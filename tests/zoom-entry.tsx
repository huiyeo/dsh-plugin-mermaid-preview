/**
 * Browser entry for the zoom smoke test.
 *
 * Mounts two independent `MermaidBody` instances in separate hosts so the test
 * can prove that zooming one diagram leaves the other alone — the property that
 * makes the zoom "view-only".
 */
import { createRoot } from 'react-dom/client'
import { createElement } from 'react'
import { MermaidBody } from '../src/client/MermaidBody.tsx'

const t = (key: string): string => key

const diagrams = [
  { host: 'a', source: 'flowchart TD\n    A[One] --> B[Two]\n    B --> C[Three]\n' },
  { host: 'b', source: 'flowchart LR\n    X[Alpha] --> Y[Beta]\n' },
]

for (const { host, source } of diagrams) {
  const container = document.getElementById(host)
  if (container === null) throw new Error(`harness page has no #${host}`)
  createRoot(container).render(createElement(MermaidBody, {
    resourceAddress: `dsh-resource://file/session/zoom/${host}.mmd`,
    content: { kind: 'bytes', data: new TextEncoder().encode(source) },
    wrap: false,
    scrollportRef: () => {},
    t,
  }))
}
