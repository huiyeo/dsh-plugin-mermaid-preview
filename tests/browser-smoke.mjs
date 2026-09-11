/**
 * Headless-browser smoke test for the renderer.
 *
 * Serves this package over HTTP, loads `tests/smoke.html` in headless Chrome,
 * and asserts on the result the page reports back. The renderer is the one part
 * the Node artifact test cannot exercise: mermaid measures the DOM, injects its
 * own styles, and resolves its grammar chunks through the bundler.
 *
 * The page POSTs its outcome to `/report` instead of the runner reading
 * Chrome's `--dump-dom` stdout, because a child process's piped stdio is not
 * capturable under a confined harness sandbox.
 *
 * Run with: node tests/browser-smoke.mjs
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

const chrome = CHROME_CANDIDATES.find(candidate => existsSync(candidate))
if (chrome === undefined) {
  console.error('no Chrome found; set CHROME_PATH to run this test')
  process.exit(2)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

let resolveReport
const reported = new Promise(resolve => { resolveReport = resolve })

const server = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/report') {
    const chunks = []
    request.on('data', chunk => { chunks.push(chunk) })
    request.on('end', () => {
      response.writeHead(204).end()
      try {
        resolveReport(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        resolveReport({ state: 'unreadable-report', parseError: String(error) })
      }
    })
    return
  }
  const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname))
    .replace(/^[\\/]+/, '')
  const file = join(root, path === '' ? 'tests/smoke.html' : path)
  if (!file.startsWith(root) || !existsSync(file)) {
    response.writeHead(404).end('not found')
    return
  }
  response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  response.end(readFileSync(file))
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
const url = `http://127.0.0.1:${String(port)}/tests/smoke.html`
const profileDir = join(here, 'dist', 'chrome-profile')

const failures = []
let report = null
let browser = null
try {
  // Asynchronous on purpose: the report arrives over HTTP, and a synchronous
  // spawn would block the event loop that has to serve it.
  browser = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    '--virtual-time-budget=45000',
    url,
  ], { stdio: 'ignore', shell: process.platform === 'win32' })

  browser.on('error', error => { failures.push(`could not launch Chrome: ${String(error)}`) })

  // Chrome stays alive for the virtual-time budget, so the POST arrives while
  // the browser is still running.
  report = await Promise.race([
    reported,
    new Promise(resolve => setTimeout(() => { resolve(null) }, 60000)),
  ])
} finally {
  browser?.kill()
  server.close()
  // Chrome releases its profile directory lazily; retry once rather than
  // failing the test on a transient Windows lock.
  try {
    rmSync(profileDir, { recursive: true, force: true })
  } catch {
    spawnSync(process.execPath, ['-e', `setTimeout(() => require('node:fs').rmSync(${JSON.stringify(profileDir)}, { recursive: true, force: true }), 1500)`], { stdio: 'ignore' })
  }
}

if (report === null) failures.push('the page never reported a result')
else {
  if (report.state !== 'ready') failures.push(`renderer settled in state "${String(report.state)}"`)
  const html = typeof report.html === 'string' ? report.html : ''
  if (!/<svg[^>]*class="[^"]*mermaid/.test(html)) failures.push('no mermaid SVG in the rendered document')
  if (/data-mermaid-error(?!\w)/.test(html)) failures.push('an error pane is present')
  const errors = Array.isArray(report.consoleErrors) ? report.consoleErrors : []
  if (errors.length > 0) failures.push(`page reported errors: ${errors.join(' | ')}`)
}

if (failures.length > 0) {
  console.error('FAIL')
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log(`browser smoke test passed (state: ${String(report.state)}, mermaid SVG rendered)`)
