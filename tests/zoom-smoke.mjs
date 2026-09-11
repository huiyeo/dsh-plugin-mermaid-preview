/**
 * Zoom-control smoke test for the renderer.
 *
 * The companion to `browser-smoke.mjs`: it drives the actual zoom buttons and
 * Ctrl+wheel over the real rendered SVG, and reports what changed. Like the
 * other browser test it reports over HTTP because a child process's piped
 * stdout is not capturable under a confined harness sandbox.
 *
 * The page under test is `tests/zoom.html`, which mounts `MermaidBody` with the
 * same props the document owner supplies.
 *
 * Run with: node tests/zoom-smoke.mjs
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
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
  '.css': 'text/css; charset=utf-8',
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
        resolveReport({ failures: [`unreadable report: ${String(error)}`] })
      }
    })
    return
  }
  const path = normalize(decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname))
    .replace(/^[\\/]+/, '')
  const file = join(root, path === '' ? 'tests/zoom.html' : path)
  if (!file.startsWith(root) || !existsSync(file)) {
    response.writeHead(404).end('not found')
    return
  }
  response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  response.end(readFileSync(file))
})

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const { port } = server.address()
const url = `http://127.0.0.1:${String(port)}/tests/zoom.html`

let report = null
let browser = null
try {
  browser = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${join(here, 'dist', 'zoom-profile')}`,
    '--virtual-time-budget=60000',
    url,
  ], { stdio: 'ignore', shell: process.platform === 'win32' })

  report = await Promise.race([
    reported,
    new Promise(resolve => setTimeout(() => { resolve(null) }, 60000)),
  ])
} finally {
  browser?.kill()
  server.close()
}

if (report === null) {
  console.error('FAIL\n - the page never reported a result')
  process.exit(1)
}

const failures = Array.isArray(report.failures) ? report.failures : ['report carried no failures list']
if (failures.length > 0) {
  console.error('FAIL')
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}

console.log('zoom smoke test passed')
for (const step of report.steps ?? []) console.log(`  ${step}`)
