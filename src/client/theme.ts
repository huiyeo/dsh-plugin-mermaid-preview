/**
 * DSH theme observation for the diagram renderer.
 *
 * The shell writes `data-ds-dark-theme` onto `<body>` and exposes its palette
 * as `--dsw-*` custom properties. Mermaid has its own theme engine and cannot
 * read those, so the renderer samples the live palette and hands mermaid a
 * matching theme. React's `useSyncExternalStore` needs a stable subscription
 * over an external mutable source — hence this module rather than an effect.
 */

/** The attribute the shell toggles for the dark palette. */
const DARK_ATTRIBUTE = 'data-ds-dark-theme'

const listeners = new Set<() => void>()
let observing = false

function notify(): void {
  for (const listener of [...listeners]) listener()
}

/**
 * Start observing the shell's theme attribute.
 * @param listener - notified on every palette change.
 * @returns its own unsubscribe.
 */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  if (!observing && typeof document !== 'undefined') {
    observing = true
    // A second observer per subscriber would be waste: the module owns one and
    // fans out, and the attribute is the only signal the shell publishes.
    new MutationObserver(notify).observe(document.body, {
      attributes: true,
      attributeFilter: [DARK_ATTRIBUTE],
    })
  }
  return () => { listeners.delete(listener) }
}

/**
 * @returns a value that changes exactly when the palette changes.
 */
export function themeSnapshot(): boolean {
  return typeof document !== 'undefined' && document.body?.hasAttribute(DARK_ATTRIBUTE) === true
}

/**
 * Read one palette custom property from the live document.
 * @param name - custom property name including the leading dashes.
 * @param fallback - value used when the shell does not define it.
 * @returns the resolved declaration text.
 */
export function palette(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.body).getPropertyValue(name).trim()
  return value === '' ? fallback : value
}

/** Mermaid `themeVariables` for the shell's current palette. */
export interface MermaidPalette {
  readonly dark: boolean
  readonly background: string
  readonly primaryTextColor: string
  readonly secondaryTextColor: string
  readonly lineColor: string
  readonly borderColor: string
  readonly surface: string
  readonly accent: string
}

/**
 * Sample the shell palette into mermaid theme variables.
 * @param dark - current palette arm.
 * @returns resolved colours, with a neutral fallback per token.
 */
export function readPalette(dark: boolean): MermaidPalette {
  return {
    dark,
    background: 'transparent',
    primaryTextColor: palette('--dsw-alias-label-primary', dark ? '#e6e6e6' : '#1a1a1a'),
    secondaryTextColor: palette('--dsw-alias-label-secondary', dark ? '#a8a8a8' : '#5c5c5c'),
    lineColor: palette('--dsw-alias-border-l4', dark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.32)'),
    borderColor: palette('--dsw-alias-border-l4', dark ? 'rgba(255,255,255,0.32)' : 'rgba(0,0,0,0.32)'),
    surface: palette('--dsw-alias-markdown-code-block', dark ? '#1b1b1d' : '#f7f8fa'),
    accent: palette('--dsw-alias-brand-primary', dark ? '#7aa2ff' : '#2f6feb'),
  }
}
