# 🛡️ clawhub-guard

**Pre-install security scanner for ClawHub skills.**  
Scan before you install. Never trust blindly.

[![npm version](https://img.shields.io/npm/v/clawhub-guard)](https://www.npmjs.com/package/clawhub-guard)
[![license](https://img.shields.io/npm/l/clawhub-guard)](LICENSE)

---

## Why?

ClawHub hosts thousands of community skills — but not all are safe. In early 2026, the ClawHavoc campaign distributed 341 malicious skills through the registry, stealing credentials and installing malware.

**clawhub-guard** adds a mandatory security checkpoint before every install.

## What It Does

```
$ clawhub-guard install summarize

📦 Installing summarize for pre-scan...
✓ Installed summarize@2.1.0

🔍 Running security scan on summarize...

═══════════════════════════════════════════════════════
  SECURITY SCAN REPORT — clawhub-guard
═══════════════════════════════════════════════════════
  Target:     ~/.openclaw/workspace/skills/summarize
  Score:      94/100
  Threshold:  70/100
  Verdict:    ✅ PASS
  Engines:    1/4 available
  Findings:   2
───────────────────────────────────────────────────────
    ⚪ low: 2
───────────────────────────────────────────────────────
  • [low] tool-shadowing: Redirects from another tool
  • [low] excessive-perms: Too many permissions declared
═══════════════════════════════════════════════════════

✅ Safe! summarize is ready to use.
```

If the score is too low:

```
❌ BLOCKED — Uninstalling malicious-skill for safety.
💡 Tip: Review the findings above. Use --force to install anyway.
```

## Install

```bash
npm install -g clawhub-guard
```

## Usage

```bash
# Install a ClawHub skill with automatic pre-scan
clawhub-guard install <skill-name>

# Scan an already-installed skill
clawhub-guard scan <skill-name>

# Scan a local skill directory
clawhub-guard scan --local ./my-skill/

# Custom risk threshold (default: 70)
clawhub-guard install <skill-name> --threshold 80

# Force install (skip security scan)
clawhub-guard install <skill-name> --force

# JSON output for automation
clawhub-guard scan <skill-name> --json
```

## Scoring

| Score | Verdict | Action |
|-------|---------|--------|
| 90–100 | ✅ PASS | Safe to install |
| 70–89 | ⚠️ WARN | Installed with warnings — review findings |
| 40–69 | ❌ BLOCK | Automatically uninstalled — review report |
| 0–39 | ❌ BLOCK | Automatically uninstalled — do not use |

## Powered By

- **[AgentShield](https://www.npmjs.com/package/@elliotllliu/agent-shield)** — 30 security rules covering credential theft, backdoors, prompt injection, obfuscation, and more.

## Recommended Workflow

```bash
# 1. Always use clawhub-guard instead of raw openclaw skills install
clawhub-guard install <skill-name>

# 2. If blocked, review the scan report
clawhub-guard scan <skill-name> --json | less

# 3. Only force-install if you've manually reviewed the code
clawhub-guard install <skill-name> --force
```

## Security

This tool is itself a security product. It:
- Runs **locally only** — no telemetry, no external calls beyond agent-shield
- Does **not** modify your OpenClaw config
- Does **not** read your credentials or session data
- Automatically **uninstalls** skills that fail the security threshold

## License

MIT © [taiwanape](https://github.com/taiwanape)

---

> "Trust is earned in milliseconds, lost in microseconds, and clawed back never." — clawhub-guard
