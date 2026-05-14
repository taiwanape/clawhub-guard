// src/install.js — Install logic with pre-scan guard

const { execSync } = require('node:child_process');
const { scanLocal, isSkillInstalled } = require('./scan.js');

/**
 * Install a ClawHub skill with pre-scan security check
 * @param {string} skillName - Name of the ClawHub skill
 * @param {object} options
 * @param {number} options.threshold - Minimum security score (default 70)
 * @param {boolean} options.force - Skip scan and install anyway
 * @returns {object} Install result
 */
function installSkill(skillName, options = {}) {
  const threshold = options.threshold ?? 70;

  // Step 0: Force mode — skip scan
  if (options.force) {
    return doInstall(skillName);
  }

  // Step 1: Can't pre-scan before download, so install first →
  // scan the installed copy, then warn
  console.log(`\n📦 Installing ${skillName} for pre-scan...\n`);
  
  let installResult = doInstall(skillName);
  if (!installResult.success) {
    return installResult;
  }

  // Step 2: Scan the just-installed skill
  console.log(`\n🔍 Running security scan on ${skillName}...\n`);
  
  const scanResult = scanLocal(installResult.installPath, { threshold });

  // Step 3: Print report
  printScanReport(scanResult);

  // Step 4: If unsafe, offer to uninstall
  if (!scanResult.passed) {
    console.log(`\n⚠️  RISK THRESHOLD NOT MET (${scanResult.score}/100, need ${threshold})`);
    console.log(`   Verdict: ${scanResult.verdict}`);
    
    if (scanResult.verdict === 'BLOCK') {
      console.log(`\n❌ BLOCKED — Uninstalling ${skillName} for safety.\n`);
      try {
        execSync(`openclaw.cmd skills uninstall ${skillName}`, { 
          encoding: 'utf-8', 
          stdio: 'pipe' 
        });
      } catch {
        // Manual cleanup
        const fs = require('node:fs');
        const path = require('node:path');
        const skillPath = installResult.installPath;
        if (fs.existsSync(skillPath)) {
          fs.rmSync(skillPath, { recursive: true, force: true });
        }
      }
      console.log(`💡 Tip: Review the findings above. Use --force to install anyway.\n`);
      return { success: false, blocked: true, scanResult, installResult };
    }
    
    if (scanResult.verdict === 'WARN') {
      console.log(`⚠️  Installed with warnings — review the findings above.\n`);
    }
  }

  return { success: true, blocked: false, scanResult, installResult };
}

function doInstall(skillName) {
  const path = require('node:path');
  const fs = require('node:fs');
  const os = require('node:os');

  try {
    const output = execSync(`openclaw.cmd skills install ${skillName}`, {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(output);

    // Determine install path
    const workspace = process.env.OPENCLAW_WORKSPACE_DIR || 
      path.join(os.homedir(), '.openclaw', 'workspace');
    const installPath = path.join(workspace, 'skills', skillName);

    return { success: true, installPath, output };
  } catch (err) {
    const errMsg = err.stderr || err.stdout || err.message || 'Unknown error';
    console.error(`❌ Install failed: ${errMsg}`);
    return { success: false, error: errMsg };
  }
}

function printScanReport(result) {
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  SECURITY SCAN REPORT — clawhub-guard`);
  console.log(`${'═'.repeat(55)}`);
  console.log(`  Target:     ${result.target || 'N/A'}`);
  console.log(`  Score:      ${result.score}/100`);
  console.log(`  Threshold:  ${result.threshold}/100`);
  console.log(`  Verdict:    ${result.passed ? '✅ PASS' : result.verdict === 'BLOCK' ? '❌ BLOCK' : '⚠️  WARN'}`);
  console.log(`  Engines:    ${result.availableEngines}/${result.totalEngines} available`);
  console.log(`  Findings:   ${(result.findings || []).length}`);
  console.log(`${'─'.repeat(55)}`);

  if (result.findings && result.findings.length > 0) {
    const bySeverity = {};
    for (const f of result.findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    }
    for (const [sev, count] of Object.entries(bySeverity)) {
      const icon = sev === 'critical' ? '🔴' : sev === 'high' ? '🟠' : sev === 'medium' ? '🟡' : '⚪';
      console.log(`    ${icon} ${sev}: ${count}`);
    }
    console.log(`${'─'.repeat(55)}`);
    for (const f of (result.findings || []).slice(0, 5)) {
      console.log(`  • [${f.severity}] ${f.rule}: ${f.message}`);
    }
    if (result.findings.length > 5) {
      console.log(`  • ... and ${result.findings.length - 5} more`);
    }
  } else {
    console.log(`  ✅ No findings — clean!`);
  }

  console.log(`${'═'.repeat(55)}\n`);
}

module.exports = { installSkill, printScanReport };
