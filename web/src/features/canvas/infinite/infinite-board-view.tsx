import { useQuery } from '@tanstack/react-query'
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
import {
  AlignStartVertical,
  Bot,
  Bookmark,
  Plug,
  Puzzle,
  RefreshCw,
  ChevronDown,
  Download,
  Grid2x2,
  Images,
  LayoutGrid,
  Loader2,
  Maximize,
  Minus,
  MoreHorizontal,
  Plus,
  Redo2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Wand2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { ApiKey } from '@/features/keys/types'
import { getPricing } from '@/features/pricing/api'
import type { PricingModel } from '@/features/pricing/types'
import { useStatus } from '@/hooks/use-status'
import { requireServerSuccess } from '@/lib/server-error-message'

import {
  editImage,
  expandPrompt,
  fetchVideoContent,
  fetchVideoTask,
  listOwnTokens,
  revealTokenKey,
  generateImages,
  generateSpeech,
  submitVideo,
} from '../../creative/api'
import {
  CapabilityKeySelect,
  type CreativeKeySelection,
} from '../../creative/components/capability-key-select'
import { DurationPicker } from '../../creative/components/duration-picker'
import { SizePicker } from '../../creative/components/size-picker'
import { useCreativeAssets } from '../../creative/hooks/use-creative-assets'
import type { CreativeCapability } from '../../creative/lib/capability-groups'
import {
  resolveGenerationTargets,
  type GenerationTarget,
  type StudioAccessStatus,
} from '../../studio/lib/tab-access'
import { CanvasAgentPanel } from './agent/agent-panel'
import { downloadDataUrl, exportBoardPng } from './export-board'
import { InfiniteCanvasBoard } from './infinite-canvas-board'
import {
  alignNodes,
  bringToFront,
  cloneNodes,
  distributeNodes,
  sendToBack,
  type AlignMode,
} from './layout'
import { allNodeTypes, nodeTypeDefinition } from './node-registry'
import { usePluginBridge } from './plugins/bridge'
import { PluginMarketplaceDialog } from './plugins/marketplace-dialog'
import { getPluginEditor } from './plugins/registry'
import { useCanvasPlugins } from './plugins/use-canvas-plugins'
import type {
  CanvasPoint,
  CanvasViewport,
  InfiniteBoard,
  InfiniteNode,
  InfiniteNodeKind,
} from './types'
import { useBoardHistory } from './use-board-history'
import { exportProjectFile, useCanvasProjects } from './use-canvas-projects'
import { useBoardOperations } from './use-infinite-board'
import { usePromptLibrary } from './use-prompt-library'
import { fitViewport, screenToWorld, zoomAtPoint } from './viewport'

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
const VIDEO_SIZE_PRESETS = [
  { value: '1280x720', label: '16:9 · 1280×720' },
  { value: '720x1280', label: '9:16 · 720×1280' },
  { value: '1920x1080', label: '16:9 · 1920×1080' },
  { value: '1080x1920', label: '9:16 · 1080×1920' },
  { value: '1024x1024', label: '1:1 · 1024' },
]
const VIDEO_SECONDS = ['4', '5', '6', '8', '10', '12', '15', '20']
const IMAGE_SIZE_PRESETS = [
  { value: '512x512', label: '512 × 512' },
  { value: '1024x1024', label: '1024 × 1024' },
  { value: '1536x1024', label: '1536 × 1024' },
  { value: '1024x1536', label: '1024 × 1536' },
  { value: '2048x2048', label: '2048 × 2048' },
  { value: '2560x1440', label: '2560 × 1440' },
  { value: '1440x2560', label: '1440 × 2560' },
  { value: '4096x4096', label: '4096 × 4096' },
  { value: '3840x2160', label: '3840 × 2160' },
  { value: '2160x3840', label: '2160 × 3840' },
]
const IMAGE_COUNTS = ['1', '2', '4']
const AUDIO_FORMATS = ['mp3', 'opus', 'wav']
const AUDIO_SPEEDS = ['0.75', '1', '1.25', '1.5']
const GENERATION_TARGETS = [
  { kind: 'image', labelKey: 'Image output', actionKey: 'Generate image' },
  { kind: 'video', labelKey: 'Video output', actionKey: 'Generate video' },
  { kind: 'audio', labelKey: 'Audio output', actionKey: 'Generate speech' },
] as const

const PANEL_HINTS = {
  generate: 'Pick a node, describe it, and place the result on the board.',
  assets: 'Media generated on this board.',
  agent: 'Let the agent add nodes or rearrange the board.',
} as const

export function InfiniteBoardView() {
  const { t } = useTranslation()
  const { status } = useStatus()
  const projectsStore = useCanvasProjects()
  const projects = projectsStore.projects
  const activeProject = projectsStore.activeProject
  const board = projectsStore.activeBoard
  const updateBoard = projectsStore.updateBoard

  const history = useBoardHistory(activeProject.id, board, updateBoard)
  const ops = useBoardOperations(board, history.commit)

  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const taskKeys = useRef(new Map<string, string>())

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(null)
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 })
  const [panelTab, setPanelTab] = useState<'generate' | 'assets' | 'agent'>(
    'generate'
  )
  const [selection, setSelection] = useState<CreativeKeySelection | null>(null)
  const [imageModel, setImageModel] = useState('')
  const [videoModel, setVideoModel] = useState('')
  const [audioModel, setAudioModel] = useState('tts-1')
  const [voice, setVoice] = useState(VOICES[0])
  const [audioFormat, setAudioFormat] = useState(AUDIO_FORMATS[0])
  const [audioSpeed, setAudioSpeed] = useState('1')
  const [prompt, setPrompt] = useState('')
  const [imageSize, setImageSize] = useState('1024x1024')
  const [imageCount, setImageCount] = useState(IMAGE_COUNTS[0])
  const [videoSize, setVideoSize] = useState(VIDEO_SIZE_PRESETS[0].value)
  const [videoSeconds, setVideoSeconds] = useState(VIDEO_SECONDS[0])
  const [isBusy, setBusy] = useState(false)
  const [referenceId, setReferenceId] = useState('')
  const [projectQuery, setProjectQuery] = useState('')
  const [chatTokenId, setChatTokenId] = useState('')
  const [chatModel, setChatModel] = useState('')
  const clipboard = useRef<InfiniteNode[]>([])
  const [targetChoice, setTargetChoice] = useState<GenerationTarget>('image')
  const generationTargets = useMemo(
    () => resolveGenerationTargets(status as StudioAccessStatus | null),
    [status]
  )
  // Falling back keeps the panel on an enabled capability when a switch flips.
  const targetKind: GenerationTarget = generationTargets.includes(targetChoice)
    ? targetChoice
    : (generationTargets[0] ?? 'image')
  const promptLibrary = usePromptLibrary()
  const pluginState = useCanvasPlugins()
  const [editingNode, setEditingNode] = useState<InfiniteNode | null>(null)
  const [marketOpen, setMarketOpen] = useState(false)

  useEffect(() => {
    if (projectsStore.persistFailed) {
      toast.error(t('Canvas could not be saved in this browser'))
    }
  }, [projectsStore.persistFailed, t])

  const selectedNode = useMemo(
    () => board.nodes.find((node) => node.id === selectedIds[0]) ?? null,
    [board.nodes, selectedIds]
  )

  const capability: CreativeCapability =
    targetKind === 'video' ? 'video' : 'image'
  const creative = useCreativeAssets(capability)

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

  const chatTokens = useMemo<ApiKey[]>(
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

  const imageNodes = useMemo(
    () =>
      board.nodes.filter(
        (node) =>
          (node.kind === 'image' || node.kind === 'panorama') && node.content
      ),
    [board.nodes]
  )

  const handleExpandPrompt = useCallback(async () => {
    if (!chatTokenId || !chatModel) {
      toast.error(t('Pick a chat key and model to expand the prompt'))
      return
    }
    if (!prompt.trim()) {
      toast.error(t('Describe the image you want'))
      return
    }
    try {
      const key = await revealTokenKey(Number(chatTokenId))
      const expanded = await expandPrompt({
        key,
        model: chatModel,
        prompt: prompt.trim(),
      })
      if (!expanded) {
        toast.error(t('The model returned an empty prompt'))
        return
      }
      setPrompt(expanded)
      if (
        selectedNode &&
        (selectedNode.kind === 'prompt' || selectedNode.kind === 'sticky')
      ) {
        ops.updateNode(selectedNode.id, { content: expanded })
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t('Prompt expansion failed')
      )
    }
  }, [chatModel, chatTokenId, ops, prompt, selectedNode, t])

  const capabilityModels = useMemo(() => {
    const group = selection?.group?.trim()
    return creative.models
      .filter(
        (item) =>
          !group ||
          group === 'auto' ||
          (item.enable_groups ?? []).includes(group)
      )
      .map((item) => item.model_name)
  }, [creative.models, selection])

  const activeImageModel = imageModel || capabilityModels[0] || ''
  const activeVideoModel = videoModel || capabilityModels[0] || ''
  const assets = useMemo(
    () =>
      board.nodes.filter(
        (node) =>
          (node.kind === 'image' ||
            node.kind === 'video' ||
            node.kind === 'audio') &&
          node.content
      ),
    [board.nodes]
  )

  useEffect(() => {
    const element = surfaceRef.current
    if (!element) return
    const update = () =>
      setSurfaceSize({
        width: element.clientWidth,
        height: element.clientHeight,
      })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const fitToContent = useCallback(() => {
    const element = surfaceRef.current
    if (!element) return
    history.commit((previous) => ({
      ...previous,
      viewport: fitViewport(previous.nodes, element.getBoundingClientRect()),
    }))
  }, [history])

  const placeNode = useCallback(
    (kind: InfiniteNodeKind) => {
      const rect = surfaceRef.current?.getBoundingClientRect()
      const definition = nodeTypeDefinition(kind)
      const center = rect
        ? screenToWorld(board.viewport, {
            x: rect.width / 2,
            y: rect.height / 2,
          })
        : { x: 0, y: 0 }
      const rightEdge = board.nodes.reduce(
        (max, node) => Math.max(max, node.position.x + node.width),
        Number.NEGATIVE_INFINITY
      )
      const topEdge = board.nodes.length
        ? Math.min(...board.nodes.map((node) => node.position.y))
        : center.y - definition.defaults.height / 2
      const position = Number.isFinite(rightEdge)
        ? { x: rightEdge + 80, y: topEdge }
        : {
            x: center.x - definition.defaults.width / 2,
            y: center.y - definition.defaults.height / 2,
          }
      const node = ops.addNode(kind, position)
      setSelectedIds([node.id])
      setSelectedConnectionId(null)
      return node
    },
    [board.nodes, board.viewport, ops]
  )

  const arrange = useCallback(
    (layout: 'grid' | 'row') => {
      history.commit((previous) => {
        const spacing = 40
        const columnWidth = 320
        const columns =
          layout === 'row'
            ? Math.max(previous.nodes.length, 1)
            : Math.max(Math.ceil(Math.sqrt(previous.nodes.length)), 1)
        const rowHeights: number[] = []
        previous.nodes.forEach((node, index) => {
          const row = layout === 'row' ? 0 : Math.floor(index / columns)
          rowHeights[row] = Math.max(rowHeights[row] ?? 0, node.height)
        })
        return {
          ...previous,
          nodes: previous.nodes.map((node, index) => {
            const column = layout === 'row' ? index : index % columns
            const row = layout === 'row' ? 0 : Math.floor(index / columns)
            const offsetY = rowHeights
              .slice(0, row)
              .reduce((total, height) => total + height + spacing, 0)
            return {
              ...node,
              position: { x: column * (columnWidth + spacing), y: offsetY },
            }
          }),
        }
      })
    },
    [history]
  )

  const applyPositions = useCallback(
    (patches: { id: string; position: { x: number; y: number } }[]) => {
      if (patches.length === 0) return
      history.commit((previous) => ({
        ...previous,
        nodes: previous.nodes.map((node) => {
          const patch = patches.find((item) => item.id === node.id)
          return patch ? { ...node, position: patch.position } : node
        }),
      }))
    },
    [history]
  )

  const handleAlign = useCallback(
    (mode: AlignMode) =>
      applyPositions(alignNodes(board.nodes, selectedIds, mode)),
    [applyPositions, board.nodes, selectedIds]
  )

  const handleDistribute = useCallback(
    (axis: 'x' | 'y') =>
      applyPositions(distributeNodes(board.nodes, selectedIds, axis)),
    [applyPositions, board.nodes, selectedIds]
  )

  const handleLayer = useCallback(
    (direction: 'front' | 'back') => {
      if (selectedIds.length === 0) return
      history.commit((previous) => ({
        ...previous,
        nodes:
          direction === 'front'
            ? bringToFront(previous.nodes, selectedIds)
            : sendToBack(previous.nodes, selectedIds),
      }))
    },
    [history, selectedIds]
  )

  const toggleLock = useCallback(() => {
    if (selectedIds.length === 0) return
    const anyUnlocked = board.nodes.some(
      (node) => selectedIds.includes(node.id) && !node.locked
    )
    history.commit((previous) => ({
      ...previous,
      nodes: previous.nodes.map((node) =>
        selectedIds.includes(node.id) ? { ...node, locked: anyUnlocked } : node
      ),
    }))
  }, [board.nodes, history, selectedIds])

  const copySelection = useCallback(() => {
    clipboard.current = board.nodes.filter((node) =>
      selectedIds.includes(node.id)
    )
  }, [board.nodes, selectedIds])

  const pasteSelection = useCallback(() => {
    if (clipboard.current.length === 0) return
    const clones = clipboard.current.map((node, index) => ({
      ...node,
      id: `${node.id}-copy-${Date.now().toString(36)}-${index}`,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      status: 'idle' as const,
    }))
    history.commit((previous) => ({
      ...previous,
      nodes: [...previous.nodes, ...clones],
    }))
    clipboard.current = clones
    setSelectedIds(clones.map((node) => node.id))
  }, [history])

  const duplicateSelection = useCallback(() => {
    const copies = cloneNodes(board.nodes, selectedIds)
    if (copies.length === 0) return
    history.commit((previous) => ({
      ...previous,
      nodes: [...previous.nodes, ...copies],
    }))
    setSelectedIds(copies.map((node) => node.id))
  }, [board.nodes, history, selectedIds])

  const syncTargetKind = (node: InfiniteNode) => {
    if (node.kind === 'image') setTargetChoice('image')
    if (node.kind === 'video') setTargetChoice('video')
    if (node.kind === 'audio') setTargetChoice('audio')
  }

  const handleOpenNode = (node: InfiniteNode) => {
    setSelectedIds([node.id])
    setSelectedConnectionId(null)
    setPrompt(node.content)
    syncTargetKind(node)
    if (getPluginEditor(node.kind)) setEditingNode(node)
  }

  const handleSelect = (ids: string[]) => {
    setSelectedIds(ids)
    const next = board.nodes.find((node) => node.id === ids[0])
    if (next) {
      setPrompt(next.content)
      syncTargetKind(next)
    }
  }

  usePluginBridge({
    nodes: board.nodes,
    getKey: () => selection?.key ?? null,
    patchNode: (id, fields) => ops.updateNode(id, fields),
    addNode: (kind, content) => {
      const node = placeNode(kind)
      if (content) ops.updateNode(node.id, { content })
      return node
    },
    generateImage: async (args) => {
      const images = await generateImages({
        key: args.key,
        model: activeImageModel,
        prompt: args.prompt,
        size: args.size ?? imageSize,
        count: 1,
      })
      return images[0]
    },
    notify: (message, level) => {
      if (level === 'error') toast.error(message)
      else if (level === 'success') toast.success(message)
      else toast(message)
    },
  })

  let saveStateLabel = t('Autosaved')
  if (!projectsStore.hydrated) saveStateLabel = t('Loading…')
  else if (projectsStore.persistFailed) saveStateLabel = t('Not saved')

  const handleDeleteNode = (id: string) => {
    ops.removeNodes([id])
    setSelectedIds((previous) => previous.filter((item) => item !== id))
  }

  const handleGenerate = async () => {
    if (!selection) {
      toast.error(t('Select an API key first'))
      return
    }
    if (!prompt.trim()) {
      toast.error(t('Describe the image you want'))
      return
    }

    const kind: InfiniteNodeKind = targetKind
    let target = selectedNode
    if (!target || target.kind !== kind) {
      target = placeNode(kind)
    }

    setBusy(true)
    ops.updateNode(target.id, { status: 'loading', error: undefined })

    try {
      if (kind === 'image') {
        if (!activeImageModel) {
          throw new Error(t('Select an image model first'))
        }
        const reference = board.nodes.find(
          (node) => node.id === referenceId && node.content
        )
        if (reference) {
          const edited = await editImage({
            key: selection.key,
            model: activeImageModel,
            prompt: prompt.trim(),
            image: reference.content,
            size: imageSize,
            count: Number(imageCount),
          })
          ops.updateNode(target.id, {
            status: 'success',
            content: edited[0],
            title: prompt.trim().slice(0, 32) || t('Image'),
          })
          toast.success(t('Image added to the canvas'))
          return
        }
        const images = await generateImages({
          key: selection.key,
          model: activeImageModel,
          prompt: prompt.trim(),
          size: imageSize,
          count: Number(imageCount),
        })
        ops.updateNode(target.id, {
          status: 'success',
          content: images[0],
          title: prompt.trim().slice(0, 32) || t('Image'),
        })
        images.slice(1).forEach((source) => {
          const extra = placeNode('image')
          ops.updateNode(extra.id, {
            status: 'success',
            content: source,
            title: prompt.trim().slice(0, 32) || t('Image'),
          })
        })
      } else if (kind === 'video') {
        if (!activeVideoModel) throw new Error(t('Select a video model'))
        const result = await submitVideo({
          key: selection.key,
          model: activeVideoModel,
          prompt: prompt.trim(),
          seconds: videoSeconds,
          size: videoSize,
        })
        taskKeys.current.set(result.taskId, selection.key)
        ops.updateNode(target.id, {
          status: 'loading',
          taskId: result.taskId,
          title: prompt.trim().slice(0, 32) || t('Video'),
        })
        toast.success(t('Video task submitted'))
        return
      } else {
        if (!audioModel.trim()) {
          throw new Error(t('Enter an audio model'))
        }
        const url = await generateSpeech({
          key: selection.key,
          model: audioModel.trim(),
          input: prompt.trim(),
          voice,
          speed: Number(audioSpeed),
          format: audioFormat as 'mp3' | 'opus' | 'wav',
        })
        ops.updateNode(target.id, {
          status: 'success',
          content: url,
          title: prompt.trim().slice(0, 32) || t('Audio'),
        })
      }
      toast.success(t('Image added to the canvas'))
    } catch (error) {
      const message =
        error instanceof Error ? error.message : t('Generation failed')
      ops.updateNode(target.id, { status: 'error', error: message })
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const handleExportPng = async () => {
    try {
      const dataUrl = await exportBoardPng(board)
      downloadDataUrl(dataUrl, `canvas-${Date.now()}.png`)
    } catch {
      toast.error(t('Nothing to export yet'))
    }
  }

  const handleImport = async (file: File) => {
    try {
      projectsStore.importProject(await file.text())
      toast.success(t('Board imported'))
    } catch {
      toast.error(t('Invalid board file'))
    }
  }

  const deleteSelection = useCallback(() => {
    if (selectedIds.length > 0) {
      ops.removeNodes(selectedIds)
      setSelectedIds([])
      return
    }
    if (selectedConnectionId) {
      history.commit((previous) => ({
        ...previous,
        connections: previous.connections.filter(
          (connection) => connection.id !== selectedConnectionId
        ),
      }))
      setSelectedConnectionId(null)
    }
  }, [history, ops, selectedConnectionId, selectedIds])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const inField =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      const meta = event.metaKey || event.ctrlKey

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) history.redo()
        else history.undo()
        return
      }
      if (meta && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        history.redo()
        return
      }
      if (inField) return
      if (meta && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        setSelectedIds(board.nodes.map((node) => node.id))
        return
      }
      if (meta && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copySelection()
        return
      }
      if (meta && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        pasteSelection()
        return
      }
      if (meta && event.key.toLowerCase() === 'l') {
        event.preventDefault()
        toggleLock()
        return
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelection()
        return
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedIds.length > 0 || selectedConnectionId) {
          event.preventDefault()
          deleteSelection()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    board.nodes,
    copySelection,
    deleteSelection,
    duplicateSelection,
    history,
    pasteSelection,
    selectedConnectionId,
    selectedIds,
    toggleLock,
  ])

  // Poll running video tasks and fold the result back into their node.
  useEffect(() => {
    const pending = board.nodes.filter(
      (node) => node.status === 'loading' && node.taskId
    )
    if (pending.length === 0) return
    const timer = window.setInterval(async () => {
      for (const node of pending) {
        const key = taskKeys.current.get(node.taskId ?? '')
        if (!key) continue
        try {
          const state = await fetchVideoTask({ key, taskId: node.taskId ?? '' })
          const finished =
            /success|succeed|complete/i.test(state.status) ||
            Boolean(state.videoUrl)
          const failed =
            /fail|error/i.test(state.status) || Boolean(state.error)
          if (finished && !failed) {
            // The task payload may carry no URL: the rendered file lives behind
            // the content endpoint and needs the caller's key.
            const source =
              state.videoUrl ??
              (await fetchVideoContent({
                key,
                taskId: node.taskId ?? '',
              }))
            ops.updateNode(node.id, {
              status: 'success',
              content: source || node.content,
            })
          } else if (failed) {
            ops.updateNode(node.id, {
              status: 'error',
              error: state.error ?? t('Generation failed'),
            })
          }
        } catch {
          // Transient poll failures retry on the next tick.
        }
      }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [board.nodes, ops, t])

  const zoomBy = (direction: 1 | -1) => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect) return
    history.commit((previous) => ({
      ...previous,
      viewport: zoomAtPoint(
        previous.viewport,
        { x: rect.width / 2, y: rect.height / 2 },
        previous.viewport.k * (direction === 1 ? 1.2 : 1 / 1.2)
      ),
    }))
  }

  return (
    <div className='grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,360px)]'>
      <div className='flex min-h-[640px] flex-col gap-3'>
        <div className='border-border/70 bg-card flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2'>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button size='sm' variant='outline' />}
            >
              <Plus className='size-3.5' aria-hidden='true' />
              {t('Add node')}
              <ChevronDown className='size-3.5' aria-hidden='true' />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start'>
              {allNodeTypes().map((definition) => (
                <DropdownMenuItem
                  key={definition.id}
                  onClick={() => placeNode(definition.id)}
                >
                  {t(definition.labelKey)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size='sm' variant='ghost' />}>
              <LayoutGrid className='size-3.5' aria-hidden='true' />
              {t('Arrange')}
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start'>
              <DropdownMenuItem
                onClick={() => {
                  arrange('grid')
                  window.setTimeout(fitToContent, 60)
                }}
              >
                <Grid2x2 className='mr-2 size-3.5' />
                {t('Grid')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  arrange('row')
                  window.setTimeout(fitToContent, 60)
                }}
              >
                <LayoutGrid className='mr-2 size-3.5' />
                {t('Row')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size='sm' variant='ghost' />}>
              <AlignStartVertical className='size-3.5' aria-hidden='true' />
              {t('Align')}
            </DropdownMenuTrigger>
            <DropdownMenuContent align='start' className='w-48'>
              <DropdownMenuItem onClick={() => handleAlign('left')}>
                {t('Align left')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAlign('hcenter')}>
                {t('Align horizontal centers')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAlign('right')}>
                {t('Align right')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAlign('top')}>
                {t('Align top')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAlign('vcenter')}>
                {t('Align vertical centers')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleAlign('bottom')}>
                {t('Align bottom')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleDistribute('x')}>
                {t('Distribute horizontally')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleDistribute('y')}>
                {t('Distribute vertically')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => handleLayer('front')}>
                {t('Bring to front')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleLayer('back')}>
                {t('Send to back')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={toggleLock}>
                {t('Toggle lock')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size='icon-sm'
            variant='ghost'
            aria-label={t('Undo')}
            disabled={!history.canUndo}
            onClick={history.undo}
          >
            <Undo2 className='size-3.5' />
          </Button>
          <Button
            size='icon-sm'
            variant='ghost'
            aria-label={t('Redo')}
            disabled={!history.canRedo}
            onClick={history.redo}
          >
            <Redo2 className='size-3.5' />
          </Button>

          <Button
            size='sm'
            variant='ghost'
            disabled={selectedIds.length === 0 && !selectedConnectionId}
            onClick={deleteSelection}
          >
            <Trash2 className='size-3.5' aria-hidden='true' />
            {t('Delete selected')}
          </Button>
          <Button size='sm' variant='ghost' onClick={fitToContent}>
            <Maximize className='size-3.5' aria-hidden='true' />
            {t('Fit view')}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size='sm' variant='ghost' />}>
              <Plug className='size-3.5' aria-hidden='true' />
              {t('Plugins')}
              <Badge variant='secondary' className='ml-1'>
                {pluginState.plugins.length}
              </Badge>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='start'
              className='w-72'
              onPointerDown={(event) => event.stopPropagation()}
            >
              {pluginState.loading ? (
                <DropdownMenuItem disabled>{t('Loading…')}</DropdownMenuItem>
              ) : null}
              {pluginState.plugins.map((plugin) => (
                <DropdownMenuItem
                  key={plugin.module.id}
                  onClick={() => placeNode(plugin.module.id)}
                >
                  {plugin.module.label}
                </DropdownMenuItem>
              ))}
              {pluginState.plugins.length === 0 && !pluginState.loading ? (
                <DropdownMenuItem disabled>
                  {t('No local plugins found')}
                </DropdownMenuItem>
              ) : null}
              {pluginState.errors.map((error) => (
                <DropdownMenuItem
                  key={error}
                  disabled
                  className='text-destructive text-[11px]'
                >
                  {error}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setMarketOpen(true)}>
                <Puzzle className='mr-2 size-3.5' />
                {t('Plugin marketplace')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => void pluginState.reload()}>
                <RefreshCw className='mr-2 size-3.5' />
                {t('Reload plugins')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  size='sm'
                  variant='ghost'
                  aria-label={t('More board actions')}
                />
              }
            >
              <MoreHorizontal className='size-4' aria-hidden='true' />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-52'>
              <DropdownMenuItem onClick={duplicateSelection}>
                {t('Duplicate selected')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPng}>
                <Download className='mr-2 size-3.5' />
                {t('Export PNG')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => exportProjectFile(activeProject)}
              >
                <Download className='mr-2 size-3.5' />
                {t('Export board JSON')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <Upload className='mr-2 size-3.5' />
                {t('Import board JSON')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => {
                  ops.clearBoard()
                  toast.success(t('Board cleared'))
                }}
              >
                {t('Clear board')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className='ml-auto flex items-center gap-2'>
            <Badge variant='outline'>
              {board.nodes.length} {t('nodes')}
            </Badge>
            <Badge
              variant={
                projectsStore.persistFailed ? 'destructive' : 'secondary'
              }
              className='font-normal'
            >
              {saveStateLabel}
            </Badge>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button size='sm' variant='outline' />}
              >
                {activeProject.name}
                <ChevronDown className='size-3.5' aria-hidden='true' />
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end' className='w-56'>
                <div
                  className='px-1.5 pt-1 pb-1.5'
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <Input
                    value={projectQuery}
                    onChange={(event) => setProjectQuery(event.target.value)}
                    placeholder={t('Search boards')}
                    aria-label={t('Search boards')}
                    className='h-8'
                  />
                </div>
                <DropdownMenuSeparator />
                {projects
                  .filter((project) =>
                    project.name
                      .toLowerCase()
                      .includes(projectQuery.trim().toLowerCase())
                  )
                  .map((project) => (
                    <DropdownMenuItem
                      key={project.id}
                      onClick={() => projectsStore.selectProject(project.id)}
                    >
                      <span className='flex min-w-0 flex-1 flex-col'>
                        <span className='truncate'>
                          {project.id === activeProject.id ? '• ' : ''}
                          {project.name}
                        </span>
                        <span className='text-muted-foreground text-[11px]'>
                          {project.board.nodes.length} {t('nodes')} ·{' '}
                          {new Date(project.updatedAt).toLocaleDateString()}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                {projects.every(
                  (project) =>
                    !project.name
                      .toLowerCase()
                      .includes(projectQuery.trim().toLowerCase())
                ) ? (
                  <DropdownMenuItem disabled>
                    {t('No boards match')}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => projectsStore.addProject()}>
                  {t('New board')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    const name = window.prompt(
                      t('Board name'),
                      activeProject.name
                    )
                    if (name?.trim()) {
                      projectsStore.renameProject(activeProject.id, name.trim())
                    }
                  }}
                >
                  {t('Rename board')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    projectsStore.duplicateProject(activeProject.id)
                  }
                >
                  {t('Duplicate board')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={projects.length <= 1}
                  onClick={() => projectsStore.deleteProject(activeProject.id)}
                >
                  {t('Delete board')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <input
            ref={fileInputRef}
            type='file'
            accept='application/json'
            className='hidden'
            aria-label={t('Import board JSON')}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleImport(file)
              event.target.value = ''
            }}
          />
        </div>

        <div
          ref={surfaceRef}
          className='border-border/80 relative min-h-[560px] flex-1 overflow-hidden rounded-xl border bg-white shadow-[0_1px_2px_0_rgb(16_24_40/0.04)]'
        >
          <InfiniteCanvasBoard
            board={board}
            selectedIds={selectedIds}
            selectedConnectionId={selectedConnectionId}
            onSelect={handleSelect}
            onSelectConnection={setSelectedConnectionId}
            onViewportChange={(viewport: CanvasViewport) =>
              history.commit((previous) => ({ ...previous, viewport }))
            }
            onMoveNodes={(updates: { id: string; position: CanvasPoint }[]) =>
              history.commit((previous) => ({
                ...previous,
                nodes: previous.nodes.map((node) => {
                  const update = updates.find((item) => item.id === node.id)
                  return update ? { ...node, position: update.position } : node
                }),
              }))
            }
            onResizeNode={(id, size) => ops.updateNode(id, size)}
            onConnect={ops.connect}
            onOpenNode={handleOpenNode}
            onDeleteNode={handleDeleteNode}
          />

          <div className='border-border/70 bg-card/90 absolute right-3 bottom-3 flex items-center gap-1 rounded-lg border p-1 shadow-xs backdrop-blur'>
            <Button
              size='icon-sm'
              variant='ghost'
              aria-label={t('Zoom out')}
              onClick={() => zoomBy(-1)}
            >
              <Minus className='size-3.5' />
            </Button>
            <span className='text-muted-foreground w-12 text-center font-mono text-[11px] tabular-nums'>
              {Math.round(board.viewport.k * 100)}%
            </span>
            <Button
              size='icon-sm'
              variant='ghost'
              aria-label={t('Zoom in')}
              onClick={() => zoomBy(1)}
            >
              <Plus className='size-3.5' />
            </Button>
          </div>

          <MiniMap
            board={board}
            surfaceSize={surfaceSize}
            onPan={(x, y) =>
              history.commit((previous) => ({
                ...previous,
                viewport: { ...previous.viewport, x: -x, y: -y },
              }))
            }
          />
        </div>
      </div>

      <PluginMarketplaceDialog
        open={marketOpen}
        onOpenChange={setMarketOpen}
        onChanged={() => void pluginState.reload()}
      />

      <Dialog
        open={editingNode !== null}
        onOpenChange={(open) => {
          if (!open) setEditingNode(null)
        }}
      >
        <DialogContent className='sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{editingNode?.title ?? ''}</DialogTitle>
            <DialogDescription>
              {t('Plugin settings for this node.')}
            </DialogDescription>
          </DialogHeader>
          {editingNode ? (
            <iframe
              title={`${editingNode.title}-editor`}
              className='border-border/70 h-[420px] w-full rounded-lg border bg-white'
              sandbox='allow-scripts'
              srcDoc={getPluginEditor(editingNode.kind)?.(editingNode) ?? ''}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Card className='flex h-fit max-h-[780px] flex-col'>
        <CardHeader>
          <CardTitle>
            <Tabs
              value={panelTab}
              onValueChange={(value) =>
                setPanelTab(value as 'generate' | 'assets' | 'agent')
              }
            >
              <TabsList>
                <TabsTrigger value='generate'>
                  <Sparkles className='mr-1 size-3.5' aria-hidden='true' />
                  {t('Generate')}
                </TabsTrigger>
                <TabsTrigger value='assets'>
                  <Images className='mr-1 size-3.5' aria-hidden='true' />
                  {t('Assets')}
                </TabsTrigger>
                <TabsTrigger value='agent'>
                  <Bot className='mr-1 size-3.5' aria-hidden='true' />
                  {t('Agent')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardTitle>
          <CardDescription>{t(PANEL_HINTS[panelTab])}</CardDescription>
        </CardHeader>

        <CardContent className='flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto'>
          {panelTab === 'agent' && (
            <CanvasAgentPanel
              projectId={activeProject.id}
              nodes={board.nodes.map((node) => ({
                id: node.id,
                title: node.title,
              }))}
              ops={{
                addNode: (kind, content, title) => {
                  const node = placeNode(kind)
                  if (content || title) {
                    ops.updateNode(node.id, {
                      content: content ?? node.content,
                      title: title ?? node.title,
                    })
                  }
                  return node
                },
                connect: ops.connect,
                arrange: (layout) => {
                  arrange(layout)
                  window.setTimeout(fitToContent, 60)
                },
                clear: ops.clearBoard,
              }}
            />
          )}
          {panelTab === 'assets' && (
            <AssetsPanel
              nodes={assets}
              onInsert={(node) => {
                const copy = placeNode(node.kind)
                ops.updateNode(copy.id, {
                  content: node.content,
                  title: node.title,
                  status: 'success',
                })
                toast.success(t('Asset placed on the canvas'))
              }}
            />
          )}
          {panelTab === 'generate' && (
            <>
              <div className='flex flex-col gap-1.5'>
                <span className='text-[13px] font-medium'>{t('Create')}</span>
                <div className='bg-muted/50 flex rounded-lg p-1'>
                  {GENERATION_TARGETS.filter((item) =>
                    generationTargets.includes(item.kind)
                  ).map((item) => (
                    <button
                      key={item.kind}
                      type='button'
                      onClick={() => setTargetChoice(item.kind)}
                      className={`flex-1 rounded-md px-2 py-1.5 text-[12px] font-medium transition-colors ${
                        targetKind === item.kind
                          ? 'bg-card text-foreground shadow-xs'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      aria-pressed={targetKind === item.kind}
                    >
                      {t(item.labelKey)}
                    </button>
                  ))}
                </div>
              </div>

              <div className='flex flex-col gap-1.5'>
                <span className='text-[13px] font-medium'>{t('API key')}</span>
                <CapabilityKeySelect
                  capability={capability}
                  selection={selection}
                  onSelect={setSelection}
                />
              </div>

              {targetKind === 'audio' ? (
                <>
                  <div className='flex flex-col gap-1.5'>
                    <span className='text-[13px] font-medium'>
                      {t('Audio model')}
                    </span>
                    <Input
                      value={audioModel}
                      onChange={(event) => setAudioModel(event.target.value)}
                      placeholder='tts-1'
                    />
                  </div>
                  <div className='grid grid-cols-2 gap-2'>
                    <div className='flex flex-col gap-1.5'>
                      <span className='text-[13px] font-medium'>
                        {t('Voice')}
                      </span>
                      <Select
                        value={voice}
                        onValueChange={(value) => setVoice(value ?? VOICES[0])}
                      >
                        <SelectTrigger
                          className='w-full'
                          aria-label={t('Voice')}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VOICES.map((item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='flex flex-col gap-1.5'>
                      <span className='text-[13px] font-medium'>
                        {t('Format')}
                      </span>
                      <Select
                        value={audioFormat}
                        onValueChange={(value) =>
                          setAudioFormat(value ?? AUDIO_FORMATS[0])
                        }
                      >
                        <SelectTrigger
                          className='w-full'
                          aria-label={t('Format')}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AUDIO_FORMATS.map((item) => (
                            <SelectItem key={item} value={item}>
                              {item}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className='flex flex-col gap-1.5'>
                    <span className='text-[13px] font-medium'>
                      {t('Speed')}
                    </span>
                    <Select
                      value={audioSpeed}
                      onValueChange={(value) => setAudioSpeed(value ?? '1')}
                    >
                      <SelectTrigger className='w-full' aria-label={t('Speed')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AUDIO_SPEEDS.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}×
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <div className='flex flex-col gap-1.5'>
                  <span className='text-[13px] font-medium'>{t('Model')}</span>
                  <Select
                    value={
                      targetKind === 'video'
                        ? activeVideoModel
                        : activeImageModel
                    }
                    onValueChange={(value) =>
                      targetKind === 'video'
                        ? setVideoModel(value ?? '')
                        : setImageModel(value ?? '')
                    }
                  >
                    <SelectTrigger className='w-full' aria-label={t('Model')}>
                      <SelectValue placeholder={t('Select a model')} />
                    </SelectTrigger>
                    <SelectContent>
                      {capabilityModels.length === 0 ? (
                        <SelectItem value='__empty__' disabled>
                          {t('No model available')}
                        </SelectItem>
                      ) : (
                        capabilityModels.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {targetKind === 'video' ? (
                <div className='grid grid-cols-2 gap-2'>
                  <div className='flex flex-col gap-1.5'>
                    <span className='text-[13px] font-medium'>
                      {t('Resolution')}
                    </span>
                    <SizePicker
                      value={videoSize}
                      onChange={setVideoSize}
                      presets={VIDEO_SIZE_PRESETS}
                      label={t('Resolution')}
                      min={256}
                      max={4096}
                    />
                  </div>
                  <div className='flex flex-col gap-1.5'>
                    <span className='text-[13px] font-medium'>
                      {t('Duration')}
                    </span>
                    <DurationPicker
                      value={videoSeconds}
                      onChange={setVideoSeconds}
                      presets={VIDEO_SECONDS}
                      label={t('Duration')}
                      min={1}
                      max={3600}
                    />
                  </div>
                </div>
              ) : null}

              {targetKind === 'image' ? (
                <div className='grid grid-cols-2 gap-2'>
                  <div className='flex flex-col gap-1.5'>
                    <span className='text-[13px] font-medium'>
                      {t('Resolution')}
                    </span>
                    <SizePicker
                      value={imageSize}
                      onChange={setImageSize}
                      presets={IMAGE_SIZE_PRESETS}
                      label={t('Resolution')}
                      min={256}
                      max={4096}
                    />
                  </div>
                  <div className='flex flex-col gap-1.5'>
                    <span className='text-[13px] font-medium'>
                      {t('Count')}
                    </span>
                    <Select
                      value={imageCount}
                      onValueChange={(value) =>
                        setImageCount(value ?? IMAGE_COUNTS[0])
                      }
                    >
                      <SelectTrigger className='w-full' aria-label={t('Count')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {IMAGE_COUNTS.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ) : null}

              <div className='flex flex-col gap-1.5'>
                <div className='flex items-center justify-between'>
                  <label
                    className='text-[13px] font-medium'
                    htmlFor='board-prompt'
                  >
                    {t('Prompt')}
                  </label>
                  <Button
                    size='sm'
                    variant='ghost'
                    className='text-muted-foreground h-7 px-2 text-[11px]'
                    onClick={() => {
                      promptLibrary.save(prompt)
                      toast.success(t('Prompt saved'))
                    }}
                    disabled={!prompt.trim()}
                  >
                    <Bookmark className='mr-1 size-3' aria-hidden='true' />
                    {t('Save prompt')}
                  </Button>
                </div>
                <Textarea
                  id='board-prompt'
                  rows={4}
                  value={prompt}
                  onChange={(event) => {
                    setPrompt(event.target.value)
                    if (
                      selectedNode?.kind === 'prompt' ||
                      selectedNode?.kind === 'sticky'
                    ) {
                      ops.updateNode(selectedNode.id, {
                        content: event.target.value,
                      })
                    }
                  }}
                  placeholder={t('A isometric city block at golden hour')}
                />
                <div className='flex flex-wrap gap-1.5'>
                  {promptLibrary.prompts.slice(0, 6).map((item) => (
                    <button
                      key={item.id}
                      type='button'
                      className='border-border/70 bg-muted/40 hover:border-primary/50 hover:text-primary line-clamp-1 max-w-full truncate rounded-full border px-2.5 py-1 text-left text-[11px] transition-colors'
                      title={item.text}
                      onClick={() => setPrompt(item.text)}
                    >
                      {item.text}
                    </button>
                  ))}
                </div>
              </div>

              {targetKind === 'image' && imageNodes.length > 0 ? (
                <div className='flex flex-col gap-1.5'>
                  <span className='text-[13px] font-medium'>
                    {t('Reference image')}
                  </span>
                  <Select
                    value={referenceId || '__none__'}
                    onValueChange={(value) =>
                      setReferenceId(value === '__none__' ? '' : (value ?? ''))
                    }
                  >
                    <SelectTrigger
                      className='w-full'
                      aria-label={t('Reference image')}
                    >
                      <SelectValue placeholder={t('No reference')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='__none__'>
                        {t('No reference')}
                      </SelectItem>
                      {imageNodes.map((node) => (
                        <SelectItem key={node.id} value={node.id}>
                          {node.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              <div className='flex items-end gap-2'>
                <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
                  <span className='text-[13px] font-medium'>
                    {t('Chat key')}
                  </span>
                  <Select
                    value={chatTokenId}
                    onValueChange={(value) => setChatTokenId(value ?? '')}
                  >
                    <SelectTrigger
                      className='w-full'
                      aria-label={t('Chat key')}
                    >
                      <SelectValue placeholder={t('Optional key')} />
                    </SelectTrigger>
                    <SelectContent>
                      {chatTokens.map((token) => (
                        <SelectItem key={token.id} value={String(token.id)}>
                          {token.name || `#${token.id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className='flex min-w-0 flex-1 flex-col gap-1.5'>
                  <span className='text-[13px] font-medium'>
                    {t('Chat model')}
                  </span>
                  <Select
                    value={chatModel}
                    onValueChange={(value) => setChatModel(value ?? '')}
                  >
                    <SelectTrigger
                      className='w-full'
                      aria-label={t('Chat model')}
                    >
                      <SelectValue placeholder={t('Select a model')} />
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
                <Button
                  size='sm'
                  variant='outline'
                  className='shrink-0'
                  onClick={handleExpandPrompt}
                >
                  <Wand2 className='size-3.5' aria-hidden='true' />
                  {t('Expand')}
                </Button>
              </div>

              {selectedNode && getPluginEditor(selectedNode.kind) ? (
                <Button
                  variant='outline'
                  onClick={() => setEditingNode(selectedNode)}
                >
                  <Puzzle className='size-4' aria-hidden='true' />
                  {t('Plugin settings')}
                </Button>
              ) : null}

              <Button onClick={handleGenerate} disabled={isBusy}>
                {isBusy ? (
                  <Loader2 className='size-4 animate-spin' aria-hidden='true' />
                ) : (
                  <Sparkles className='size-4' aria-hidden='true' />
                )}
                {t(
                  GENERATION_TARGETS.find((item) => item.kind === targetKind)
                    ?.actionKey ?? 'Generate image'
                )}
              </Button>

              <p className='text-muted-foreground text-[12px] leading-relaxed'>
                {t(
                  'Space or Alt + drag pans the board, the wheel zooms at the cursor, and dragging the right-edge dot connects two nodes.'
                )}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AssetThumb(props: { node: InfiniteNode }) {
  const { t } = useTranslation()
  if (props.node.kind === 'image') {
    return (
      <img
        src={props.node.content}
        alt={props.node.title}
        className='h-full w-full object-cover'
      />
    )
  }
  if (props.node.kind === 'video') {
    return (
      <video src={props.node.content} className='h-full w-full object-cover' />
    )
  }
  return <span className='text-muted-foreground text-[11px]'>{t('Audio')}</span>
}

function AssetsPanel(props: {
  nodes: InfiniteNode[]
  onInsert: (node: InfiniteNode) => void
}) {
  const { t } = useTranslation()
  if (props.nodes.length === 0) {
    return (
      <p className='text-muted-foreground rounded-lg border border-dashed px-3 py-10 text-center text-[12px]'>
        {t('No media yet. Generate an image, video, or audio node first.')}
      </p>
    )
  }
  return (
    <div className='grid grid-cols-2 gap-2'>
      {props.nodes.map((node) => (
        <button
          key={node.id}
          type='button'
          onClick={() => props.onInsert(node)}
          className='border-border/70 hover:border-primary/60 group overflow-hidden rounded-lg border text-left transition-colors'
        >
          <div className='bg-muted/40 flex h-24 items-center justify-center overflow-hidden'>
            <AssetThumb node={node} />
          </div>
          <div className='flex items-center justify-between px-2 py-1.5'>
            <span className='truncate text-[11px]'>{node.title}</span>
            <Plus className='text-muted-foreground group-hover:text-primary size-3' />
          </div>
        </button>
      ))}
    </div>
  )
}

function MiniMap(props: {
  board: InfiniteBoard
  surfaceSize: { width: number; height: number }
  onPan: (x: number, y: number) => void
}) {
  const width = 132
  const height = 84
  const [dragging, setDragging] = useState(false)
  const nodes = props.board.nodes
  if (nodes.length === 0) return null

  const minX = Math.min(...nodes.map((node) => node.position.x))
  const minY = Math.min(...nodes.map((node) => node.position.y))
  const maxX = Math.max(...nodes.map((node) => node.position.x + node.width))
  const maxY = Math.max(...nodes.map((node) => node.position.y + node.height))
  const boardWidth = Math.max(maxX - minX, 1)
  const boardHeight = Math.max(maxY - minY, 1)
  const scale = Math.min(width / boardWidth, height / boardHeight)
  const offsetX = (width - boardWidth * scale) / 2
  const offsetY = (height - boardHeight * scale) / 2

  const viewWorldX = -props.board.viewport.x / props.board.viewport.k
  const viewWorldY = -props.board.viewport.y / props.board.viewport.k
  const viewWidth = props.surfaceSize.width / props.board.viewport.k
  const viewHeight = props.surfaceSize.height / props.board.viewport.k

  const jump = (
    event: { clientX: number; clientY: number },
    element: SVGSVGElement
  ) => {
    const rect = element.getBoundingClientRect()
    props.onPan(
      (event.clientX - rect.left - offsetX) / scale + minX,
      (event.clientY - rect.top - offsetY) / scale + minY
    )
  }

  return (
    <div className='border-border/70 bg-card/90 absolute bottom-3 left-3 rounded-lg border p-1.5 shadow-xs backdrop-blur'>
      <svg
        width={width}
        height={height}
        role='img'
        aria-label={MiniMap.name}
        className='bg-muted/40 block cursor-grab rounded'
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          setDragging(true)
          jump(event, event.currentTarget)
        }}
        onPointerMove={(event) => {
          if (dragging) jump(event, event.currentTarget)
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
      >
        {nodes.map((node) => (
          <rect
            key={node.id}
            x={offsetX + (node.position.x - minX) * scale}
            y={offsetY + (node.position.y - minY) * scale}
            width={Math.max(node.width * scale, 4)}
            height={Math.max(node.height * scale, 3)}
            rx={1.5}
            className='fill-primary/40'
          />
        ))}
        <rect
          x={offsetX + (viewWorldX - minX) * scale}
          y={offsetY + (viewWorldY - minY) * scale}
          width={Math.max(viewWidth * scale, 3)}
          height={Math.max(viewHeight * scale, 3)}
          className='fill-primary/10 stroke-primary'
          strokeWidth={1}
        />
      </svg>
    </div>
  )
}
