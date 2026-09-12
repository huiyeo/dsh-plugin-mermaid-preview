/**
 * Browser half of dsh-plugin-mermaid-preview.
 *
 * Two surfaces, one renderer behind both:
 *
 * - A document-preview implementation for `.mmd` / `.mermaid` files, registered
 *   through `ctx.documentPreviews` with its body in the keyed
 *   `sidebar.right.tab.document` seat.
 * - A ```mermaid fence renderer for chat messages, registered with the
 *   `registeredFences` registry that `ui-primitives` shares. That registry is a
 *   module-level singleton in a module the harness serves to the whole page, so
 *   the transcript picks this up without the chat package knowing about it.
 *
 * Nothing here reaches into the sidebar's store, its panes, or its sequence.
 */
import { createElement } from 'react'
import { registeredFences } from '@deepseek-ai/dsh-client-ui-primitives'
import { MermaidBody } from './MermaidBody.tsx'
import { MermaidFence } from './MermaidFence.tsx'
import { en, NS, zh } from './locales.ts'
import { installStyles } from './styles.ts'
import type { PluginContext, RegisteredFences } from './types.ts'

/**
 * Implementation identity, shared by the metadata registration and the slot
 * cell. The extension band (`priority` omitted) outranks the builtin text
 * renderer, which is the only other implementation matching these suffixes.
 */
export const MERMAID_BODY_ID = 'dsh-plugin-mermaid-preview'

/** The fence info this plugin claims in chat messages. */
export const MERMAID_FENCE_LANGUAGE = 'mermaid'

/**
 * Whether a harness's `ui-primitives` exposes the Markdown fence registry.
 *
 * A plugin published to a registry runs against harnesses older than the seam it
 * wants, so the capability is probed rather than assumed.
 * @param candidate - the module's `registeredFences` export, or undefined.
 * @returns true when it is usable as a registry.
 */
function isFenceRegistry(candidate: unknown): candidate is RegisteredFences {
  return typeof candidate === 'object'
    && candidate !== null
    && typeof (candidate as { register?: unknown }).register === 'function'
}

/**
 * Required browser services. `slots` and `locale` are provided by the shell;
 * `documentPreviews` is provided by the document-preview plugin, so this plugin
 * stays parked until the viewer it extends is mounted.
 */
export const inject = ['slots', 'locale', 'documentPreviews'] as const

/**
 * Plugin body: register the copy, the stylesheet, the file preview, and the
 * chat fence language.
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

  // The chat side. Registration is owned by this fiber, so unloading the plugin
  // releases the language and the fences fall back to their code blocks.
  //
  // Guarded on purpose: `registeredFences` is a registry the harness gained
  // alongside this plugin, and a harness without it ships a `ui-primitives`
  // whose module has no such export. An unguarded call would throw inside
  // `apply` and take the `.mmd` preview down with it, so a host that predates
  // the seam keeps the file preview and simply keeps rendering ```mermaid
  // fences as code blocks.
  //
  // The renderer returns an ELEMENT rather than calling the component: the
  // renderer result is inserted as a child, and invoking a hook-using component
  // as a plain function would break the rules of hooks.
  if (isFenceRegistry(registeredFences)) {
    const fences = registeredFences
    ctx.effect(
      () => fences.register(MERMAID_FENCE_LANGUAGE, (code, streaming) => (
        createElement(MermaidFence, { code, streaming })
      )),
      'mermaid-preview: chat fence',
    )
  } else {
    ctx.logger?.info?.(
      'mermaid-preview: this harness has no Markdown fence registry, so chat ```mermaid blocks stay code blocks '
      + '(the .mmd file preview is unaffected)',
    )
  }
}
