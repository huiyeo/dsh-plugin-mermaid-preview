/**
 * Ambient contracts this plugin compiles against.
 *
 * The harness publishes no types for an out-of-tree client plugin, so the
 * minimal surface the preview touches is declared here rather than imported
 * from DSH packages. That also keeps the build independent: a type-only import
 * of an unpublished declaration file would fail to resolve, while the runtime
 * face is a Cordis service reached through `ctx`, never a value import.
 */

/** How the document owner delivers file contents to a renderer. */
export type DocumentLoadMode = 'text-pages' | 'bytes-complete'

/** One loaded text window, retaining source line positions. */
export interface DocumentTextPage {
  readonly offset: number
  readonly text: string
  readonly lines: number
}

/**
 * Contents prepared by the preview owner using ordinary file reads.
 * Byte arrays are transient UI input, never persisted layout or Session data.
 */
export type DocumentContent =
  | { readonly kind: 'text'; readonly text: string; readonly pages: readonly DocumentTextPage[]; readonly eof: boolean }
  | { readonly kind: 'bytes'; readonly data: Uint8Array }

/** One renderer implementation, independent of its component registration. */
export interface DocumentPreviewDefinition {
  /** Unique implementation name, also used as the document slot key. */
  readonly id: string
  /** File suffixes without a leading dot; compound suffixes such as tar.gz are accepted. */
  readonly extensions: readonly string[]
  /** External implementations win over product implementations; defaults to extension. */
  readonly priority?: 'builtin' | 'extension'
  /** Localized implementation label, evaluated when the toolbar renders. */
  readonly title: () => string
  /** Content delivery mode supplied by the document owner. */
  readonly loading: DocumentLoadMode
  /** Whether the implementation consumes the document's wrap preference. */
  readonly wrap?: boolean
}

/** Observable registry of live document-preview implementations. */
export interface DocumentPreviewRegistry {
  /**
   * Register metadata separately from the matching keyed slot component.
   * @param definition - unique implementation and recognized suffixes.
   * @returns an idempotent disposer; duplicate live implementation names throw.
   */
  register(definition: DocumentPreviewDefinition): () => void
}

/** Registration contract for one keyed slot cell. */
export interface SlotRegistration {
  /** Slot key the cell belongs to. */
  readonly name: string
  /** Cell key inside a keyed slot. */
  readonly key?: string
  /** Locale namespace whose dictionary the component's `t` binding reads. */
  readonly locale?: string
}

/** The slot registry, narrowed to the calls this plugin makes. */
export interface SlotRegistry {
  /**
   * Defer a registration until the named slot exists.
   * @param name - slot key the registration belongs to.
   * @param callback - registers into the slot; returns its disposer.
   * @returns the deferred registration's disposer.
   */
  inject(name: string, callback: () => () => void): () => void
  /**
   * Register one component cell.
   * @param registration - slot name, cell key, and locale namespace.
   * @param component - React component rendered for the cell.
   * @returns the registration's disposer.
   */
  register(registration: SlotRegistration, component: unknown): () => void
}

/** A copy binding for one locale namespace. */
export interface LocaleBinding {
  /**
   * @param key - dictionary key.
   * @param params - interpolation values.
   * @returns the localized string.
   */
  (key: string, params?: Record<string, string | number>): string
}

/** Dictionaries registered for one namespace, keyed by locale id. */
export type LocaleDictionaries = Readonly<Record<string, Readonly<Record<string, string>>>>

/** The locale service, narrowed to registration and binding. */
export interface LocaleService {
  /**
   * Register one namespace's dictionaries.
   * @param namespace - namespace id.
   * @param dictionaries - locale id to message map.
   * @returns the registration's disposer.
   */
  register(namespace: string, dictionaries: LocaleDictionaries): () => void
  /**
   * Bind one namespace for rendering.
   * @param namespace - namespace id.
   * @returns the namespace's copy binding.
   */
  bind(namespace: string): LocaleBinding
}

/**
 * The plugin context this client half uses: the three registries it contributes
 * to, plus the effect seam that ties every contribution to the plugin's fiber.
 */
export interface PluginContext {
  readonly documentPreviews: DocumentPreviewRegistry
  readonly slots: SlotRegistry
  readonly locale: LocaleService
  /**
   * Register a side effect owned by this plugin's fiber.
   * @param callback - returns an optional disposer.
   * @param label - diagnostic label.
   * @returns the effect's disposer.
   */
  effect(callback: () => void | (() => void), label?: string): () => void
}

/** Props the document owner hands every renderer body. */
export interface DocumentPreviewProps {
  /** Original file address, also readable through the standard useResource hook. */
  readonly resourceAddress: string
  /** Loaded content; text is an accumulated prefix until eof. */
  readonly content: DocumentContent
  /** The document toolbar's current wrapping preference. */
  readonly wrap: boolean
  /** Report a renderer-owned scrollport; passing `null` restores the shared body as the owner. */
  readonly scrollportRef: (element: HTMLElement | null) => void
  /** Localized copy binding, present because the cell registers with a locale namespace. */
  readonly t: LocaleBinding
}

declare global {
  /** Client module registration facade installed by the harness HTML. */
  var __ModuleLoader__: {
    /**
     * Register one bundle factory.
     * @param registration - package id and its synchronous CommonJS factory.
     */
    load(registration: { id: string; factory: (require: (specifier: string) => unknown) => unknown }): void
  }
}
