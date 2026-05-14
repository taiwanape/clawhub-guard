// src/report.js — Report formatting for clawhub-guard

/**
 * Print formatted scan report for a single skill
 */
function printScanReport(result) {
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  SECURITY SCAN REPORT — clawhub-guard`);
  console.log(`${'═'.repeat(55)}`);
  console.log(`  Target:     ${result.target || result.sourceUrl || 'N/A'}`);
  console.log(`  Score:      ${result.score}/100`);
  console.log(`  Threshold:  ${result.threshold}/100`);
  
  const verdictIcon = result.passed ? '✅ PASS' : 
    result.verdict === 'BLOCK' ? '❌ BLOCK' : '⚠️  WARN';
  console.log(`  Verdict:    ${verdictIcon}`);
  console.log(`  Engines:    ${result.availableEngines}/${result.totalEngines} available`);
  console.log(`  Findings:   ${(result.findings || []).length}`);
  console.log(`${'─'.repeat(55)}`);

  if (result.findings && result.findings.length > 0) {
    const bySeverity = {};
    for (const f of result.findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
    }
    for (const [sev, count] of Object.entries(bySeverity)) {
      const icon = sev === 'critical' ? '🔴' : sev === 'high' ? '🟠' : 
                   sev === 'medium' ? '🟡' : '⚪';
      console.log(`    ${icon} ${sev}: ${count}`);
    }
    console.log(`${'─'.repeat(55)}`);
    for (const f of (result.findings || []).slice(0, 8)) {
      console.log(`  • [${f.severity}] ${f.rule}: ${f.message}`);
    }
    if (result.findings.length > 8) {
      console.log(`  • ... and ${result.findings.length - 8} more`);
    }
  } else {
    console.log(`  ✅ No findings — clean!`);
  }

  console.log(`${'═'.repeat(55)}\n`);
}

/**
 * Print a section header
 */
function header(text) {
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  ${text}`);
  console.log(`${'─'.repeat(50)}\n`);
}

module.exports = { printScanReport, header };
