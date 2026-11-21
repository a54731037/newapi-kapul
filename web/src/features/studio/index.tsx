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
import { Brush, Clapperboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '@/components/empty-state'
import { SectionPageLayout } from '@/components/layout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { VideoStudioView } from '@/features/video'
import { useStatus } from '@/hooks/use-status'

import { DrawingBoardView } from './components/drawing-board-view'
import { resolveStudioTabs, type StudioAccessStatus } from './lib/tab-access'
import type { StudioTab } from './search'

const TAB_ICONS: Record<StudioTab, typeof Brush> = {
  canvas: Brush,
  video: Clapperboard,
}

const TAB_LABELS: Record<StudioTab, string> = {
  canvas: 'Drawing Board',
  video: 'Video Studio',
}

/**
 * One creative workspace: the drawing board (image form plus node canvas) and
 * video tasks are the two sections here.
 */
export function StudioView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { status } = useStatus()
  const search = useSearch({ from: '/_authenticated/studio/' })
  // Master switch plus per-feature switches; the drawing board also honours the
  // legacy DrawingEnabled flag so existing deployments keep their setting.
  // `useStatus` hands back the unwrapped `/api/status` data map.
  const tabs: StudioTab[] = resolveStudioTabs(
    status as StudioAccessStatus | null
  )
  const requested: StudioTab = search.tab ?? 'canvas'
  const tab: StudioTab = tabs.includes(requested) ? requested : tabs[0]

  if (tabs.length === 0) {
    return (
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('Studio')}</SectionPageLayout.Title>
        <SectionPageLayout.Content>
          <EmptyState
            title={t('Creative workspace is closed')}
            description={t(
              'An administrator can enable it, or specific features of it, in System Settings → Content.'
            )}
            bordered
            className='min-h-64'
          />
        </SectionPageLayout.Content>
      </SectionPageLayout>
    )
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Studio')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Tabs
          value={tab}
          onValueChange={(value) =>
            void navigate({
              to: '/studio',
              search: { tab: value as StudioTab },
              replace: true,
            })
          }
        >
          <TabsList>
            {tabs.map((item) => {
              const Icon = TAB_ICONS[item]
              return (
                <TabsTrigger key={item} value={item}>
                  <Icon className='mr-1 size-3.5' aria-hidden='true' />
                  {t(TAB_LABELS[item])}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
      </SectionPageLayout.Actions>

      <SectionPageLayout.Content>
        <div className='mx-auto flex w-full max-w-7xl flex-col gap-4'>
          {tab === 'canvas' ? <DrawingBoardView /> : null}
          {tab === 'video' ? <VideoStudioView /> : null}
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
