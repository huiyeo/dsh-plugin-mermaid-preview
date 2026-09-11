/**
 * Browser half of dsh-plugin-mermaid-preview.
 *
 * Contributes one document-preview implementation through the public extension
 * points only: metadata into `ctx.documentPreviews`, the body into the keyed
 * `sidebar.right.tab.document` seat under the same id, and copy into the
 * locale service. Nothing here reaches into the sidebar's store, its panes, or
 * its sequence.
 */
import { MermaidBody } from './MermaidBody.tsx'
import { en, NS, zh } from './locales.ts'
import { installStyles } from './styles.ts'
import type { PluginContext } from './types.ts'

/**
 * Implementation identity, shared by the metadata registration and the slot
 * cell. The extension band (`priority` omitted) outranks the builtin text
 * renderer, which is the only other implementation matching these suffixes.
 */
export const MERMAID_BODY_ID = 'dsh-plugin-mermaid-preview'

/**
 * Required browser services. `slots` and `locale` are provided by the shell;
 * `documentPreviews` is provided by the document-preview plugin, so this plugin
 * stays parked until the viewer it extends is mounted.
 */
export const inject = ['slots', 'locale', 'documentPreviews'] as const

/**
 * Plugin body: register the metadata, the body, the stylesheet, and the copy.
 * @param ctx - client context carrying the registries this plugin contributes to.
 */
export function apply(ctx: PluginContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mermaid-preview: dictionaries')
  ctx.effect(installStyles, 'mermaid-preview: styles')

  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.documentPreviews.register({
    id: MERMAID_BODY_ID,
    extensions: ['mmd', 'mermaid'],
    // No `priority`: the default `extension` band is what lets a third-party
    // implementation win over a builtin one for the same suffix.
    title: () => t('title'),
    // The diagram needs the whole file to parse; the paged mode would hand the
    // body an accumulated prefix and no way to ask for the rest.
    loading: 'bytes-complete',
    // The body owns its own scrolling, so the toolbar's wrap toggle has no
    // meaning for it and is hidden.
    wrap: false,
  }), 'mermaid-preview: metadata')

  ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
    { name: 'sidebar.right.tab.document', key: MERMAID_BODY_ID, locale: NS },
    MermaidBody,
  )), 'mermaid-preview: body')
}
