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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useAuthStore } from '@/stores/auth-store'

import { VideoStudioView } from '..'

const relay = vi.hoisted(() => ({
  submitVideo: vi.fn(),
  fetchVideoTask: vi.fn(),
  fetchVideoContent: vi.fn(),
  revealTokenKey: vi.fn(),
}))
vi.mock('../../creative/api', () => relay)
vi.mock('../../creative/hooks/use-creative-assets', () => ({
  useCreativeAssets: () => ({ models: [{ model_name: 'video-model' }] }),
}))
vi.mock('../../creative/components/capability-key-select', () => ({
  CapabilityKeySelect: (props: { onSelect: (value: unknown) => void }) => (
    <button
      type='button'
      onClick={() =>
        props.onSelect({ tokenId: 101, key: 'test-key-a', group: 'default' })
      }
    >
      Choose test key
    </button>
  ),
}))

function login(id: number) {
  useAuthStore.getState().auth.setUser({ id, username: `user-${id}`, role: 1 })
}

beforeEach(() => {
  window.localStorage.clear()
  login(11)
  relay.submitVideo.mockResolvedValue({ taskId: 'task-a', status: 'queued' })
  relay.fetchVideoTask.mockResolvedValue({ status: 'queued' })
  relay.revealTokenKey.mockResolvedValue('restored-test-key')
})
afterEach(() => {
  useAuthStore.getState().auth.reset()
  vi.useRealTimers()
})

async function submitTask() {
  fireEvent.click(screen.getByRole('button', { name: 'Choose test key' }))
  fireEvent.change(screen.getByLabelText('Prompt'), {
    target: { value: 'private prompt A' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Generate video' }))
  await screen.findByText('private prompt A')
}

describe('video task account isolation', () => {
  it('persists the token id but never the usable key and removes legacy credentials', async () => {
    window.localStorage.setItem('video-task-key:old-task', 'old-test-key')
    render(<VideoStudioView />)
    await submitTask()
    const values = Array.from(
      { length: window.localStorage.length },
      (_, index) =>
        window.localStorage.getItem(window.localStorage.key(index) ?? '') ?? ''
    ).join('')
    expect(values).not.toContain('test-key-a')
    expect(values).not.toContain('old-test-key')
    expect(values).toContain('101')
  })

  it('hides account A tasks immediately when the current account changes', async () => {
    render(<VideoStudioView />)
    await submitTask()
    act(() => login(22))
    expect(screen.queryByText('private prompt A')).not.toBeInTheDocument()
    expect(screen.getByText('No video tasks yet')).toBeInTheDocument()
  })

  it('ignores an account A submission that completes after signing into B', async () => {
    let finish!: (value: { taskId: string; status: string }) => void
    relay.submitVideo.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    render(<VideoStudioView />)
    fireEvent.click(screen.getByRole('button', { name: 'Choose test key' }))
    fireEvent.change(screen.getByLabelText('Prompt'), {
      target: { value: 'late private result' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Generate video' }))
    act(() => login(22))
    await act(async () => finish({ taskId: 'late-a', status: 'queued' }))
    expect(screen.queryByText('late private result')).not.toBeInTheDocument()
    expect(window.localStorage.getItem('video-task-key:late-a')).toBeNull()
  })

  it('does not send a key revealed after the task owner signed out', async () => {
    window.localStorage.setItem(
      'video-studio-tasks:11',
      JSON.stringify([
        {
          id: 'saved',
          taskId: 'private-task-A',
          tokenId: 101,
          model: 'video-model',
          prompt: 'private A',
          status: 'queued',
          createdAt: 1,
        },
      ])
    )
    let reveal!: (key: string) => void
    relay.revealTokenKey.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          reveal = resolve
        })
    )
    render(<VideoStudioView />)
    await waitFor(() => expect(relay.revealTokenKey).toHaveBeenCalledWith(101))
    act(() => {
      useAuthStore.getState().auth.reset()
      login(22)
    })
    await act(async () => reveal('late-test-key-A'))
    expect(relay.fetchVideoTask).not.toHaveBeenCalled()
    expect(screen.queryByText('private A')).not.toBeInTheDocument()
  })

  it('revokes video blobs returned after the account changed', async () => {
    window.localStorage.setItem(
      'video-studio-tasks:11',
      JSON.stringify([
        {
          id: 'saved',
          taskId: 'private-task-A',
          tokenId: 101,
          model: 'video-model',
          prompt: 'private A',
          status: 'completed',
          createdAt: 1,
        },
      ])
    )
    let finish!: (url: string) => void
    relay.fetchVideoContent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const revoke = vi.fn()
    vi.stubGlobal(
      'URL',
      class extends URL {
        static revokeObjectURL = revoke
      }
    )
    render(<VideoStudioView />)
    await waitFor(() => expect(relay.fetchVideoContent).toHaveBeenCalled())
    act(() => login(22))
    await act(async () => finish('blob:late-private-A'))
    expect(revoke).toHaveBeenCalledWith('blob:late-private-A')
    vi.unstubAllGlobals()
  })

  it('restores an own task after remount by revealing its token under the current account', async () => {
    const first = render(<VideoStudioView />)
    await submitTask()
    first.unmount()
    relay.revealTokenKey.mockClear()
    render(<VideoStudioView />)
    await screen.findByText('private prompt A')
    vi.useFakeTimers()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(relay.revealTokenKey).toHaveBeenCalledWith(101)
    expect(relay.fetchVideoTask).toHaveBeenCalledWith({
      key: 'restored-test-key',
      taskId: 'task-a',
    })
  })
})
