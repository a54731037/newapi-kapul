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
import {
  Download,
  ImagePlus,
  Loader2,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { usePromptLibrary } from '@/features/canvas/infinite/use-prompt-library'
import {
  createImageJob,
  deleteImageJob,
  deleteJobImage,
  editImage,
  listImageJobs,
  resolveJobImage,
  type ImageJob,
} from '@/features/creative/api'
import {
  CapabilityKeySelect,
  type CreativeKeySelection,
} from '@/features/creative/components/capability-key-select'
import { SizePicker } from '@/features/creative/components/size-picker'
import { useCreativeAssets } from '@/features/creative/hooks/use-creative-assets'

import { appendImageToCanvas } from './append-image-to-canvas'
import {
  ImageEditDialog,
  type ImageEditSubmission,
} from './components/image-edit-dialog'
import { ImagePreviewDialog } from './components/image-preview-dialog'
import { downloadImage } from './lib/download'
import {
  IMAGE_UPLOAD_ACCEPT,
  MAX_IMAGE_UPLOAD_BYTES,
  readImageUpload,
} from './lib/upload'
import {
  DEFAULT_IMAGE_SIZE,
  IMAGE_COUNTS,
  IMAGE_SIZE_MAX,
  IMAGE_SIZE_MIN,
  IMAGE_SIZES,
  type GeneratedImage,
  type GenerationResult,
} from './types'

/** Reads the clock; kept out of component scope so render stays pure. */
function now(): number {
  return Date.now()
}

export function ImageStudioView() {
  const { t } = useTranslation()
  const creative = useCreativeAssets('image')
  const promptLibrary = usePromptLibrary()

  const [selection, setSelection] = useState<CreativeKeySelection | null>(null)
  const [model, setModel] = useState('')
  const [size, setSize] = useState<string>(DEFAULT_IMAGE_SIZE)
  const [count, setCount] = useState<string>(IMAGE_COUNTS[0])
  const [prompt, setPrompt] = useState('')
  // Jobs live on the server, so a reload simply re-reads them.
  const [jobs, setJobs] = useState<ImageJob[]>([])
  const [edited, setEdited] = useState<GenerationResult[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [preview, setPreview] = useState<GeneratedImage | null>(null)
  const [editing, setEditing] = useState<GeneratedImage | null>(null)
  const [editRunning, setEditRunning] = useState(false)
  const uploadInput = useRef<HTMLInputElement>(null)

  const refreshJobs = useCallback(async () => {
    try {
      setJobs(await listImageJobs())
    } catch {
      // A transient failure keeps the previous list; the next tick retries.
    }
  }, [])

  useEffect(() => {
    let active = true
    listImageJobs()
      .then((items) => {
        if (active) setJobs(items)
      })
      .catch(() => {
        // A transient failure keeps the previous list; the next tick retries.
      })
    return () => {
      active = false
    }
  }, [])

  const running = jobs.some(
    (job) => job.status === 'pending' || job.status === 'running'
  )

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => void refreshJobs(), 3000)
    return () => window.clearInterval(timer)
  }, [running, refreshJobs])

  // Rendered files sit behind dashboard credentials, so read them as blobs.
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    const missing = jobs
      .flatMap((job) => (job.status === 'succeeded' ? job.images : []))
      .map((image) => image.url)
      .filter((url) => !imageUrls[url])
    if (missing.length === 0) return
    let active = true
    Promise.all(
      missing.map(async (url) => ({
        url,
        objectUrl: await resolveJobImage(url).catch(() => ''),
      }))
    )
      .then((resolved) => {
        if (!active) return
        setImageUrls((previous) => {
          const next = { ...previous }
          for (const item of resolved) {
            if (item.objectUrl) next[item.url] = item.objectUrl
          }
          return next
        })
      })
      .catch(() => {
        // A card keeps its placeholder; the next poll retries the download.
      })
    return () => {
      active = false
    }
  }, [jobs, imageUrls])

  const modelOptions = useMemo(() => {
    const group = selection?.group?.trim()
    return creative.models
      .filter(
        (item) =>
          !group ||
          group === 'auto' ||
          (item.enable_groups ?? []).includes(group)
      )
      .map((item) => item.model_name)
  }, [creative.models, selection])

  const activeModel = model || modelOptions[0] || ''

  // One card per rendered file; a job that is still running keeps its slot.
  const jobResults = useMemo<GenerationResult[]>(
    () =>
      jobs.flatMap((job): GenerationResult[] => {
        if (job.status === 'succeeded' && job.images.length > 0) {
          return job.images.map((image): GenerationResult => {
            const source = imageUrls[image.url]
            const id = `job-${job.id}-${image.index}`
            if (!source) return { id, status: 'pending' }
            return {
              id,
              status: 'success',
              jobId: job.id,
              imageIndex: image.index,
              image: {
                id,
                source,
                prompt: job.prompt,
                model: job.model,
                size: job.size,
                createdAt: job.created_at * 1000,
              },
            }
          })
        }
        if (job.status === 'failed') {
          return [
            {
              id: `job-${job.id}`,
              status: 'failed' as const,
              error: job.error || t('Image generation failed'),
              jobId: job.id,
            },
          ]
        }
        return [{ id: `job-${job.id}`, status: 'pending' as const }]
      }),
    [jobs, imageUrls, t]
  )

  const results = useMemo(
    () => [...edited, ...jobResults],
    [edited, jobResults]
  )
  const pendingCount = results.filter(
    (item) => item.status === 'pending'
  ).length

  const handleGenerate = async () => {
    if (!selection) {
      toast.error(t('Select an API key first'))
      return
    }
    if (!activeModel) {
      toast.error(t('Select an image model first'))
      return
    }
    if (!prompt.trim()) {
      toast.error(t('Describe the image you want'))
      return
    }

    setSubmitting(true)
    try {
      await createImageJob({
        tokenId: selection.tokenId,
        model: activeModel,
        prompt: prompt.trim(),
        size,
        count: Number(count),
      })
      await refreshJobs()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Image generation failed')
      )
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteImage = async (jobId: number, index: number) => {
    try {
      await deleteJobImage({ jobId, index })
      await refreshJobs()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Unable to delete the image')
      )
    }
  }

  const handleDeleteJob = async (jobId: number) => {
    try {
      await deleteImageJob(jobId)
      await refreshJobs()
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Unable to delete the record')
      )
    }
  }

  /** Re-run a failed job with the same parameters. */
  const handleRetry = async (jobId: number) => {
    const job = jobs.find((item) => item.id === jobId)
    if (!job) return
    if (!selection) {
      toast.error(t('Select an API key first'))
      return
    }
    try {
      await createImageJob({
        tokenId: selection.tokenId,
        model: job.model,
        prompt: job.prompt,
        size: job.size,
        count: job.n,
      })
      await refreshJobs()
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Image generation failed')
      )
    }
  }

  const handleSendToCanvas = useCallback(
    async (image: GeneratedImage) => {
      try {
        const board = await appendImageToCanvas({
          source: image.source,
          title: image.prompt,
        })
        toast.success(t('Sent to board {{name}}', { name: board }))
      } catch {
        toast.error(t('No canvas board available'))
      }
    },
    [t]
  )

  const handleDownload = useCallback(
    async (image: GeneratedImage) => {
      try {
        await downloadImage(image)
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('Unable to download image')
        )
      }
    },
    [t]
  )

  const handleEditSubmit = async (submission: ImageEditSubmission) => {
    if (!editing) return
    if (!selection) {
      toast.error(t('Select an API key first'))
      return
    }
    if (!activeModel) {
      toast.error(t('Select an image model first'))
      return
    }

    const source = editing
    const batchId = `edit-${now().toString(36)}`
    setEditRunning(true)
    try {
      const images = await editImage({
        key: selection.key,
        model: activeModel,
        prompt: submission.prompt,
        image: source.source,
        size: submission.size,
        count: submission.count,
      })
      const createdAt = now()
      const edited: GeneratedImage[] = images.map((image, index) => ({
        id: `${batchId}-image-${index}`,
        source: image,
        prompt: submission.prompt,
        model: activeModel,
        size: submission.size,
        createdAt,
      }))

      setEdited((previous) => [
        ...edited.map((image, index) => ({
          id: `${batchId}-${index}`,
          status: 'success' as const,
          image,
        })),
        ...previous,
      ])
      toast.success(t('Edited {{count}} images', { count: edited.length }))
      setEditing(null)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Image edit failed')
      )
    } finally {
      setEditRunning(false)
    }
  }

  const handleUploadReference = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    try {
      const result = await readImageUpload(file)
      if ('failure' in result) {
        if (result.failure === 'type') {
          toast.error(t('Please choose an image file'))
        } else {
          toast.error(
            t('Image must be smaller than {{size}} MB', {
              size: Math.round(MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)),
            })
          )
        }
        return
      }
      // Reuse the edit flow: an uploaded picture is just another reference.
      setEditing({
        id: `upload-${Date.now().toString(36)}`,
        source: result.source,
        prompt: '',
        model: activeModel,
        size,
        createdAt: Date.now(),
      })
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Unable to read the image')
      )
    }
  }

  return (
    <>
      <ImagePreviewDialog
        image={preview}
        onOpenChange={(open) => !open && setPreview(null)}
        onDownload={(image) => void handleDownload(image)}
        onEdit={(image) => {
          setPreview(null)
          setEditing(image)
        }}
        onSendToCanvas={(image) => {
          void handleSendToCanvas(image)
          setPreview(null)
        }}
      />
      <ImageEditDialog
        key={editing?.id ?? 'empty'}
        image={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        onSubmit={(submission) => void handleEditSubmit(submission)}
        isSubmitting={editRunning}
      />
      <div className='grid w-full gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]'>
        <Card className='h-fit'>
          <CardHeader>
            <CardTitle>{t('Generate images')}</CardTitle>
            <CardDescription>
              {t('Write a prompt, pick a size, generate.')}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-4'>
            <div className='flex flex-col gap-1.5'>
              <span className='text-[13px] font-medium'>{t('API key')}</span>
              <CapabilityKeySelect
                capability='image'
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
                  <SelectValue placeholder={t('Select a model')} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.length === 0 ? (
                    <SelectItem value='__empty__' disabled>
                      {t('No model available')}
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

            <div className='grid grid-cols-2 gap-2'>
              <div className='flex flex-col gap-1.5'>
                <span className='text-[13px] font-medium'>{t('Size')}</span>
                <SizePicker
                  value={size}
                  onChange={setSize}
                  presets={[...IMAGE_SIZES]}
                  label={t('Size')}
                  min={IMAGE_SIZE_MIN}
                  max={IMAGE_SIZE_MAX}
                  disabled={running}
                />
              </div>
              <div className='flex flex-col gap-1.5'>
                <span className='text-[13px] font-medium'>{t('Count')}</span>
                <Select
                  value={count}
                  onValueChange={(value) => setCount(value ?? IMAGE_COUNTS[0])}
                >
                  <SelectTrigger className='w-full' aria-label={t('Count')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {IMAGE_COUNTS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className='flex flex-col gap-1.5'>
              <label
                className='text-[13px] font-medium'
                htmlFor='studio-prompt'
              >
                {t('Prompt')}
              </label>
              <Textarea
                id='studio-prompt'
                rows={5}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t('A isometric city block at golden hour')}
              />
              <div className='flex flex-wrap gap-1.5'>
                {promptLibrary.prompts.slice(0, 4).map((item) => (
                  <button
                    key={item.id}
                    type='button'
                    className='border-border/70 bg-muted/40 hover:border-primary/50 hover:text-primary max-w-full truncate rounded-full border px-2.5 py-1 text-left text-[11px] transition-colors'
                    title={item.text}
                    onClick={() => setPrompt(item.text)}
                  >
                    {item.text}
                  </button>
                ))}
              </div>
            </div>

            <div className='flex gap-2'>
              <Button
                onClick={handleGenerate}
                disabled={submitting}
                className='flex-1'
              >
                {running || submitting ? (
                  <Loader2 className='size-4 animate-spin' aria-hidden='true' />
                ) : (
                  <Sparkles className='size-4' aria-hidden='true' />
                )}
                {running || submitting
                  ? t('Generating…')
                  : t('Generate images')}
              </Button>
              <input
                ref={uploadInput}
                type='file'
                accept={IMAGE_UPLOAD_ACCEPT}
                className='hidden'
                aria-label={t('Upload an image to edit')}
                onChange={(event) => void handleUploadReference(event)}
              />
              <Button
                type='button'
                variant='outline'
                className='shrink-0'
                aria-label={t('Upload an image to edit')}
                title={t('Upload an image to edit')}
                disabled={running || editRunning}
                onClick={() => uploadInput.current?.click()}
              >
                <Upload className='size-4' aria-hidden='true' />
                {t('Upload')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className='flex flex-col gap-4'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Results')}</CardTitle>
              {pendingCount > 0 ? (
                <CardDescription>
                  {t('{{count}} images in progress', { count: pendingCount })}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <div className='border-border/70 text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center text-[12px]'>
                  <span className='bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full'>
                    <ImagePlus className='size-4' aria-hidden='true' />
                  </span>
                  {t('Nothing here yet.')}
                </div>
              ) : (
                <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3'>
                  {results.map((result) => (
                    <ResultCard
                      key={result.id}
                      result={result}
                      onPreview={setPreview}
                      onEdit={setEditing}
                      onDownload={handleDownload}
                      onSendToCanvas={handleSendToCanvas}
                      onRetry={(jobId) => void handleRetry(jobId)}
                      onDeleteJob={(jobId) => void handleDeleteJob(jobId)}
                      onDeleteImage={(jobId, index) =>
                        void handleDeleteImage(jobId, index)
                      }
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

function ResultCard(props: {
  result: GenerationResult
  onPreview: (image: GeneratedImage) => void
  onEdit: (image: GeneratedImage) => void
  onDownload: (image: GeneratedImage) => void
  onSendToCanvas: (image: GeneratedImage) => void
  onRetry: (jobId: number) => void
  onDeleteJob: (jobId: number) => void
  onDeleteImage: (jobId: number, index: number) => void
}) {
  const { t } = useTranslation()

  if (props.result.status === 'pending') {
    return (
      <div className='border-border/70 bg-muted/30 flex aspect-square animate-pulse items-center justify-center rounded-xl border'>
        <Loader2 className='text-muted-foreground size-5 animate-spin' />
      </div>
    )
  }

  if (props.result.status === 'failed') {
    const jobId = props.result.jobId
    return (
      <div className='border-destructive/40 bg-destructive/5 text-destructive flex aspect-square flex-col items-center justify-center gap-2 rounded-xl border px-3 text-center text-[11px]'>
        <span>{t('Generation failed')}</span>
        <span className='text-muted-foreground line-clamp-4 break-all'>
          {props.result.error}
        </span>
        <div className='flex items-center gap-2'>
          {jobId === undefined ? null : (
            <>
              <Button
                size='sm'
                variant='outline'
                onClick={() => props.onRetry(jobId)}
              >
                {t('Try again')}
              </Button>
              <Button
                size='sm'
                variant='ghost'
                aria-label={t('Delete record')}
                onClick={() => props.onDeleteJob(jobId)}
              >
                <Trash2 className='size-3.5' />
              </Button>
            </>
          )}
        </div>
      </div>
    )
  }

  const image = props.result.image
  const jobId = props.result.jobId
  const imageIndex = props.result.imageIndex
  return (
    <figure className='group border-border/70 relative overflow-hidden rounded-xl border'>
      <button
        type='button'
        className='block w-full cursor-zoom-in'
        aria-label={t('Preview image')}
        onClick={() => props.onPreview(image)}
      >
        <img
          src={image.source}
          alt={image.prompt}
          className='aspect-square w-full object-cover'
        />
      </button>
      <figcaption className='bg-card/95 absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 px-2 py-1.5 opacity-0 backdrop-blur transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'>
        <span className='text-muted-foreground truncate text-[11px]'>
          {image.size}
        </span>
        <span className='flex items-center gap-1'>
          <Button
            size='icon-sm'
            variant='ghost'
            aria-label={t('Download')}
            onClick={() => props.onDownload(image)}
          >
            <Download className='size-3.5' />
          </Button>
          <Button
            size='icon-sm'
            variant='ghost'
            aria-label={t('Edit this image')}
            onClick={() => props.onEdit(image)}
          >
            <Pencil className='size-3.5' />
          </Button>
          <Button
            size='icon-sm'
            variant='ghost'
            aria-label={t('Send to canvas')}
            onClick={() => props.onSendToCanvas(image)}
          >
            <Send className='size-3.5' />
          </Button>
          {jobId === undefined || imageIndex === undefined ? null : (
            <Button
              size='icon-sm'
              variant='ghost'
              aria-label={t('Delete image')}
              onClick={() => props.onDeleteImage(jobId, imageIndex)}
            >
              <Trash2 className='size-3.5' />
            </Button>
          )}
        </span>
      </figcaption>
    </figure>
  )
}
