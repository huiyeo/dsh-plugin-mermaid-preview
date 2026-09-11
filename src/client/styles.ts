/**
 * Plugin-owned stylesheet.
 *
 * The harness compiles `*.module.css` inside its own client build, which an
 * out-of-tree package cannot reuse, so this plugin ships its styles as text and
 * injects them into a tagged `<style>` element of its own. The tag carries
 * `data-plugin`, which is how the harness's module system attributes injected
 * styles to their owning plugin for hot-reload bookkeeping.
 */

/** Plugin id stamped on the injected tag and used as its dedupe key. */
const PLUGIN_ID = 'dsh-plugin-mermaid-preview'

/** The class names the component reads; plain, because the seat gives the body its own subtree. */
export const styles = {
  panel: 'dsh-mermaid-panel',
  diagram: 'dsh-mermaid-diagram',
  canvas: 'dsh-mermaid-canvas',
  notice: 'dsh-mermaid-notice',
  failure: 'dsh-mermaid-failure',
  detail: 'dsh-mermaid-detail',
  source: 'dsh-mermaid-source',
  tools: 'dsh-mermaid-tools',
  tool: 'dsh-mermaid-tool',
  readout: 'dsh-mermaid-readout',
} as const

const CSS = `
.dsh-mermaid-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  box-sizing: border-box;
  /* Fill the document body so the diagram's own scroller has a bounded height
     to size against: without this a tall diagram would stretch the panel and
     never scroll internally. */
  height: 100%;
  min-height: 0;
  color: var(--dsw-alias-label-primary, inherit);
  font: var(--dsw-font-markdown-base, 14px/24px inherit);
}
.dsh-mermaid-diagram {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  /* The only overflow owner and the only region that grows: the scaled diagram
     scrolls here, which is also the scrollport reported to the document owner. */
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  overflow: auto;
}
/* The zoomed footprint. The SVG inside is re-sized through its own width/height
   attributes (see MermaidBody), so this box only has to reserve the layout the
   scrollport measures — hence no width/height rule on the svg itself, which
   would resample a raster instead of re-rendering the vector. */
.dsh-mermaid-canvas {
  flex: 0 0 auto;
  margin: auto;
  /* Re-rasterize on every zoom step instead of letting the compositor keep the
     layer's bitmap and stretch it. Without this the live display shows a
     resampled raster at some steps (50% on a 1x display) while a screenshot —
     which forces a fresh raster at the target size — comes out crisp. */
  will-change: transform;
}
.dsh-mermaid-canvas > svg {
  display: block;
  /* Vector geometry must not be snapped to the device pixel grid. Under a
     non-unit zoom Chrome otherwise applies pixel-grid snapping, which shows up
     as one zoom step (50% on a 1x display) looking softer than its neighbours
     even though the SVG was re-sized rather than resampled. geometricPrecision
     keeps every scale on the vector path. */
  shape-rendering: geometricPrecision;
}
/* Keep hairlines readable when zoomed out. Mermaid writes stroke-width in user
   units, so a 50% view halves them; a non-scaling stroke holds the drawn width
   in screen pixels while the geometry still scales. */
.dsh-mermaid-canvas svg .edgePath path,
.dsh-mermaid-canvas svg .flowchart-link,
.dsh-mermaid-canvas svg .messageLine0,
.dsh-mermaid-canvas svg .messageLine1,
.dsh-mermaid-canvas svg .relation,
.dsh-mermaid-canvas svg .transition {
  vector-effect: non-scaling-stroke;
}
.dsh-mermaid-notice {
  margin: 0;
  color: var(--dsw-alias-label-secondary, inherit);
  text-align: center;
}
.dsh-mermaid-failure {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-mermaid-detail,
.dsh-mermaid-source {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--dsw-alias-markdown-code-block, transparent);
  font: var(--dsw-font-markdown-code-block, 11px/19px monospace);
  white-space: pre-wrap;
  word-break: break-word;
  overflow: auto;
}
.dsh-mermaid-detail {
  border: 1px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.16));
}
.dsh-mermaid-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  /* Zoom is per diagram view: the control sits with the view it changes. */
  position: sticky;
  bottom: 0;
  align-self: flex-end;
  padding: 2px 4px;
  border: 1px solid var(--dsw-alias-border-l4, rgba(0, 0, 0, 0.16));
  border-radius: 8px;
  background: var(--dsw-alias-markdown-code-block, rgba(127, 127, 127, 0.08));
}
.dsh-mermaid-tool {
  min-width: 24px;
  height: 22px;
  padding: 0 6px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.dsh-mermaid-tool:hover:not(:disabled) {
  background: var(--dsw-alias-border-l4, rgba(127, 127, 127, 0.2));
}
.dsh-mermaid-tool:disabled {
  opacity: 0.4;
  cursor: default;
}
.dsh-mermaid-readout {
  min-width: 44px;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-secondary, inherit);
}
`

/**
 * Inject this plugin's stylesheet exactly once per document.
 * @returns a disposer removing the tag this call created, or a no-op when the tag already existed.
 */
export function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const selector = `style[data-plugin-css=${JSON.stringify(PLUGIN_ID)}]`
  if (document.querySelector(selector) !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN_ID
  tag.dataset.pluginCss = PLUGIN_ID
  tag.textContent = CSS
  document.head.append(tag)
  return () => { tag.remove() }
}
