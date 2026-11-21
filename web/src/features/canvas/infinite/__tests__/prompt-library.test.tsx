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
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { usePromptLibrary } from '../use-prompt-library'

function login(id: number) {
  useAuthStore.getState().auth.setUser({ id, username: `user-${id}`, role: 1 })
}
beforeEach(() => {
  window.localStorage.clear()
  login(11)
})
afterEach(() => {
  useAuthStore.getState().auth.reset()
})

describe('prompt library ownership', () => {
  it('keeps private prompts with their owner and ignores late saves from the previous account', () => {
    const { result } = renderHook(() => usePromptLibrary())
    act(() => result.current.save('private A'))
    const lateSave = result.current.save
    act(() => login(22))
    expect(result.current.custom).toEqual([])
    expect(result.current.prompts.some((prompt) => prompt.builtin)).toBe(true)
    act(() => lateSave('late private A'))
    expect(result.current.custom).toEqual([])
    act(() => result.current.save('private B'))
    act(() => login(11))
    expect(result.current.custom.map((prompt) => prompt.text)).toEqual([
      'private A',
    ])
  })

  it('preserves unowned legacy prompts without reading them into the next account', () => {
    const legacy = JSON.stringify([
      { id: 'old', text: 'legacy private prompt' },
    ])
    window.localStorage.setItem('infinite-canvas-prompts-v1', legacy)
    const { result } = renderHook(() => usePromptLibrary())
    expect(result.current.custom).toEqual([])
    expect(window.localStorage.getItem('infinite-canvas-prompts-v1')).toBe(
      legacy
    )
  })

  it('keeps the prompt library usable when browser storage is disabled', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    const { result } = renderHook(() => usePromptLibrary())
    act(() => result.current.save('in-memory prompt'))
    expect(result.current.custom[0].text).toBe('in-memory prompt')
  })
})
