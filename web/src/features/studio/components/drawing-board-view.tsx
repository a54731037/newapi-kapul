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
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ImagePlus, Workflow } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CanvasStudioView } from '@/features/canvas'
import { ImageStudioView } from '@/features/image-studio'
import { useStatus } from '@/hooks/use-status'
import { useAuthStore } from '@/stores/auth-store'

import { resolveBoardViews, type StudioAccessStatus } from '../lib/tab-access'
import type { BoardView } from '../search'

const VIEW_ICONS: Record<BoardView, typeof ImagePlus> = {
  image: ImagePlus,
  canvas: Workflow,
}

const VIEW_LABELS: Record<BoardView, string> = {
  image: 'Image generation',
  canvas: 'Canvas',
}

/**
 * The drawing board holds two working modes that share the same keys and media:
 * a plain image-generation form, and the node canvas that can arrange, connect
 * and re-use the results.
 */
export function DrawingBoardView() {
  const ownerId = useAuthStore((store) => store.auth.user?.id ?? null)
  const sessionId = useAuthStore((store) => store.auth.session?.sid ?? null)
  if (ownerId === null) return null
  // Both modes hold generation credentials in memory. A new login must get a
  // fresh component tree, even when the router keeps this workspace mounted.
  return <OwnedDrawingBoardView key={`${ownerId}:${sessionId}`} />
}

function OwnedDrawingBoardView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { status } = useStatus()
  const search = useSearch({ from: '/_authenticated/studio/' })
  // Each capability has its own switch, so only the allowed modes are offered.
  const views = resolveBoardViews(status as StudioAccessStatus | null)
  const view: BoardView =
    search.view && views.includes(search.view) ? search.view : views[0]

  return (
    <div className='flex flex-col gap-4'>
      {views.length > 1 ? (
        <Tabs
          value={view}
          onValueChange={(value) =>
            void navigate({
              to: '/studio',
              search: { tab: 'canvas', view: value as BoardView },
              replace: true,
            })
          }
        >
          <TabsList aria-label={t('Drawing board mode')}>
            {views.map((item) => {
              const Icon = VIEW_ICONS[item]
              return (
                <TabsTrigger key={item} value={item}>
                  <Icon className='mr-1 size-3.5' aria-hidden='true' />
                  {t(VIEW_LABELS[item])}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
      ) : null}

      {view === 'image' ? <ImageStudioView /> : null}
      {view === 'canvas' ? <CanvasStudioView /> : null}
    </div>
  )
}
