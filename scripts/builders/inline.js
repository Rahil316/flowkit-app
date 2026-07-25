// Builder: post-build step inlining CSS/JS into a single standalone HTML file.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '../..')

const distDir = path.resolve(ROOT, 'dist')
const htmlPath = path.join(distDir, 'index.html')

if (!fs.existsSync(htmlPath)) {
  console.error('Error: dist/index.html not found. Please run "npm run build" first.')
  process.exit(1)
}

let html = fs.readFileSync(htmlPath, 'utf8')

// Regex to find CSS links
const cssRegex = /<link[^>]*href=["'](?:\.\/|\/)?assets\/([^"']+\.css)["'][^>]*>/g
// Regex to find JS scripts
const jsRegex = /<script[^>]*src=["'](?:\.\/|\/)?assets\/([^"']+\.js)["'][^>]*>[\s\S]*?<\/script>/g

// Inline CSS
html = html.replace(cssRegex, (match, filename) => {
  const cssPath = path.join(distDir, 'assets', filename)
  if (fs.existsSync(cssPath)) {
    const cssContent = fs.readFileSync(cssPath, 'utf8')
    return `<style>\n${cssContent}\n</style>`
  }
  return match
})

// Inline JS
html = html.replace(jsRegex, (match, filename) => {
  const jsPath = path.join(distDir, 'assets', filename)
  if (fs.existsSync(jsPath)) {
    const jsContent = fs.readFileSync(jsPath, 'utf8')
    // Ensure module script compatibility
    return `<script type="module">\n${jsContent}\n</script>`
  }
  return match
})

// Inline workspace design-system tokens so standalone exports keep custom palettes.
// The default active workspace is the first entry in src/workspaces.ts.
// We parse the name via regex to avoid a runtime import.
const workspacesFile = fs.readFileSync(path.resolve(ROOT, 'src/workspaces.ts'), 'utf8')
const firstWsMatch = workspacesFile.match(/\{\s*name:\s*'([^']+)'/)
const activeWorkspace = firstWsMatch ? firstWsMatch[1] : null
if (activeWorkspace) {
  const dsDir = path.resolve(ROOT, 'workspaces', activeWorkspace, 'design-system')
  if (fs.existsSync(dsDir)) {
    const cssFiles = fs.readdirSync(dsDir).filter(f => f.endsWith('.css'))
    if (cssFiles.length > 0) {
      const tokenStyles = cssFiles.map(f => fs.readFileSync(path.join(dsDir, f), 'utf8')).join('\n')
      html = html.replace('</head>', `<style>\n${tokenStyles}\n</style>\n</head>`)
      console.log(
        `Inlined design-system tokens for workspace "${activeWorkspace}" (${cssFiles.join(', ')})`
      )
    }
  }
}

// Warn if a JSONBin master key was bundled into the output
if (html.includes('X-Master-Key') || /\$2a\$\d+\$/.test(html)) {
  console.warn(
    '\n⚠️️️  WARNING: A JSONBin master key may be embedded in the standalone output.\n' +
      '   This key grants full account access to anyone who views the HTML source.\n' +
      '   Remove the key from JSONBIN_CONFIG.providedKey before sharing.\n'
  )
}

// Save to standalone.html
const standalonePath = path.join(distDir, 'standalone.html')
fs.writeFileSync(standalonePath, html, 'utf8')

console.log('\n🚀 Standalone build successful!')
console.log(`Generated single-file bundle at: ${standalonePath}\n`)
