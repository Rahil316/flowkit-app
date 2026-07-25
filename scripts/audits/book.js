// flowkit audit:book — whole-flowBook-spanning rules (workspace-wide page id uniqueness,
// startPage/defaultDevice validity, cross-chapter concerns). Registered as a domain so it
// shows up in `flowkit audit`'s output from day one, but intentionally ships with zero
// rules — see Documentation/audit-command.md's backlog for the reviewed-but-not-yet-built
// candidates (book/no-chapters, book/invalid-start-page, book/duplicate-chapter-id, etc.).
export async function checkBook(_wsDir, _report) {
  // No rules yet — Phase 1 ships this domain empty on purpose.
}
