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
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

import { getPricing } from '@/features/pricing/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listOwnTokens } from '../api'
import {
  groupsForCapability,
  modelsForCapability,
  tokensForCapability,
  type CreativeCapability,
} from '../lib/capability-groups'

/**
 * Loads the two datasets the studio pages need: the caller's API keys and the
 * pricing catalogue (which tells us which groups expose video/image models).
 */
export function useCreativeAssets(capability: CreativeCapability) {
  const tokensQuery = useQuery({
    queryKey: ['creative', 'tokens'],
    queryFn: listOwnTokens,
    staleTime: 30_000,
  })

  const pricingQuery = useQuery({
    queryKey: ['creative', 'pricing'],
    queryFn: async () => {
      const payload = requireServerSuccess(await getPricing())
      return payload.data ?? []
    },
    staleTime: 60_000,
  })

  const models = useMemo(() => pricingQuery.data ?? [], [pricingQuery.data])
  const tokens = useMemo(() => tokensQuery.data ?? [], [tokensQuery.data])

  const capabilityModels = useMemo(
    () => modelsForCapability(models, capability),
    [models, capability]
  )
  const capableGroups = useMemo(
    () => groupsForCapability(models, capability),
    [models, capability]
  )
  const usableTokens = useMemo(
    () => tokensForCapability(tokens, models, capability),
    [tokens, models, capability]
  )

  return {
    tokens: usableTokens,
    allTokens: tokens,
    models: capabilityModels,
    groups: capableGroups,
    isLoading: tokensQuery.isLoading || pricingQuery.isLoading,
    error: tokensQuery.error ?? pricingQuery.error,
  }
}
