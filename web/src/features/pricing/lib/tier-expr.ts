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
import { BILLING_CACHE_VAR_MAP } from './billing-expr'
import {
  buildMultiplierText,
  normalizeMultiplierSpec,
  readFactorChain,
  type MultiplierSpec,
} from './billing-expression/multiplier'
import { compileBillingExpression } from './billing-expression/parser'
import { evaluateBillingExpression } from './billing-expression/runtime'
import type {
  BillingSimulationContext,
  TokenVariable,
} from './billing-expression/types'

export const CACHE_MODE_TIMED = 'timed'
export const CACHE_MODE_GENERIC = 'generic'
export type CacheMode = typeof CACHE_MODE_TIMED | typeof CACHE_MODE_GENERIC

/** Request probes usable in a flat tier condition, alongside p/c/len. */
export const TIER_REQUEST_CONDITION_VARS = ['param', 'header', 'u'] as const
export type TierRequestConditionVar = (typeof TIER_REQUEST_CONDITION_VARS)[number]
export type TierConditionVar = 'p' | 'c' | 'len' | TierRequestConditionVar
export type TierConditionOp = '<' | '<=' | '>' | '>=' | '==' | '!='
/** How the compared value is written: 2, "text", or nil. */
export type TierConditionValueKind = 'number' | 'string' | 'nil'

export function isTierRequestConditionVar(
  value: string
): value is TierRequestConditionVar {
  return (TIER_REQUEST_CONDITION_VARS as readonly string[]).includes(value)
}

export type TierConditionInput = {
  var: TierConditionVar
  op: TierConditionOp
  value: number | string
  /** Request path, header name or usage key for param/header/u conditions. */
  key?: string
  /** Missing means "number", so existing conditions keep their meaning. */
  valueKind?: TierConditionValueKind
}

/** A condition contributes to the expression only when it is complete. */
function isTierConditionComplete(condition: TierConditionInput): boolean {
  if (isTierRequestConditionVar(condition.var)) {
    if (!(condition.key ?? '').trim()) return false
    const valueKind = condition.valueKind ?? 'number'
    if (valueKind === 'nil') return true
    // An explicitly empty text value is meaningful (`== ""`).
    if (valueKind === 'string') return true
    return condition.value != null && condition.value !== ''
  }
  return condition.value != null && condition.value !== ''
}

function buildTierConditionExpr(condition: TierConditionInput): string {
  if (!isTierRequestConditionVar(condition.var)) {
    return `${condition.var} ${condition.op} ${condition.value}`
  }
  const probe = `${condition.var}(${JSON.stringify((condition.key ?? '').trim())})`
  const valueKind = condition.valueKind ?? 'number'
  if (valueKind === 'nil') return `${probe} ${condition.op} nil`
  if (valueKind === 'string') {
    return `${probe} ${condition.op} ${JSON.stringify(String(condition.value ?? ''))}`
  }
  return `${probe} ${condition.op} ${condition.value}`
}

export type VisualTier = {
  billing_unit?: 'token' | 'request'
  fixed_price?: string
  label: string
  conditions: TierConditionInput[]
  input_unit_cost: number
  output_unit_cost: number
  cache_mode: CacheMode
  cache_read_unit_cost?: number
  cache_create_unit_cost?: number
  cache_create_1h_unit_cost?: number
  image_unit_cost?: number
  image_output_unit_cost?: number
  audio_input_unit_cost?: number
  audio_output_unit_cost?: number
  [field: string]: unknown
}

/** A request factor scaling the whole price tree: (<tiers>) * param("n"). */
export type TierMultiplier = MultiplierSpec

export type VisualConfig = {
  tiers: VisualTier[]
  multiplier?: TierMultiplier
}

export function getTierCacheMode(
  tier: Partial<VisualTier> | null | undefined
): CacheMode {
  if (tier?.cache_mode === CACHE_MODE_TIMED) return CACHE_MODE_TIMED
  if (tier?.cache_mode === CACHE_MODE_GENERIC) return CACHE_MODE_GENERIC
  return Number(tier?.cache_create_1h_unit_cost) > 0
    ? CACHE_MODE_TIMED
    : CACHE_MODE_GENERIC
}

