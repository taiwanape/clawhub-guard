// src/scan.js — Security scanning engine using agent-shield

const { execSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

/**
 * Scan a local directory for security issues using agent-shield
 * @param {string} targetPath - Path to the skill directory
 * @param {object} options
 * @param {number} options.threshold - Minimum score to pass (0-100)
 * @returns {object} Scan result with score, findings, and verdict
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
    // agent-shield exits non-zero if findings exist — still parse output
    stdout = err.stdout || err.stderr || '';
  }

  // Try to extract JSON from agent-shield output (it may have noise)
  let result;
  try {
    const jsonStart = stdout.indexOf('{');
    if (jsonStart >= 0) {
      result = JSON.parse(stdout.slice(jsonStart));
    }
  } catch {
    // Fallback: parse manually
  }

  if (!result) {
    return {
      success: false,
      error: 'Failed to parse agent-shield output',
      rawOutput: stdout.slice(0, 500),
      score: 0,
      verdict: 'ERROR',
    };
  }

  // Calculate score based on findings
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
 * Determine ClawHub skill install directory
 */
function getSkillInstallPath(skillName) {
  const workspace = process.env.OPENCLAW_WORKSPACE_DIR || 
    path.join(os.homedir(), '.openclaw', 'workspace');
  return path.join(workspace, 'skills', skillName);
}

/**
 * Check if a skill is already installed locally
 */
function isSkillInstalled(skillName) {
  const installPath = getSkillInstallPath(skillName);
  return fs.existsSync(installPath);
}

module.exports = { scanLocal, getSkillInstallPath, isSkillInstalled };
