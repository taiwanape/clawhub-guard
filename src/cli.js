#!/usr/bin/env node
// src/cli.js — Main CLI for clawhub-guard v1.1.0

const { 
  scanLocal, scanUrl, auditAll, printAuditReport, saveReport,
  getSkillInstallPath, isSkillInstalled 
} = require('./scan.js');
const { installSkill } = require('./install.js');
const { printScanReport } = require('./report.js');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`
🛡️  clawhub-guard v1.1.0 — Pre-install security scanner for ClawHub skills

Commands:
  install <name>         Scan + install a ClawHub skill
  scan <name>            Scan an installed skill (fuzzy name match)
  scan --local <path>    Scan a local directory
  scan --url <github>    Scan a GitHub repo (clones to temp, scans, cleans)
  audit                  Audit ALL installed skills with summary table
  watch                  Watch skills dir and auto-scan new installs
  history                Show scan report history

Options:
  --threshold <0-100>    Minimum score to pass (default: 70)
  --fail-under <score>   CI mode: exit 1 if score below this
  --force                Skip security scan and install anyway
  --json                 Output scan result as JSON
  --no-log               Skip saving to scan history

Examples:
  clawhub-guard install summarize
  clawhub-guard scan --url https://github.com/user/skill-repo
  clawhub-guard audit
  clawhub-guard audit --fail-under 80
  clawhub-guard watch
  clawhub-guard history
`);
}

if (!command || command === '--help' || command === '-h') {
  usage();
  process.exit(0);
}

// Parse options
const options = {
  threshold: 70,
  force: false,
  json: false,
  local: false,
  url: false,
  log: true,
  failUnder: null,
};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--threshold' && args[i + 1]) {
    options.threshold = parseInt(args[i + 1], 10);
    i++;
  }
  if (args[i] === '--fail-under' && args[i + 1]) {
    options.failUnder = parseInt(args[i + 1], 10);
    options.threshold = options.failUnder;
    i++;
  }
  if (args[i] === '--force') options.force = true;
  if (args[i] === '--json') options.json = true;
  if (args[i] === '--local') options.local = true;
  if (args[i] === '--url') options.url = true;
  if (args[i] === '--no-log') options.log = false;
}

