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
import { Clapperboard, Loader2, Play, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DurationPicker } from '@/features/creative/components/duration-picker'
import { SizePicker } from '@/features/creative/components/size-picker'
import { clearLegacyVideoCredentials } from '@/lib/creative-credentials'
import { useAuthStore } from '@/stores/auth-store'

import {
  fetchVideoContent,
  fetchVideoTask,
  revealTokenKey,
  submitVideo,
} from '../creative/api'
import {
  CapabilityKeySelect,
  type CreativeKeySelection,
} from '../creative/components/capability-key-select'
import { useCreativeAssets } from '../creative/hooks/use-creative-assets'

const STORAGE_KEY = 'video-studio-tasks'
const POLL_INTERVAL_MS = 5000
const DURATIONS = ['4', '5', '6', '8', '10', '12', '15', '20']
const SIZE_PRESETS = [
  { value: '1280x720', label: '16:9 · 1280×720' },
  { value: '720x1280', label: '9:16 · 720×1280' },
  { value: '1920x1080', label: '16:9 · 1920×1080' },
  { value: '1080x1920', label: '9:16 · 1080×1920' },
  { value: '1024x1024', label: '1:1 · 1024' },
  { value: '1152x768', label: '3:2 · 1152×768' },
  { value: '768x1152', label: '2:3 · 768×1152' },
]

type VideoTask = {
  id: string
  taskId: string
  tokenId: number
  model: string
  prompt: string
  status: string
  videoUrl?: string
  error?: string
  createdAt: number
}

