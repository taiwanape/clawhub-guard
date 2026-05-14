// src/scan.js — Security scanning engine using agent-shield

const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

/**
 * Scan a local directory for security issues using agent-shield
 */
function scanLocal(targetPath, options = {}) {
  const threshold = options.threshold ?? 70;

  if (!fs.existsSync(targetPath)) {
    return {
      success: false,
      error: `Target not found: ${targetPath}`,
      score: 0,
      verdict: 'ERROR',
    };
  }

  let stdout;
  try {
    stdout = execSync(
      `npx @elliotllliu/agent-shield scan "${targetPath}" --json`,
      {
        encoding: 'utf-8',
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env },
      }
    );
  } catch (err) {
    stdout = err.stdout || err.stderr || '';
  }

  let result;
  try {
    const jsonStart = stdout.indexOf('{');
    if (jsonStart >= 0) {
      result = JSON.parse(stdout.slice(jsonStart));
    }
  } catch { /* fall through */ }

  if (!result) {
    return {
      success: false,
      error: 'Failed to parse agent-shield output',
      rawOutput: stdout.slice(0, 500),
      score: 0,
      verdict: 'ERROR',
    };
  }

  const allFindings = result.allFindings || [];
  const severityScores = { critical: 40, high: 25, medium: 10, low: 3 };
  let penalty = 0;
  for (const f of allFindings) {
    penalty += severityScores[f.severity] || 5;
  }
  const score = Math.max(0, 100 - penalty);

  return {
    success: true,
    score,
    threshold,
    passed: score >= threshold,
    verdict: score >= threshold ? 'PASS' : score < 40 ? 'BLOCK' : 'WARN',
    findings: allFindings,
    engines: result.engines || [],
    totalEngines: result.totalEngines || 0,
    availableEngines: result.availableEngines || 0,
    target: result.target || targetPath,
  };
}

/**
 * Scan a GitHub URL by cloning to temp and scanning
 */
function scanUrl(url, options = {}) {
  const tempDir = path.join(os.tmpdir(), `clawhub-guard-${Date.now()}`);
  
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    
    console.log(`\n📥 Cloning ${url}...\n`);
    execSync(`git clone --depth 1 "${url}" "${tempDir}"`, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: 'pipe',
    });

    console.log(`🔍 Scanning...\n`);
    const result = scanLocal(tempDir, options);
    result.sourceUrl = url;
    return result;
  } catch (err) {
    return {
      success: false,
      error: `Failed to clone/scan URL: ${err.stderr || err.message}`,
      score: 0,
      verdict: 'ERROR',
      sourceUrl: url,
    };
  } finally {
    // Cleanup temp dir
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Audit all installed skills - scan everything and produce summary
 */
function auditAll(options = {}) {
  const workspace = process.env.OPENCLAW_WORKSPACE_DIR ||
    path.join(os.homedir(), '.openclaw', 'workspace');
  const skillsDir = path.join(workspace, 'skills');

  if (!fs.existsSync(skillsDir)) {
    console.log('📦 No skills installed yet.');
    return { skills: [], summary: { total: 0, passed: 0, warned: 0, blocked: 0 } };
  }

  const entries = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  console.log(`\n🔍 Auditing ${entries.length} installed skill(s)...\n`);

  const results = [];
  for (const skill of entries) {
    const skillPath = path.join(skillsDir, skill);
    process.stdout.write(`  Scanning ${skill}... `);
    const result = scanLocal(skillPath, options);
    
    const icon = result.verdict === 'PASS' ? '✅' : 
                 result.verdict === 'WARN' ? '⚠️' : '❌';
    console.log(`${icon} ${result.score}/100`);
    
    results.push({
      name: skill,
      path: skillPath,
      score: result.score,
      verdict: result.verdict,
      findingsCount: (result.findings || []).length,
      findings: result.findings || [],
    });
  }

  const summary = {
    total: results.length,
    passed: results.filter(r => r.verdict === 'PASS').length,
    warned: results.filter(r => r.verdict === 'WARN').length,
    blocked: results.filter(r => r.verdict === 'BLOCK').length,
    avgScore: results.length > 0 
      ? Math.round(results.reduce((s, r) => s + r.score, 0) / results.length) 
      : 0,
  };

  return { skills: results, summary, timestamp: new Date().toISOString() };
}

/**
 * Print audit summary as a formatted table
 */
function printAuditReport(auditResult, options = {}) {
  const { skills, summary } = auditResult;

  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  SKILL AUDIT SUMMARY — clawhub-guard`);
  console.log(`${'═'.repeat(65)}`);
  
  if (skills.length === 0) {
    console.log(`  No skills installed.\n`);
    return;
  }

  // Table header
  console.log(`  ${'SKILL'.padEnd(28)} ${'SCORE'.padEnd(8)} ${'VERDICT'.padEnd(8)} FINDINGS`);
  console.log(`  ${'─'.repeat(60)}`);

  for (const r of skills) {
    const icon = r.verdict === 'PASS' ? '✅' : r.verdict === 'WARN' ? '⚠️' : '❌';
    console.log(`  ${r.name.padEnd(28)} ${String(r.score).padEnd(8)} ${icon} ${String(r.verdict).padEnd(6)} ${r.findingsCount}`);
  }

  console.log(`  ${'─'.repeat(60)}`);
  console.log(`  TOTAL: ${summary.total} | ✅ ${summary.passed} passed | ⚠️ ${summary.warned} warned | ❌ ${summary.blocked} blocked`);
  console.log(`  Average score: ${summary.avgScore}/100`);
  console.log(`${'═'.repeat(65)}\n`);

  // Highlight risky skills
  const risky = skills.filter(r => r.verdict !== 'PASS');
  if (risky.length > 0) {
    console.log(`⚠️  Skills needing attention:\n`);
    for (const r of risky) {
      console.log(`  ${r.name} (${r.score}/100):`);
      for (const f of r.findings.slice(0, 3)) {
        console.log(`    - [${f.severity}] ${f.rule}: ${f.message}`);
      }
    }
    console.log('');
  }
}

/**
 * Save scan report to log file
 */
function saveReport(result, command) {
  const stateDir = path.join(os.homedir(), '.clawhub-guard');
  fs.mkdirSync(stateDir, { recursive: true });
  
  const logFile = path.join(stateDir, 'scan-history.jsonl');
  const entry = {
    timestamp: new Date().toISOString(),
    command,
    score: result.score,
    verdict: result.verdict,
    target: result.target || result.sourceUrl || 'unknown',
    findingsCount: (result.findings || []).length,
    summary: result.summary || null,
  };
  
  fs.appendFileSync(logFile, JSON.stringify(entry) + '\n', 'utf-8');
  return logFile;
}

function getSkillInstallPath(skillName) {
  const workspace = process.env.OPENCLAW_WORKSPACE_DIR ||
    path.join(os.homedir(), '.openclaw', 'workspace');
  return path.join(workspace, 'skills', skillName);
}

function isSkillInstalled(skillName) {
  return fs.existsSync(getSkillInstallPath(skillName));
}

module.exports = { 
  scanLocal, 
  scanUrl, 
  auditAll, 
  printAuditReport, 
  saveReport,
  getSkillInstallPath, 
  isSkillInstalled 
};
