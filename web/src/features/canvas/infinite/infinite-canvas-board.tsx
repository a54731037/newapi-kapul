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
import { Loader2, Lock, Trash2 } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import { nodeTypeDefinition } from './node-registry'
import { getPluginRenderer } from './plugins/registry'
import {
  GRID_SIZE,
  STICKY_TINTS,
  type CanvasPoint,
  type CanvasViewport,
  type InfiniteBoard,
  type InfiniteNode,
} from './types'
import {
  connectionPath,
  normalizeRect,
  rectsIntersect,
  screenToWorld,
  zoomByFactor,
} from './viewport'

type DragState =
  | { mode: 'none' }
  | { mode: 'pan'; startScreen: CanvasPoint; startViewport: CanvasViewport }
  | {
      mode: 'marquee'
      startWorld: CanvasPoint
      currentWorld: CanvasPoint
      additive: boolean
    }
  | {
      mode: 'nodes'
      startWorld: CanvasPoint
      origins: { id: string; position: CanvasPoint }[]
    }
  | {
      mode: 'resize'
      nodeId: string
      startWorld: CanvasPoint
      startWidth: number
      startHeight: number
    }
  | { mode: 'connect'; fromNodeId: string; currentWorld: CanvasPoint }

interface InfiniteCanvasBoardProps {
  board: InfiniteBoard
  selectedIds: string[]
  selectedConnectionId: string | null
  onSelect: (ids: string[]) => void
  onSelectConnection: (id: string | null) => void
  onViewportChange: (viewport: CanvasViewport) => void
  onMoveNodes: (updates: { id: string; position: CanvasPoint }[]) => void
  onResizeNode: (id: string, size: { width: number; height: number }) => void
  onConnect: (fromNodeId: string, toNodeId: string) => void
  onOpenNode: (node: InfiniteNode) => void
  onDeleteNode: (id: string) => void
}

/** Shift adds to the selection; pressing a selected node keeps the group. */
function nodeSelection(
  selectedIds: string[],
  nodeId: string,
  additive: boolean
): string[] {
  if (additive) return [...new Set([...selectedIds, nodeId])]
  if (selectedIds.includes(nodeId)) return selectedIds
  return [nodeId]
}

