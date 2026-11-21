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
import { describe, expect, it } from 'vitest'

import { channelSchema } from '../../types'
import {
  buildSettingJSON,
  transformChannelToFormDefaults,
} from '../channel-form'

function channelWithSetting(setting: string) {
  return channelSchema.parse({
    id: 1,
    type: 1,
    key: 'sk-test',
    status: 1,
    name: 'image channel',
    created_time: 0,
    test_time: 0,
    response_time: 0,
    balance_updated_time: 0,
    models: 'gpt-image-2.5',
    group: 'default',
    setting,
  })
}

describe('channel capability settings', () => {
  it('reads declared capabilities into the form switches', () => {
    const values = transformChannelToFormDefaults(
      channelWithSetting(JSON.stringify({ capabilities: ['image'] }))
    )
    expect(values.capability_image).toBe(true)
    expect(values.capability_video).toBe(false)
  })

  it('writes the enabled capabilities back to the setting JSON', () => {
    const values = {
      ...transformChannelToFormDefaults(
        channelWithSetting(JSON.stringify({ capabilities: ['image'] }))
      ),
      capability_video: true,
    }
    const setting = JSON.parse(buildSettingJSON(values)) as {
      capabilities?: string[]
    }
    expect(setting.capabilities).toEqual(['image', 'video'])
  })

  it('omits capabilities entirely when no switch is on', () => {
    const setting = JSON.parse(
      buildSettingJSON(transformChannelToFormDefaults(channelWithSetting('')))
    ) as { capabilities?: string[] }
    expect(setting.capabilities).toEqual([])
  })
})
