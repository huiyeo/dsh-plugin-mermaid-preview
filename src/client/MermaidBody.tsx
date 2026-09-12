/**
 * Mermaid diagram body for the right-sidebar document viewer.
 *
 * Delivery mode is `bytes-complete`, so the owner hands the whole file in one
 * shot: unlike a `text-pages` renderer this body is never asked to page, and it
 * must not need to. The source reaches mermaid only after the bytes are decoded;
 * a parse failure keeps the source visible instead of replacing it with an
 * error, because a half-written diagram is the common case for a file the agent
 * is still editing.
 *
 * Zoom is deliberately instance state. Every preview tab mounts its own body, so
 * a zoom set on one diagram cannot reach another: there is no shared scale, no
 * global transform, and no document-level side effect. Only the durable value
 * (the user's preferred reading zoom) is remembered across tabs.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement, WheelEvent } from 'react'
import type { DocumentPreviewProps } from './types.ts'
import { readPalette, subscribeTheme, themeSnapshot } from './theme.ts'
import {
  configure, fitDiagram, MAX_SOURCE_LENGTH, measureIntrinsic, renderDiagram,
} from './mermaid-runtime.ts'
import type { IntrinsicSize } from './mermaid-runtime.ts'
import { styles as css } from './styles.ts'

/** Smallest and largest reading zoom a user can reach, as a multiple of fit-to-width. */
const MIN_ZOOM = 0.25
const MAX_ZOOM = 8

/** Discrete rungs so a zoomed-in diagram lands on round percentages. */
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 6, 8] as const

/** Storage key for the remembered zoom; a view preference, not document state. */
const ZOOM_STORAGE_KEY = 'dsh-plugin-mermaid-preview.zoom'

/** Clamp one zoom request into the supported range. */
function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

/** The next rung above the current zoom, or the maximum when already there. */
function zoomIn(current: number): number {
  return ZOOM_STEPS.find(step => step > current + 1e-6) ?? MAX_ZOOM
}

/** The next rung below the current zoom, or the minimum when already there. */
function zoomOut(current: number): number {
  const below = ZOOM_STEPS.filter(step => step < current - 1e-6)
  return below.length === 0 ? MIN_ZOOM : below[below.length - 1]!
}

/**
 * Read the remembered zoom once per page.
 * @returns the stored zoom, or 1 when nothing valid is stored.
 */
function readStoredZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY)
    if (raw === null) return 1
    const value = Number.parseFloat(raw)
    return Number.isFinite(value) ? clampZoom(value) : 1
  } catch {
    // Storage can be unavailable (private mode, blocked origin); a missing
    // preference is not worth failing a diagram over.
    return 1
  }
}

/** Persist the remembered zoom, ignoring a storage that refuses writes. */
function storeZoom(value: number): void {
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, String(value))
  } catch {
    // Same as above: the diagram is already rendered, the preference is a nicety.
  }
}

/** One render attempt's outcome, kept so a theme change can re-run it. */
type RenderState =
  | { readonly kind: 'rendering' }
  | { readonly kind: 'ready'; readonly svg: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'too-large' }

/**
 * Decode the owner-delivered content into diagram source.
 * @param content - prepared document content.
 * @returns the source text, or undefined when no text is available.
 */
function decodeSource(content: DocumentPreviewProps['content']): string | undefined {
  if (content.kind === 'bytes') return new TextDecoder().decode(content.data)
  return content.text
}

/**
 * Render one Mermaid diagram for the document viewer.
 * @param props - owner content plus this implementation's copy binding.
 * @returns the diagram, or the reason it could not be drawn.
 */
