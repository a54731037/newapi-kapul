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
import { Download, Loader2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import {
  fetchRemoteManifest,
  installRemotePlugin,
  type RemotePluginEntry,
} from './registry'
import { listSavedPlugins, removeSavedPlugin, type SavedPlugin } from './store'

interface PluginMarketplaceDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}

/**
 * Marketplace sync is local-only: the manifest is fetched straight from the
 * given URL and the plugin source is stored in this browser's IndexedDB.
 */
export function PluginMarketplaceDialog(props: PluginMarketplaceDialogProps) {
  const { t } = useTranslation()
  const [manifestUrl, setManifestUrl] = useState('')
  const [entries, setEntries] = useState<RemotePluginEntry[]>([])
  const [installed, dispatchInstalled] = useReducer(
    (_previous: SavedPlugin[], next: SavedPlugin[]) => next,
    [] as SavedPlugin[]
  )
  const [loading, setLoading] = useState(false)
  const [installing, setInstalling] = useState('')

  const refreshInstalled = useCallback(async () => {
    dispatchInstalled(await listSavedPlugins())
  }, [])

  useEffect(() => {
    if (!props.open) return
    void refreshInstalled()
  }, [props.open, refreshInstalled])

  const handleFetch = async () => {
    if (!manifestUrl.trim()) return
    setLoading(true)
    try {
      setEntries(await fetchRemoteManifest(manifestUrl.trim()))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Could not load the manifest')
      )
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  const handleInstall = async (entry: RemotePluginEntry) => {
    setInstalling(entry.id)
    try {
      const label = await installRemotePlugin(entry)
      await refreshInstalled()
      props.onChanged()
      toast.success(t('Installed {{name}}', { name: label }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Install failed'))
    } finally {
      setInstalling('')
    }
  }

  const handleRemove = async (id: string) => {
    await removeSavedPlugin(id)
    await refreshInstalled()
    props.onChanged()
    toast.success(t('Plugin removed'))
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('Plugin marketplace')}</DialogTitle>
          <DialogDescription>
            {t(
              'Plugins download straight into this browser (IndexedDB). Nothing is uploaded to the server.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className='flex flex-col gap-2'>
          <label className='text-[13px] font-medium' htmlFor='plugin-manifest'>
            {t('Manifest URL')}
          </label>
          <div className='flex items-center gap-2'>
            <Input
              id='plugin-manifest'
              value={manifestUrl}
              onChange={(event) => setManifestUrl(event.target.value)}
              placeholder='https://raw.githubusercontent.com/<you>/canvas-plugins/main/index.json'
            />
            <Button onClick={handleFetch} disabled={loading}>
              {loading ? (
                <Loader2 className='size-4 animate-spin' />
              ) : (
                <Download className='size-4' />
              )}
              {t('Fetch')}
            </Button>
          </div>
        </div>

        {entries.length > 0 ? (
          <ul className='border-border/70 divide-border/70 max-h-56 divide-y overflow-y-auto rounded-lg border'>
            {entries.map((entry) => (
              <li
                key={entry.id}
                className='flex items-center justify-between gap-3 px-3 py-2'
              >
                <div className='min-w-0'>
                  <p className='truncate text-[13px] font-medium'>{entry.id}</p>
                  <p className='text-muted-foreground truncate text-[11px]'>
                    {entry.entry}
                  </p>
                </div>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={installing === entry.id}
                  onClick={() => void handleInstall(entry)}
                >
                  {installing === entry.id ? (
                    <Loader2 className='size-3.5 animate-spin' />
                  ) : null}
                  {t('Install')}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className='flex flex-col gap-2'>
          <span className='text-[13px] font-medium'>
            {t('Installed in this browser')}
          </span>
          {installed.length === 0 ? (
            <p className='text-muted-foreground text-[12px]'>
              {t('Nothing installed yet.')}
            </p>
          ) : (
            <ul className='flex flex-col gap-1.5'>
              {installed.map((plugin) => (
                <li
                  key={plugin.id}
                  className='border-border/70 flex items-center justify-between gap-3 rounded-lg border px-3 py-2'
                >
                  <div className='min-w-0'>
                    <p className='truncate text-[12px] font-medium'>
                      {plugin.label} · {plugin.id}
                    </p>
                    <p className='text-muted-foreground truncate text-[11px]'>
                      {plugin.entryUrl}
                    </p>
                  </div>
                  <Button
                    size='icon-sm'
                    variant='ghost'
                    aria-label={t('Remove plugin')}
                    onClick={() => void handleRemove(plugin.id)}
                  >
                    <Trash2 className='size-3.5' />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