switch (command) {

  // ─── INSTALL ─────────────────────────────────────
  case 'install': {
    const skillName = args[1];
    if (!skillName) {
      console.error('❌ Error: skill name required.\nUsage: clawhub-guard install <skill-name>');
      process.exit(1);
    }
    const result = installSkill(skillName, options);
    if (options.log && result.scanResult) {
      saveReport(result.scanResult, `install ${skillName}`);
    }
    process.exit(result.success ? 0 : 1);
  }

  // ─── SCAN ────────────────────────────────────────
  case 'scan': {
    let target = args[1];

    // --url mode
    if (options.url) {
      target = args.find((a, i) => args[i - 1] === '--url') || args[2] || target;
      if (!target) {
        console.error('❌ Error: URL required with --url flag.');
        process.exit(1);
      }
      const result = scanUrl(target, options);
      if (options.log) saveReport(result, `scan --url ${target}`);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printScanReport(result);
      }
      process.exit(result.passed ? 0 : 1);
    }

    // --local mode
    if (options.local) {
      target = args.find((a, i) => args[i - 1] === '--local') || args[2];
      if (!target) {
        console.error('❌ Error: path required with --local flag.');
        process.exit(1);
      }
      const result = scanLocal(target, options);
      if (options.log) saveReport(result, `scan --local ${target}`);
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printScanReport(result);
      }
      process.exit(result.passed ? 0 : 1);
    }

    // Skill name mode (default)
    if (!target) {
      console.error('❌ Error: skill name, --local <path>, or --url <url> required.');
      process.exit(1);
    }

    let scanTarget;
    if (target.includes('http://') || target.includes('https://')) {
      // Auto-detect URL
      scanTarget = target;
      const result = scanUrl(scanTarget, options);
      if (options.log) saveReport(result, `scan --url ${target}`);
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else printScanReport(result);
      process.exit(result.passed ? 0 : 1);
    }

    if (target.includes('/') || target.includes('\\')) {
      scanTarget = target;
    } else {
      scanTarget = getSkillInstallPath(target);
      if (!isSkillInstalled(target)) {
        // Fuzzy match
        const workspace = process.env.OPENCLAW_WORKSPACE_DIR ||
          path.join(os.homedir(), '.openclaw', 'workspace');
        const skillsDir = path.join(workspace, 'skills');
        let installedList = [];
        if (fs.existsSync(skillsDir)) {
          installedList = fs.readdirSync(skillsDir, { withFileTypes: true })
            .filter(d => d.isDirectory()).map(d => d.name);
          const normalize = s => s.toLowerCase().replace(/[-_]/g, '');
          const normTarget = normalize(target);
          const match = installedList.find(e =>
            normalize(e).includes(normTarget) || normTarget.includes(normalize(e))
          );
          if (match) scanTarget = getSkillInstallPath(match);
        }
        if (!scanTarget) {
          console.error(`❌ Skill '${target}' not installed.`);
          console.error(`   Installed: ${installedList.join(', ') || 'none'}`);
          process.exit(1);
        }
      }
    }

    const result = scanLocal(scanTarget, options);
    if (options.log) saveReport(result, `scan ${target}`);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printScanReport(result);
    }
    process.exit(result.passed ? 0 : 1);
  }

  // ─── AUDIT ───────────────────────────────────────
  case 'audit': {
    const result = auditAll(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printAuditReport(result, options);
    }
    if (options.log && result.summary) {
      saveReport({ score: result.summary.avgScore, verdict: 'AUDIT', target: 'all', 
                   findings: result.skills.flatMap(s => s.findings), summary: result.summary,
                   passed: result.summary.blocked === 0 }, 'audit');
    }
    const exitCode = (options.failUnder && result.summary.avgScore < options.failUnder) ? 1 : 0;
    process.exit(exitCode);
  }

  // ─── WATCH ───────────────────────────────────────
  case 'watch': {
    console.log('👀 Watching skills directory for changes...\n');
    console.log('   New skill installs will be auto-scanned.\n');
    console.log('   Press Ctrl+C to stop.\n');

    const workspace = process.env.OPENCLAW_WORKSPACE_DIR ||
      path.join(os.homedir(), '.openclaw', 'workspace');
    const skillsDir = path.join(workspace, 'skills');
    
    let knownSkills = new Set();
    if (fs.existsSync(skillsDir)) {
      fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .forEach(d => knownSkills.add(d.name));
    }

    const interval = setInterval(() => {
      if (!fs.existsSync(skillsDir)) return;
      const current = fs.readdirSync(skillsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
      
      for (const skill of current) {
        if (!knownSkills.has(skill)) {
          knownSkills.add(skill);
          const skillPath = path.join(skillsDir, skill);
          console.log(`\n🔔 New skill detected: ${skill}`);
          console.log(`🔍 Auto-scanning...\n`);
          
          const result = scanLocal(skillPath, options);
          printScanReport(result);
          
          if (options.log) saveReport(result, `watch:${skill}`);
          
          if (!result.passed && result.verdict === 'BLOCK') {
            console.log(`❌ AUTO-BLOCKED: ${skill} (${result.score}/100)`);
            console.log(`   Run: openclaw skills uninstall ${skill}\n`);
          }
        }
      }
    }, 3000); // Poll every 3 seconds

    process.on('SIGINT', () => { clearInterval(interval); process.exit(0); });
    process.on('SIGTERM', () => { clearInterval(interval); process.exit(0); });
    
    // Keep alive
    setInterval(() => {}, 60000);
    break;
  }

  // ─── HISTORY ─────────────────────────────────────
  case 'history': {
    const logFile = path.join(os.homedir(), '.clawhub-guard', 'scan-history.jsonl');
    if (!fs.existsSync(logFile)) {
      console.log('📭 No scan history yet. Run some scans first!');
      process.exit(0);
    }

    const lines = fs.readFileSync(logFile, 'utf-8').trim().split('\n').filter(Boolean);
    const entries = lines.map(l => JSON.parse(l));

    if (options.json) {
      console.log(JSON.stringify(entries, null, 2));
      process.exit(0);
    }

    console.log(`\n${'═'.repeat(70)}`);
    console.log(`  SCAN HISTORY — clawhub-guard (${entries.length} entries)`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`  ${'DATE'.padEnd(22)} ${'COMMAND'.padEnd(24)} ${'SCORE'.padEnd(8)} ${'VERDICT'.padEnd(8)} TARGET`);
    console.log(`  ${'─'.repeat(68)}`);

    for (const e of entries.slice(-20)) {
      const date = new Date(e.timestamp).toLocaleString('zh-TW', { 
        month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
      });
      const icon = e.verdict === 'PASS' ? '✅' : e.verdict === 'WARN' ? '⚠️' : 
                   e.verdict === 'BLOCK' ? '❌' : '📊';
      const target = (e.target || '').split('/').slice(-1)[0] || e.target || '';
      console.log(`  ${date.padEnd(22)} ${e.command.padEnd(24)} ${String(e.score).padEnd(8)} ${icon} ${String(e.verdict).padEnd(6)} ${target}`);
    }
    console.log(`${'═'.repeat(70)}\n`);
    process.exit(0);
  }

  // ─── DEFAULT ─────────────────────────────────────
  default:
    console.error(`❌ Unknown command: ${command}`);
    usage();
    process.exit(1);
}