function loadTasks(ownerId: number): VideoTask[] {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_KEY}:${ownerId}`)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (task): task is VideoTask =>
        task &&
        typeof task === 'object' &&
        typeof task.id === 'string' &&
        typeof task.taskId === 'string' &&
        Number.isSafeInteger(task.tokenId) &&
        task.tokenId > 0 &&
        typeof task.model === 'string' &&
        typeof task.prompt === 'string' &&
        typeof task.status === 'string' &&
        typeof task.createdAt === 'number' &&
        (task.videoUrl === undefined || typeof task.videoUrl === 'string') &&
        (task.error === undefined || typeof task.error === 'string')
    )
  } catch {
    return []
  }
}

function isFinished(status: string): boolean {
  const normalized = status.toLowerCase()
  return (
    normalized.includes('success') ||
    normalized.includes('succeed') ||
    normalized.includes('fail') ||
    normalized.includes('error') ||
    normalized === 'completed'
  )
}

function statusVariant(
  status: string
): 'default' | 'secondary' | 'destructive' {
  const normalized = status.toLowerCase()
  if (normalized.includes('fail') || normalized.includes('error')) {
    return 'destructive'
  }
  if (isFinished(normalized)) return 'default'
  return 'secondary'
}

export function VideoStudioView() {
  const ownerId = useAuthStore((store) => store.auth.user?.id ?? null)
  const sessionId = useAuthStore((store) => store.auth.session?.sid ?? null)
  useEffect(() => clearLegacyVideoCredentials(), [ownerId, sessionId])
  if (ownerId === null) return null
  return (
    <OwnedVideoStudio
      key={`${ownerId}:${sessionId}`}
      ownerId={ownerId}
      sessionId={sessionId}
    />
  )
}

function OwnedVideoStudio(props: {
  ownerId: number
  sessionId: string | null
}) {
  const { t } = useTranslation()
  const { models } = useCreativeAssets('video')

  const [selection, setSelection] = useState<CreativeKeySelection | null>(null)
  const [model, setModel] = useState('')
  const [prompt, setPrompt] = useState('')
  const [seconds, setSeconds] = useState<string>(DURATIONS[1])
  const [size, setSize] = useState(SIZE_PRESETS[0].value)
  const [tasks, setTasks] = useState<VideoTask[]>(() =>
    loadTasks(props.ownerId)
  )
  const [isSubmitting, setSubmitting] = useState(false)
  const mounted = useRef(true)
  const taskKeys = useRef(new Map<number, Promise<string>>())
  const objectUrls = useRef(new Set<string>())
  const isCurrent = useCallback(() => {
    const auth = useAuthStore.getState().auth
    return (
      mounted.current &&
      auth.user?.id === props.ownerId &&
      (auth.session?.sid ?? null) === props.sessionId
    )
  }, [props.ownerId, props.sessionId])

  useEffect(() => {
    mounted.current = true
    const keys = taskKeys.current
    const urls = objectUrls.current
    return () => {
      mounted.current = false
      keys.clear()
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const resolveTaskKey = useCallback(
    async (tokenId: number) => {
      if (!isCurrent()) return null
      let request = taskKeys.current.get(tokenId)
      if (!request) {
        request = revealTokenKey(tokenId)
        taskKeys.current.set(tokenId, request)
      }
      try {
        const key = await request
        return isCurrent() ? key : null
      } catch (error) {
        taskKeys.current.delete(tokenId)
        throw error
      }
    },
    [isCurrent]
  )

  const modelOptions = useMemo(
    () => models.map((item) => item.model_name),
    [models]
  )
  const activeModel = model || modelOptions[0] || ''

  useEffect(() => {
    if (!isCurrent()) return
    // Store only metadata; keys are re-revealed under the current login.
    const persistable = tasks.map((task) => ({
      id: task.id,
      taskId: task.taskId,
      tokenId: task.tokenId,
      model: task.model,
      prompt: task.prompt,
      status: task.status,
      error: task.error,
      createdAt: task.createdAt,
      videoUrl: task.videoUrl?.startsWith('blob:') ? undefined : task.videoUrl,
    }))
    try {
      window.localStorage.setItem(
        `${STORAGE_KEY}:${props.ownerId}`,
        JSON.stringify(persistable)
      )
    } catch {
      // A browser storage failure must not discard the in-memory task.
    }
  }, [isCurrent, props.ownerId, tasks])

  useEffect(() => {
    const pending = tasks.filter(
      (task) =>
        !task.error &&
        (!isFinished(task.status) ||
          (!task.videoUrl && !/fail|error/i.test(task.status)))
    )
    if (pending.length === 0) return
    let cancelled = false
    let polling = false
    const poll = async () => {
      if (polling || cancelled || !isCurrent()) return
      polling = true
      for (const task of pending) {
        try {
          const key = await resolveTaskKey(task.tokenId)
          if (!key || cancelled || !isCurrent()) break
          const state = isFinished(task.status)
            ? { status: task.status, videoUrl: undefined, error: undefined }
            : await fetchVideoTask({ key, taskId: task.taskId })
          if (cancelled || !isCurrent()) break
          let videoUrl = state.videoUrl ?? task.videoUrl
          if (
            !videoUrl &&
            isFinished(state.status) &&
            !/fail|error/i.test(state.status) &&
            !state.error
          ) {
            videoUrl = await fetchVideoContent({ key, taskId: task.taskId })
          }
          if (cancelled || !isCurrent()) {
            if (videoUrl?.startsWith('blob:')) URL.revokeObjectURL(videoUrl)
            break
          }
          if (videoUrl?.startsWith('blob:')) objectUrls.current.add(videoUrl)
          if (
            state.status === task.status &&
            videoUrl === task.videoUrl &&
            state.error === task.error
          ) {
            continue
          }
          setTasks((previous) =>
            previous.map((item) =>
              item.id === task.id
                ? {
                    ...item,
                    status: state.status,
                    videoUrl,
                    error: state.error,
                  }
                : item
            )
          )
        } catch {
          // Transient failures retry; the current account must still own the token.
        }
      }
      polling = false
    }
    const timer = window.setInterval(() => void poll(), POLL_INTERVAL_MS)
    void poll()
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [isCurrent, resolveTaskKey, tasks])

  const handleSubmit = useCallback(async () => {
    if (!isCurrent()) return
    if (!selection) {
      toast.error(t('Select an API key first'))
      return
    }
    if (!activeModel) {
      toast.error(t('Select a model first'))
      return
    }
    if (!prompt.trim()) {
      toast.error(t('Describe the video you want'))
      return
    }

    setSubmitting(true)
    try {
      const result = await submitVideo({
        key: selection.key,
        model: activeModel,
        prompt: prompt.trim(),
        seconds,
        size,
      })
      if (!isCurrent()) return
      taskKeys.current.set(selection.tokenId, Promise.resolve(selection.key))
      setTasks((previous) => [
        {
          id: `${result.taskId}-${Date.now()}`,
          taskId: result.taskId,
          tokenId: selection.tokenId,
          model: activeModel,
          prompt: prompt.trim(),
          status: result.status,
          createdAt: Date.now(),
        },
        ...previous,
      ])
      setPrompt('')
      toast.success(t('Video task submitted'))
    } catch (error) {
      if (isCurrent()) {
        toast.error(
          error instanceof Error
            ? error.message
            : t('Failed to submit the task')
        )
      }
    } finally {
      if (isCurrent()) setSubmitting(false)
    }
  }, [activeModel, isCurrent, prompt, seconds, selection, size, t])

  const removeTask = (id: string) => {
    if (!isCurrent()) return
    const task = tasks.find((item) => item.id === id)
    if (task?.videoUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(task.videoUrl)
      objectUrls.current.delete(task.videoUrl)
    }
    if (
      task &&
      !tasks.some((item) => item.id !== id && item.tokenId === task.tokenId)
    ) {
      taskKeys.current.delete(task.tokenId)
    }
    setTasks((previous) => previous.filter((item) => item.id !== id))
  }

  return (
    <div className='flex w-full flex-col gap-4'>
      <p className='text-muted-foreground text-[13px]'>
        {t('Turn a prompt into a video and track every task.')}
      </p>
      <div className='grid gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]'>
        <Card className='h-fit'>
          <CardHeader>
            <CardTitle>{t('New video')}</CardTitle>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div className='flex flex-col gap-1.5'>
              <span className='text-[13px] font-medium'>{t('API key')}</span>
              <CapabilityKeySelect
                capability='video'
                selection={selection}
                onSelect={setSelection}
              />
            </div>

            <div className='flex flex-col gap-1.5'>
              <span className='text-[13px] font-medium'>{t('Model')}</span>
              <Select
                value={activeModel}
                onValueChange={(value) => setModel(value ?? '')}
              >
                <SelectTrigger className='w-full' aria-label={t('Model')}>
                  <SelectValue placeholder={t('Select a video model')} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.length === 0 ? (
                    <SelectItem value='__empty__' disabled>
                      {t('No video model available')}
                    </SelectItem>
                  ) : (
                    modelOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className='flex flex-col gap-1.5'>
              <label className='text-[13px] font-medium' htmlFor='video-prompt'>
                {t('Prompt')}
              </label>
              <Textarea
                id='video-prompt'
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t(
                  'A slow dolly shot through a neon-lit alley, cinematic'
                )}
                rows={4}
              />
            </div>

            <div className='grid grid-cols-2 gap-3'>
              <div className='flex flex-col gap-1.5'>
                <span className='text-[13px] font-medium'>{t('Duration')}</span>
                <DurationPicker
                  value={seconds}
                  onChange={setSeconds}
                  presets={DURATIONS}
                  label={t('Duration')}
                  min={1}
                  max={3600}
                  disabled={isSubmitting}
                />
              </div>
              <div className='flex flex-col gap-1.5'>
                <span className='text-[13px] font-medium'>
                  {t('Resolution')}
                </span>
                <SizePicker
                  value={size}
                  onChange={setSize}
                  presets={SIZE_PRESETS}
                  label={t('Resolution')}
                  min={256}
                  max={4096}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className='size-4 animate-spin' aria-hidden='true' />
              ) : (
                <Plus className='size-4' aria-hidden='true' />
              )}
              {t('Generate video')}
            </Button>
          </CardContent>
        </Card>

        <div className='flex flex-col gap-3'>
          <div className='flex items-center justify-between'>
            <h3 className='text-[15px] font-semibold tracking-tight'>
              {t('Tasks')}
            </h3>
            <Badge variant='outline'>
              {tasks.length} {t('total')}
            </Badge>
          </div>

          {tasks.length === 0 ? (
            <div className='border-border/70 bg-muted/20 flex min-h-[280px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 text-center'>
              <span className='bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full'>
                <Clapperboard className='size-5' aria-hidden='true' />
              </span>
              <p className='text-[15px] font-semibold'>
                {t('No video tasks yet')}
              </p>
              <p className='text-muted-foreground max-w-sm text-[13px] leading-relaxed'>
                {t('Submitted tasks are saved in this browser.')}
              </p>
            </div>
          ) : (
            tasks.map((task) => (
              <Card key={task.id} size='sm'>
                <CardContent className='flex flex-col gap-3 py-4'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Badge variant={statusVariant(task.status)}>
                      {task.status}
                    </Badge>
                    <Badge variant='outline'>{task.model}</Badge>
                    <span className='text-muted-foreground font-mono text-[11px]'>
                      {task.taskId}
                    </span>
                    <Button
                      variant='ghost'
                      size='icon-sm'
                      className='ml-auto'
                      onClick={() => removeTask(task.id)}
                      aria-label={t('Remove task')}
                    >
                      <Trash2 className='size-3.5' />
                    </Button>
                  </div>
                  <p className='text-muted-foreground line-clamp-2 text-[13px]'>
                    {task.prompt}
                  </p>
                  {task.error ? (
                    <p className='text-destructive text-[12px]'>{task.error}</p>
                  ) : null}
                  {task.videoUrl ? (
                    <div className='flex flex-col gap-2'>
                      <video
                        src={task.videoUrl}
                        controls
                        className='border-border/70 w-full max-w-lg rounded-lg border'
                      />
                      <a
                        className='text-primary w-fit text-[12px] font-medium hover:underline'
                        href={task.videoUrl}
                        download={`ai-studio-${task.taskId}.mp4`}
                      >
                        {t('Download video')}
                      </a>
                    </div>
                  ) : (
                    <div className='text-muted-foreground flex items-center gap-2 text-[12px]'>
                      <Play className='size-3.5' aria-hidden='true' />
                      {t('Waiting for the rendered file')}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