export function MermaidBody({ content, t, scrollportRef }: DocumentPreviewProps): ReactElement {
  const dark = useSyncExternalStore(subscribeTheme, themeSnapshot, () => false)
  const palette = readPalette(dark)
  const source = decodeSource(content)

  const [state, setState] = useState<RenderState>({ kind: 'rendering' })
  const [zoom, setZoom] = useState(readStoredZoom)
  // Available width of the scrollport, and the scale that makes the diagram
  // exactly fill it. Together they define this tab's 100%.
  const [available, setAvailable] = useState(0)
  const [intrinsic, setIntrinsic] = useState<IntrinsicSize | null>(null)
  // The container mermaid measures while laying out; kept in a ref so React
  // never re-creates the node mermaid is writing into.
  const hostRef = useRef<HTMLDivElement | null>(null)
  // Guards against a stale async render landing after unmount or after a newer
  // render started, and against re-rendering an unchanged input.
  const generationRef = useRef(0)
  const renderedRef = useRef<string | null>(null)

  useEffect(() => {
    const renderKey = `${dark ? 'dark' : 'light'}\u0000${source ?? ''}`
    if (renderedRef.current === renderKey) return
    const generation = ++generationRef.current

    if (source === undefined || source.trim() === '') {
      renderedRef.current = renderKey
      setState({ kind: 'too-large' })
      return
    }
    if (source.length > MAX_SOURCE_LENGTH) {
      renderedRef.current = renderKey
      setState({ kind: 'too-large' })
      return
    }

    // Zooming is this renderer's business, so mermaid must not also scale the
    // SVG to the pane: the intrinsic size is what the zoom multiplies.
    configure(palette)
    setState({ kind: 'rendering' })

    void renderDiagram(source).then((result) => {
      if (generationRef.current !== generation) return
      renderedRef.current = renderKey
      setState(result.ok
        ? { kind: 'ready', svg: result.svg }
        : { kind: 'failed', message: result.message })
    })
  }, [dark, palette, source])

  // The diagram owns the scrolling: the SVG is wider than the pane far more
  // often than the source text is wider than the editor.
  useEffect(() => {
    scrollportRef(hostRef.current)
    return () => { scrollportRef(null) }
  }, [scrollportRef, state.kind])

  // Fit-to-width needs the pane's live width: the sidebar is resizable and the
  // same tab survives a resize.
  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const observer = new ResizeObserver(() => { setAvailable(host.clientWidth) })
    observer.observe(host)
    setAvailable(host.clientWidth)
    return () => { observer.disconnect() }
  }, [state.kind])

  // Measure the freshly written SVG, and re-measure when the theme swap replaces
  // it: a different palette can produce a different intrinsic size. Layout effect
  // so the first frame after mermaid's markup lands already carries the right size.
  useLayoutEffect(() => {
    if (state.kind !== 'ready') return
    setIntrinsic(measureIntrinsic(hostRef.current))
  }, [state, dark])

  const canZoom = state.kind === 'ready' && intrinsic !== null && available > 0
  // 100% means "fills the pane": the diagram is scaled to the available width,
  // and the user's zoom multiplies from there. `fitDiagram` owns the DEVICE
  // pixel snapping that keeps every zoom step crisp — see its doc comment.
  const size = canZoom ? fitDiagram(intrinsic, available, zoom) : undefined
  const renderWidth = size?.width
  const renderHeight = size?.height

  // Size the SVG through its own width/height ATTRIBUTES, not through CSS.
  // Mermaid writes an SVG with a viewBox plus a pixel width/height; a CSS-only
  // scale leaves the browser rasterizing at mermaid's size and then resampling,
  // which is visibly blurry below 100%. Setting the attributes re-rasterizes the
  // vector at the exact target size, so every zoom step stays crisp. Layout
  // effect so the attributes land in the same frame as the wrapper's size.
  useLayoutEffect(() => {
    if (renderWidth === undefined || renderHeight === undefined) return
    for (const svg of hostRef.current?.querySelectorAll('svg') ?? []) {
      svg.setAttribute('width', String(renderWidth))
      svg.setAttribute('height', String(renderHeight))
      // Mermaid's `max-width: 100%` would re-clamp what we just set.
      svg.style.removeProperty('max-width')
    }
  }, [renderWidth, renderHeight, state])

  const applyZoom = useCallback((next: number) => {
    const clamped = clampZoom(next)
    setZoom(clamped)
    storeZoom(clamped)
  }, [])

  const onWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    // Ctrl/Cmd + wheel is the platform gesture for "zoom this surface"; a plain
    // wheel stays a scroll so the diagram does not fight the pane.
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    applyZoom(event.deltaY < 0 ? zoomIn(zoom) : zoomOut(zoom))
  }, [applyZoom, zoom])

  if (state.kind === 'too-large') {
    return (
      <div className={css.panel} data-mermaid-state="unavailable">
        <p className={css.notice}>{t('source.unavailable')}</p>
        <pre className={css.source}>{source ?? ''}</pre>
      </div>
    )
  }

  return (
    <div className={css.panel} data-mermaid-state={state.kind}>
      <div ref={hostRef} className={css.diagram} data-mermaid-diagram="" data-mermaid-zoom={zoom} onWheel={onWheel}>
        {state.kind === 'ready' && (
          // Mermaid produces the SVG string itself; the strict security level
          // sanitizes label content before it is ever serialized here. The
          // wrapper carries the zoomed size so the scrollport measures the real
          // footprint rather than the untransformed one.
          <div
            className={css.canvas}
            data-mermaid-canvas=""
            style={renderWidth === undefined || renderHeight === undefined
              ? undefined
              : { width: `${String(renderWidth)}px`, height: `${String(renderHeight)}px` }}
            dangerouslySetInnerHTML={{ __html: state.svg }}
          />
        )}
      </div>
      {state.kind === 'ready' && (
        <div className={css.tools} data-mermaid-tools="">
          <button type="button" className={css.tool} aria-label={t('zoom.out')} title={t('zoom.out')}
            disabled={zoom <= MIN_ZOOM} onClick={() => { applyZoom(zoomOut(zoom)) }}>−</button>
          <span className={css.readout} data-mermaid-zoom-readout="" aria-live="polite">
            {`${String(Math.round(zoom * 100))}%`}
          </span>
          <button type="button" className={css.tool} aria-label={t('zoom.in')} title={t('zoom.in')}
            disabled={zoom >= MAX_ZOOM} onClick={() => { applyZoom(zoomIn(zoom)) }}>+</button>
          <button type="button" className={css.tool} aria-label={t('zoom.reset')} title={t('zoom.reset')}
            data-mermaid-zoom-reset="" disabled={zoom === 1} onClick={() => { applyZoom(1) }}>{t('zoom.reset')}</button>
        </div>
      )}
      {state.kind === 'rendering' && <p className={css.notice}>{t('rendering')}</p>}
      {state.kind === 'failed' && (
        <div className={css.failure} data-mermaid-error>
          <p className={css.notice}>{t('error.title')}</p>
          <pre className={css.detail}>{state.message}</pre>
          <pre className={css.source}>{source ?? ''}</pre>
        </div>
      )}
    </div>
  )
}
