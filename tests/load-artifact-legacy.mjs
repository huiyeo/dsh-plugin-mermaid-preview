/**
 * Degradation test: the harness WITHOUT the Markdown fence registry.
 *
 * Every harness older than the fence seam ships a `ui-primitives` whose module
 * has no `registeredFences` export, and that is the environment most people
 * installing this plugin from npm will have. An unguarded registration would
 * throw inside `apply` and take the `.mmd` file preview down with it, so this
 * asserts the opposite: the plugin still mounts, still registers its file
 * preview, and simply does not claim the chat language.
 *
 * A separate process from `load-artifact.mjs` because a module's exports are
 * cached per process.
 *
 *   node tests/load-artifact-legacy.mjs
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = join(here, '..', 'lib', 'client.js')
const require = createRequire(import.meta.url)

// The legacy shape: the package exists and exports plenty, just not the registry.
const seed = new Map([
  ['react', require('react')],
  ['react/jsx-runtime', require('react/jsx-runtime')],
  ['@deepseek-ai/dsh-client-ui-primitives', { MarkdownText: () => null }],
])

let registration
globalThis.window = {
  __ModuleLoader__: {
    load(value) {
      registration = value
    },
  },
}

await import(`file://${bundlePath.replaceAll('\\', '/')}`)

const failures = []
const note = message => failures.push(message)

const requested = new Set()
let exports
try {
  exports = registration.factory((specifier) => {
    requested.add(specifier)
    if (seed.has(specifier)) return seed.get(specifier)
    throw new Error(`client-modules: require("${specifier}") missed the module table`)
  })
} catch (error) {
  note(`the factory threw while materializing: ${String(error)}`)
}

const calls = []
const warnings = []
if (exports !== undefined) {
  let previewRegistered = false
  const ctx = {
    logger: { info: message => warnings.push(String(message)) },
    locale: {
      register: () => () => {},
      bind: () => key => key,
    },
    documentPreviews: {
      register: () => { previewRegistered = true; return () => {} },
    },
    slots: {
      inject: (_name, callback) => { callback(); return () => {} },
      register: () => () => {},
    },
    effect: (callback, label) => {
      calls.push(String(label))
      const dispose = callback()
      return typeof dispose === 'function' ? dispose : () => {}
    },
  }
  try {
    exports.apply(ctx)
  } catch (error) {
    note(`apply threw on a harness without the fence registry: ${String(error)}`)
  }
  if (!previewRegistered) note('the .mmd file preview was not registered')
  if (calls.some(label => label.includes('chat fence'))) {
    note('the chat fence was registered even though the registry is absent')
  }
  if (warnings.length === 0) note('the degradation was not reported to the logger')
}

if (failures.length > 0) {
  console.error('FAIL')
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}

console.log('degrades cleanly on a harness without the Markdown fence registry')
console.log(`  registered: ${calls.join(', ')}`)
console.log(`  reported:   ${warnings[0] ?? '(nothing)'}`)
