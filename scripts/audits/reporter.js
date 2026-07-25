// Shared output formatting for flowkit audit's rule domains — human-readable and --json,
// both built from the same finding objects so neither format can drift from the other.
import { g, r, d, b, y, c } from '../helpers/colors.js'

/**
 * @typedef {Object} Finding
 * @property {string} ruleId     e.g. 'screen/missing-meta'
 * @property {'error'|'warning'} severity
 * @property {string} file       workspace-relative path
 * @property {string} message    human-readable description of the problem
 * @property {string} [fix]      manual fix description
 * @property {string} [clifix]   exact CLI command that fixes it, if one exists
 * @property {boolean} [requiresAcknowledgment]  when true, this finding is surfaced in its
 *   own clearly-headed section (in addition to the normal flat list) so it can't be missed
 *   or silently scrolled past — e.g. screen/ambiguous-folder. Never affects errorCount/
 *   exit code by itself; a finding still needs severity: 'error' to fail the build.
 * @property {Object} [meta]  structured data a --fix orchestrator can act on directly
 *   (e.g. { chapterId, pageId }) instead of parsing the human-readable `message` string —
 *   only rules with a defined auto-fix need to set this.
 */

export function createReport() {
  /** @type {Finding[]} */
  const findings = []
  return {
    findings,
    // Not a Finding — a count of navigateTo() call sites whose argument couldn't be
    // statically resolved (an identifier/member-expression, not a string literal).
    // Nothing is wrong when this is nonzero; it's the tool disclosing its own blind
    // spot rather than silently pretending 100% of calls were checked. Doesn't fit the
    // Finding shape (no single file/message is "the" problem), so it's a plain
    // mutable counter on the report rather than another finding entry — see
    // navigations.js for the one caller today.
    dynamicNavCallSites: 0,
    addDynamicNavCallSite() {
      this.dynamicNavCallSites++
    },
    add(finding) {
      findings.push(finding)
    },
    get errorCount() {
      return findings.filter(f => f.severity === 'error').length
    },
    get warningCount() {
      return findings.filter(f => f.severity === 'warning').length
    },
  }
}

/** Prints a report in the human-readable format. `label` is e.g. "screens", "plans", or null for the full suite. */
export function printReport(report, workspaceName, label) {
  const { findings, errorCount, warningCount, dynamicNavCallSites } = report
  const heading = label ? `flowkit audit:${label}` : 'flowkit audit'
  const rule = '─'.repeat(50)

  console.log('')
  console.log(b(`  ${heading}`) + d(`  ·  ${workspaceName}`))
  console.log(d(rule))

  if (findings.length === 0) {
    console.log('')
    console.log(g('  ✓  all clean — no issues found'))
    console.log('')
    printDynamicNavCallSiteSummary(dynamicNavCallSites)
    console.log('')
    return
  }

  for (const [domain, group] of groupByDomain(findings)) {
    console.log('')
    console.log(c(`  ${domain}`) + d(`  (${group.length})`))
    console.log('')
    for (const f of group) {
      printFinding(f)
    }
  }

  console.log(d(rule))
  console.log('')
  const parts = []
  if (errorCount) parts.push(r(b(`✗ ${errorCount} error${errorCount !== 1 ? 's' : ''}`)))
  if (warningCount) parts.push(y(`⚠️️ ${warningCount} warning${warningCount !== 1 ? 's' : ''}`))
  console.log('  ' + parts.join(d('   ·   ')))
  console.log('')
  printDynamicNavCallSiteSummary(dynamicNavCallSites)
  console.log('')

  printAcknowledgmentSection(findings)
}

/** Groups findings by their ruleId's domain prefix (e.g. 'screen/missing-meta' → 'screen'), preserving first-seen order. */
function groupByDomain(findings) {
  const groups = new Map()
  for (const f of findings) {
    const domain = f.ruleId?.includes('/') ? f.ruleId.slice(0, f.ruleId.indexOf('/')) : 'general'
    if (!groups.has(domain)) groups.set(domain, [])
    groups.get(domain).push(f)
  }
  return groups
}

/** Prints one finding: a colored severity marker + rule id on their own line, then the
 * file path, message, and any fix hints indented below — with breathing room around each
 * entry so long rule ids / paths never collide into one unreadable run-on line. */
function printFinding(f) {
  const isError = f.severity === 'error'
  const marker = isError ? r(b('✗')) : y('⚠️️')
  const ruleTag = isError ? r(b(f.ruleId)) : y(b(f.ruleId))

  console.log(`  ${marker}  ${ruleTag}`)
  console.log(d(`     ${f.file}`))
  console.log(`     ${f.message}`)
  if (f.fix) console.log(g(`     ↳ fix: `) + d(f.fix))
  if (f.clifix) console.log(c(`     ↳ run: `) + d(f.clifix))
  console.log('')
}

/**
 * One unconditional summary line disclosing how many navigateTo() call sites couldn't
 * be statically resolved (non-literal argument — an identifier, member expression,
 * etc.) — printed only when nonzero. Not styled as a finding (no ✗/⚠️️ marker, no
 * ruleId) since nothing is wrong; this is the tool being honest about its own
 * coverage gap rather than silently pretending 100% of calls were checked.
 */
function printDynamicNavCallSiteSummary(count) {
  if (!count) return
  const plural = count !== 1 ? 's' : ''
  console.log(
    d(`  ℹ  ${count} dynamic navigateTo() call site${plural} not statically traced `) +
      d('(see --json for the count)')
  )
}

/**
 * Findings marked `requiresAcknowledgment: true` (e.g. screen/ambiguous-folder) get a
 * second, visually distinct pass here — a boxed, all-caps-headed section printed after the
 * normal flat list — so an author can't just scroll past them as one more line among many.
 * This is presentation only: it does not change errorCount/exit-code behavior; a finding
 * still needs severity: 'error' to fail the build. Not a full interactive prompt (no
 * blocking/input handling) — that's a larger UX investment out of scope for this pass.
 */
function printAcknowledgmentSection(findings) {
  const needsAck = findings.filter(f => f.requiresAcknowledgment)
  if (needsAck.length === 0) return

  const line = '═'.repeat(50)
  console.log(r(b(line)))
  console.log(r(b(`  ⚠️️  REQUIRES ACKNOWLEDGMENT  (${needsAck.length})`)))
  console.log(r(b(line)))
  console.log('')
  for (const f of needsAck) {
    console.log(r(b(`  ${f.ruleId}`)))
    console.log(d(`     ${f.file}`))
    console.log(`     ${f.message}`)
    if (f.fix) console.log(g(`     ↳ fix: `) + d(f.fix))
    if (f.clifix) console.log(c(`     ↳ run: `) + d(f.clifix))
    console.log('')
  }
  console.log(r(b(line)))
  console.log('')
}

/** Prints a report as machine-readable JSON. */
export function printReportJson(report, workspaceName) {
  console.log(
    JSON.stringify(
      {
        workspace: workspaceName,
        errors: report.errorCount,
        warnings: report.warningCount,
        results: report.findings,
        requiresAcknowledgment: report.findings.filter(f => f.requiresAcknowledgment),
        dynamicNavCallSites: report.dynamicNavCallSites,
      },
      null,
      2
    )
  )
}
