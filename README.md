# dsh-plugin-mermaid-preview

Mermaid diagram previews for the DeepSeek Harness right-sidebar document viewer.
Open a `.mmd` or `.mermaid` file in the sidebar and the diagram is drawn instead
of the source being listed as plain text.

## What it does

- Registers a **document-preview implementation** for the `mmd` and `mermaid`
  file suffixes through the harness's public `documentPreviews` extension point.
- Renders the diagram with [mermaid](https://mermaid.js.org/) 11, bundled into
  the plugin's own client artifact.
- Follows the shell's light/dark palette and re-renders when the theme changes.
- Zooms per diagram view: `−` / percentage / `+` / `重置` in a small control under
  the diagram, plus Ctrl (or ⌘) + wheel over it. 100% means "fills the pane
  width", the remembered zoom is a view preference rather than document state,
  and each preview tab keeps its own zoom because the state lives in the
  renderer instance.
- Falls back to showing the source, with the parse error above it, when a
  diagram does not parse — a file the agent is still writing is the common case,
  so a failed render never hides the content.
- Ships Simplified Chinese and English copy through the shell's locale service.

Supported diagram types are mermaid's own: flowchart, sequence, class, state,
entity-relationship, gantt, pie, git graph, mindmap, timeline, quadrant,
requirement, sankey, block, architecture, and the rest.

## What it does not do

**Mermaid fenced code blocks inside chat messages are not rendered.** The chat
Markdown pipeline (`@deepseek-ai/dsh-client-ui-primitives`, `src/markdown/render.tsx`)
maps a fenced block to a `switch` arm over mdast node types and always renders
`<CodeBlock>`; the only language it special-cases is `math`. There is no
registry, prop, or service a third-party client plugin can use to claim a
language, so a ` ```mermaid ` block in a message keeps its syntax-highlighted
code block. Rendering those would mean patching that package in the DSH
checkout — a product change, not a plugin.

## Requirements

- DSH with the `web` profile (`@deepseek-ai/dsh-web-app`), which mounts
  `@deepseek-ai/dsh-client-ui-sidebar-documentpreview`. The plugin stays parked
  until that viewer is mounted, because `documentPreviews` is the service it
  extends.

## Install

The harness serves the built `lib/client.js` and never reads sources, and build
output is not committed, so **build first**:

```sh
git clone https://github.com/huiyeo/dsh-plugin-mermaid-preview
cd dsh-plugin-mermaid-preview
pnpm install
pnpm run build
```

Then install that directory as a profile layer:

```sh
dsh plugin --profile web add /path/to/dsh-plugin-mermaid-preview
```

`dsh plugin add` installs the package and, because the manifest declares
`dsh.bundle.patch`, appends it to `dsh.profile.bundles`. The bundle layer is read
at process start, so **restart the `dsh web` process**, then reload the page.

To see it without waiting for a restart, a profile with `patchReload: live` also
accepts the row directly in `$DSH_HOME/profiles/web/cordis.patch.yml`, which
hot-mounts on save so only a page reload is needed:

```yaml
- insert:
    - id: mermaid-preview
      name: dsh-plugin-mermaid-preview
```

Add that only while iterating, and remove it once the process restarts: the
bundle layer then mounts the same row, and `documentPreviews.register()` throws
on a duplicate implementation id.

Verify the layer landed:

```sh
node -e "console.log(require('./package.json').dsh.profile.bundles)" \
  # run in $DSH_HOME/profiles/web  →  should list dsh-plugin-mermaid-preview
```

Remove it with `dsh plugin --profile web remove dsh-plugin-mermaid-preview`.

## Development

```sh
pnpm install
pnpm run build          # lib/index.js (host half) + lib/client.js (browser half)
pnpm test               # load the built artifact the way the module system does
```

`tests/browser-smoke.mjs` additionally renders a diagram in headless Chrome and
asserts on the produced SVG. It needs a browser that can actually start —
a confined sandbox blocks Chrome's own IPC, so run it somewhere unrestricted:

```sh
CHROME_PATH=/path/to/chrome pnpm run test:browser
```

### How the two halves fit together

`lib/index.js` is the host half and deliberately contributes nothing: a package
is only scanned for a browser half when it is mounted as a host row, so the row
exists to make the browser half discoverable.

`lib/client.js` is a single classic script that calls
`window.__ModuleLoader__.load({ id, factory })` with a CommonJS-style factory.
That format is the harness's own client-bundle contract; the browser half of
`@deepseek-ai/dsh-client-modules` serves the file and drives it. Two
consequences shape the build:

- **Only the harness browser platform's module-table words may stay external**
  (`react`, `react/jsx-runtime`, the UI registries). Everything else — mermaid
  included — must be inlined, because a `require()` the module table cannot
  answer throws when the bundle materializes.
- **The artifact must be one file.** mermaid loads each diagram grammar through
  a dynamic `import()`; the plugin loader serves exactly one file per package
  and there is no dynamic-import hook, so `codeSplitting: false` folds every
  grammar into the factory. The result is ~7 MB uncompressed, fetched once and
  cached by revision.

The document body receives `loading: 'bytes-complete'` content, so it gets the
whole file in one shot and never has to page — the paged mode would hand it an
accumulated prefix with no way to request the rest.

### Zoom must snap to the DEVICE pixel grid

The renderer re-sizes the SVG through its own `width`/`height` attributes rather
than through CSS, so the browser re-rasterizes the vector at the target size
instead of resampling a bitmap. The size it writes is snapped so that
`width × devicePixelRatio` is a whole number:

```ts
devicePixels / devicePixelRatio   // not Math.round(cssPixels)
```

A whole number of *CSS* pixels is not a whole number of *device* pixels. On a
125%-scaled Windows display (`devicePixelRatio === 1.25`) a 326 px box covers
407.5 device pixels — half a pixel off the grid — and the browser resolves that
by resampling, which reads as blur. It shows up at only *some* zoom steps: 50%
was soft while 100% happened to land whole. Rounding CSS pixels does not fix it;
snapping device pixels does. `tests/` cannot catch this, because jsdom has no
rasterizer.

If it ever needs re-checking, the numbers are visible from the page itself —
`getBoundingClientRect()` on the SVG times `devicePixelRatio` must be a whole
number at every zoom step. To reach a real browser from an agent session, the
[DSH Browser Control](https://github.com/caob23/dsh-browser-control) extension
(Chrome MV3 + a local WebSocket bridge on `127.0.0.1:9777`) works when a sandbox
forbids launching one: the extension dials out as a client, so the agent only has
to accept that socket and can then `eval` in the tab.

## Layout

```
src/index.js                 host half (empty by design)
src/client/index.ts          plugin body: metadata, slot cell, locale, styles
src/client/MermaidBody.tsx   the renderer
src/client/theme.ts          shell palette sampling + dark-mode subscription
src/client/locales.ts        zh/en copy
src/client/styles.ts         plugin-owned stylesheet, injected with a tagged tag
src/client/types.ts          the minimal ambient contracts this package compiles against
cordis.patch.yml             the profile patch that mounts the row
tests/load-artifact.mjs      artifact smoke test (module-loader contract)
tests/browser-smoke.mjs      headless render check (needs an unrestricted browser)
tests/zoom.html              two-instance harness proving zoom is per-view
```

## License

MIT
