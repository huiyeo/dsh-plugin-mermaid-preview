/**
 * Inline Mermaid renderer for a ```mermaid fence inside a chat message.
 *
 * Registered into the shared fence registry `ui-primitives` exposes, so the chat
 * transcript renders the diagram with no cooperation from the chat package: the
 * registry lives in a module the harness shares, both sides hold the same
 * instance, and the plugin owns its registration for its own lifetime.
 *
 * It returns null instead of drawing whenever it would be guessing — a body
 * without its closing fence, a parse error, a render still in flight — and the
 * fence then keeps its syntax-highlighted source. A half-drawn diagram in a
 * streaming reply is worse than the source the reader can already see.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { configure, MAX_SOURCE_LENGTH, renderDiagram } from './mermaid-runtime.ts'
import { fenceClosed, readPalette, subscribeTheme, themeSnapshot } from './theme.ts'
import { styles as css } from './styles.ts'

/**
 * Render one ```mermaid fence body.
 * @param props - the fence body and whether its message is still growing.
 * @returns the diagram, or null while the default code block should stand in.
 */
export function MermaidFence({ code, streaming }: {
  /** Fence body, info string excluded. */
  code: string
  /** Whether the enclosing message is still streaming. */
  streaming: boolean
}): ReactElement | null {
  const dark = useSyncExternalStore(subscribeTheme, themeSnapshot, () => false)
  const palette = readPalette(dark)
  const source = code.trimEnd()

  const [svg, setSvg] = useState<string | null>(null)
  // Guards a stale async render landing after unmount or after a newer source.
  const generationRef = useRef(0)
  const renderedRef = useRef<string | null>(null)

  // Whether this body is drawable at all, decided before any render work so the
  // fallback to the code block is immediate.
  const drawable = source !== ''
    && source.length <= MAX_SOURCE_LENGTH
    && (!streaming || fenceClosed(code))

  useEffect(() => {
    const renderKey = `${dark ? 'dark' : 'light'}\u0000${source}`
    if (renderedRef.current === renderKey) return
    const generation = ++generationRef.current
    if (!drawable) {
      renderedRef.current = renderKey
      setSvg(null)
      return
    }
    // Same shared configuration as the document preview; the drawing is capped
    // at the message column by CSS rather than by mermaid.
    configure(palette)
    void renderDiagram(source).then((result) => {
      if (generationRef.current !== generation) return
      renderedRef.current = renderKey
      setSvg(result.ok ? result.svg : null)
    })
  }, [dark, palette, source, drawable])

  if (!drawable || svg === null) return null

  return (
    <div className={css.fence} data-mermaid-fence="">
      <div className={css.fenceCanvas} dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  )
}
