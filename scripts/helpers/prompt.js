// Helper: interactive CLI prompt/select-list utilities.
import readline from 'readline'
import { bold as _b, dim as _d, cyan as _c } from './colors.js'

export function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve))
}

export function selectFromList(items) {
  if (!process.stdin.isTTY) {
    // Non-TTY fallback (VS Code terminal, piped input, CI): numbered list via readline
    return new Promise(resolve => {
      items.forEach((item, i) => console.log(`  ${_d(String(i + 1) + '.')} ${item}`))
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.question(_c('? ') + `Select (1–${items.length}): `, ans => {
        rl.close()
        const n = parseInt(ans.trim(), 10) - 1
        resolve(items[Math.max(0, Math.min(isNaN(n) ? 0 : n, items.length - 1))])
      })
    })
  }

  return new Promise(resolve => {
    let idx = 0
    let cursorRestored = false
    const restoreCursor = () => {
      if (cursorRestored) return
      cursorRestored = true
      process.stdout.write('\x1b[?25h')
    }
    // Belt-and-suspenders: covers uncaught exceptions elsewhere in the process
    // and external signals (SIGTERM) that bypass the '\x03' branch in onData
    // below, so the terminal cursor is never left hidden after this process exits.
    process.once('exit', restoreCursor)

    const render = () => {
      process.stdout.write('\x1b[?25l')
      items.forEach((item, i) => {
        const prefix = i === idx ? _c('  ❯ ') : '    '
        const text = i === idx ? _b(item) : _d(item)
        process.stdout.write(`\r${prefix}${text}\n`)
      })
      process.stdout.write(`\x1b[${items.length}A`)
    }

    render()
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    const onData = key => {
      if (key === '\x1b[A') {
        idx = (idx - 1 + items.length) % items.length
        render()
      } else if (key === '\x1b[B') {
        idx = (idx + 1) % items.length
        render()
      } else if (key === '\r' || key === '\n') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.removeListener('data', onData)
        process.stdout.write(`\x1b[${items.length}B`)
        restoreCursor()
        resolve(items[idx])
      } else if (key === '\x03') {
        restoreCursor()
        process.exit()
      }
    }
    process.stdin.on('data', onData)
  })
}
