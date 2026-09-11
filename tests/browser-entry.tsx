/**
 * Browser entry for the artifact smoke test.
 *
 * The plugin registers `MermaidBody` as the document body; this mounts that
 * same component through the same React the module table would hand it, with
 * the owner's props. It exists because the renderer is the one part the Node
 * artifact test cannot exercise: mermaid measures the DOM, injects styles, and
 * resolves its grammar chunks through the bundler, all of which need a browser.
 */
import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import { MermaidBody } from '../src/client/MermaidBody.tsx'

const source = `flowchart TD
    A[Request] --> B{Cached?}
    B -- yes --> C[Serve from cache]
    B -- no --> D[Fetch upstream]
    D --> E[Store]
    E --> C
`

const t = (key: string): string => key

const container = document.getElementById('root')
if (container === null) throw new Error('harness page has no #root')

createRoot(container).render(createElement(MermaidBody, {
  resourceAddress: 'dsh-resource://file/session/smoke/diagram.mmd',
  content: { kind: 'bytes', data: new TextEncoder().encode(source) },
  wrap: false,
  scrollportRef: () => {},
  t,
}))
