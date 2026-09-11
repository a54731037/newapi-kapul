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
import { createFileRoute } from '@tanstack/react-router'
import { ExternalLink, FileWarning } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { RichContent } from '@/components/rich-content'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useStatus } from '@/hooks/use-status'

function DocsPage() {
  const { t } = useTranslation()
  const { status, loading } = useStatus()

  if (loading) {
    return (
      <PublicLayout>
        <div className='mx-auto flex max-w-4xl flex-col gap-4 py-12'>
          <Skeleton className='h-8 w-[45%]' />
          <Skeleton className='h-4 w-full' />
          <Skeleton className='h-4 w-[90%]' />
          <Skeleton className='h-4 w-[80%]' />
        </div>
      </PublicLayout>
    )
  }

  const docsContent = (status?.docs_content as string | undefined)?.trim() ?? ''
  const docsLink = (status?.docs_link as string | undefined)?.trim() ?? ''

  if (docsContent) {
    return (
      <PublicLayout showMainContainer={false}>
        <div className='pt-16'>
          <RichContent
            mode='html'
            htmlVariant='isolated'
            content={docsContent}
          />
        </div>
      </PublicLayout>
    )
  }

  if (docsLink) {
    return (
      <PublicLayout>
        <div className='mx-auto max-w-2xl py-12'>
          <Card>
            <CardHeader>
              <CardTitle>{t('文档')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <p className='text-muted-foreground text-sm'>
                {t(
                  '管理员配置了外部文档链接。'
                )}
              </p>
              <Button
                render={
                  <a
                    href={docsLink}
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                <ExternalLink className='mr-2 h-4 w-4' />
                {t('打开文档')}
              </Button>
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className='mx-auto max-w-2xl py-12'>
        <Card className='border-dashed'>
          <CardHeader className='flex flex-row items-center gap-4'>
            <div className='bg-muted rounded-lg p-2'>
              <FileWarning className='text-muted-foreground h-5 w-5' />
            </div>
            <div className='space-y-1'>
              <CardTitle className='text-lg font-semibold'>
                {t('文档')}
              </CardTitle>
              <p className='text-muted-foreground text-sm'>
                {t('尚未配置文档内容。')}
              </p>
            </div>
          </CardHeader>
        </Card>
      </div>
    </PublicLayout>
  )
}

export const Route = createFileRoute('/docs')({
  component: DocsPage,
})