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
import { flattenBinary } from './billing-expression/display'
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
  ExpressionNode,
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
  /** Spelling to regenerate for a request price; fixed and per_call are equal. */
  request_price_callee?: 'fixed' | 'per_call'
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
  if (tier.billing_unit === 'request') {
    // Preserve the spelling the administrator stored: the round-trip check
    // compares against the original source, and fixed/per_call are equivalent.
    const callee = tier.request_price_callee === 'per_call' ? 'per_call' : 'fixed'
    return `${callee}(${tier.fixed_price ?? ''})`
  }
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
    // Request-priced tiers: the editor writes fixed(...) while price lists and
    // imported expressions often spell it per_call(...). Both are the same leaf.
    const requestBodyPat = `(?:fixed|per_call)\\(\\s*([\\d.eE+-]+)\\s*\\)`

    const finish = (tiers: VisualTier[]): VisualConfig | null => {
      if (tiers.length === 0) return null
      const cfg = normalizeVisualConfig({
        tiers,
        ...(multiplier ? { multiplier } : {}),
      })
      // The parse must reproduce the stored expression; otherwise the caller
      // keeps the richer document editor. Nested chains may or may not
      // parenthesise each branch, so equivalence is checked on the normalised
      // form rather than the literal text.
      if (!expressionsEquivalent(generateExprFromVisualConfig(cfg), fullBody)) {
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
          request_price_callee: requestSimple[0].includes('per_call') ? 'per_call' : 'fixed',
          fixed_price: requestSimple[2],
        }),
      ])
    }

    // Walk the tier chain through the AST instead of a global regex: a chained
    // ternary (`c1 ? t1 : c2 ? t2 : t3`) nests arbitrarily deep, and the source
    // may or may not parenthesise each branch. Regex matching mis-attributed the
    // conditions of the third tier and rejected 3+ tier expressions.
    const tiers =
      compiled.status === 'ready'
        ? readTierChainFromAst(chain ? chain.tree : compiled.ast, exprStr)
        : null
    if (!tiers) return null
    return finish(tiers)
  } catch {
    return null
  }
}

/**
 * Whether two expressions differ only in whitespace and redundant parentheses.
 * Recompiling both and stripping whitespace is enough here: the parser already
 * rejects anything unsafe, and the caller only needs "did we read this
 * faithfully?", not a byte-identical echo.
 */
function expressionsEquivalent(left: string, right: string): boolean {
  const normalize = (value: string): string | null => {
    const compiled = compileBillingExpression(value)
    if (compiled.status !== 'ready') return null
    return sourceShape(compiled.ast)
  }
  const a = normalize(left)
  const b = normalize(right)
  return a !== null && a === b
}

/** Structural shape with parentheses removed, for equivalence comparison. */
function sourceShape(node: ExpressionNode): string {
  switch (node.kind) {
    case 'literal':
      return `lit(${String(node.value)})`
    case 'variable':
      return `var(${node.name})`
    case 'call':
      return `call(${node.name},${node.args.map(sourceShape).join(',')})`
    case 'unary':
      return `un(${node.operator},${sourceShape(node.operand)})`
    case 'binary':
      return `bin(${node.operator},${sourceShape(node.left)},${sourceShape(node.right)})`
    case 'conditional':
      return `cond(${sourceShape(node.condition)},${sourceShape(node.yes)},${sourceShape(node.no)})`
    default:
      return 'unknown'
  }
}

type ChainTier = { node: ExpressionNode; conditions: TierConditionInput[] }

/**
 * Reads the canonical tier chain `cond1 ? tier1 : cond2 ? tier2 : ... : tierN`
 * from the AST. Returns null for any other shape so the caller keeps the raw
 * expression rather than inventing prices.
 */
function readTierChainFromAst(
  node: ExpressionNode,
  source: string
): VisualTier[] | null {
  const chain: ChainTier[] = []
  let remaining = node
  while (remaining.kind === 'conditional') {
    const conditions = readChainConditions(remaining.condition, source)
    if (!conditions) return null
    chain.push({ node: remaining.yes, conditions })
    // `a ? b : (c ? d : e)` and `a ? b : c ? d : e` parse identically in the AST.
    remaining = remaining.no
  }
  chain.push({ node: remaining, conditions: [] })

  const tiers: VisualTier[] = []
  for (const entry of chain) {
    const tier = tierFromCallNode(entry.node, entry.conditions, source)
    if (!tier) return null
    tiers.push(tier)
  }
  return tiers
}

function readChainConditions(
  node: ExpressionNode,
  source: string
): TierConditionInput[] | null {
  const conditions: TierConditionInput[] = []
  for (const part of flattenBinary(node, '&&')) {
    const text = source.slice(part.start, part.end).trim()
    const condition = text ? parseTierCondition(text) : null
    if (!condition) return null
    conditions.push(condition)
  }
  return conditions.length > 0 ? conditions : null
}

/** Converts one `tier("label", ...)` call into the editor's tier shape. */
function tierFromCallNode(
  node: ExpressionNode,
  conditions: TierConditionInput[],
  source: string
): VisualTier | null {
  if (
    node.kind !== 'call' ||
    node.name !== 'tier' ||
    node.args[0]?.kind !== 'literal' ||
    typeof node.args[0].value !== 'string'
  ) {
    return null
  }
  const label = node.args[0].value
  const body = node.args[1]
  if (
    body.kind === 'call' &&
    isRequestPriceCallee(body.name) &&
    body.args[0]?.kind === 'literal' &&
    typeof body.args[0].value === 'number'
  ) {
    // Keep the literal exactly as written: the round-trip check compares against
    // the stored source, so 0.10 must not collapse to 0.1.
    return normalizeVisualTier({
      conditions,
      label,
      billing_unit: 'request',
      request_price_callee: body.name === 'per_call' ? 'per_call' : 'fixed',
      fixed_price: source.slice(body.args[0].start, body.args[0].end),
    })
  }
  if (body.kind !== 'binary' && body.kind !== 'call') return null
  const prices = new Map<string, number>()
  for (const term of flattenBinary(body, '+')) {
    if (
      term.kind !== 'binary' ||
      term.operator !== '*' ||
      term.left.kind !== 'variable' ||
      term.right.kind !== 'literal' ||
      typeof term.right.value !== 'number'
    ) {
      return null
    }
    if (Number.isNaN(term.right.value)) return null
    prices.set(term.left.name, term.right.value)
  }
  if (!prices.has('p') || !prices.has('c')) return null
  const tier: Record<string, unknown> = {
    conditions,
    label,
    input_unit_cost: prices.get('p'),
    output_unit_cost: prices.get('c'),
  }
  for (const cv of BILLING_CACHE_VAR_MAP) {
    if (prices.has(cv.exprVar)) tier[cv.field] = prices.get(cv.exprVar)
  }
  return normalizeVisualTier(tier as Partial<VisualTier>)
}

function isRequestPriceCallee(name: string): boolean {
  return name === 'fixed' || name === 'per_call'
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
