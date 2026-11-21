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
import { Bot, Eraser, Loader2, RefreshCw, Send } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { ApiKey } from '@/features/keys/types'
import { getPricing } from '@/features/pricing/api'
import type { PricingModel } from '@/features/pricing/types'
import { requireServerSuccess } from '@/lib/server-error-message'

import { listOwnTokens, requestChatPlan } from '../../../creative/api'
import {
  AGENT_SYSTEM_PROMPT,
  applyPlan,
  parsePlan,
  planFromText,
  type AgentAction,
} from './plan'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  actions?: { id: string; label: string }[]
}

function describeActionLabel(action: AgentAction): string {
  if (action.type === 'add-node') {
    return `${action.type}: ${String(action.kind)}`
  }
  if (action.type === 'arrange') {
    return `${action.type}: ${action.layout}`
  }
  return action.type
}

function describeActions(actions: AgentAction[], messageId: string) {
  return actions.map((action, index) => ({
    id: `${messageId}-${action.type}-${index}`,
    label: describeActionLabel(action),
  }))
}

interface CanvasAgentPanelProps {
  /** Transcript is per board so switching boards keeps its own conversation. */
  projectId: string
  nodes: { id: string; title: string }[]
  ops: {
    addNode: Parameters<typeof applyPlan>[1]['addNode']
    connect: Parameters<typeof applyPlan>[1]['connect']
    arrange: Parameters<typeof applyPlan>[1]['arrange']
    clear: () => void
  }
}

const historyKey = (projectId: string) => `infinite-canvas-agent-${projectId}`

function loadMessages(projectId: string): ChatMessage[] {
  try {
    const raw = window.localStorage.getItem(historyKey(projectId))
    return raw ? (JSON.parse(raw) as ChatMessage[]) : []
  } catch {
    return []
  }
}

export function CanvasAgentPanel(props: CanvasAgentPanelProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    loadMessages(props.projectId)
  )
  const [trackedProject, setTrackedProject] = useState(props.projectId)

  // Switching boards swaps the transcript during render (the documented
  // "adjust state when a prop changes" pattern) instead of in an effect.
  if (trackedProject !== props.projectId) {
    setTrackedProject(props.projectId)
    setMessages(loadMessages(props.projectId))
  }

  useEffect(() => {
    try {
      window.localStorage.setItem(
        historyKey(props.projectId),
        JSON.stringify(messages)
      )
    } catch {
      // Best effort: a full quota must not break the panel.
    }
  }, [messages, props.projectId])
  const [tokenId, setTokenId] = useState('')
  const [model, setModel] = useState('')
  const [running, setRunning] = useState(false)

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

  const tokens = useMemo<ApiKey[]>(
    () => (tokensQuery.data ?? []).filter((token) => token.status === 1),
    [tokensQuery.data]
  )
  const chatModels = useMemo(
    () =>
      ((pricingQuery.data ?? []) as PricingModel[])
        .filter((item) => item.supported_endpoint_types?.includes('openai'))
        .map((item) => item.model_name),
    [pricingQuery.data]
  )

  const run = async (override?: string) => {
    const text = (override ?? input).trim()
    if (!text) return
    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text,
    }
    setMessages((previous) => [...previous, userMessage])
    setInput('')
    setRunning(true)

    try {
      let actions: AgentAction[] = []
      if (tokenId && model) {
        const { revealTokenKey } = await import('../../../creative/api')
        const key = await revealTokenKey(Number(tokenId))
        const raw = await requestChatPlan({
          key,
          model,
          system: `${AGENT_SYSTEM_PROMPT} Current nodes: ${JSON.stringify(
            props.nodes
          )}`,
          prompt: text,
        })
        actions = parsePlan(raw)
      }
      if (actions.length === 0) {
        actions = planFromText(text)
      }

      const applied = applyPlan(actions, props.ops)
      setMessages((previous) => [
        ...previous,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text:
            applied > 0
              ? t('Applied {{count}} canvas actions', { count: applied })
              : t('No canvas action matched that request'),
          actions: describeActions(actions, `a-${Date.now()}`),
        },
      ])
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('Agent request failed')
      toast.error(message)
      setMessages((previous) => [
        ...previous,
        { id: `e-${Date.now()}`, role: 'assistant', text: message },
      ])
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className='flex h-full min-h-0 flex-col gap-3'>
      <div className='grid grid-cols-2 gap-2'>
        <Select
          value={tokenId}
          onValueChange={(value) => setTokenId(value ?? '')}
        >
          <SelectTrigger aria-label={t('API key')}>
            <SelectValue placeholder={t('Optional key')} />
          </SelectTrigger>
          <SelectContent>
            {tokens.map((token) => (
              <SelectItem key={token.id} value={String(token.id)}>
                {token.name || `#${token.id}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={model} onValueChange={(value) => setModel(value ?? '')}>
          <SelectTrigger aria-label={t('Model')}>
            <SelectValue placeholder={t('Chat model')} />
          </SelectTrigger>
          <SelectContent>
            {chatModels.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className='border-border/70 bg-muted/20 min-h-[220px] flex-1 space-y-3 overflow-y-auto rounded-lg border p-3'>
        {messages.length === 0 ? (
          <div className='text-muted-foreground flex h-full flex-col items-center justify-center gap-2 text-center text-[12px]'>
            <span className='bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-full'>
              <Bot className='size-4' aria-hidden='true' />
            </span>
            {t(
              'Ask for nodes, an arrangement, or a clear. Without a chat key the panel uses built-in commands.'
            )}
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={
                message.role === 'user'
                  ? 'bg-primary/10 text-foreground ml-auto w-fit max-w-[90%] rounded-lg px-3 py-2 text-[12px]'
                  : 'bg-card border-border/70 w-fit max-w-[95%] rounded-lg border px-3 py-2 text-[12px]'
              }
            >
              <p className='leading-relaxed whitespace-pre-wrap'>
                {message.text}
              </p>
              {message.actions && message.actions.length > 0 ? (
                <ul className='text-muted-foreground mt-1.5 space-y-0.5 font-mono text-[10px]'>
                  {message.actions.map((action) => (
                    <li key={action.id}>{action.label}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className='flex items-center gap-2'>
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void run()
            }
          }}
          placeholder={t('Add 3 image nodes and arrange them')}
          aria-label={t('Agent instruction')}
        />
        <Button
          size='icon'
          onClick={() => void run()}
          disabled={running}
          aria-label={t('Run')}
        >
          {running ? (
            <Loader2 className='size-4 animate-spin' />
          ) : (
            <Send className='size-4' />
          )}
        </Button>
        <Button
          size='icon'
          variant='outline'
          disabled={running || messages.length === 0}
          aria-label={t('Retry last instruction')}
          onClick={() => {
            const lastUser = [...messages]
              .reverse()
              .find((message) => message.role === 'user')
            if (lastUser) void run(lastUser.text)
          }}
        >
          <RefreshCw className='size-4' />
        </Button>
        <Button
          size='icon'
          variant='ghost'
          disabled={messages.length === 0}
          aria-label={t('Clear conversation')}
          onClick={() => setMessages([])}
        >
          <Eraser className='size-4' />
        </Button>
      </div>
    </div>
  )
}
