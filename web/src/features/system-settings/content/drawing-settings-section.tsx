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
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import * as React from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const studioSchema = z.object({
  StudioEnabled: z.boolean(),
  StudioImageEnabled: z.boolean(),
  StudioCanvasEnabled: z.boolean(),
  StudioVideoEnabled: z.boolean(),
  StudioAudioEnabled: z.boolean(),
})

type StudioFormValues = z.infer<typeof studioSchema>

type DrawingSettingsSectionProps = {
  defaultValues: StudioFormValues
}

const SUB_FEATURES = [
  {
    key: 'StudioImageEnabled',
    label: 'Image generation',
    description:
      'The image form inside the board: prompt, size, history and editing.',
  },
  {
    key: 'StudioCanvasEnabled',
    label: 'Node canvas',
    description:
      'The infinite board: place, connect and re-use generated media.',
  },
  {
    key: 'StudioVideoEnabled',
    label: 'Video creation',
    description: 'The video tab plus the video target inside the canvas panel.',
  },
  {
    key: 'StudioAudioEnabled',
    label: 'Audio generation',
    description: 'The speech target inside the canvas panel.',
  },
] as const

/**
 * Creative workspace switches. The master switch hides the whole workspace
 * (sidebar entry, all tabs, and the `/drawing` compatibility route); the sub
 * switches narrow it down per capability: image generation, the node canvas,
 * video and audio can each be switched off on their own.
 */
export function DrawingSettingsSection(props: DrawingSettingsSectionProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const updateOption = useUpdateOption()
  const form = useForm<StudioFormValues>({
    resolver: zodResolver(studioSchema),
    defaultValues: props.defaultValues,
  })

  React.useEffect(() => {
    form.reset(props.defaultValues)
  }, [props.defaultValues, form])

  const studioEnabled = useWatch({
    control: form.control,
    name: 'StudioEnabled',
  })

  const onSubmit = async (values: StudioFormValues) => {
    const changed = (
      Object.keys(values) as Array<keyof StudioFormValues>
    ).filter((key) => values[key] !== props.defaultValues[key])
    for (const key of changed) {
      await updateOption.mutateAsync({ key, value: values[key] })
    }
  }

  return (
    <SettingsSection title={t('Creative workspace')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save creative workspace settings'
          />
          <div className='space-y-4'>
            <FormField
              control={form.control}
              name='StudioEnabled'
              render={({ field }) => (
                <SettingsSwitchItem>
                  <SettingsSwitchContent>
                    <FormLabel>{t('Enable creative workspace')}</FormLabel>
                    <FormDescription>
                      {t(
                        'Master switch: when off, the workspace entry, every tab and the drawing board entry are hidden.'
                      )}
                    </FormDescription>
                  </SettingsSwitchContent>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </SettingsSwitchItem>
              )}
            />

            <div
              className={cn(
                'border-border/70 ml-1 space-y-1 rounded-lg border-l-2 pl-4',
                !studioEnabled && 'opacity-60'
              )}
            >
              <p className='text-muted-foreground pb-1 text-[12px]'>
                {t('Features available inside the workspace')}
              </p>
              {SUB_FEATURES.map((feature) => (
                <FormField
                  key={feature.key}
                  control={form.control}
                  name={feature.key}
                  render={({ field }) => (
                    <SettingsSwitchItem>
                      <SettingsSwitchContent>
                        <FormLabel>{t(feature.label)}</FormLabel>
                        <FormDescription>
                          {t(feature.description)}
                        </FormDescription>
                      </SettingsSwitchContent>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          disabled={!studioEnabled}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </SettingsSwitchItem>
                  )}
                />
              ))}
            </div>

            <div className='border-border/70 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4'>
              <div className='min-w-0'>
                <p className='text-[13px] font-medium'>
                  {t('Preview the workspace')}
                </p>
                <p className='text-muted-foreground text-[12px]'>
                  {t(
                    'Only the features switched on above are shown to every user.'
                  )}
                </p>
              </div>
              <Button
                type='button'
                variant='outline'
                disabled={!studioEnabled}
                onClick={() =>
                  void navigate({ to: '/studio', search: { tab: 'canvas' } })
                }
              >
                {t('Open creative workspace')}
              </Button>
            </div>
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
