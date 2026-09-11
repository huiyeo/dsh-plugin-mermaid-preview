/**
 * Copy for the Mermaid document body.
 *
 * Registered under the plugin's own namespace, so the shell's locale service
 * owns selection and the component reads it through the seat's `t` binding.
 */

/** The namespace this plugin registers its dictionaries under. */
export const NS = 'mermaidPreview'

/** Simplified Chinese dictionary. */
export const zh = {
  'title': 'Mermaid 图表',
  'rendering': '正在渲染图表…',
  'error.title': '无法渲染 Mermaid 图表',
  'source.unavailable': '图表源码为空或过大，已回退为源码显示',
  'zoom.in': '放大',
  'zoom.out': '缩小',
  'zoom.reset': '重置',
} as const

/** English dictionary. */
export const en: Record<keyof typeof zh, string> = {
  'title': 'Mermaid Diagram',
  'rendering': 'Rendering diagram…',
  'error.title': 'Could not render this Mermaid diagram',
  'source.unavailable': 'Diagram source is empty or too large; showing the source instead',
  'zoom.in': 'Zoom in',
  'zoom.out': 'Zoom out',
  'zoom.reset': 'Reset',
}
