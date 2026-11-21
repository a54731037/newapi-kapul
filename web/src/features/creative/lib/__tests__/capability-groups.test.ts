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

import type { ApiKey } from '@/features/keys/types'
import type { PricingModel } from '@/features/pricing/types'

import {
  groupsForCapability,
  modelsForToken,
  tokensForCapability,
} from '../capability-groups'

function token(overrides: Partial<ApiKey>): ApiKey {
  return {
    id: 1,
    name: 'key',
    key: 'sk-***',
    status: 1,
    remain_quota: 0,
    used_quota: 0,
    unlimited_quota: true,
    expired_time: -1,
    created_time: 0,
    accessed_time: 0,
    group: 'default',
    auto_groups: null,
    cross_group_retry: false,
    model_limits_enabled: false,
    model_limits: '',
    allow_ips: '',
    ...overrides,
  }
}

function model(overrides: Partial<PricingModel>): PricingModel {
  return {
    id: 1,
    model_name: 'model',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    ...overrides,
  }
}

const models: PricingModel[] = [
  model({
    id: 1,
    model_name: 'sora-2',
    enable_groups: ['video'],
    supported_endpoint_types: ['openai-video'],
  }),
  model({
    id: 2,
    model_name: 'veo-3',
    enable_groups: ['video', 'default'],
    supported_endpoint_types: ['openai-video'],
  }),
  model({
    id: 3,
    model_name: 'gpt-image-1',
    enable_groups: ['image'],
    supported_endpoint_types: ['image-generation'],
  }),
  model({
    id: 4,
    model_name: 'gpt-4o',
    enable_groups: ['default'],
    supported_endpoint_types: ['openai'],
  }),
]

describe('creative capability groups', () => {
  it('lists every group that exposes a capable model, sorted', () => {
    expect(groupsForCapability(models, 'video')).toEqual(['default', 'video'])
    expect(groupsForCapability(models, 'image')).toEqual(['image'])
  })

  it('keeps only enabled keys whose group can drive the capability', () => {
    const keys = [
      token({ id: 1, group: 'video' }),
      token({ id: 2, group: 'default' }),
      token({ id: 3, group: 'image' }),
      token({ id: 4, group: 'auto' }),
      token({ id: 5, group: 'video', status: 2 }),
    ]

    expect(tokensForCapability(keys, models, 'video').map((k) => k.id)).toEqual(
      [1, 2, 4]
    )
    expect(tokensForCapability(keys, models, 'image').map((k) => k.id)).toEqual(
      [3, 4]
    )
  })

  it('drops every key when no group exposes the capability', () => {
    const keys = [token({ id: 1, group: 'default' })]
    expect(tokensForCapability(keys, [], 'video')).toEqual([])
  })

  it('narrows the model list to the group of the selected key', () => {
    expect(
      modelsForToken(models, 'video', token({ group: 'default' })).map(
        (item) => item.model_name
      )
    ).toEqual(['veo-3'])
    expect(
      modelsForToken(models, 'video', token({ group: 'auto' })).map(
        (item) => item.model_name
      )
    ).toEqual(['sora-2', 'veo-3'])
  })
})
