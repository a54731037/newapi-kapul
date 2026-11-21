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

type DurationPickerProps = {
  value: string
  onChange: (value: string) => void
  presets: string[]
  label: string
  min?: number
  max?: number
  disabled?: boolean
}

const CUSTOM = 'custom'

/**
 * Seconds selector with presets plus a free numeric input, bounded so an
 * out-of-range duration never reaches billing.
 */
export function DurationPicker(props: DurationPickerProps) {
  const { t } = useTranslation()
  const min = props.min ?? 1
  const max = props.max ?? 60
  const isPreset = props.presets.includes(props.value)
  const [customChosen, setCustomChosen] = React.useState(false)
  const [custom, setCustom] = React.useState(isPreset ? '' : props.value)
  const showCustom = customChosen || !isPreset

  const emitCustom = (raw: string) => {
    setCustom(raw)
    const seconds = Number(raw)
    if (Number.isFinite(seconds) && seconds >= min && seconds <= max) {
      props.onChange(String(seconds))
    }
  }

  return (
    <div className='flex flex-col gap-1.5'>
      <Select
        value={showCustom ? CUSTOM : props.value}
        items={[
          ...props.presets.map((value) => ({ value, label: `${value}s` })),
          { value: CUSTOM, label: t('Custom duration') },
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
          {props.presets.map((value) => (
            <SelectItem key={value} value={value}>
              {value}s
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>{t('Custom duration')}</SelectItem>
        </SelectContent>
      </Select>
      {showCustom ? (
        <Input
          type='number'
          min={min}
          max={max}
          value={custom}
          aria-label={t('Seconds')}
          placeholder={t('Seconds')}
          disabled={props.disabled}
          onChange={(event) => emitCustom(event.target.value)}
        />
      ) : null}
      {showCustom ? (
        <p className='text-muted-foreground text-[11px]'>
          {t('Between {{min}} and {{max}} seconds', { min, max })}
        </p>
      ) : null}
    </div>
  )
}
