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
import { isRequestProbe, type ExpressionNode, type RequestProbe } from './types'

/**
 * How a request factor reads the request:
 * - `value`: one bounded value, e.g. `param("seconds")`
 * - `units`: an explicit list of unit values, one traced factor per value,
 *   e.g. `(param("seconds") == "8" ? 8 : 1)`. Requests outside the list are
 *   charged a single unit, which is why the list is the supported-duration
 *   whitelist rather than a pure optimisation.
 */
export type MultiplierMode = 'value' | 'units'

export type MultiplierSpec = {
  probe: RequestProbe
  key: string
  mode: MultiplierMode
  units: number[]
}

export function normalizeMultiplierSpec(value: {
  probe: string
  key: string
  mode?: MultiplierMode
  units?: number[]
}): MultiplierSpec | null {
  if (!isRequestProbe(value.probe)) return null
  const mode: MultiplierMode = value.mode === 'units' ? 'units' : 'value'
  const units =
    mode === 'units'
      ? (value.units ?? []).filter(
          (unit) => Number.isFinite(unit) && unit > 0
        )
      : []
  return { probe: value.probe, key: value.key, mode, units }
}

/** Renders the factor part of `(<tree>) * <factor>`; empty when incomplete. */
export function buildMultiplierText(spec: {
  probe: RequestProbe
  key: string
  mode: MultiplierMode
  units: number[]
}): string {
  const key = spec.key.trim()
  if (!key) return ''
  const probe = `${spec.probe}(${JSON.stringify(key)})`
  // A zero or negative unit would make that value free, so unusable units are
  // dropped here as well as on parse. An empty list degrades to the bounded
  // value factor instead of charging nothing.
  const units = spec.units.filter(
    (unit) => Number.isFinite(unit) && unit > 0
  )
  if (spec.mode !== 'units' || units.length === 0) return probe
  return units
    .map((unit) => `(${probe} == ${JSON.stringify(String(unit))} ? ${unit} : 1)`)
    .join(' * ')
}

function readRequestCall(
  node: ExpressionNode
): { probe: RequestProbe; key: string } | null {
  if (node.kind !== 'call' || !isRequestProbe(node.name)) return null
  const argument = node.args[0]
  if (
    node.args.length !== 1 ||
    argument?.kind !== 'literal' ||
    typeof argument.value !== 'string'
  ) {
    return null
  }
  return { probe: node.name, key: argument.value }
}

type UnitFactor = { probe: RequestProbe; key: string; unit: number }

/** `(probe("key") == "8" ? 8 : 1)` — one enumerated unit factor. */
function readUnitFactor(node: ExpressionNode): UnitFactor | null {
  if (node.kind !== 'conditional') return null
  if (node.no.kind !== 'literal' || node.no.value !== 1) return null
  if (
    node.yes.kind !== 'literal' ||
    typeof node.yes.value !== 'number' ||
    node.yes.value <= 0
  ) {
    return null
  }
  const condition = node.condition
  if (condition.kind !== 'binary' || condition.operator !== '==') return null
  const probe = readRequestCall(condition.left)
  if (!probe) return null
  const compared = condition.right
  if (compared.kind !== 'literal' || typeof compared.value !== 'string') {
    return null
  }
  // The factor must equal the compared unit, which is what makes the list a
  // per-unit price rather than an arbitrary multiplier.
  if (Number(compared.value) !== node.yes.value) return null
  return { ...probe, unit: node.yes.value }
}

/**
 * Splits `<tree> * <factor>` into the tree and its request factor. Returns null
 * when the multiplication is not a whole-tree factor, so callers keep falling
 * back to raw text instead of rewriting an ambiguous expression such as
 * `a ? b : c * param("n")`, where the factor only scales one branch.
 */
export function readFactorChain(
  node: ExpressionNode
): { tree: ExpressionNode; spec: MultiplierSpec } | null {
  if (node.kind !== 'binary' || node.operator !== '*') return null

  const units: UnitFactor[] = []
  let tree: ExpressionNode = node
  while (tree.kind === 'binary' && tree.operator === '*') {
    const factor = readUnitFactor(tree.right)
    if (!factor) break
    units.unshift(factor)
    tree = tree.left
  }
  if (units.length > 0) {
    const { probe, key } = units[0]
    if (units.some((unit) => unit.probe !== probe || unit.key !== key)) {
      return null
    }
    return {
      tree,
      spec: {
        probe,
        key,
        mode: 'units',
        units: units.map((unit) => unit.unit),
      },
    }
  }

  const right = readRequestCall(node.right)
  if (right) return { tree: node.left, spec: { ...right, mode: 'value', units: [] } }
  const left = readRequestCall(node.left)
  if (left) return { tree: node.right, spec: { ...left, mode: 'value', units: [] } }
  return null
}
