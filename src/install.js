// src/install.js — Install logic with pre-scan guard

const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { scanLocal } = require('./scan.js');
const { printScanReport } = require('./report.js');

/**
 * Install a ClawHub skill with pre-scan security check
 */
function installSkill(skillName, options = {}) {
  const threshold = options.threshold ?? 70;

  if (options.force) {
    return doInstall(skillName);
  }

  console.log(`\n📦 Installing ${skillName} for pre-scan...\n`);
  
  let installResult = doInstall(skillName);
  if (!installResult.success) {
    return installResult;
  }

  console.log(`\n🔍 Running security scan on ${skillName}...\n`);
  
  const scanResult = scanLocal(installResult.installPath, { threshold });
  printScanReport(scanResult);

  if (!scanResult.passed) {
    console.log(`⚠️  RISK THRESHOLD NOT MET (${scanResult.score}/100, need ${threshold})`);
    console.log(`   Verdict: ${scanResult.verdict}`);
    
    if (scanResult.verdict === 'BLOCK') {
      console.log(`\n❌ BLOCKED — Uninstalling ${skillName} for safety.\n`);
      try {
        execSync(`openclaw.cmd skills uninstall ${skillName}`, { 
          encoding: 'utf-8', 
          stdio: 'pipe' 
        });
      } catch {
        if (fs.existsSync(installResult.installPath)) {
          fs.rmSync(installResult.installPath, { recursive: true, force: true });
        }
      }
      console.log(`💡 Tip: Review the findings. Use --force to install anyway.\n`);
      return { success: false, blocked: true, scanResult, installResult };
    }
    
    console.log(`⚠️  Installed with warnings — review the findings above.\n`);
  }

  return { success: true, blocked: false, scanResult, installResult };
}

function doInstall(skillName) {
  try {
    const output = execSync(`openclaw.cmd skills install ${skillName}`, {
      encoding: 'utf-8',
      timeout: 60000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(output);

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

module.exports = { installSkill, doInstall, printScanReport };
