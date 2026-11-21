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
import {
  getCoreRowModel,
  getFilteredRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
} from '@tanstack/react-table'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { toast } from 'sonner'
import { describe, expect, it, vi } from 'vitest'

import type { User } from '../../types'
import { DataTableBulkActions } from '../data-table-bulk-actions'
import { UsersProvider } from '../users-provider'

const manageUser = vi.fn()
const deleteUser = vi.fn()

vi.mock('sonner', () => ({
  toast: { info: vi.fn(), success: vi.fn(), warning: vi.fn() },
}))

vi.mock('../../api', () => ({
  manageUser: (...args: unknown[]) => manageUser(...args),
  deleteUser: (...args: unknown[]) => deleteUser(...args),
}))

const users = [
  {
    id: 11,
    username: 'alice',
    role: 1,
    status: 1,
    group: 'default',
    quota: 0,
  },
  {
    id: 12,
    username: 'bob',
    role: 1,
    status: 2,
    group: 'default',
    quota: 0,
  },
  {
    id: 13,
    username: 'root',
    role: 100,
    status: 1,
    group: 'default',
    quota: 0,
  },
] as unknown as User[]

const columns: ColumnDef<User>[] = [{ accessorKey: 'username', id: 'username' }]

function Harness(props: { selection: RowSelectionState }) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>(
    props.selection
  )
  const table = useReactTable({
    data: users,
    columns,
    state: { rowSelection },
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })
  return (
    <UsersProvider>
      <DataTableBulkActions table={table} />
    </UsersProvider>
  )
}

function renderWithSelection(selection: RowSelectionState) {
  return render(<Harness selection={selection} />)
}

describe('user bulk actions', () => {
  it('bans every selected non-root user and keeps the root account untouched', async () => {
    manageUser.mockResolvedValue({ success: true })
    renderWithSelection({ '11': true, '13': true })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Ban selected users' }))
    expect(
      screen.getByRole('heading', { name: 'Ban 1 users?' })
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ban 1 users' }))

    await waitFor(() => expect(manageUser).toHaveBeenCalledWith(11, 'disable'))
    expect(manageUser).toHaveBeenCalledTimes(1)
    expect(deleteUser).not.toHaveBeenCalled()
  })

  it('enables only the selected users that are currently disabled', async () => {
    manageUser.mockResolvedValue({ success: true })
    renderWithSelection({ '11': true, '12': true })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Enable selected users' })
    )

    await waitFor(() => expect(manageUser).toHaveBeenCalledWith(12, 'enable'))
    expect(manageUser).toHaveBeenCalledTimes(1)
  })

  it('deletes selected users after confirmation and skips the root account', async () => {
    deleteUser.mockResolvedValue({ success: true })
    renderWithSelection({ '11': true, '12': true, '13': true })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Delete selected users' })
    )
    expect(
      screen.getByRole('heading', { name: 'Delete 2 users?' })
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete 2 users' }))

    await waitFor(() => expect(deleteUser).toHaveBeenCalledTimes(2))
    expect(deleteUser).toHaveBeenCalledWith(11)
    expect(deleteUser).toHaveBeenCalledWith(12)
    expect(manageUser).not.toHaveBeenCalled()
  })

  it('does not call the API when nothing selected can be changed', async () => {
    renderWithSelection({ '13': true })

    const user = userEvent.setup()
    await user.click(
      screen.getByRole('button', { name: 'Enable selected users' })
    )

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        'No selected user can be changed by this action'
      )
    )
    expect(manageUser).not.toHaveBeenCalled()
    expect(deleteUser).not.toHaveBeenCalled()
  })
})
