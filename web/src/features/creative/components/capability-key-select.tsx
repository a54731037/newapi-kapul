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
import { KeyRound } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { revealTokenKey } from '../api'
import { useCreativeAssets } from '../hooks/use-creative-assets'
import type { CreativeCapability } from '../lib/capability-groups'

export interface CreativeKeySelection {
  tokenId: number
  key: string
  group: string
}

interface CapabilityKeySelectProps {
  capability: CreativeCapability
  selection: CreativeKeySelection | null
  onSelect: (selection: CreativeKeySelection | null) => void
}

/**
 * Picks one of the caller's own API keys, limited to keys whose group exposes a
 * model for the requested capability. The plaintext key is revealed lazily so
 * the list never holds secrets it does not need.
 */
const LAST_KEY_STORAGE = 'creative-key-selection'

function readLastKeyId(): number | null {
  try {
    const raw = window.localStorage.getItem(LAST_KEY_STORAGE)
    const parsed = raw ? Number(raw) : Number.NaN
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function rememberKeyId(id: number) {
  try {
    window.localStorage.setItem(LAST_KEY_STORAGE, String(id))
  } catch {
    /* storage can be unavailable */
  }
}

export function CapabilityKeySelect(props: CapabilityKeySelectProps) {
  const { t } = useTranslation()
  const { tokens, groups, isLoading } = useCreativeAssets(props.capability)
  const autoSelecting = useRef(false)

  const selectToken = async (tokenId: number) => {
    const token = tokens.find((item) => item.id === tokenId)
    if (!token) {
      props.onSelect(null)
      return
    }
    try {
      const key = await revealTokenKey(token.id)
      rememberKeyId(token.id)
      props.onSelect({ tokenId: token.id, key, group: token.group ?? 'auto' })
    } catch {
      props.onSelect(null)
    }
  }

  const handleValueChange = async (value: string | null) => {
    const token = tokens.find((item) => String(item.id) === value)
    if (!token) {
      props.onSelect(null)
      return
    }
    await selectToken(token.id)
  }

  // Generating should not stop at a "select a key first" guard: preselect the
  // last key this browser used, otherwise the first capable one. Revealing the
  // plaintext stays a per-mount action of the caller's own key.
  useEffect(() => {
    if (props.selection || isLoading || autoSelecting.current) return
    if (tokens.length === 0) return
    const lastId = readLastKeyId()
    const preferred = tokens.find((token) => token.id === lastId) ?? tokens[0]
    autoSelecting.current = true
    void selectToken(preferred.id).finally(() => {
      autoSelecting.current = false
    })
    // `selectToken` is recreated per render; the guard ref keeps this one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, tokens, props.selection])

  if (isLoading) {
    return <div className='bg-muted/40 h-9 w-full animate-pulse rounded-lg' />
  }

  if (tokens.length === 0) {
    return (
      <div className='border-border/70 bg-muted/30 flex flex-col gap-2 rounded-lg border p-3 text-[13px]'>
        <div className='text-foreground flex items-center gap-2 font-medium'>
          <KeyRound className='size-4' aria-hidden='true' />
          {t('No key in a capable group yet')}
        </div>
        <p className='text-muted-foreground leading-relaxed'>
          {t('Keys must belong to a group that exposes this capability.')}
        </p>
        <p className='text-muted-foreground leading-relaxed'>
          {t(
            'Administrators can mark a channel as an image or video channel in the channel settings; its models then count as that capability.'
          )}
        </p>
        <Link
          to='/keys'
          className='text-primary text-[13px] font-medium hover:underline'
        >
          {t('Create API key')}
        </Link>
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-1.5'>
      <Select
        // `items` lets the trigger render the selected key before the popup ever
        // opens; without it a preselected key still shows the placeholder.
        items={tokens.map((token) => ({
          value: String(token.id),
          label: token.name || `#${token.id}`,
        }))}
        value={props.selection ? String(props.selection.tokenId) : null}
        onValueChange={handleValueChange}
      >
        <SelectTrigger className='w-full' aria-label={t('API key')}>
          <SelectValue placeholder={t('Select one of your keys')} />
        </SelectTrigger>
        <SelectContent>
          {tokens.map((token) => (
            <SelectItem key={token.id} value={String(token.id)}>
              <span className='flex items-center gap-2'>
                <span className='truncate'>{token.name || `#${token.id}`}</span>
                <Badge variant='outline'>{token.group || 'auto'}</Badge>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className='text-muted-foreground text-[12px]'>
        {t('Capable groups')}: {groups.join(' · ') || '—'}
      </p>
    </div>
  )
}
