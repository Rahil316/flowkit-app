// Shared implementation for the `/__flowlens/save-session` dev-server middleware.
// Both vite.config.ts (repo mode, workspace-scoped) and scripts/helpers/vite-plugin.js
// (flat mode, cwd-scoped) mount this same handler — the only thing that legitimately
// differs between them is where flowLensDir resolves to, and what extra fields (if
// any) get merged into a freshly-bootstrapped studies.json.
import fs from 'fs'
import path from 'path'

/** Dash-slug used for FlowLens session filenames — also usable anywhere else a short, filesystem-safe label is needed. */
export function toDashSlug(str, maxLen = 30) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLen)
}

function resolveActiveStudyId(flowLensDir, bootstrapExtra) {
  const studiesPath = path.join(flowLensDir, 'studies.json')
  if (fs.existsSync(studiesPath)) {
    const studies = JSON.parse(fs.readFileSync(studiesPath, 'utf8'))
    return studies.activeStudyId ?? 'initial-study'
  }
  fs.mkdirSync(flowLensDir, { recursive: true })
  fs.writeFileSync(
    studiesPath,
    JSON.stringify(
      {
        ...bootstrapExtra,
        activeStudyId: 'initial-study',
        studies: [
          {
            id: 'initial-study',
            name: 'Initial Study',
            status: 'active',
            createdAt: new Date().toISOString(),
            archivedAt: null,
            description: '',
          },
        ],
      },
      null,
      2
    ) + '\n'
  )
  return 'initial-study'
}

function buildSessionFilename(session) {
  const slug = toDashSlug(session.meta.name || 'session')
  // Defensive: strip anything that isn't alphanumeric before it reaches path.join.
  // meta.id is already capped to 8 chars, which on its own doesn't escape the
  // session dir (verified), but stripping here removes the theoretical risk
  // outright instead of relying on that staying true if the surrounding code
  // ever changes.
  const idPart = String(session.meta.id)
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 8)
  return `${slug}-${idPart}.json`
}

/**
 * Shared handler body for the `/__flowlens/save-session` dev-server middleware.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {string} flowLensDir — mode-specific FlowLens library root
 * @param {object} [bootstrapExtra] — extra fields merged into a freshly-created studies.json
 */
export async function handleSaveSession(req, res, flowLensDir, bootstrapExtra = {}) {
  if (req.method !== 'POST') {
    res.writeHead(405)
    res.end()
    return
  }
  try {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const session = JSON.parse(Buffer.concat(chunks).toString('utf8'))

    if (!session?.meta?.id || !Array.isArray(session.events)) {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Invalid session: missing meta.id or events' }))
      return
    }

    const studyId = resolveActiveStudyId(flowLensDir, bootstrapExtra)
    const sessionDir = path.join(flowLensDir, 'sessions', studyId)
    fs.mkdirSync(sessionDir, { recursive: true })

    const filename = buildSessionFilename(session)
    fs.writeFileSync(path.join(sessionDir, filename), JSON.stringify(session, null, 2))

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, studyId, filename }))
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
  }
}
