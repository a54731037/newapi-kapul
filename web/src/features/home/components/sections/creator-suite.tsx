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
import { Link } from '@tanstack/react-router'
import {
  ArrowUpRight,
  Brush,
  Clapperboard,
  KeyRound,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import type { StudioTab } from '@/features/studio/search'

type StudioCard = {
  title: string
  description: string
  icon: LucideIcon
  badge: string
  tab?: StudioTab
}

/**
 * Entry point for the creative workspace. The drawing board (image generation
 * plus node canvas) and video both live behind one `/studio` hub, so the cards
 * deep-link into the matching tab.
 */
export function CreatorSuite() {
  const { t } = useTranslation()

  const cards: StudioCard[] = [
    {
      title: t('Drawing Board'),
      description: t(
        'Write a prompt and generate on an infinite board: arrange the results as nodes, chain them together and export.'
      ),
      icon: Brush,
      badge: t('Image + node canvas'),
      tab: 'canvas',
    },
    {
      title: t('Video Studio'),
      description: t(
        'Pick a video-group key, submit a prompt, and follow every task status in one list.'
      ),
      icon: Clapperboard,
      badge: t('Video models'),
      tab: 'video',
    },
    {
      title: t('API Keys'),
      description: t(
        'Keys are grouped, so a video or image key can be scoped to exactly the models it may call.'
      ),
      icon: KeyRound,
      badge: t('Group scoped'),
    },
  ]

  return (
    <section className='mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 md:py-20 lg:px-8'>
      <div className='mx-auto mb-10 max-w-2xl text-center'>
        <span className='text-primary text-[11px] font-semibold tracking-[0.16em] uppercase'>
          {t('Creation suite')}
        </span>
        <h2 className='mt-3 text-[clamp(1.6rem,3vw,2.25rem)] leading-tight font-semibold tracking-tight text-balance'>
          {t('Generate, compose, and ship creative work')}
        </h2>
        <p className='text-muted-foreground mt-3 text-[15px] leading-relaxed'>
          {t(
            'Every studio surface bills through the same key and group rules as your API traffic.'
          )}
        </p>
      </div>

      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        {cards.map((card) => (
          <div
            key={card.title}
            className='group/card border-border/80 bg-card hover:border-primary/40 flex flex-col gap-4 rounded-xl border p-5 shadow-[0_1px_2px_0_rgb(16_24_40/0.04)] transition-colors'
          >
            <div className='flex items-start justify-between gap-3'>
              <span className='bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg'>
                <card.icon className='size-5' aria-hidden='true' />
              </span>
              <Badge variant='outline'>{card.badge}</Badge>
            </div>
            <div className='flex flex-col gap-1.5'>
              <h3 className='text-[15px] font-semibold tracking-tight'>
                {card.title}
              </h3>
              <p className='text-muted-foreground text-[13px] leading-relaxed'>
                {card.description}
              </p>
            </div>
            {card.tab ? (
              <Link
                to='/studio'
                search={{ tab: card.tab }}
                className='text-primary mt-auto inline-flex items-center gap-1 text-[13px] font-medium'
              >
                {t('Open')}
                <ArrowUpRight
                  className='size-3.5 transition-transform group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5'
                  aria-hidden='true'
                />
              </Link>
            ) : (
              <Link
                to='/keys'
                className='text-primary mt-auto inline-flex items-center gap-1 text-[13px] font-medium'
              >
                {t('Open')}
                <ArrowUpRight
                  className='size-3.5 transition-transform group-hover/card:translate-x-0.5 group-hover/card:-translate-y-0.5'
                  aria-hidden='true'
                />
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