export function InfiniteCanvasBoard(props: InfiniteCanvasBoardProps) {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [drag, setDrag] = useState<DragState>({ mode: 'none' })
  const [spacePressed, setSpacePressed] = useState(false)
  const lastTap = useRef({ id: '', at: 0 })

  const viewport = props.board.viewport

  const screenPoint = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const rect = containerRef.current?.getBoundingClientRect()
      return {
        x: event.clientX - (rect?.left ?? 0),
        y: event.clientY - (rect?.top ?? 0),
      }
    },
    []
  )

  const worldPoint = useCallback(
    (event: { clientX: number; clientY: number }) =>
      screenToWorld(viewport, screenPoint(event)),
    [screenPoint, viewport]
  )

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(true)
    }
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false)
    }
    const blur = () => setSpacePressed(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const factor = Math.pow(1.1, -event.deltaY / 100)
    props.onViewportChange(zoomByFactor(viewport, screenPoint(event), factor))
  }

  const handleSurfacePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    const target = event.target as Element
    const onBackground = !target.closest('[data-canvas-node]')
    const wantsPan =
      spacePressed || event.button === 1 || (event.button === 0 && event.altKey)

    if (wantsPan && onBackground) {
      event.currentTarget.setPointerCapture(event.pointerId)
      setDrag({
        mode: 'pan',
        startScreen: screenPoint(event),
        startViewport: viewport,
      })
      return
    }

    if (event.button !== 0 || !onBackground) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const world = worldPoint(event)
    setDrag({
      mode: 'marquee',
      startWorld: world,
      currentWorld: world,
      additive: event.shiftKey,
    })
    if (!event.shiftKey) {
      props.onSelect([])
      props.onSelectConnection(null)
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (drag.mode === 'none') return
    if (drag.mode === 'pan') {
      const screen = screenPoint(event)
      props.onViewportChange({
        k: drag.startViewport.k,
        x: drag.startViewport.x + (screen.x - drag.startScreen.x),
        y: drag.startViewport.y + (screen.y - drag.startScreen.y),
      })
      return
    }
    if (drag.mode === 'marquee') {
      setDrag({ ...drag, currentWorld: worldPoint(event) })
      return
    }
    if (drag.mode === 'nodes') {
      const world = worldPoint(event)
      const deltaX = world.x - drag.startWorld.x
      const deltaY = world.y - drag.startWorld.y
      props.onMoveNodes(
        drag.origins.map((origin) => ({
          id: origin.id,
          position: {
            x: origin.position.x + deltaX,
            y: origin.position.y + deltaY,
          },
        }))
      )
      return
    }
    if (drag.mode === 'resize') {
      const world = worldPoint(event)
      props.onResizeNode(drag.nodeId, {
        width: Math.max(160, drag.startWidth + (world.x - drag.startWorld.x)),
        height: Math.max(120, drag.startHeight + (world.y - drag.startWorld.y)),
      })
      return
    }
    if (drag.mode === 'connect') {
      setDrag({ ...drag, currentWorld: worldPoint(event) })
    }
  }

  const finishDrag = () => {
    if (drag.mode === 'marquee') {
      const rect = normalizeRect(drag.startWorld, drag.currentWorld)
      if (rect.width > 4 && rect.height > 4) {
        const hits = props.board.nodes
          .filter((node) =>
            rectsIntersect(rect, {
              x: node.position.x,
              y: node.position.y,
              width: node.width,
              height: node.height,
            })
          )
          .map((node) => node.id)
        props.onSelect(
          drag.additive ? [...new Set([...props.selectedIds, ...hits])] : hits
        )
      }
    }
    if (drag.mode === 'connect') {
      const fromId = drag.fromNodeId
      const target = props.board.nodes.find(
        (node) =>
          node.id !== fromId &&
          drag.currentWorld.x >= node.position.x &&
          drag.currentWorld.x <= node.position.x + node.width &&
          drag.currentWorld.y >= node.position.y &&
          drag.currentWorld.y <= node.position.y + node.height
      )
      if (target) props.onConnect(fromId, target.id)
    }
    setDrag({ mode: 'none' })
  }

  const gridSize = GRID_SIZE * viewport.k
  const gridStyle = useMemo(
    () => ({
      backgroundImage:
        'radial-gradient(circle, var(--border) 1.1px, transparent 1.3px)',
      backgroundSize: `${gridSize}px ${gridSize}px`,
      backgroundPosition: `${viewport.x % gridSize}px ${viewport.y % gridSize}px`,
    }),
    [gridSize, viewport.x, viewport.y]
  )

  const marquee =
    drag.mode === 'marquee'
      ? normalizeRect(drag.startWorld, drag.currentWorld)
      : null

  const connectPreview =
    drag.mode === 'connect'
      ? (() => {
          const from = props.board.nodes.find(
            (node) => node.id === drag.fromNodeId
          )
          if (!from) return null
          const start = {
            x: from.position.x + from.width,
            y: from.position.y + from.height / 2,
          }
          const curve = Math.max(
            Math.abs(drag.currentWorld.x - start.x) * 0.5,
            60
          )
          return `M ${start.x} ${start.y} C ${start.x + curve} ${start.y}, ${drag.currentWorld.x - curve} ${drag.currentWorld.y}, ${drag.currentWorld.x} ${drag.currentWorld.y}`
        })()
      : null

  return (
    <div
      ref={containerRef}
      role='application'
      aria-label={t('Infinite canvas')}
      className='bg-muted/20 relative h-full w-full touch-none overflow-hidden rounded-xl select-none'
      style={{ cursor: spacePressed ? 'grab' : undefined }}
      onWheel={handleWheel}
      onPointerDown={handleSurfacePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
    >
      <div
        className='pointer-events-none absolute inset-0 opacity-[0.55]'
        style={gridStyle}
      />

      <div
        className='absolute origin-top-left'
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`,
        }}
      >
        <svg className='absolute top-0 left-0 overflow-visible'>
          {props.board.connections.map((connection) => {
            const from = props.board.nodes.find(
              (node) => node.id === connection.fromNodeId
            )
            const to = props.board.nodes.find(
              (node) => node.id === connection.toNodeId
            )
            if (!from || !to) return null
            const shape = connectionPath(from, to)
            const selected = props.selectedConnectionId === connection.id
            return (
              <g key={connection.id}>
                <path
                  d={shape.d}
                  fill='none'
                  stroke='transparent'
                  strokeWidth={16 / viewport.k}
                  className='cursor-pointer'
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    props.onSelectConnection(connection.id)
                    props.onSelect([])
                  }}
                />
                <path
                  d={shape.d}
                  fill='none'
                  stroke='var(--primary)'
                  strokeOpacity={selected ? 0.95 : 0.5}
                  strokeWidth={(selected ? 3 : 2) / viewport.k}
                  className='pointer-events-none'
                />
              </g>
            )
          })}
          {connectPreview ? (
            <path
              d={connectPreview}
              fill='none'
              stroke='var(--primary)'
              strokeDasharray={`${6 / viewport.k} ${4 / viewport.k}`}
              strokeWidth={2 / viewport.k}
            />
          ) : null}
        </svg>

        {props.board.nodes.map((node) => {
          const selected = props.selectedIds.includes(node.id)
          const definition = nodeTypeDefinition(node.kind)
          const sticky = node.kind === 'sticky'
          const tint = STICKY_TINTS[(node.tint ?? 0) % STICKY_TINTS.length]
          return (
            <div
              key={node.id}
              data-canvas-node={node.id}
              className={cn(
                'group absolute flex flex-col rounded-xl border shadow-[0_1px_2px_0_rgb(16_24_40/0.06)]',
                sticky ? tint : 'bg-card',
                selected
                  ? 'border-primary ring-primary/25 ring-2'
                  : 'border-border/80'
              )}
              style={{
                left: node.position.x,
                top: node.position.y,
                width: node.width,
                height: node.height,
              }}
              onPointerDown={(event) => {
                event.stopPropagation()
                const now = Date.now()
                const isDoubleTap =
                  lastTap.current.id === node.id &&
                  now - lastTap.current.at < 350
                lastTap.current = {
                  id: isDoubleTap ? '' : node.id,
                  at: now,
                }
                if (isDoubleTap) {
                  props.onOpenNode(node)
                  return
                }
                const ids = nodeSelection(
                  props.selectedIds,
                  node.id,
                  event.shiftKey
                )
                props.onSelect(ids)
                props.onSelectConnection(null)
                event.currentTarget.setPointerCapture(event.pointerId)
                const origins = props.board.nodes
                  .filter((item) => ids.includes(item.id) && !item.locked)
                  .map((item) => ({ id: item.id, position: item.position }))
                if (origins.length === 0) return
                setDrag({
                  mode: 'nodes',
                  startWorld: worldPoint(event),
                  origins,
                })
              }}
              onDoubleClick={() => props.onOpenNode(node)}
            >
              <div
                className={cn(
                  'flex items-center justify-between gap-2 overflow-hidden rounded-t-xl border-b px-3 py-2 text-[11px] font-medium',
                  sticky
                    ? 'border-black/10'
                    : 'border-border/70 text-muted-foreground'
                )}
              >
                <span className='truncate'>{node.title}</span>
                <span className='flex items-center gap-1'>
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5',
                      sticky ? 'bg-black/5' : 'bg-muted'
                    )}
                  >
                    {t(definition.labelKey)}
                  </span>
                  {node.locked ? (
                    <Lock
                      className='text-muted-foreground size-3'
                      aria-hidden='true'
                    />
                  ) : null}
                  <button
                    type='button'
                    aria-label={t('Delete node')}
                    title={t('Delete node')}
                    className={cn(
                      'hover:bg-destructive/10 hover:text-destructive flex size-5 items-center justify-center rounded transition-opacity',
                      selected
                        ? 'opacity-100'
                        : 'opacity-60 group-hover:opacity-100'
                    )}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      props.onDeleteNode(node.id)
                    }}
                  >
                    <Trash2 className='size-3' aria-hidden='true' />
                  </button>
                </span>
              </div>

              <div className='relative min-h-0 flex-1 overflow-hidden rounded-b-xl p-2.5'>
                <NodeBody node={node} />
                {node.status === 'loading' ? (
                  <div className='bg-card/70 absolute inset-0 flex items-center justify-center backdrop-blur-[1px]'>
                    <Loader2 className='text-primary size-5 animate-spin' />
                  </div>
                ) : null}
              </div>

              <span
                className='border-primary bg-card absolute top-1/2 -right-1.5 size-3 -translate-y-1/2 cursor-crosshair rounded-full border-2'
                role='button'
                tabIndex={-1}
                aria-label={t('Connect from this node')}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setDrag({
                    mode: 'connect',
                    fromNodeId: node.id,
                    currentWorld: worldPoint(event),
                  })
                }}
              />

              <span
                className='border-primary absolute -right-1 -bottom-1 size-3 cursor-nwse-resize rounded-sm border-2 bg-white'
                role='button'
                tabIndex={-1}
                aria-label={t('Resize node')}
                onPointerDown={(event) => {
                  event.stopPropagation()
                  event.preventDefault()
                  event.currentTarget.setPointerCapture(event.pointerId)
                  setDrag({
                    mode: 'resize',
                    nodeId: node.id,
                    startWorld: worldPoint(event),
                    startWidth: node.width,
                    startHeight: node.height,
                  })
                }}
              />
            </div>
          )
        })}

        {marquee ? (
          <div
            className='border-primary bg-primary/10 pointer-events-none absolute rounded border'
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.width,
              height: marquee.height,
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function NodeBody(props: { node: InfiniteNode }) {
  const { t } = useTranslation()
  const { node } = props

  if (node.status === 'error') {
    return (
      <p className='text-destructive text-[12px] leading-relaxed'>
        {node.error || t('Generation failed')}
      </p>
    )
  }

  if (node.kind === 'image') {
    return node.content ? (
      <img
        src={node.content}
        alt={node.title}
        className='h-full w-full rounded-lg object-cover'
        draggable={false}
      />
    ) : (
      <div className='flex h-full items-center justify-center'>
        <p className='text-muted-foreground px-3 text-center text-[12px] leading-relaxed'>
          {t('Double-click to generate an image')}
        </p>
      </div>
    )
  }

  if (node.kind === 'video') {
    return node.content ? (
      <video
        src={node.content}
        controls
        className='h-full w-full rounded-lg bg-black object-contain'
      />
    ) : (
      <p className='text-muted-foreground text-[12px] leading-relaxed'>
        {node.taskId
          ? t('Waiting for the rendered file')
          : t('Double-click to generate a video')}
      </p>
    )
  }

  if (node.kind === 'audio') {
    return node.content ? (
      <audio src={node.content} controls className='w-full' />
    ) : (
      <p className='text-muted-foreground text-[12px] leading-relaxed'>
        {t('Double-click to generate speech')}
      </p>
    )
  }

  if (node.kind === 'svg') {
    // Rendering through an <img> keeps any inline script inert.
    const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      node.content || '<svg xmlns="http://www.w3.org/2000/svg" />'
    )}`
    return (
      <img
        src={source}
        alt={node.title}
        className='h-full w-full object-contain'
        draggable={false}
      />
    )
  }

  if (node.kind === 'html') {
    return (
      <iframe
        title={node.title}
        srcDoc={node.content}
        sandbox=''
        className='border-border/60 h-full w-full rounded-lg border bg-white'
      />
    )
  }

  if (node.kind === 'panorama') {
    return node.content ? (
      <div
        className='bg-muted h-full w-full cursor-grab overflow-hidden rounded-lg'
        style={{
          backgroundImage: `url(${node.content})`,
          backgroundSize: 'auto 100%',
          backgroundRepeat: 'repeat-x',
          backgroundPositionX: `${node.tint ?? 0}px`,
        }}
        role='img'
        aria-label={node.title}
        onPointerDown={(event) => {
          event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
      />
    ) : (
      <div className='flex h-full items-center justify-center'>
        <p className='text-muted-foreground px-3 text-center text-[12px]'>
          {t('Double-click to generate an image')}
        </p>
      </div>
    )
  }

  if (node.kind === 'markdown') {
    return (
      <pre className='text-foreground/90 h-full overflow-hidden font-mono text-[11px] leading-relaxed whitespace-pre-wrap'>
        {node.content}
      </pre>
    )
  }

  if (node.kind === 'sticky') {
    return (
      <p className='h-full overflow-hidden text-[12px] leading-relaxed whitespace-pre-wrap'>
        {node.content}
      </p>
    )
  }

  // Plugin nodes come from the local plugin folder; their body is HTML that we
  // sandbox without same-origin access.
  const pluginRenderer = getPluginRenderer(node.kind)
  if (pluginRenderer) {
    let html = ''
    try {
      html = pluginRenderer(node)
    } catch {
      html = ''
    }
    return (
      <iframe
        title={node.title}
        srcDoc={html || node.content}
        sandbox='allow-scripts'
        className='border-border/60 h-full w-full rounded-lg border bg-white'
      />
    )
  }

  if (nodeTypeDefinition(node.kind).id !== 'prompt') {
    return (
      <p className='text-muted-foreground text-[12px] leading-relaxed'>
        {t('Plugin not loaded')}
      </p>
    )
  }

  return (
    <p className='text-muted-foreground line-clamp-6 text-[12px] leading-relaxed whitespace-pre-wrap'>
      {node.content || t('Double-click to write a prompt')}
    </p>
  )
}
