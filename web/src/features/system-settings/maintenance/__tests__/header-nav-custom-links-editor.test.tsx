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
import { fireEvent, render, screen, within } from '@testing-library/react'
import i18next from 'i18next'
import { useState } from 'react'
import { beforeAll, describe, expect, test } from 'vitest'

import {
  hasInvalidHeaderNavCustomLink,
  type HeaderNavCustomLink,
} from '@/lib/nav-custom-links'

import { HeaderNavCustomLinksEditor } from '../header-nav-custom-links-editor'

beforeAll(() => {
  i18next.addResourceBundle('en', 'translation', {
    'Custom tabs': 'Custom tabs',
    'Add tab': 'Add tab',
    'No custom tabs configured': 'No custom tabs configured',
    'Custom tab name': 'Custom tab name',
    'Custom tab link': 'Custom tab link',
    Name: 'Name',
    Link: 'Link',
    Actions: 'Actions',
    Delete: 'Delete',
    Documentation: 'Documentation',
    'Name is required': 'Name is required',
    'Link is required': 'Link is required',
    'Internal link cannot start with //': 'Internal link cannot start with //',
    'Link must start with / or use http(s)':
      'Link must start with / or use http(s)',
  })
})

function EditorFixture(props: { initial: HeaderNavCustomLink[] }) {
  const [links, setLinks] = useState(props.initial)
  return (
    <>
      <HeaderNavCustomLinksEditor links={links} onChange={setLinks} />
      <output data-testid='serialized'>{JSON.stringify(links)}</output>
      <output data-testid='invalid'>
        {String(hasInvalidHeaderNavCustomLink(links))}
      </output>
    </>
  )
}

describe('header nav custom links editor', () => {
  test('shows an empty state and adds a row on demand', () => {
    render(<EditorFixture initial={[]} />)

    expect(screen.getByText('No custom tabs configured')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add tab' }))

    expect(
      screen.queryByText('No custom tabs configured')
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Custom tab name')).toHaveValue('')
    expect(screen.getByLabelText('Custom tab link')).toHaveValue('')
  })

  test('edits an existing row and reports the values upward', () => {
    render(<EditorFixture initial={[{ name: 'Docs', url: '/docs' }]} />)

    fireEvent.change(screen.getByLabelText('Custom tab name'), {
      target: { value: 'Handbook' },
    })
    fireEvent.change(screen.getByLabelText('Custom tab link'), {
      target: { value: 'https://handbook.example.com' },
    })

    expect(screen.getByTestId('serialized')).toHaveTextContent(
      '[{"name":"Handbook","url":"https://handbook.example.com"}]'
    )
  })

  test('marks an unsafe link invalid instead of silently accepting it', () => {
    render(
      <EditorFixture initial={[{ name: 'Docs', url: '//evil.example.com' }]} />
    )

    const linkInput = screen.getByLabelText('Custom tab link')
    expect(linkInput).toHaveAttribute('aria-invalid', 'true')
    expect(
      screen.getByText('Internal link cannot start with //')
    ).toBeInTheDocument()
    expect(screen.getByTestId('invalid')).toHaveTextContent('true')
  })

  test('clears the invalid state once the link becomes an in-site path', () => {
    render(<EditorFixture initial={[{ name: 'Docs', url: 'docs' }]} />)

    expect(screen.getByTestId('invalid')).toHaveTextContent('true')

    fireEvent.change(screen.getByLabelText('Custom tab link'), {
      target: { value: '/docs' },
    })

    expect(screen.getByLabelText('Custom tab link')).toHaveAttribute(
      'aria-invalid',
      'false'
    )
    expect(screen.getByTestId('invalid')).toHaveTextContent('false')
  })

  test('removes only the targeted row', () => {
    render(
      <EditorFixture
        initial={[
          { name: 'First', url: '/first' },
          { name: 'Second', url: '/second' },
        ]}
      />
    )

    const rows = screen.getAllByRole('row')
    // Header row plus the two data rows.
    fireEvent.click(within(rows[1]).getByRole('button', { name: 'Delete' }))

    expect(screen.getByTestId('serialized')).toHaveTextContent(
      '[{"name":"Second","url":"/second"}]'
    )
  })

  test('disables Add tab at the configured maximum', () => {
    const atLimit = Array.from({ length: 20 }, (_, i) => ({
      name: `tab-${i}`,
      url: `/path-${i}`,
    }))
    render(<EditorFixture initial={atLimit} />)

    expect(screen.getByRole('button', { name: 'Add tab' })).toBeDisabled()
  })
})
