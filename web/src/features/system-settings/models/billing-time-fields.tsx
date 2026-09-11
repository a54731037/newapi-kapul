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
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  COMMON_TIMEZONES,
  TIME_FUNCS,
} from '@/features/pricing/lib/billing-expr'
import {
  REQUEST_PROBES,
  isRequestProbe,
  type RequestProbe,
  type VisualComparison,
  type VisualValueKind,
} from '@/features/pricing/lib/billing-expression/visual'
import type {
  MultiplierMode,
  MultiplierSpec,
} from '@/features/pricing/lib/billing-expression/multiplier'

import { DraftNumberInput } from './draft-number-input'

const PROBE_LABELS = {
  hour: 'Hour of day',
  minute: 'Minute',
  weekday: 'Weekday',
  month: 'Month number',
  day: 'Day of month',
  p: 'Billable input tokens',
  c: 'Billable output tokens',
  len: 'Full input length',
  param: 'Request field',
  header: 'Request header',
  u: 'Task usage fact',
} as const

const VALUE_KIND_LABELS: Record<VisualValueKind, string> = {
  number: 'Number',
  string: 'Text',
  nil: 'Not provided',
}

export function BillingTimeProbeFields(props: {
  probe: VisualComparison['probe']
  timezone: string
  includeTokens?: boolean
  includeRequest?: boolean
  keyValue?: string
  invalidKey?: boolean
  onKeyChange?: (key: string) => void
  invalidTimezone?: boolean
  onChange: (probe: VisualComparison['probe'], timezone: string) => void
}) {
  const { t } = useTranslation()
  const probes: VisualComparison['probe'][] = [...TIME_FUNCS]
  if (props.includeTokens) probes.push('len', 'p', 'c')
  if (props.includeRequest) probes.push(...REQUEST_PROBES)
  const isTime = (TIME_FUNCS as readonly string[]).includes(props.probe)
  const isRequest = isRequestProbe(props.probe)
  const zones = COMMON_TIMEZONES.map((zone) => ({
    value: zone.value,
    label: zone.value,
  }))
  if (!zones.some((zone) => zone.value === props.timezone)) {
    zones.push({ value: props.timezone, label: props.timezone || 'UTC' })
  }
  return (
    <>
      <Select
        items={probes.map((probe) => ({
          value: probe,
          label: t(PROBE_LABELS[probe]),
        }))}
        value={props.probe}
        onValueChange={(probe) =>
          probe && props.onChange(probe, props.timezone || 'UTC')
        }
      >
        <SelectTrigger
          aria-label={t('Condition input')}
          className='w-44'
          size='sm'
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {probes.map((probe) => (
            <SelectItem key={probe} value={probe}>
              {t(PROBE_LABELS[probe])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isTime && (
        <div className='w-56 max-w-full min-w-0'>
          <Combobox
            aria-label={t('Timezone')}
            aria-invalid={props.invalidTimezone || undefined}
            options={zones}
            value={props.timezone}
            allowCustomValue
            onValueChange={(timezone) =>
              timezone !== null && props.onChange(props.probe, timezone)
            }
            className='w-full'
          />
        </div>
      )}
      {isRequest && (
        <Input
          aria-label={t('Request field path')}
          aria-invalid={props.invalidKey || undefined}
          value={props.keyValue ?? ''}
          placeholder={props.probe === 'header' ? 'X-Header-Name' : 'size'}
          onChange={(event) => props.onKeyChange?.(event.target.value)}
          className='w-40'
        />
      )}
    </>
  )
}

/** Value type selector for request probes: 3, "text" or nil. */
export function BillingValueKindSelect(props: {
  value: VisualValueKind
  onChange: (kind: VisualValueKind) => void
}) {
  const { t } = useTranslation()
  const kinds: VisualValueKind[] = ['number', 'string', 'nil']
  return (
    <Select
      items={kinds.map((kind) => ({
        value: kind,
        label: t(VALUE_KIND_LABELS[kind]),
      }))}
      value={props.value}
      onValueChange={(kind) => kind && props.onChange(kind)}
    >
      <SelectTrigger
        size='sm'
        className='w-32'
        aria-label={t('Condition value type')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {kinds.map((kind) => (
          <SelectItem key={kind} value={kind}>
            {t(VALUE_KIND_LABELS[kind])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export type BillingMultiplierValue = MultiplierSpec

const MULTIPLIER_MODE_LABELS: Record<MultiplierMode, string> = {
  value: 'By value',
  units: 'By unit list',
}

function nextUnitValue(units: number[]): number {
  return units.length > 0 ? Math.max(...units) + 1 : 1
}

/** Request factor applied to a whole pricing tree: (<tree>) * param("n"). */
export function BillingMultiplierFields(props: {
  value: BillingMultiplierValue | null
  onChange: (next: BillingMultiplierValue | null) => void
}) {
  const { t } = useTranslation()
  const value = props.value
  if (!value) {
    return (
      <Button
        type='button'
        variant='outline'
        size='sm'
        className='h-7 text-xs'
        onClick={() =>
          props.onChange({ probe: 'param', key: '', mode: 'value', units: [] })
        }
      >
        <Plus aria-hidden='true' className='mr-1 size-3.5' />
        {t('Request multiplier')}
      </Button>
    )
  }
  const update = (patch: Partial<MultiplierSpec>) =>
    props.onChange({ ...value, ...patch })
  const modes: MultiplierMode[] = ['value', 'units']
  return (
    <div
      role='group'
      aria-label={t('Request multiplier')}
      className='space-y-2 rounded-md border p-2'
    >
      <div className='flex flex-wrap items-center gap-2'>
        <span aria-hidden='true' className='text-muted-foreground text-sm'>
          ×
        </span>
        <Select
          items={REQUEST_PROBES.map((probe) => ({
            value: probe,
            label: t(PROBE_LABELS[probe]),
          }))}
          value={value.probe}
          onValueChange={(probe) => probe && update({ probe: probe as RequestProbe })}
        >
          <SelectTrigger
            size='sm'
            className='w-40'
            aria-label={t('Request multiplier')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {REQUEST_PROBES.map((probe) => (
              <SelectItem key={probe} value={probe}>
                {t(PROBE_LABELS[probe])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label={t('Request field path')}
          value={value.key}
          placeholder={value.probe === 'header' ? 'X-Header-Name' : 'seconds'}
          onChange={(event) => update({ key: event.target.value })}
          className='w-36'
        />
        <Select
          items={modes.map((mode) => ({
            value: mode,
            label: t(MULTIPLIER_MODE_LABELS[mode]),
          }))}
          value={value.mode}
          onValueChange={(mode) =>
            mode &&
            update({
              mode: mode as MultiplierMode,
              units:
                mode === 'units' && value.units.length === 0
                  ? [nextUnitValue([])]
                  : value.units,
            })
          }
        >
          <SelectTrigger
            size='sm'
            className='w-36'
            aria-label={t('Request multiplier mode')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {modes.map((mode) => (
              <SelectItem key={mode} value={mode}>
                {t(MULTIPLIER_MODE_LABELS[mode])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          aria-label={t('Remove multiplier')}
          onClick={() => props.onChange(null)}
        >
          <Trash2 aria-hidden='true' className='text-destructive size-4' />
        </Button>
      </div>
      {value.mode === 'units' && (
        <div className='space-y-1.5'>
          <div className='flex flex-wrap items-center gap-1.5'>
            {value.units.map((unit, index) => (
              // eslint-disable-next-line react/no-array-index-key -- Parsed unit rows have no IDs; preserve input identity while their values change.
              <div key={index} className='flex items-center'>
                <DraftNumberInput
                  aria-label={t('Unit value')}
                  min={1}
                  value={unit}
                  onValueChange={(next) =>
                    update({
                      units: value.units.map((current, i) =>
                        i === index ? next : current
                      ),
                    })
                  }
                  className='w-16'
                />
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  aria-label={t('Remove unit')}
                  onClick={() =>
                    update({
                      units: value.units.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 aria-hidden='true' className='size-3.5' />
                </Button>
              </div>
            ))}
            <Button
              type='button'
              variant='outline'
              size='sm'
              className='h-7 text-xs'
              onClick={() =>
                update({ units: [...value.units, nextUnitValue(value.units)] })
              }
            >
              <Plus aria-hidden='true' className='mr-1 size-3.5' />
              {t('Add unit')}
            </Button>
          </div>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Each listed value gets its own traced factor; other values charge one unit.'
            )}
          </p>
        </div>
      )}
    </div>
  )
}

/** String drafts keep incomplete bounds visible instead of silently changing them to zero. */
export function BillingConditionValueInput(props: {
  value: string
  onChange: (value: string) => void
  label?: string
  invalid?: boolean
  normalizeNumberDrafts?: boolean
  probe?: VisualComparison['probe']
  valueKind?: VisualValueKind
}) {
  const { t, i18n } = useTranslation()
  if (
    props.probe === 'weekday' &&
    !props.normalizeNumberDrafts &&
    (props.value === '' || /^[0-6]$/.test(props.value))
  ) {
    const formatter = new Intl.DateTimeFormat(
      i18n.language === 'zhCN' ? 'zh-CN' : i18n.language,
      { weekday: 'long', timeZone: 'UTC' }
    )
    const days = Array.from({ length: 7 }, (_, day) => ({
      value: String(day),
      label: formatter.format(new Date(Date.UTC(2026, 0, 4 + day))),
    }))
    return (
      <Select
        items={days}
        value={props.value}
        onValueChange={(value) => value !== null && props.onChange(value)}
      >
        <SelectTrigger
          size='sm'
          className='w-32'
          aria-label={props.label ?? t('Condition value')}
          aria-invalid={props.invalid || undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {days.map((day) => (
            <SelectItem key={day.value} value={day.value}>
              {day.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }
  if (props.normalizeNumberDrafts) {
    return (
      <DraftNumberInput
        aria-label={props.label ?? t('Condition value')}
        value={props.value}
        onValueChange={(value) => props.onChange(String(value))}
        className='w-24'
      />
    )
  }
  if (props.valueKind === 'string') {
    return (
      <Input
        type='text'
        aria-label={props.label ?? t('Condition value')}
        aria-invalid={props.invalid || undefined}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        className='w-40'
      />
    )
  }
  return (
    <Input
      type='text'
      inputMode='numeric'
      aria-label={props.label ?? t('Condition value')}
      aria-invalid={props.invalid || undefined}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      className='w-24'
    />
  )
}

export function BillingTimeRangeFields(props: {
  start: string
  end: string
  startOperator?: ReactNode
  endOperator?: ReactNode
  invalidStart?: boolean
  invalidEnd?: boolean
  normalizeNumberDrafts?: boolean
  probe?: VisualComparison['probe']
  onChange: (start: string, end: string) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      {props.startOperator}
      <BillingConditionValueInput
        label={props.probe === 'weekday' ? t('Start weekday') : t('Start')}
        probe={props.probe}
        normalizeNumberDrafts={props.normalizeNumberDrafts}
        invalid={props.invalidStart}
        value={props.start}
        onChange={(start) => props.onChange(start, props.end)}
      />
      <span className='text-muted-foreground text-xs'>{t('to')}</span>
      {props.endOperator}
      <BillingConditionValueInput
        label={props.probe === 'weekday' ? t('End weekday') : t('End')}
        probe={props.probe}
        normalizeNumberDrafts={props.normalizeNumberDrafts}
        invalid={props.invalidEnd}
        value={props.end}
        onChange={(end) => props.onChange(props.start, end)}
      />
    </>
  )
}
