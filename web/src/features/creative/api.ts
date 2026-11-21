import type { ApiKey } from '@/features/keys/types'
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
import { api } from '@/lib/api'

/** Relay calls carry the user's API key, so they bypass the console client. */
async function relay<T>(
  path: string,
  key: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? 'POST',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  })

  const text = await response.text()
  let parsed: unknown = null
  if (text) {
    try {
      parsed = JSON.parse(text)
    } catch {
      parsed = text
    }
  }

  if (!response.ok) {
    const message =
      (parsed as { error?: { message?: string }; message?: string } | null)
        ?.error?.message ||
      (parsed as { message?: string } | null)?.message ||
      `${response.status} ${response.statusText}`
    throw new Error(message)
  }

  return parsed as T
}

export async function listOwnTokens(): Promise<ApiKey[]> {
  const res = await api.get('/api/token/?p=1&size=100')
  const body = res.data as {
    data?: { items?: ApiKey[] } | ApiKey[]
  }
  const payload = body?.data
  if (Array.isArray(payload)) return payload
  return payload?.items ?? []
}

/** The list endpoint masks keys; reveal the plaintext only for the chosen one. */
export async function revealTokenKey(id: number): Promise<string> {
  // The backend only exposes the plaintext through POST (rate limited, uncached).
  const res = await api.post(`/api/token/${id}/key`)
  const body = res.data as { data?: { key?: string } }
  const key = body?.data?.key
  if (!key) {
    throw new Error('Unable to reveal the selected key')
  }
  return key
}

type ImageResponse = {
  data?: { url?: string; b64_json?: string }[]
}

/** Resolve every image in a `images/generations` payload to a drawable source. */
async function resolveImages(payload: ImageResponse): Promise<string[]> {
  const entries = payload.data ?? []
  const sources: string[] = []
  for (const entry of entries) {
    if (entry.b64_json) {
      sources.push(`data:image/png;base64,${entry.b64_json}`)
      continue
    }
    if (entry.url) sources.push(entry.url)
  }
  return sources
}

export async function generateImages(args: {
  key: string
  model: string
  prompt: string
  size: string
  count: number
}): Promise<string[]> {
  const payload = await relay<ImageResponse>(
    '/v1/images/generations',
    args.key,
    {
      body: {
        model: args.model,
        prompt: args.prompt,
        n: args.count,
        size: args.size,
        response_format: 'b64_json',
      },
    }
  )
  const images = await resolveImages(payload)
  if (images.length === 0) {
    throw new Error('The upstream returned no images')
  }
  return images
}

export type ImageJobImage = { index: number; url: string }

export type ImageJobStatus = 'pending' | 'running' | 'succeeded' | 'failed'

/** A generation owned by the server, so a page reload cannot lose it. */
export type ImageJob = {
  id: number
  model: string
  prompt: string
  size: string
  n: number
  status: ImageJobStatus
  error: string
  images: ImageJobImage[]
  created_at: number
}

/** Start an image job; the server keeps rendering after the tab closes. */
export async function createImageJob(args: {
  tokenId: number
  model: string
  prompt: string
  size: string
  count: number
}): Promise<ImageJob> {
  const response = await api.post('/api/creative/image-jobs', {
    token_id: args.tokenId,
    model: args.model,
    prompt: args.prompt,
    size: args.size,
    n: args.count,
  })
  const payload = response.data as {
    success?: boolean
    message?: string
    data?: ImageJob
  }
  if (!payload?.success || !payload.data) {
    throw new Error(payload?.message || 'Failed to start the image job')
  }
  return payload.data
}

const jobImageCache = new Map<string, string>()

/**
 * Rendered job files sit behind dashboard auth, so an `<img>` cannot load them
 * directly: read them once through the authenticated client and hand the card a
 * blob URL.
 */
export async function resolveJobImage(url: string): Promise<string> {
  const cached = jobImageCache.get(url)
  if (cached) return cached
  const response = await api.get(url, { responseType: 'blob' })
  const objectUrl = URL.createObjectURL(response.data as Blob)
  jobImageCache.set(url, objectUrl)
  return objectUrl
}

/** Remove one rendered file; an empty job is dropped server-side. */
export async function deleteJobImage(args: {
  jobId: number
  index: number
}): Promise<void> {
  await api.delete(
    `/api/creative/image-jobs/${args.jobId}/images/${args.index}`
  )
}

/** Remove a job with every rendered file. */
export async function deleteImageJob(jobId: number): Promise<void> {
  await api.delete(`/api/creative/image-jobs/${jobId}`)
}

/** Recent jobs of the current account, newest first. */
export async function listImageJobs(): Promise<ImageJob[]> {
  const response = await api.get('/api/creative/image-jobs?limit=20')
  const payload = response.data as {
    success?: boolean
    message?: string
    data?: ImageJob[]
  }
  if (!payload?.success || !payload.data) {
    throw new Error(payload?.message || 'Failed to load image jobs')
  }
  return payload.data
}

export type VideoSubmitResult = {
  taskId: string
  status: string
}

type VideoSubmitPayload = {
  id?: string
  task_id?: string
  status?: string
  data?: { id?: string; task_id?: string; status?: string }
}

