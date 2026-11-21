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
import type { InfiniteNode, InfiniteNodeKind } from '../types'

/**
 * Canvas agent plan. A plan is a small, declarative list of board mutations so
 * the executor (not the model) stays in control of what can happen.
 */
export type AgentAction =
  | {
      type: 'add-node'
      kind: InfiniteNodeKind
      title?: string
      content?: string
    }
  | { type: 'connect'; from: string; to: string }
  | { type: 'arrange'; layout: 'grid' | 'row' }
  | { type: 'clear' }

export const AGENT_SYSTEM_PROMPT = [
  'You plan operations for a node canvas. Reply with JSON only, no prose, in the shape:',
  '{"actions":[{"type":"add-node","kind":"prompt|image|video|audio|sticky|markdown","title":"...","content":"..."}]}',
  'Supported actions: add-node, connect {from,to}, arrange {layout:"grid"|"row"}, clear.',
  'Keep plans under 8 actions and never invent node ids that were not provided.',
].join(' ')

const KIND_KEYWORDS: { kind: InfiniteNodeKind; words: string[] }[] = [
  { kind: 'image', words: ['image', '图片', '图像', '生图', '画一'] },
  { kind: 'video', words: ['video', '视频', '短片'] },
  { kind: 'audio', words: ['audio', '语音', '音频', '配音'] },
  { kind: 'sticky', words: ['sticky', '便签', 'note', '备注'] },
  { kind: 'markdown', words: ['markdown', '文档', 'md '] },
  { kind: 'prompt', words: ['prompt', '提示词', '文案'] },
]

function detectKind(text: string): InfiniteNodeKind {
  const lower = text.toLowerCase()
  return (
    KIND_KEYWORDS.find((entry) =>
      entry.words.some((word) => lower.includes(word))
    )?.kind ?? 'prompt'
  )
}

/**
 * Deterministic fallback planner used when the agent has no chat-capable key.
 * It understands the common canvas intents so the panel is still useful.
 */
export function planFromText(input: string): AgentAction[] {
  const text = input.trim()
  if (!text) return []
  const actions: AgentAction[] = []
  const lower = text.toLowerCase()

  if (/(clear|清空|重置)/.test(lower)) actions.push({ type: 'clear' })
  if (/(arrange|排布|排列|整理|对齐)/.test(lower)) {
    actions.push({
      type: 'arrange',
      layout: /(row|横|单行|一行)/.test(lower) ? 'row' : 'grid',
    })
  }
  const countMatch = text.match(/(\d+)\s*(个|nodes?|张|条)/)
  const count = Math.min(Math.max(countMatch ? Number(countMatch[1]) : 1, 1), 6)
  if (/(add|new|新建|添加|创建|加|生成)/.test(lower) || actions.length === 0) {
    const kind = detectKind(text)
    for (let index = 0; index < count; index += 1) {
      actions.push({
        type: 'add-node',
        kind,
        title: text.slice(0, 24) || undefined,
        content: kind === 'prompt' || kind === 'sticky' ? text : '',
      })
    }
  }
  return actions
}

type ParsedPlan = { actions?: unknown }

/** Tolerant JSON extraction: models sometimes wrap JSON in fences. */
export function parsePlan(raw: string): AgentAction[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced ? fenced[1] : raw).trim()
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1) return []
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1)) as ParsedPlan
    if (!Array.isArray(parsed.actions)) return []
    return parsed.actions.filter(isAgentAction)
  } catch {
    return []
  }
}

function isAgentAction(value: unknown): value is AgentAction {
  if (typeof value !== 'object' || value === null) return false
  const type = (value as { type?: unknown }).type
  return (
    type === 'add-node' ||
    type === 'connect' ||
    type === 'arrange' ||
    type === 'clear'
  )
}

/** Apply a plan on the board through the caller's operations. */
export function applyPlan(
  actions: AgentAction[],
  ops: {
    addNode: (
      kind: InfiniteNodeKind,
      content?: string,
      title?: string
    ) => InfiniteNode
    connect: (from: string, to: string) => void
    arrange: (layout: 'grid' | 'row') => void
    clear: () => void
  }
): number {
  let applied = 0
  for (const action of actions) {
    if (action.type === 'add-node') {
      ops.addNode(action.kind, action.content, action.title)
      applied += 1
    } else if (action.type === 'arrange') {
      ops.arrange(action.layout)
      applied += 1
    } else if (action.type === 'clear') {
      ops.clear()
      applied += 1
    }
  }
  return applied
}
