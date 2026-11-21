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
import type { Table } from '@tanstack/react-table'
import { Power, PowerOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { DataTableBulkActions as BulkActionsToolbar } from '@/components/data-table'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { handleServerError } from '@/lib/handle-server-error'

import { deleteUser, manageUser } from '../api'
import { USER_ROLE, USER_STATUS, isUserDeleted } from '../constants'
import type { User } from '../types'
import { useUsers } from './users-provider'

interface DataTableBulkActionsProps {
  table: Table<User>
}

type BulkAction = 'enable' | 'disable' | 'delete'

/**
 * Bulk user management: ban (disable), re-enable, and delete many accounts at
 * once. Root accounts are skipped on the client because the server refuses to
 * disable or delete them; every other failure is reported per batch.
 */
export function DataTableBulkActions({ table }: DataTableBulkActionsProps) {
  const { t } = useTranslation()
  const { triggerRefresh } = useUsers()
  const [busy, setBusy] = useState<BulkAction | null>(null)
  const [confirmOpen, setConfirmOpen] = useState<BulkAction | null>(null)

  const rows = table.getFilteredSelectedRowModel().rows
  const selected = rows.map((row) => row.original)
  const manageable = selected.filter((user) => user.role !== USER_ROLE.ROOT)
  const protectedRoots = selected.length - manageable.length
  const bannable = manageable.filter(
    (user) => user.status !== USER_STATUS.DISABLED
  )
  const enableable = manageable.filter(
    (user) => user.status === USER_STATUS.DISABLED
  )
  const deletable = manageable.filter((user) => !isUserDeleted(user))

  const finish = (action: BulkAction, succeeded: number, failed: number) => {
    const label = {
      enable: t('Enabled {{success}} users, {{failed}} failed', {
        success: succeeded,
        failed,
      }),
      disable: t('Banned {{success}} users, {{failed}} failed', {
        success: succeeded,
        failed,
      }),
      delete: t('Deleted {{success}} users, {{failed}} failed', {
        success: succeeded,
        failed,
      }),
    }[action]
    if (failed === 0) toast.success(label)
    else toast.warning(label)
    if (protectedRoots > 0) {
      toast.info(
        t('{{count}} root accounts were skipped', { count: protectedRoots })
      )
    }
    table.resetRowSelection()
    triggerRefresh()
  }

  const run = async (action: BulkAction, targets: User[]) => {
    if (targets.length === 0) {
      toast.info(t('No selected user can be changed by this action'))
      return
    }
    setBusy(action)
    let succeeded = 0
    let failed = 0
    try {
      for (const user of targets) {
        try {
          const result =
            action === 'delete'
              ? await deleteUser(user.id)
              : await manageUser(user.id, action)
          if (result.success) succeeded += 1
          else {
            failed += 1
            if (failed === 1) {
              handleServerError(
                result,
                t('Failed to update {{name}}', { name: user.username })
              )
            }
          }
        } catch (error) {
          failed += 1
          if (failed === 1) {
            handleServerError(
              error instanceof Error ? error : new Error(String(error)),
              t('Failed to update {{name}}', { name: user.username })
            )
          }
        }
        // Refresh progress feedback for long selections.
        if ((succeeded + failed) % 10 === 0) triggerRefresh()
      }
    } finally {
      setBusy(null)
      setConfirmOpen(null)
      finish(action, succeeded, failed)
    }
  }

  const confirmTargets: User[] = (() => {
    if (confirmOpen === 'delete') return deletable
    if (confirmOpen === 'disable') return bannable
    return enableable
  })()

  return (
    <>
      <BulkActionsToolbar table={table} entityName={t('User')}>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                className='size-8'
                disabled={busy !== null}
                onClick={() => void run('enable', enableable)}
                aria-label={t('Enable selected users')}
                title={t('Enable selected users')}
              />
            }
          >
            <Power />
            <span className='sr-only'>{t('Enable selected users')}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Enable selected users')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='outline'
                size='icon'
                className='size-8'
                disabled={busy !== null}
                onClick={() => setConfirmOpen('disable')}
                aria-label={t('Ban selected users')}
                title={t('Ban selected users')}
              />
            }
          >
            <PowerOff />
            <span className='sr-only'>{t('Ban selected users')}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Ban selected users')}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant='destructive'
                size='icon'
                className='size-8'
                disabled={busy !== null}
                onClick={() => setConfirmOpen('delete')}
                aria-label={t('Delete selected users')}
                title={t('Delete selected users')}
              />
            }
          >
            <Trash2 />
            <span className='sr-only'>{t('Delete selected users')}</span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('Delete selected users')}</p>
          </TooltipContent>
        </Tooltip>
      </BulkActionsToolbar>

      <ConfirmDialog
        open={confirmOpen === 'disable'}
        onOpenChange={(open) => !open && setConfirmOpen(null)}
        title={t('Ban {{count}} users?', { count: bannable.length })}
        desc={t(
          'Banned users lose API access immediately. Their data and quota are kept, and you can re-enable them later.'
        )}
        confirmText={
          busy === 'disable'
            ? t('Banning...')
            : t('Ban {{count}} users', { count: bannable.length })
        }
        isLoading={busy === 'disable'}
        handleConfirm={() => void run('disable', confirmTargets)}
      />

      <ConfirmDialog
        open={confirmOpen === 'delete'}
        onOpenChange={(open) => !open && setConfirmOpen(null)}
        title={t('Delete {{count}} users?', { count: deletable.length })}
        desc={t(
          'Selected users are permanently deleted together with their keys. This action cannot be undone.'
        )}
        confirmText={
          busy === 'delete'
            ? t('Deleting...')
            : t('Delete {{count}} users', { count: deletable.length })
        }
        destructive
        isLoading={busy === 'delete'}
        handleConfirm={() => void run('delete', confirmTargets)}
      />
    </>
  )
}
