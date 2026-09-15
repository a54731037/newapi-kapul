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
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { StaticDataTable } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  MAX_CUSTOM_LINK_NAME_LENGTH,
  MAX_CUSTOM_LINK_URL_LENGTH,
  MAX_HEADER_NAV_CUSTOM_LINKS,
  validateHeaderNavCustomLinkName,
  validateHeaderNavCustomLinkUrl,
  type HeaderNavCustomLink,
} from '@/lib/nav-custom-links'

type HeaderNavCustomLinksEditorProps = {
  links: HeaderNavCustomLink[]
  onChange: (links: HeaderNavCustomLink[]) => void
}

export function HeaderNavCustomLinksEditor(
  props: HeaderNavCustomLinksEditorProps
) {
  const { t } = useTranslation()

  const updateRow = (index: number, field: 'name' | 'url', value: string) => {
    props.onChange(
      props.links.map((link, position) =>
        position === index ? { ...link, [field]: value } : link
      )
    )
  }

  return (
    <div className='space-y-3'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='space-y-0.5'>
          <p className='text-sm font-medium'>{t('Custom tabs')}</p>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Added after the built-in items. Use /path for an in-site page or a full https:// address.'
            )}
          </p>
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={props.links.length >= MAX_HEADER_NAV_CUSTOM_LINKS}
          onClick={() =>
            props.onChange([...props.links, { name: '', url: '' }])
          }
        >
          <Plus className='mr-2 h-4 w-4' />
          {t('Add tab')}
        </Button>
      </div>

      <StaticDataTable
        data={props.links}
        emptyClassName='text-muted-foreground py-8'
        emptyContent={t('No custom tabs configured')}
        columns={[
          {
            id: 'name',
            header: t('Name'),
            className: 'w-[240px]',
            cell: (row, index) => {
              const error = validateHeaderNavCustomLinkName(row.name)
              return (
                <Field data-invalid={Boolean(error)}>
                  <Input
                    value={row.name}
                    aria-label={t('Custom tab name')}
                    aria-invalid={Boolean(error)}
                    maxLength={MAX_CUSTOM_LINK_NAME_LENGTH}
                    placeholder={t('Documentation')}
                    onChange={(event) =>
                      updateRow(index, 'name', event.target.value)
                    }
                  />
                  {error ? <FieldError>{t(error)}</FieldError> : null}
                </Field>
              )
            },
          },
          {
            id: 'url',
            header: t('Link'),
            cell: (row, index) => {
              const error = validateHeaderNavCustomLinkUrl(row.url)
              return (
                <Field data-invalid={Boolean(error)}>
                  <Input
                    value={row.url}
                    aria-label={t('Custom tab link')}
                    aria-invalid={Boolean(error)}
                    maxLength={MAX_CUSTOM_LINK_URL_LENGTH}
                    placeholder='https://example.com/docs'
                    onChange={(event) =>
                      updateRow(index, 'url', event.target.value)
                    }
                  />
                  {error ? <FieldError>{t(error)}</FieldError> : null}
                </Field>
              )
            },
          },
          {
            id: 'actions',
            header: t('Actions'),
            className: 'w-[80px] text-right',
            cellClassName: 'text-right',
            cell: (_row, index) => (
              <Button
                type='button'
                variant='ghost'
                size='icon'
                aria-label={t('Delete')}
                onClick={() =>
                  props.onChange(
                    props.links.filter((_, position) => position !== index)
                  )
                }
              >
                <Trash2 className='text-destructive h-4 w-4' />
              </Button>
            ),
          },
        ]}
      />
    </div>
  )
}