export async function submitVideo(args: {
  key: string
  model: string
  prompt: string
  seconds: string
  size: string
}): Promise<VideoSubmitResult> {
  const payload = await relay<VideoSubmitPayload>('/v1/videos', args.key, {
    body: {
      model: args.model,
      prompt: args.prompt,
      seconds: args.seconds,
      size: args.size,
    },
  })

  const taskId =
    payload.id ?? payload.task_id ?? payload.data?.id ?? payload.data?.task_id
  if (!taskId) {
    throw new Error('The upstream did not return a task id')
  }
  return {
    taskId,
    status: payload.status ?? payload.data?.status ?? 'queued',
  }
}

/**
 * Download the rendered file for a finished task.
 *
 * OpenAI-style video APIs stream the file from `/v1/videos/{id}/content` and may
 * never expose a URL, so the browser needs the bytes (and the key) to play it.
 */
export async function fetchVideoContent(args: {
  key: string
  taskId: string
}): Promise<string> {
  const response = await fetch(`/v1/videos/${args.taskId}/content`, {
    method: 'GET',
    credentials: 'omit',
    headers: { Authorization: `Bearer ${args.key}` },
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      text.slice(0, 240) || `${response.status} ${response.statusText}`
    )
  }
  const blob = await response.blob()
  if (blob.size === 0) throw new Error('The rendered file is empty')
  return URL.createObjectURL(blob)
}

export type VideoTaskState = {
  status: string
  videoUrl?: string
  error?: string
}

type VideoStatusPayload = {
  status?: string
  error?: { message?: string } | string
  video_url?: string
  url?: string
  data?:
    | {
        status?: string
        video_url?: string
        url?: string
        error?: { message?: string } | string
        output?: { video_url?: string; url?: string }
      }[]
    | {
        status?: string
        video_url?: string
        url?: string
        error?: { message?: string } | string
        output?: { video_url?: string; url?: string }
      }
}

function firstEntry<T>(value: T | T[] | undefined): T | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

export async function fetchVideoTask(args: {
  key: string
  taskId: string
}): Promise<VideoTaskState> {
  const payload = await relay<VideoStatusPayload>(
    `/v1/videos/${encodeURIComponent(args.taskId)}`,
    args.key,
    { method: 'GET' }
  )
  const entry = firstEntry(payload.data)

  const rawError = entry?.error ?? payload.error
  const error = typeof rawError === 'string' ? rawError : rawError?.message

  return {
    status: entry?.status ?? payload.status ?? 'unknown',
    videoUrl:
      entry?.video_url ||
      entry?.url ||
      entry?.output?.video_url ||
      entry?.output?.url ||
      payload.video_url ||
      payload.url,
    error,
  }
}

/** TTS returns audio bytes, so this bypasses the JSON relay helper. */
export async function generateSpeech(args: {
  key: string
  model: string
  input: string
  voice: string
  speed?: number
  format?: 'mp3' | 'opus' | 'wav'
}): Promise<string> {
  const response = await fetch('/v1/audio/speech', {
    method: 'POST',
    credentials: 'omit',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.key}`,
    },
    body: JSON.stringify({
      model: args.model,
      input: args.input,
      voice: args.voice,
      speed: args.speed ?? 1,
      response_format: args.format ?? 'mp3',
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      text.slice(0, 240) || `${response.status} ${response.statusText}`
    )
  }
  const blob = await response.blob()
  return URL.createObjectURL(blob)
}

/** Chat completion used by the canvas agent to draft an action plan. */
export async function requestChatPlan(args: {
  key: string
  model: string
  system: string
  prompt: string
}): Promise<string> {
  const payload = await relay<{
    choices?: { message?: { content?: string } }[]
  }>('/v1/chat/completions', args.key, {
    body: {
      model: args.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: args.prompt },
      ],
    },
  })
  return payload.choices?.[0]?.message?.content ?? ''
}

/**
 * Image editing uploads bytes, and references arrive either as data URLs from
 * canvas nodes or as links to files rendered by the server.
 */
async function sourceToBlob(source: string): Promise<Blob> {
  if (!source.startsWith('data:')) {
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`Unable to read the reference image (${response.status})`)
    }
    return response.blob()
  }
  return dataUrlToBlob(source)
}

/** Data URLs come from canvas nodes; multipart needs a Blob. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(',')
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/png'
  if (!payload) throw new Error('invalid image data')
  const binary = atob(payload)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mime })
}

/** Reference-image editing (`/v1/images/edits`). */
export async function editImage(args: {
  key: string
  model: string
  prompt: string
  image: string
  size: string
  count: number
}): Promise<string[]> {
  const form = new FormData()
  form.append('model', args.model)
  form.append('prompt', args.prompt)
  form.append('n', String(args.count))
  form.append('size', args.size)
  form.append('response_format', 'b64_json')
  form.append('image', await sourceToBlob(args.image), 'reference.png')

  const response = await fetch('/v1/images/edits', {
    method: 'POST',
    credentials: 'omit',
    headers: { Authorization: `Bearer ${args.key}` },
    body: form,
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(
      text.slice(0, 240) || `${response.status} ${response.statusText}`
    )
  }
  return resolveImages((await response.json()) as ImageResponse)
}

/** Ask a chat model to expand a short prompt into a richer one. */
export async function expandPrompt(args: {
  key: string
  model: string
  prompt: string
}): Promise<string> {
  const payload = await relay<{
    choices?: { message?: { content?: string } }[]
  }>('/v1/chat/completions', args.key, {
    body: {
      model: args.model,
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content:
            'Rewrite the user seed into one vivid image prompt under 60 words. Reply with the prompt only.',
        },
        { role: 'user', content: args.prompt },
      ],
    },
  })
  return payload.choices?.[0]?.message?.content?.trim() ?? ''
}
