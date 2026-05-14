#!/usr/bin/env node
// src/cli.js — Main CLI for clawhub-guard

const { scanLocal, getSkillInstallPath, isSkillInstalled } = require('./scan.js');
const { installSkill } = require('./install.js');

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`
🛡️  clawhub-guard — Pre-install security scanner for ClawHub skills

Usage:
  clawhub-guard install <skill-name>     Scan + install a ClawHub skill
  clawhub-guard scan <skill-name>        Scan an installed ClawHub skill
  clawhub-guard scan --local <path>      Scan a local skill directory
  clawhub-guard --help                   Show this help

Options:
  --threshold <0-100>    Minimum score to pass (default: 70)
  --force                Skip security scan and install anyway
  --json                 Output scan result as JSON

Examples:
  clawhub-guard install summarize
  clawhub-guard scan --local ./my-skill/
  clawhub-guard install database-query --threshold 80
  clawhub-guard scan skill-vetter --json
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
};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--threshold' && args[i + 1]) {
    options.threshold = parseInt(args[i + 1], 10);
    i++;
  }
  if (args[i] === '--force') options.force = true;
  if (args[i] === '--json') options.json = true;
  if (args[i] === '--local') options.local = true;
}

switch (command) {
  case 'install': {
    const skillName = args[1];
    if (!skillName) {
      console.error('❌ Error: skill name required.\nUsage: clawhub-guard install <skill-name>');
      process.exit(1);
    }
    const result = installSkill(skillName, options);
    process.exit(result.success ? 0 : 1);
  }

  case 'scan': {
    let target = args[1];
    if (!target && !options.local) {
      console.error('❌ Error: skill name or --local <path> required.');
      process.exit(1);
    }

    // --local mode: scan a directory
    if (options.local) {
      target = args.find((a, i) => args[i - 1] === '--local') || args[2];
      if (!target) {
        // If --local was passed as the target itself (e.g., scan --local ./path)
        target = args[1];
      }
    }

    const fs = require('node:fs');
    const path = require('node:path');
    const os = require('node:os');

    let scanTarget;
    if (options.local || target.includes('/') || target.includes('\\')) {
      scanTarget = target;
    } else {
      scanTarget = getSkillInstallPath(target);
      if (!isSkillInstalled(target)) {
        // Try fuzzy match
        const workspace = process.env.OPENCLAW_WORKSPACE_DIR ||
          path.join(os.homedir(), '.openclaw', 'workspace');
        const skillsDir = path.join(workspace, 'skills');
        let installedList = [];
        if (fs.existsSync(skillsDir)) {
          installedList = fs.readdirSync(skillsDir, { withFileTypes: true })
            .filter(d => d.isDirectory())
            .map(d => d.name);
          // Normalize names (strip hyphens, underscores) for fuzzy matching
          const normalize = s => s.toLowerCase().replace(/[-_]/g, '');
          const normTarget = normalize(target);
          const match = installedList.find(e =>
            normalize(e).includes(normTarget) || normTarget.includes(normalize(e))
          );
          if (match) {
            scanTarget = getSkillInstallPath(match);
          }
        }
        if (!scanTarget) {
          console.error(`❌ Skill '${target}' not installed.`);
          console.error(`   Installed skills: ${installedList.join(', ') || 'none'}`);
          process.exit(1);
        }
      }
    }

    const result = scanLocal(scanTarget, options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const { printScanReport } = require('./install.js');
      printScanReport(result);
    }
    process.exit(result.passed ? 0 : 1);
  }

  default:
    console.error(`❌ Unknown command: ${command}`);
    usage();
    process.exit(1);
}
