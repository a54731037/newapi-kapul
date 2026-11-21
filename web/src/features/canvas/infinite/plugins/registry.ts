import type { InfiniteNode } from '../types'
/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { listSavedPlugins, savePluginRecord } from './store'
import type {
  CanvasPluginModule,
  LoadedPlugin,
  PluginManifestFile,
} from './types'

export const DEFAULT_MANIFEST_URL = '/plugins/canvas/index.json'

const renderers = new Map<string, (node: InfiniteNode) => string>()
const editors = new Map<string, (node: InfiniteNode) => string>()

function moduleFromUrl(entryUrl: string, bust = true) {
  const url = bust ? `${entryUrl}?t=${Date.now()}` : entryUrl
  return import(/* webpackIgnore: true */ url) as Promise<{ default?: unknown }>
}

function moduleFromSource(source: string) {
  const blob = new Blob([source], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  return import(/* webpackIgnore: true */ url).finally(() => {
    URL.revokeObjectURL(url)
  }) as Promise<{ default?: unknown }>
}

/**
 * Validate a module pulled from disk or the marketplace. A plugin only needs
 * `id` + `label`; a malformed entry is reported instead of crashing the canvas.
 */
export function normalizePluginModule(raw: unknown): CanvasPluginModule | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as Partial<CanvasPluginModule>
  if (typeof candidate.id !== 'string' || !candidate.id.trim()) return null
  if (typeof candidate.label !== 'string' || !candidate.label.trim()) {
    return null
  }

  const size =
    candidate.size &&
    typeof candidate.size.width === 'number' &&
    typeof candidate.size.height === 'number'
      ? candidate.size
      : undefined

  return {
    id: candidate.id.trim(),
    label: candidate.label.trim(),
    size,
    create:
      typeof candidate.create === 'function'
        ? candidate.create.bind(raw)
        : undefined,
    render:
      typeof candidate.render === 'function'
        ? candidate.render.bind(raw)
        : undefined,
    editor:
      typeof candidate.editor === 'function'
        ? candidate.editor.bind(raw)
        : undefined,
  }
}

export function getPluginRenderer(
  kind: string
): ((node: InfiniteNode) => string) | undefined {
  return renderers.get(kind)
}

export function getPluginEditor(
  kind: string
): ((node: InfiniteNode) => string) | undefined {
  return editors.get(kind)
}

function register(plugin: CanvasPluginModule) {
  if (plugin.render) renderers.set(plugin.id, plugin.render)
  if (plugin.editor) editors.set(plugin.id, plugin.editor)
}

/** Plugins load from `/public/plugins/canvas`; the manifest is plain JSON. */
export async function loadLocalPlugins(
  manifestUrl: string = DEFAULT_MANIFEST_URL
): Promise<{ plugins: LoadedPlugin[]; errors: string[] }> {
  const errors: string[] = []
  renderers.clear()
  editors.clear()
  const loaded: LoadedPlugin[] = []

  let manifest: PluginManifestFile | null = null
  try {
    const response = await fetch(`${manifestUrl}?t=${Date.now()}`, {
      cache: 'no-store',
    })
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`)
    }
    manifest = (await response.json()) as PluginManifestFile
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errors.push(`manifest: ${message}`)
  }

  for (const entry of manifest?.plugins ?? []) {
    if (!entry?.entry) {
      errors.push(`${entry?.id ?? 'unknown'}: missing entry`)
      continue
    }
    try {
      const module = normalizePluginModule(
        (await moduleFromUrl(entry.entry)).default
      )
      if (!module) {
        errors.push(`${entry.id}: invalid module shape`)
        continue
      }
      register(module)
      loaded.push({ module, source: 'local' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${entry.id}: ${message}`)
    }
  }

  // Marketplace installs live in IndexedDB and take precedence by id.
  for (const saved of await listSavedPlugins()) {
    try {
      const module = normalizePluginModule(
        (await moduleFromSource(saved.source)).default
      )
      if (!module) {
        errors.push(`${saved.id}: invalid saved module`)
        continue
      }
      register(module)
      const index = loaded.findIndex((item) => item.module.id === module.id)
      const plugin: LoadedPlugin = { module, source: 'installed' }
      if (index >= 0) loaded[index] = plugin
      else loaded.push(plugin)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${saved.id}: ${message}`)
    }
  }

  return { plugins: loaded, errors }
}

export type RemotePluginEntry = {
  id: string
  label: string
  entry: string
}

/** Fetch a marketplace manifest without touching the server. */
export async function fetchRemoteManifest(
  url: string
): Promise<RemotePluginEntry[]> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  const payload = (await response.json()) as PluginManifestFile
  const entries = Array.isArray(payload.plugins) ? payload.plugins : []
  return entries
    .filter((entry) => entry?.entry)
    .map((entry) => ({
      id: entry.id,
      label: entry.id,
      entry: new URL(entry.entry, url).toString(),
    }))
}

/**
 * Download a plugin module into IndexedDB. The source never leaves the browser
 * and the import is validated before it is stored.
 */
export async function installRemotePlugin(
  entry: RemotePluginEntry
): Promise<string> {
  const response = await fetch(entry.entry, { cache: 'no-store' })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  const source = await response.text()
  const module = normalizePluginModule((await moduleFromSource(source)).default)
  if (!module) throw new Error('invalid plugin module')
  await savePluginRecord({
    id: module.id,
    label: module.label,
    entryUrl: entry.entry,
    source,
    savedAt: Date.now(),
  })
  return module.label
}
