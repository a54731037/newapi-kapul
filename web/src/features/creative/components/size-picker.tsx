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

import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export type SizePreset = { value: string; label: string }

type SizePickerProps = {
  value: string
  onChange: (value: string) => void
  presets: SizePreset[]
  label: string
  min?: number
  max?: number
  disabled?: boolean
}

const CUSTOM = 'custom'

function parseSize(value: string): [string, string] {
  const match = /^(\d+)x(\d+)$/.exec(value)
  return match ? [match[1], match[2]] : ['', '']
}

/**
 * Size selector with the common presets plus a free width × height input, so
 * models that accept arbitrary resolutions are not limited to a few choices.
 */
export function SizePicker(props: SizePickerProps) {
  const { t } = useTranslation()
  const min = props.min ?? 64
  const max = props.max ?? 4096
  const isPreset = props.presets.some((item) => item.value === props.value)
  const [customChosen, setCustomChosen] = React.useState(false)
  const [custom, setCustom] = React.useState(() => parseSize(props.value))
  const showCustom = customChosen || !isPreset

  const emitCustom = (next: [string, string]) => {
    setCustom(next)
    const width = Number(next[0])
    const height = Number(next[1])
    if (width >= min && width <= max && height >= min && height <= max) {
      props.onChange(`${width}x${height}`)
    }
  }

  return (
    <div className='flex flex-col gap-1.5'>
      <Select
        value={showCustom ? CUSTOM : props.value}
        items={[
          ...props.presets.map((item) => ({
            value: item.value,
            label: item.label,
          })),
          { value: CUSTOM, label: t('Custom size') },
        ]}
        disabled={props.disabled}
        onValueChange={(next) => {
          if (!next) return
          if (next === CUSTOM) {
            setCustomChosen(true)
            return
          }
          setCustomChosen(false)
          props.onChange(next)
        }}
      >
        <SelectTrigger className='w-full' aria-label={props.label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {props.presets.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>{t('Custom size')}</SelectItem>
        </SelectContent>
      </Select>
      {showCustom ? (
        <div className='flex items-center gap-2'>
          <Input
            type='number'
            min={min}
            max={max}
            value={custom[0]}
            aria-label={t('Width')}
            placeholder={t('Width')}
            disabled={props.disabled}
            onChange={(event) => emitCustom([event.target.value, custom[1]])}
          />
          <span className='text-muted-foreground text-xs'>×</span>
          <Input
            type='number'
            min={min}
            max={max}
            value={custom[1]}
            aria-label={t('Height')}
            placeholder={t('Height')}
            disabled={props.disabled}
            onChange={(event) => emitCustom([custom[0], event.target.value])}
          />
        </div>
      ) : null}
      {showCustom ? (
        <p className='text-muted-foreground text-[11px]'>
          {t('Any width × height between {{min}} and {{max}} px', { min, max })}
        </p>
      ) : null}
    </div>
  )
}
