#!/usr/bin/env node
// Reversibly toggles the repo between real (unscoped) package identity and a
// scoped canary identity (e.g. @rahil316/*) for rehearsing a real npm publish
// without touching the real unscoped package names.
// Usage: node scripts/dev/scope-toggle.js <scope> <on|off>
//   node scripts/dev/scope-toggle.js @rahil316 on
//   node scripts/dev/scope-toggle.js @rahil316 off

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..', '..')

const COUNTER_FILE = path.join(ROOT, 'scripts', 'dev', '.canary-version.json')
const SNAPSHOT_FILE = path.join(ROOT, 'scripts', 'dev', '.pre-canary-snapshot.json')

const TARGETS = [
  {
    key: 'root',
    pkgPath: path.join(ROOT, 'package.json'),
    realName: 'flowkit',
  },
  {
    key: 'create-flowkit-app',
    pkgPath: path.join(ROOT, 'packages', 'create-flowkit-app', 'package.json'),
    realName: 'create-flowkit-app',
    indexPath: path.join(ROOT, 'packages', 'create-flowkit-app', 'index.js'),
  },
  {
    key: 'create-flowkit-mono',
    pkgPath: path.join(ROOT, 'packages', 'create-flowkit-mono', 'package.json'),
    realName: 'create-flowkit-mono',
    indexPath: path.join(ROOT, 'packages', 'create-flowkit-mono', 'index.js'),
  },
]

function readText(p) {
  return fs.readFileSync(p, 'utf8')
}

function writeText(p, content) {
  fs.writeFileSync(p, content)
}

function replaceOnce(content, oldStr, newStr, label) {
  const idx = content.indexOf(oldStr)
  if (idx === -1) {
    throw new Error(
      `Expected to find ${JSON.stringify(oldStr)} in ${label}, but it was not present.`
    )
  }
  return content.slice(0, idx) + newStr + content.slice(idx + oldStr.length)
}

function readCounter() {
  if (!fs.existsSync(COUNTER_FILE)) {
    return { n: 0 }
  }
  return JSON.parse(readText(COUNTER_FILE))
}

function writeCounter(counter) {
  writeText(COUNTER_FILE, JSON.stringify(counter, null, 2) + '\n')
}

function getNameLine(content) {
  const match = content.match(/^(\s*"name":\s*")([^"]+)(")/m)
  if (!match) throw new Error('Could not find "name" field')
  return match
}

function getVersionLine(content) {
  const match = content.match(/^(\s*"version":\s*")([^"]+)(")/m)
  if (!match) throw new Error('Could not find "version" field')
  return match
}

function getPublishedRangeLine(content) {
  const match = content.match(/^(const FLOWKIT_PUBLISHED_RANGE = )'([^']+)'/m)
  if (!match) throw new Error('Could not find FLOWKIT_PUBLISHED_RANGE')
  return match
}

function turnOn(scope) {
  // Idempotency guard: if root package.json's name already has the scope, bail.
  const rootPkgContent = readText(TARGETS[0].pkgPath)
  const [, , currentRootName] = getNameLine(rootPkgContent)
  if (currentRootName.startsWith(`${scope}/`)) {
    console.error(`Already scoped as ${currentRootName} — run "off" before running "on" again.`)
    process.exit(1)
  }

  const counter = readCounter()
  const n = counter.n
  const canaryVersion = `0.0.0-canary.${n}`

  // Snapshot originals before any edits.
  const snapshot = {}
  for (const t of TARGETS) {
    const pkgContent = readText(t.pkgPath)
    const [, , origName] = getNameLine(pkgContent)
    const [, , origVersion] = getVersionLine(pkgContent)
    snapshot[t.key] = { name: origName, version: origVersion }
    if (t.indexPath) {
      const indexContent = readText(t.indexPath)
      const [, , origRange] = getPublishedRangeLine(indexContent)
      snapshot[t.key].publishedRange = origRange
    }
  }
  writeText(SNAPSHOT_FILE, JSON.stringify(snapshot, null, 2) + '\n')

  // Apply edits.
  for (const t of TARGETS) {
    let pkgContent = readText(t.pkgPath)
    const [nameFull, namePre, origName, namePost] = getNameLine(pkgContent)
    pkgContent = replaceOnce(
      pkgContent,
      nameFull,
      `${namePre}${scope}/${origName}${namePost}`,
      t.pkgPath
    )
    const [versionFull, versionPre, , versionPost] = getVersionLine(pkgContent)
    pkgContent = replaceOnce(
      pkgContent,
      versionFull,
      `${versionPre}${canaryVersion}${versionPost}`,
      t.pkgPath
    )
    writeText(t.pkgPath, pkgContent)

    if (t.indexPath) {
      let indexContent = readText(t.indexPath)
      const [rangeFull, rangePre] = getPublishedRangeLine(indexContent)
      indexContent = replaceOnce(
        indexContent,
        rangeFull,
        `${rangePre}'npm:${scope}/flowkit@${canaryVersion}'`,
        t.indexPath
      )
      writeText(t.indexPath, indexContent)
    }
  }

  writeCounter({ n: n + 1 })

  console.log(execSync('git diff --stat', { cwd: ROOT }).toString())
  console.log(
    `\n⚠ Published as ${scope}/*@${canaryVersion}. FLOWKIT_PUBLISHED_RANGE in both scaffolders is pinned ` +
      `to this exact canary number. If ${scope}/flowkit is ever republished alone (a newer canary number) ` +
      `without republishing both scaffolders to match, every future 'npm create ${scope}/...' will keep ` +
      `installing the older pinned library version.`
  )
}

function turnOff(scope) {
  if (!fs.existsSync(SNAPSHOT_FILE)) {
    console.error('No pre-canary snapshot found — nothing to revert (was "on" ever run?).')
    process.exit(1)
  }
  const snapshot = JSON.parse(readText(SNAPSHOT_FILE))

  for (const t of TARGETS) {
    const orig = snapshot[t.key]
    let pkgContent = readText(t.pkgPath)
    const [nameFull, namePre, , namePost] = getNameLine(pkgContent)
    pkgContent = replaceOnce(pkgContent, nameFull, `${namePre}${orig.name}${namePost}`, t.pkgPath)
    const [versionFull, versionPre, , versionPost] = getVersionLine(pkgContent)
    pkgContent = replaceOnce(
      pkgContent,
      versionFull,
      `${versionPre}${orig.version}${versionPost}`,
      t.pkgPath
    )
    writeText(t.pkgPath, pkgContent)

    if (t.indexPath) {
      let indexContent = readText(t.indexPath)
      const [rangeFull, rangePre] = getPublishedRangeLine(indexContent)
      indexContent = replaceOnce(
        indexContent,
        rangeFull,
        `${rangePre}'${orig.publishedRange}'`,
        t.indexPath
      )
      writeText(t.indexPath, indexContent)
    }
  }

  fs.unlinkSync(SNAPSHOT_FILE)

  console.log(execSync('git diff --stat', { cwd: ROOT }).toString())
  console.log(`\nReverted to unscoped state. (.canary-version.json counter left untouched.)`)
}

const [, , scope, mode] = process.argv

if (!scope || !mode || !['on', 'off'].includes(mode) || !scope.startsWith('@')) {
  console.error('Usage: node scripts/dev/scope-toggle.js <@scope> <on|off>')
  process.exit(1)
}

if (mode === 'on') {
  turnOn(scope)
} else {
  turnOff(scope)
}
