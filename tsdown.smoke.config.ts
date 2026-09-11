/**
 * Browser smoke-test bundles: the renderer plus the React it needs, as
 * self-contained ESM files a plain page can load. Nothing about the shipped
 * artifact is exercised here except the renderer itself — the module-loader
 * contract is `tests/load-artifact.mjs`'s job.
 *
 * One config per entry: a single synchronous file per page means
 * `codeSplitting` must be off, and rolldown refuses that with several entries.
 */
const base = {
  outDir: 'tests/dist',
  format: ['esm'],
  platform: 'browser',
  target: 'es2022',
  dts: false,
  sourcemap: false,
  clean: false,
  outputOptions: { codeSplitting: false },
  deps: {
    alwaysBundle: () => true,
  },
  define: {
    'process.env.NODE_ENV': '"development"',
  },
}

export default [
  {
    ...base,
    name: 'dsh-plugin-mermaid-preview/smoke',
    entry: { 'browser-run': 'tests/browser-entry.tsx' },
  },
  {
    ...base,
    name: 'dsh-plugin-mermaid-preview/zoom-smoke',
    entry: { 'zoom-run': 'tests/zoom-entry.tsx' },
  },
]
