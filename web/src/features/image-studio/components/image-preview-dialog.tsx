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
import { Download, Pencil, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'

import type { GeneratedImage } from '../types'

type ImagePreviewDialogProps = {
  image: GeneratedImage | null
  onOpenChange: (open: boolean) => void
  onDownload: (image: GeneratedImage) => void
  onEdit: (image: GeneratedImage) => void
  onSendToCanvas: (image: GeneratedImage) => void
}

/** Full-size view of a generated image with its follow-up actions. */
export function ImagePreviewDialog(props: ImagePreviewDialogProps) {
  const { t } = useTranslation()
  const image = props.image

  return (
    <Dialog
      open={Boolean(image)}
      onOpenChange={props.onOpenChange}
      title={t('Generated image')}
      description={image ? `${image.model} · ${image.size}` : undefined}
      contentClassName='sm:max-w-3xl'
      bodyClassName='space-y-3'
      footer={
        image ? (
          <>
            <Button
              variant='outline'
              onClick={() => props.onSendToCanvas(image)}
            >
              <Send className='mr-1 size-4' aria-hidden='true' />
              {t('Send to canvas')}
            </Button>
            <Button variant='outline' onClick={() => props.onDownload(image)}>
              <Download className='mr-1 size-4' aria-hidden='true' />
              {t('Download')}
            </Button>
            <Button onClick={() => props.onEdit(image)}>
              <Pencil className='mr-1 size-4' aria-hidden='true' />
              {t('Edit this image')}
            </Button>
          </>
        ) : null
      }
    >
      {image ? (
        <>
          <img
            src={image.source}
            alt={image.prompt}
            className='bg-muted/30 max-h-[60vh] w-full rounded-lg object-contain'
          />
          <p className='text-muted-foreground text-[12px] break-all'>
            {image.prompt}
          </p>
        </>
      ) : null}
    </Dialog>
  )
}
