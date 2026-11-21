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
import type { ApiKey } from '@/features/keys/types'
import type { PricingModel } from '@/features/pricing/types'

/** Creative surfaces supported by the studio pages. */
export type CreativeCapability = 'video' | 'image'

/**
 * Pricing models advertise their relay endpoint family through
 * `supported_endpoint_types`. Video and image models carry the endpoint
 * names registered by the relay layer, which is what we group by:
 * a token can only drive a capability when its group exposes one of those
 * models.
 */
const CAPABILITY_ENDPOINT: Record<CreativeCapability, string> = {
  video: 'openai-video',
  image: 'image-generation',
}

/** Tokens bound to the `auto` group fall back to platform routing. */
const AUTO_GROUP = 'auto'

export function modelsForCapability(
  models: PricingModel[],
  capability: CreativeCapability
): PricingModel[] {
  const endpoint = CAPABILITY_ENDPOINT[capability]
  return models.filter((model) =>
    model.supported_endpoint_types?.includes(endpoint)
  )
}

/** Groups that expose at least one model for the capability, sorted for display. */
export function groupsForCapability(
  models: PricingModel[],
  capability: CreativeCapability
): string[] {
  const groups = new Set<string>()
  for (const model of modelsForCapability(models, capability)) {
    for (const group of model.enable_groups ?? []) {
      groups.add(group)
    }
  }
  return [...groups].sort((a, b) => a.localeCompare(b))
}

/**
 * A token is usable when it is enabled and either pinned to a capable group or
 * left on `auto` routing. A token pinned elsewhere would be rejected upstream,
 * so it is filtered out instead of surfacing as a confusing option.
 */
export function isTokenUsableForCapability(
  token: ApiKey,
  capableGroups: string[]
): boolean {
  if (token.status !== 1) return false
  if (capableGroups.length === 0) return false
  const group = token.group?.trim()
  if (!group || group === AUTO_GROUP) return true
  return capableGroups.includes(group)
}

export function tokensForCapability(
  tokens: ApiKey[],
  models: PricingModel[],
  capability: CreativeCapability
): ApiKey[] {
  const capableGroups = groupsForCapability(models, capability)
  return tokens.filter((token) =>
    isTokenUsableForCapability(token, capableGroups)
  )
}

/** Model names available to a token's group, falling back to every capable model. */
export function modelsForToken(
  models: PricingModel[],
  capability: CreativeCapability,
  token?: ApiKey | null
): PricingModel[] {
  const capable = modelsForCapability(models, capability)
  const group = token?.group?.trim()
  if (!group || group === AUTO_GROUP) return capable
  return capable.filter((model) => (model.enable_groups ?? []).includes(group))
}
