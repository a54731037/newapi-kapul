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
import * as React from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { SizePicker } from '@/features/creative/components/size-picker'

import {
  IMAGE_COUNTS,
  IMAGE_SIZE_MAX,
  IMAGE_SIZE_MIN,
  IMAGE_SIZES,
  type GeneratedImage,
} from '../types'

export type ImageEditSubmission = {
  prompt: string
  size: string
  count: number
}

type ImageEditDialogProps = {
  image: GeneratedImage | null
  onOpenChange: (open: boolean) => void
  onSubmit: (submission: ImageEditSubmission) => void
  isSubmitting: boolean
}

/**
 * Edit an already generated image: the picture is sent back to
 * `/v1/images/edits` together with a new prompt, so the result keeps the
 * original composition instead of starting from scratch.
 */
export function ImageEditDialog(props: ImageEditDialogProps) {
  const { t } = useTranslation()
  // Initialised from the selected image; the parent remounts the dialog with a
  // `key` per image, so no state sync effect is needed.
  const [prompt, setPrompt] = React.useState(() => props.image?.prompt ?? '')
  const [size, setSize] = React.useState<string>(
    () => props.image?.size ?? IMAGE_SIZES[0].value
  )
  const [count, setCount] = React.useState<string>(IMAGE_COUNTS[0])

  const canSubmit = Boolean(prompt.trim()) && !props.isSubmitting

  return (
    <Dialog
      open={Boolean(props.image)}
      onOpenChange={props.onOpenChange}
      title={t('Edit image')}
      description={t(
        'Describe what should change. The selected image is sent as the reference.'
      )}
      contentClassName='sm:max-w-2xl'
      bodyClassName='space-y-4'
      footer={
        <>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() =>
              props.onSubmit({
                prompt: prompt.trim(),
                size,
                count: Number(count),
              })
            }
          >
            {props.isSubmitting ? t('Editing...') : t('Apply edit')}
          </Button>
        </>
      }
    >
      <div className='flex gap-3'>
        {props.image ? (
          <img
            src={props.image.source}
            alt={props.image.prompt}
            className='bg-muted/30 size-24 shrink-0 rounded-lg object-cover'
          />
        ) : null}
        <Textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('Describe what should change')}
          aria-label={t('Edit prompt')}
          className='min-h-24'
        />
      </div>
      <div className='grid grid-cols-2 gap-3'>
        <div className='space-y-1.5'>
          <span className='text-[13px] font-medium'>{t('Size')}</span>
          <SizePicker
            value={size}
            onChange={setSize}
            presets={[...IMAGE_SIZES]}
            label={t('Size')}
            min={IMAGE_SIZE_MIN}
            max={IMAGE_SIZE_MAX}
            disabled={props.isSubmitting}
          />
        </div>
        <div className='space-y-1.5'>
          <span className='text-[13px] font-medium'>{t('Count')}</span>
          <Select
            value={count}
            onValueChange={(value) => value && setCount(value)}
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
    </Dialog>
  )
}
