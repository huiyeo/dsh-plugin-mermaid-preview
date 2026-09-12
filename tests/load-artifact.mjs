/**
 * Artifact smoke test: load the built `lib/client.js` the way the harness's
 * browser module system does, then drive the exported plugin through a stub
 * context.
 *
 * This is not a substitute for the browser, but it does verify the parts a
 * build can silently get wrong: the `__ModuleLoader__.load` handoff, the
 * CommonJS factory contract, the external specifiers the factory asks the module
 * table for, that `apply` reaches every registry, and that the chat fence
 * registers into the SHARED `ui-primitives` registry rather than a bundled copy
 * of it.
 *
 * Run with the DSH checkout's react on the resolution path:
 *   node tests/load-artifact.mjs
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = join(here, '..', 'lib', 'client.js')
// react and react/jsx-runtime are module-table externals. They resolve from
// this package's own install, which is where the plugin's declared peer
// dependencies were materialized.
const require = createRequire(import.meta.url)

/**
 * A stub of the harness's shared `ui-primitives` module-table entry.
 *
 * Recording what the plugin registers here is the point: if the bundle had
 * INLINED its own copy of `ui-primitives` instead of requiring the shared one,
 * the plugin would register into that private copy, the transcript would read
 * the shared registry, and the diagram would silently never render.
 */
const fenceRegistrations = new Map()
const registeredFences = {
  register(language, renderer) {
    if (fenceRegistrations.has(language)) throw new Error(`duplicate language ${language}`)
    fenceRegistrations.set(language, renderer)
    let active = true
    return () => {
      if (!active) return
      active = false
      fenceRegistrations.delete(language)
    }
  },
  forLanguage(language) {
    return fenceRegistrations.get(language) ?? null
  },
}

const seed = new Map([
  ['react', require('react')],
  ['react/jsx-runtime', require('react/jsx-runtime')],
  ['@deepseek-ai/dsh-client-ui-primitives', { registeredFences }],
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
const check = (condition, message) => {
  if (!condition) failures.push(message)
}

check(registration !== undefined, 'bundle did not call window.__ModuleLoader__.load')
check(registration?.id === 'dsh-plugin-mermaid-preview', `unexpected bundle id: ${registration?.id}`)
check(typeof registration?.factory === 'function', 'registration carries no factory')

const requested = new Set()
const exports = registration.factory((specifier) => {
  requested.add(specifier)
  if (seed.has(specifier)) return seed.get(specifier)
  throw new Error(`client-modules: require("${specifier}") missed the module table`)
})

check(typeof exports.apply === 'function', 'factory exports no apply')
check(Array.isArray(exports.inject), 'factory exports no inject array')
check(
  JSON.stringify(exports.inject) === JSON.stringify(['slots', 'locale', 'documentPreviews']),
  `unexpected inject: ${JSON.stringify(exports.inject)}`,
)
// Anything outside the seeded platform words would throw at materialization in
// the browser, so this list is the whole runtime dependency surface.
const unexpected = [...requested].filter(specifier => !seed.has(specifier))
check(unexpected.length === 0, `factory requested specifiers the module table cannot answer: ${unexpected.join(', ')}`)

const calls = []
const disposers = []
let previewDefinition
let slotRegistration
let styleTag

globalThis.document = {
  head: { append: (tag) => { styleTag = tag } },
  createElement: (name) => ({ name, dataset: {}, textContent: '', remove() {} }),
  querySelector: () => null,
}

const ctx = {
  locale: {
    register: (namespace, dictionaries) => {
      calls.push(`locale.register:${namespace}`)
      check(dictionaries.zh !== undefined && dictionaries.en !== undefined, 'locale register lacks a dictionary pair')
      return () => {}
    },
    bind: (namespace) => (key) => `${namespace}.${key}`,
  },
  documentPreviews: {
    register: (definition) => {
      calls.push(`documentPreviews.register:${definition.id}`)
      previewDefinition = definition
      return () => {}
    },
  },
  slots: {
    inject: (name, callback) => {
      calls.push(`slots.inject:${name}`)
      disposers.push(callback())
      return () => {}
    },
    register: (value, component) => {
      calls.push(`slots.register:${value.name}#${value.key}`)
      slotRegistration = value
      check(typeof component === 'function', 'slot registration component is not a component')
      return () => {}
    },
  },
  effect: (callback, label) => {
    calls.push(`effect:${label}`)
    const dispose = callback()
    if (typeof dispose === 'function') disposers.push(dispose)
    return () => {}
  },
}

exports.apply(ctx)

check(previewDefinition !== undefined, 'no document-preview definition registered')
check(previewDefinition?.loading === 'bytes-complete', `unexpected loading mode: ${previewDefinition?.loading}`)
check(
  JSON.stringify(previewDefinition?.extensions) === JSON.stringify(['mmd', 'mermaid']),
  `unexpected extensions: ${JSON.stringify(previewDefinition?.extensions)}`,
)
// Omitting `priority` is what puts the implementation in the band that wins
// over the builtin renderer for the same suffix.
check(previewDefinition?.priority === undefined, 'definition must not pin a priority band')
check(typeof previewDefinition?.title === 'function', 'definition title is not lazily evaluated')
check(slotRegistration?.key === previewDefinition?.id, 'slot cell key and metadata id must match')
check(slotRegistration?.locale === 'mermaidPreview', `unexpected locale namespace: ${slotRegistration?.locale}`)
check(styleTag?.dataset?.plugin === 'dsh-plugin-mermaid-preview', 'stylesheet was not injected with the plugin tag')

// The chat fence. Asserted BEFORE the disposers run, because releasing the
// plugin's effects must unregister the language.
const fenceRenderer = registeredFences.forLanguage('mermaid')
check(fenceRenderer !== null, 'the mermaid fence language was not registered into the shared registry')
check(typeof fenceRenderer === 'function', 'the mermaid fence renderer is not callable')
if (typeof fenceRenderer === 'function') {
  // Shape only. `MarkdownText` renders whatever this returns as a child element,
  // and the renderer is a component with hooks, so it cannot be invoked outside
  // React — drawing it is the browser test's job.
  const element = fenceRenderer('flowchart TD\n  A --> B\n', false)
  check(element !== null && typeof element === 'object', 'the mermaid fence renderer did not return an element')
}

for (const dispose of disposers) dispose()

check(
  registeredFences.forLanguage('mermaid') === null,
  'releasing the plugin left the mermaid fence language registered',
)

if (failures.length > 0) {
  console.error('FAIL')
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}

console.log('artifact loads under the module-loader contract')
console.log(`  external requests: ${[...requested].join(', ')}`)
console.log('  contributions:')
for (const call of calls) console.log(`    ${call}`)
