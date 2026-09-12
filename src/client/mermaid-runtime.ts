/**
 * Shared Mermaid runtime for both places a diagram is drawn: the right-sidebar
 * document preview and a ```mermaid fence inside a chat message.
 *
 * Both need the same four things — one global mermaid configuration per palette,
 * the shell palette sampled into mermaid theme variables, the adaptive size the
 * drawing should occupy, and a render that yields an SVG string. Keeping them
 * here is what stops the two surfaces from drifting: a diagram that looks right
 * in the sidebar cannot look wrong in the transcript.
 *
 * The size rule is the subtle part and is shared deliberately — see
 * {@link fitDiagram}.
 */
import mermaid from 'mermaid'
import { readPalette } from './theme.ts'
import type { MermaidPalette } from './theme.ts'

/**
 * Above this source length neither surface renders: layout of a multi-megabyte
 * diagram blocks the browser thread long enough to look like a hang, and no
 * honest diagram is that large.
 */
export const MAX_SOURCE_LENGTH = 200_000

let configured: MermaidPalette | null = null

/** Build mermaid's theme variables from the sampled shell palette. */
export function themeVariables(palette: MermaidPalette): Record<string, string> {
  return {
    background: palette.background,
    primaryTextColor: palette.primaryTextColor,
    secondaryTextColor: palette.secondaryTextColor,
    tertiaryTextColor: palette.secondaryTextColor,
    lineColor: palette.lineColor,
    textColor: palette.primaryTextColor,
    mainBkg: palette.surface,
    nodeBkg: palette.surface,
    nodeBorder: palette.borderColor,
    clusterBkg: 'transparent',
    clusterBorder: palette.borderColor,
    titleColor: palette.primaryTextColor,
    edgeLabelBackground: palette.background,
    actorBkg: palette.surface,
    actorBorder: palette.borderColor,
    actorTextColor: palette.primaryTextColor,
    signalColor: palette.lineColor,
    signalTextColor: palette.primaryTextColor,
    labelBoxBkgColor: palette.surface,
    labelBoxBorderColor: palette.borderColor,
    labelTextColor: palette.primaryTextColor,
    noteBkgColor: palette.surface,
    noteBorderColor: palette.borderColor,
    noteTextColor: palette.primaryTextColor,
    pie1: palette.accent,
    pie2: palette.borderColor,
  }
}

/**
 * Configure mermaid for the current palette.
 *
 * mermaid's configuration is GLOBAL, so this must be identical for every surface
 * on the page — a per-surface flag here would make the two flip the config back
 * and forth on each render. Both surfaces therefore draw at mermaid's intrinsic
 * size (`useMaxWidth: false`) and own their own scaling: the document preview
 * scales by zoom, and the transcript's CSS caps the drawing at the message
 * column. Memoized on the palette rather than run per render.
 * @param palette - the shell palette to draw with.
 */
export function configure(palette: MermaidPalette): void {
  if (configured !== null
    && configured.dark === palette.dark
    && configured.background === palette.background
    && configured.primaryTextColor === palette.primaryTextColor
    && configured.surface === palette.surface) {
    return
  }
  configured = palette
  mermaid.initialize({
    startOnLoad: false,
    // Guest-authored diagram source is untrusted: strict sanitizes every label
    // and renders HTML labels inside a sandboxed frame, matching the harness's
    // own policy of never letting authored markup reach the document DOM.
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: themeVariables(palette),
    fontFamily: 'inherit',
    flowchart: { useMaxWidth: false, htmlLabels: false },
    sequence: { useMaxWidth: false },
    gantt: { useMaxWidth: false },
    er: { useMaxWidth: false },
    class: { useMaxWidth: false },
    state: { useMaxWidth: false },
    pie: { useMaxWidth: false },
    journey: { useMaxWidth: false },
    gitGraph: { useMaxWidth: false },
  })
}

/** A monotonically increasing id keeps mermaid's internal element ids unique per render. */
let renderSequence = 0

/** One render attempt's SVG, or the reason it could not be drawn. */
export type MermaidRender =
  | { readonly ok: true; readonly svg: string }
  | { readonly ok: false; readonly message: string }

/**
 * Render one diagram source to an SVG string.
 * @param source - the diagram source.
 * @returns the SVG, or the parse/layout error message.
 */
export async function renderDiagram(source: string): Promise<MermaidRender> {
  try {
    const { svg } = await mermaid.render(`dsh-mermaid-${++renderSequence}`, source)
    return { ok: true, svg }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

/** The rendered SVG's intrinsic size, read from the document after mermaid writes it. */
export interface IntrinsicSize {
  readonly width: number
  readonly height: number
}

/**
 * Measure the SVG mermaid wrote into a host, preferring its viewBox because that
 * is the coordinate space the whole diagram lives in.
 * @param host - the element holding the rendered SVG.
 * @returns the intrinsic size, or null before the SVG exists or without a usable box.
 */
export function measureIntrinsic(host: HTMLElement | null): IntrinsicSize | null {
  const svg = host?.querySelector('svg')
  if (svg === undefined || svg === null) return null
  const viewBox = svg.getAttribute('viewBox')
  if (viewBox !== null) {
    const parts = viewBox.trim().split(/[\s,]+/u).map(Number)
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2]! > 0 && parts[3]! > 0) {
      return { width: parts[2]!, height: parts[3]! }
    }
  }
  const width = Number.parseFloat(svg.getAttribute('width') ?? '')
  const height = Number.parseFloat(svg.getAttribute('height') ?? '')
  return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0
    ? { width, height }
    : null
}

/**
 * The size one diagram should be drawn at.
 *
 * `width`/`height` are DEVICE pixel-aligned: a whole number of CSS pixels is not
 * a whole number of device pixels, and on a 1.25 devicePixelRatio display a
 * 326px box covers 407.5 device pixels — half a pixel off the grid, which the
 * browser resolves by resampling and which reads as blur at exactly the zoom
 * steps where the product is fractional.
 */
export interface DiagramSize {
  readonly width: number
  readonly height: number
}

/**
 * Fit one intrinsic size into an available width, scaled by a zoom factor.
 * @param intrinsic - the SVG's natural size.
 * @param available - the CSS width the drawing may occupy.
 * @param zoom - the reading zoom; 1 means "fill the available width".
 * @returns the CSS size to draw at, snapped so it is a whole number of device pixels.
 */
export function fitDiagram(intrinsic: IntrinsicSize, available: number, zoom: number): DiagramSize {
  const devicePixelRatio = typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1)
  const snap = (cssPixels: number): number =>
    Math.max(1, Math.round(cssPixels * devicePixelRatio)) / devicePixelRatio
  const fitScale = available / intrinsic.width
  const width = snap(intrinsic.width * fitScale * zoom)
  const height = snap(intrinsic.height * (width / intrinsic.width))
  return { width, height }
}