export function normalizeVisualTier(
  tier: Partial<VisualTier> = {}
): VisualTier {
  return {
    label: tier.label ?? '',
    input_unit_cost: Number(tier.input_unit_cost) || 0,
    output_unit_cost: Number(tier.output_unit_cost) || 0,
    cache_mode: getTierCacheMode(tier),
    conditions: Array.isArray(tier.conditions) ? tier.conditions : [],
    ...tier,
    cache_read_unit_cost: Number(tier.cache_read_unit_cost) || 0,
    cache_create_unit_cost: Number(tier.cache_create_unit_cost) || 0,
    cache_create_1h_unit_cost: Number(tier.cache_create_1h_unit_cost) || 0,
    image_unit_cost: Number(tier.image_unit_cost) || 0,
    image_output_unit_cost: Number(tier.image_output_unit_cost) || 0,
    audio_input_unit_cost: Number(tier.audio_input_unit_cost) || 0,
    audio_output_unit_cost: Number(tier.audio_output_unit_cost) || 0,
  }
}

export function createDefaultVisualConfig(): VisualConfig {
  return {
    tiers: [
      normalizeVisualTier({
        conditions: [],
        input_unit_cost: 0,
        output_unit_cost: 0,
        label: 'base',
        cache_mode: CACHE_MODE_GENERIC,
      }),
    ],
  }
}

export function normalizeVisualConfig(
  config: VisualConfig | null | undefined
): VisualConfig {
  if (!config || !Array.isArray(config.tiers) || config.tiers.length === 0) {
    return createDefaultVisualConfig()
  }
  // Keep a half-typed multiplier (empty key or empty unit list) so the editor
  // can show the row the administrator just added; generation ignores an
  // incomplete one instead.
  const multiplier = config.multiplier
    ? normalizeMultiplierSpec(config.multiplier)
    : null
  return {
    ...config,
    tiers: config.tiers.map((tier) => normalizeVisualTier(tier)),
    multiplier: multiplier ?? undefined,
  }
}

function buildConditionStr(conditions: TierConditionInput[]): string {
  if (!conditions || conditions.length === 0) return ''
  return conditions
    .filter(isTierConditionComplete)
    .map(buildTierConditionExpr)
    .join(' && ')
}

function buildTierBodyExpr(tier: VisualTier): string {
  if (tier.billing_unit === 'request') return `fixed(${tier.fixed_price ?? ''})`
  const parts: string[] = []
  const ic = Number(tier.input_unit_cost) || 0
  const oc = Number(tier.output_unit_cost) || 0
  parts.push(`p * ${ic}`)
  parts.push(`c * ${oc}`)
  for (const cv of BILLING_CACHE_VAR_MAP) {
    const v = Number((tier as Record<string, unknown>)[cv.field]) || 0
    if (v !== 0) parts.push(`${cv.exprVar} * ${v}`)
  }
  return parts.join(' + ')
}

export function generateExprFromVisualConfig(
  config: VisualConfig | null | undefined
): string {
  const tree = generateTiersExpr(config)
  const multiplierText = config?.multiplier
    ? buildMultiplierText(config.multiplier)
    : ''
  if (!multiplierText) return tree
  // The parenthesis is required: `*` binds tighter than `?:`, so an unwrapped
  // factor would scale only the last branch.
  return `(${tree}) * ${multiplierText}`
}

function generateTiersExpr(
  config: VisualConfig | null | undefined
): string {
  if (!config || !config.tiers || config.tiers.length === 0) {
    return 'p * 0 + c * 0'
  }
  const tiers = config.tiers

  if (tiers.length === 1) {
    const tier = tiers[0]
    const label = tier.label || 'default'
    const body = `tier("${label}", ${buildTierBodyExpr(tier)})`
    const cond = buildConditionStr(tier.conditions)
    if (cond) {
      // A conditional single tier still needs a fallback branch, and a request
      // price may not sit next to token charges in one expression: use a free
      // request leaf there instead of the free token leaf.
      const fallback =
        tier.billing_unit === 'request'
          ? `tier("no_match", fixed(0))`
          : 'p * 0 + c * 0'
      return `${cond} ? ${body} : ${fallback}`
    }
    return body
  }

  const parts: string[] = []
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]
    const label = tier.label || `tier_${i + 1}`
    const body = `tier("${label}", ${buildTierBodyExpr(tier)})`
    const cond = buildConditionStr(tier.conditions)

    if (i < tiers.length - 1 && cond) {
      parts.push(`${cond} ? ${body}`)
    } else {
      parts.push(body)
    }
  }
  return parts.join(' : ')
}

