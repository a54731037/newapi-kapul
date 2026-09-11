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
import { Gift, Share2, TrendingUp, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatQuota } from '@/lib/format'

import type { UserWalletData } from '../types'

interface AffiliateRewardsCardProps {
  user: UserWalletData | null
  affiliateLink: string
  onTransfer: () => void
  complianceConfirmed?: boolean
  loading?: boolean
  commissionRate?: number
}

export function AffiliateRewardsCard({
  user,
  affiliateLink,
  onTransfer,
  complianceConfirmed = true,
  loading,
  commissionRate,
}: AffiliateRewardsCardProps) {
  const { t } = useTranslation()

  if (loading) {
    return (
      <Card data-card-hover='false'>
        <CardHeader className='pb-3'>
          <Skeleton className='h-6 w-28' />
          <Skeleton className='mt-1 h-4 w-64' />
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-4 gap-4'>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className='h-16 rounded-lg' />
            ))}
          </div>
          <Skeleton className='mt-4 h-10 rounded-lg' />
        </CardContent>
      </Card>
    )
  }

  const ratePercent = ((commissionRate ?? 0) * 100).toFixed(0)
  const hasCommission = (commissionRate ?? 0) > 0
  const hasRewards = (user?.aff_quota ?? 0) > 0

  return (
    <Card data-card-hover='false'>
      <CardHeader className='pb-3'>
        <div className='flex items-center gap-2.5'>
          <div className='flex size-8 items-center justify-center rounded-lg bg-violet-500/10'>
            <Gift className='size-4 text-violet-500' />
          </div>
          <div>
            <CardTitle className='text-base'>{t('邀请返利')}</CardTitle>
            <p className='text-muted-foreground mt-0.5 text-xs'>
              {t('分享邀请链接给好友，双方均可获得奖励')}
              {hasCommission &&
                ` — ${t('好友充值你拿')} ${ratePercent}% ${t('返佣')}`}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className='space-y-4'>
        {/* 数据卡片 */}
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
          <div className='bg-muted/40 rounded-lg p-3 text-center'>
            <div className='text-muted-foreground mb-1 flex items-center justify-center gap-1 text-[11px]'>
              <Gift className='size-3' />
              <span>{t('待领取')}</span>
            </div>
            <div className='text-lg font-bold tabular-nums'>
              {formatQuota(user?.aff_quota ?? 0)}
            </div>
          </div>

          <div className='bg-muted/40 rounded-lg p-3 text-center'>
            <div className='text-muted-foreground mb-1 flex items-center justify-center gap-1 text-[11px]'>
              <TrendingUp className='size-3' />
              <span>{t('累计获得')}</span>
            </div>
            <div className='text-lg font-bold tabular-nums'>
              {formatQuota(user?.aff_history_quota ?? 0)}
            </div>
          </div>

          <div className='bg-muted/40 rounded-lg p-3 text-center'>
            <div className='text-muted-foreground mb-1 flex items-center justify-center gap-1 text-[11px]'>
              <Users className='size-3' />
              <span>{t('邀请人数')}</span>
            </div>
            <div className='text-lg font-bold tabular-nums'>
              {user?.aff_count ?? 0}
            </div>
          </div>

          <div
            className={`rounded-lg p-3 text-center ${hasCommission ? 'bg-violet-500/10' : 'bg-muted/40'}`}
          >
            <div className='text-muted-foreground mb-1 flex items-center justify-center gap-1 text-[11px]'>
              <Share2 className='size-3' />
              <span>{t('返佣比例')}</span>
            </div>
            <div
              className={`text-lg font-bold tabular-nums ${hasCommission ? 'text-violet-600 dark:text-violet-400' : ''}`}
            >
              {ratePercent}%
            </div>
          </div>
        </div>

        {/* 推广链接 */}
        <div className='flex items-center gap-2'>
          <Input
            value={affiliateLink}
            readOnly
            className='border-muted bg-background/70 h-10 min-w-0 flex-1 font-mono text-xs'
          />
          <CopyButton
            value={affiliateLink}
            variant='outline'
            className='bg-background size-10 shrink-0'
            tooltip={t('复制邀请链接')}
            aria-label={t('复制邀请链接')}
          />
          {hasRewards && (
            <Button
              onClick={onTransfer}
              disabled={!complianceConfirmed}
              className='h-10 shrink-0 px-4'
            >
              {t('转入余额')}
            </Button>
          )}
        </div>

        {!complianceConfirmed ? (
          <p className='text-muted-foreground text-xs'>
            {t('管理员尚未确认合规条款，返利转入暂时不可用。')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}