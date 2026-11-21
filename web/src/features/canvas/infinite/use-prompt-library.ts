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
import { useCallback, useEffect, useState } from 'react'

import { useAuthStore } from '@/stores/auth-store'

const STORAGE_KEY = 'infinite-canvas-prompts-v2:user:'

export type SavedPrompt = {
  id: string
  text: string
  builtin?: boolean
}

const BUILTIN_PROMPTS: SavedPrompt[] = [
  {
    id: 'builtin-1',
    builtin: true,
    text: 'A isometric city block at golden hour, soft long shadows, 35mm photo',
  },
  {
    id: 'builtin-2',
    builtin: true,
    text: 'Product shot of a ceramic mug on linen, window light, shallow depth of field',
  },
  {
    id: 'builtin-3',
    builtin: true,
    text: 'Slow push-in through a neon alley after rain, cinematic, 24fps',
  },
  {
    id: 'builtin-4',
    builtin: true,
    text: 'Calm narrator voice reading a 20 second product intro',
  },
]

function loadCustom(ownerId: number | null): SavedPrompt[] {
  if (ownerId === null) return []
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}${ownerId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedPrompt[]
    return Array.isArray(parsed)
      ? parsed.filter(
          (item) =>
            item &&
            typeof item.id === 'string' &&
            typeof item.text === 'string' &&
            item.text
        )
      : []
  } catch {
    return []
  }
}

/** Prompt library: built-in starters plus whatever the user saved. */
export function usePromptLibrary() {
  const ownerId = useAuthStore((store) => store.auth.user?.id ?? null)
  const sessionId = useAuthStore((store) => store.auth.session?.sid ?? null)
  const scope = `${ownerId}:${sessionId}`
  const [trackedScope, setTrackedScope] = useState(scope)
  const [custom, setCustom] = useState<SavedPrompt[]>(() => loadCustom(ownerId))
  if (trackedScope !== scope) {
    setTrackedScope(scope)
    setCustom(loadCustom(ownerId))
  }

  useEffect(() => {
    if (ownerId === null) return
    try {
      window.localStorage.setItem(
        `${STORAGE_KEY}${ownerId}`,
        JSON.stringify(custom)
      )
    } catch {
      // Keep the in-memory library available when browser storage is disabled.
    }
  }, [custom, ownerId])

  const save = useCallback(
    (text: string) => {
      const auth = useAuthStore.getState().auth
      if (
        ownerId === null ||
        auth.user?.id !== ownerId ||
        (auth.session?.sid ?? null) !== sessionId
      ) {
        return
      }
      const trimmed = text.trim()
      if (!trimmed) return
      setCustom((previous) => {
        if (previous.some((item) => item.text === trimmed)) return previous
        return [
          ...previous,
          { id: `prompt-${Date.now().toString(36)}`, text: trimmed },
        ].slice(-40)
      })
    },
    [ownerId, sessionId]
  )

  const remove = useCallback(
    (id: string) => {
      const auth = useAuthStore.getState().auth
      if (
        ownerId === null ||
        auth.user?.id !== ownerId ||
        (auth.session?.sid ?? null) !== sessionId
      ) {
        return
      }
      setCustom((previous) => previous.filter((item) => item.id !== id))
    },
    [ownerId, sessionId]
  )

  return {
    prompts: [...custom, ...BUILTIN_PROMPTS],
    custom,
    save,
    remove,
  }
}
