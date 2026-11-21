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
import { useCallback, useEffect, useReducer } from 'react'

import { clearPluginNodeTypes, registerPluginNodeType } from '../node-registry'
import { loadLocalPlugins } from './registry'
import type { LoadedPlugin } from './types'

type PluginState = {
  plugins: LoadedPlugin[]
  errors: string[]
  loading: boolean
}

const INITIAL: PluginState = { plugins: [], errors: [], loading: true }

type PluginAction =
  | { type: 'start' }
  | { type: 'loaded'; plugins: LoadedPlugin[]; errors: string[] }

function reducer(state: PluginState, action: PluginAction): PluginState {
  if (action.type === 'start') return { ...state, loading: true }
  return { plugins: action.plugins, errors: action.errors, loading: false }
}

/**
 * Loads the local plugin folder into the node registry. Failures are surfaced
 * in the toolbar popover instead of breaking the canvas.
 */
export function useCanvasPlugins() {
  const [state, dispatch] = useReducer(reducer, INITIAL)

  const reload = useCallback(async (showSpinner = true) => {
    if (showSpinner) dispatch({ type: 'start' })
    const result = await loadLocalPlugins()
    clearPluginNodeTypes()
    for (const plugin of result.plugins) {
      registerPluginNodeType({
        id: plugin.module.id,
        labelKey: plugin.module.label,
        defaults: {
          width: plugin.module.size?.width ?? 280,
          height: plugin.module.size?.height ?? 200,
          content: '',
          title: plugin.module.label,
        },
      })
    }
    dispatch({
      type: 'loaded',
      plugins: result.plugins,
      errors: result.errors,
    })
  }, [])

  useEffect(() => {
    // The first load already starts in the loading state.
    void reload(false)
  }, [reload])

  return { ...state, reload }
}