/** Parses one flat tier condition; unknown shapes return null. */
function parseTierCondition(text: string): TierConditionInput | null {
  const numeric = text.match(/^(p|c|len)\s*(<|<=|>|>=)\s*([\d.eE+]+)$/)
  if (numeric) {
    return {
      var: numeric[1] as TierConditionInput['var'],
      op: numeric[2] as TierConditionOp,
      value: Number(numeric[3]),
    }
  }
  const request = text.match(
    /^(param|header|u)\("([^"]*)"\)\s*(==|!=|<|<=|>|>=)\s*(nil|"[^"]*"|[\d.eE+-]+)$/
  )
  if (!request) return null
  const [, name, key, op, raw] = request
  const base = {
    var: name as TierRequestConditionVar,
    key,
    op: op as TierConditionOp,
  }
  if (raw === 'nil') {
    if (op !== '==' && op !== '!=') return null
    return { ...base, value: '', valueKind: 'nil' }
  }
  if (raw.startsWith('"')) {
    if (op !== '==' && op !== '!=') return null
    return { ...base, value: raw.slice(1, -1), valueKind: 'string' }
  }
  return { ...base, value: Number(raw), valueKind: 'number' }
}

export function tryParseVisualConfig(
  exprStr: string | null | undefined
): VisualConfig | null {
  if (!exprStr) return null
  try {
    let body = exprStr
    const versionMatch = body.match(/^v\d+:([\s\S]*)$/)
    if (versionMatch) body = versionMatch[1]
    const fullBody = body
    // A whole-tree request factor is stored as `(<tiers>) * <factor>`, where the
    // factor is either one bounded value or an enumerated unit list. Anything
    // else stays with the document editor, which round-trips it losslessly.
    let multiplier: TierMultiplier | undefined
    const compiled = compileBillingExpression(exprStr)
    const chain =
      compiled.status === 'ready' ? readFactorChain(compiled.ast) : null
    if (chain) {
      multiplier = chain.spec
      body = exprStr.slice(chain.tree.start, chain.tree.end)
    }
    const cacheVarNames = BILLING_CACHE_VAR_MAP.map((cv) => cv.exprVar)
    const optCacheStr = cacheVarNames
      .map((v) => `(?:\\s*\\+\\s*${v}\\s*\\*\\s*([\\d.eE+-]+))?`)
      .join('')

    const bodyPat = `p\\s*\\*\\s*([\\d.eE+-]+)\\s*\\+\\s*c\\s*\\*\\s*([\\d.eE+-]+)${optCacheStr}`
    const requestBodyPat = `fixed\\(\\s*([\\d.eE+-]+)\\s*\\)`

    const finish = (tiers: VisualTier[]): VisualConfig | null => {
      if (tiers.length === 0) return null
      const cfg = normalizeVisualConfig({
        tiers,
        ...(multiplier ? { multiplier } : {}),
      })
      // The parse must reproduce the stored expression byte for byte (ignoring
      // whitespace); otherwise the caller keeps the richer document editor.
      const regenerated = generateExprFromVisualConfig(cfg)
      if (
        regenerated.replaceAll(/\s+/g, '') !== fullBody.replaceAll(/\s+/g, '')
      ) {
        return null
      }
      return cfg
    }
    // A single unconditional tier keeps the historical leniency: readers such as
    // the upstream sync preview show parsed prices while storing the source text
    // unchanged, so an explicit `+ cr * 0` must not disqualify the parse.
    const finishSingleTier = (tiers: VisualTier[]): VisualConfig | null =>
      tiers.length === 0
        ? null
        : normalizeVisualConfig({
            tiers,
            ...(multiplier ? { multiplier } : {}),
          })

    const singleRe = new RegExp(`^tier\\("([^"]*)",\\s*${bodyPat}\\)$`)
    const simple = body.match(singleRe)
    if (simple) {
      const tier: Record<string, unknown> = {
        conditions: [],
        input_unit_cost: Number(simple[2]),
        output_unit_cost: Number(simple[3]),
        label: simple[1],
      }
      BILLING_CACHE_VAR_MAP.forEach((cv, i) => {
        const val = simple[4 + i]
        if (val != null) tier[cv.field] = Number(val)
      })
      return finishSingleTier([normalizeVisualTier(tier as Partial<VisualTier>)])
    }

    // A request-priced tier (`fixed(...)`) has no token coefficients. Only the
    // exact spelling this module generates is accepted, so `per_call(...)`
    // expressions keep falling back to the richer document editor.
    const requestSingleRe = new RegExp(
      `^tier\\("([^"]*)",\\s*${requestBodyPat}\\)$`
    )
    const requestSimple = body.match(requestSingleRe)
    if (requestSimple) {
      return finishSingleTier([
        normalizeVisualTier({
          conditions: [],
          label: requestSimple[1],
          billing_unit: 'request',
          fixed_price: requestSimple[2],
        }),
      ])
    }

    const numberCondition = `(?:p|c|len)\\s*(?:<|<=|>|>=)\\s*[\\d.eE+]+`
    const requestCondition =
      `(?:param|header|u)\\("(?:[^"]*)"\\)\\s*(?:==|!=|<|<=|>|>=)\\s*` +
      `(?:nil|"[^"]*"|[\\d.eE+-]+)`
    const anyCondition = `(?:${numberCondition}|${requestCondition})`
    const condGroup = `((?:${anyCondition})(?:\\s*&&\\s*${anyCondition})*)`
    const conditionsOf = (condStr: string): TierConditionInput[] => {
      if (!condStr) return []
      const conditions: TierConditionInput[] = []
      for (const cp of condStr.split(/\s*&&\s*/)) {
        const condition = parseTierCondition(cp.trim())
        if (condition) conditions.push(condition)
      }
      return conditions
    }

    const tokenTierRe = new RegExp(
      `(?:${condGroup}\\s*\\?\\s*)?tier\\("([^"]*)",\\s*${bodyPat}\\)`,
      'g'
    )
    const tokenTiers: VisualTier[] = []
    let match: RegExpExecArray | null
    while ((match = tokenTierRe.exec(body)) !== null) {
      const tier: Record<string, unknown> = {
        conditions: conditionsOf(match[1] || ''),
        input_unit_cost: Number(match[3]),
        output_unit_cost: Number(match[4]),
        label: match[2],
      }
      const m = match
      BILLING_CACHE_VAR_MAP.forEach((cv, i) => {
        const val = m[5 + i]
        if (val != null) tier[cv.field] = Number(val)
      })
      tokenTiers.push(normalizeVisualTier(tier as Partial<VisualTier>))
    }
    if (tokenTiers.length > 0) return finish(tokenTiers)

    const requestTierRe = new RegExp(
      `(?:${condGroup}\\s*\\?\\s*)?tier\\("([^"]*)",\\s*${requestBodyPat}\\)`,
      'g'
    )
    const requestTiers: VisualTier[] = []
    while ((match = requestTierRe.exec(body)) !== null) {
      requestTiers.push(
        normalizeVisualTier({
          conditions: conditionsOf(match[1] || ''),
          label: match[2],
          billing_unit: 'request',
          fixed_price: match[3],
        })
      )
    }
    return finish(requestTiers)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Local cost evaluator (for the estimator preview)
// ---------------------------------------------------------------------------

const ESTIMATOR_VARS = [
  { var: 'cr', stateKey: 'cacheReadTokens' },
  { var: 'cc', stateKey: 'cacheCreateTokens' },
  { var: 'cc1h', stateKey: 'cacheCreate1hTokens' },
  { var: 'img', stateKey: 'imageTokens' },
  { var: 'img_o', stateKey: 'imageOutputTokens' },
  { var: 'ai', stateKey: 'audioInputTokens' },
  { var: 'ao', stateKey: 'audioOutputTokens' },
] as const

export type ExtraTokenValues = Record<
  (typeof ESTIMATOR_VARS)[number]['stateKey'],
  number
>

export type EvalResult = {
  cost: number
  matchedTier: string
  error: string | null
  billingUnit?: 'token' | 'request'
}

export function evalExprLocally(
  exprStr: string,
  promptTokens: number,
  completionTokens: number,
  extraTokenValues: ExtraTokenValues,
  context?: BillingSimulationContext
): EvalResult {
  if (!exprStr.trim()) return { cost: 0, matchedTier: '', error: null }
  const result = evaluateBillingExpression(exprStr, {
    ...context,
    tokens: {
      ...buildEstimatorTokens(promptTokens, completionTokens, extraTokenValues),
      ...context?.tokens,
    },
  })
  if (result.status !== 'success') {
    return { cost: 0, matchedTier: '', error: result.diagnostic.detail }
  }
  return {
    cost: result.cost,
    matchedTier: result.matchedTier,
    error: null,
    ...(result.billingUnit === 'request'
      ? { billingUnit: result.billingUnit }
      : {}),
  }
}

export function buildEstimatorTokens(
  promptTokens: number,
  completionTokens: number,
  extraTokenValues: ExtraTokenValues
): Partial<Record<TokenVariable, number>> {
  return {
    p: promptTokens,
    c: completionTokens,
    len:
      promptTokens +
      extraTokenValues.cacheReadTokens +
      extraTokenValues.cacheCreateTokens +
      extraTokenValues.cacheCreate1hTokens,
    ...Object.fromEntries(
      ESTIMATOR_VARS.map((field) => [
        field.var,
        extraTokenValues[field.stateKey],
      ])
    ),
  }
}

export function exprUsesExtraVars(exprStr: string): boolean {
  if (!exprStr) return false
  const compiled = compileBillingExpression(exprStr)
  if (compiled.status !== 'ready') return false
  return ESTIMATOR_VARS.some((field) => compiled.variables.has(field.var))
}

export const ESTIMATOR_EXTRA_FIELDS = ESTIMATOR_VARS
