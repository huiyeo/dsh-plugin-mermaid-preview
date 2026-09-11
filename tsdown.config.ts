/**
 * tsdown config for the browser half.
 *
 * An out-of-tree DSH client plugin has to reproduce the artifact format the
 * harness's own shared preset (`packages/client/tsdown.client.ts`) produces,
 * because the client module registry serves the built bytes and nothing else:
 * a single `lib/client.js` that is a classic script calling
 * `window.__ModuleLoader__.load({ id, factory })`, with the factory body in
 * CommonJS form (`require` in, `module.exports` out).
 *
 * Externals: only the harness browser platform's module-table seed words are
 * external. Every other dependency — including mermaid and its whole
 * dependency tree — is inlined, because a `require()` the module table cannot
 * answer throws at materialization time.
 */
/**
 * The harness browser platform's module-table seed words. These are the only
 * specifiers the module table can answer, so they are the only externals; every
 * other dependency — including mermaid and its whole dependency tree — is
 * inlined, because a `require()` the table cannot answer throws at
 * materialization time.
 */
const PLATFORM_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
])

export default {
  name: 'dsh-plugin-mermaid-preview/client',
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    // Statement, not inference: the package's own manifest sections say what is
    // installed beside it, which has nothing to do with what the browser module
    // table can answer.
    neverBundle: (id: string) => PLATFORM_MODULES.has(id),
    alwaysBundle: (id: string) => !PLATFORM_MODULES.has(id),
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  outputOptions: {
    entryFileNames: 'client.js',
    // mermaid loads each diagram grammar through a dynamic `import()`. The
    // client module registry serves exactly one file per package and the
    // browser half is a classic script with no dynamic-import hook, so a split
    // chunk would be unreachable: every grammar is inlined into the one
    // synchronous factory instead.
    codeSplitting: false,
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify('dsh-plugin-mermaid-preview')}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}
