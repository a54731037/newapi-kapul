import type { InfiniteBoard } from './types'
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
import { nodeBounds } from './viewport'

const PADDING = 48

function loadImage(source: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = source
  })
}

/**
 * Flatten the board into a PNG. Images are drawn when they load; prompt nodes
 * are rendered as wrapped text so an exported board is readable without the app.
 */
export async function exportBoardPng(
  board: InfiniteBoard,
  scale = 1
): Promise<string> {
  if (board.nodes.length === 0) {
    throw new Error('empty board')
  }
  const bounds = nodeBounds(board.nodes)
  const width = Math.ceil((bounds.width + PADDING * 2) * scale)
  const height = Math.ceil((bounds.height + PADDING * 2) * scale)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(width, 320)
  canvas.height = Math.max(height, 240)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('canvas unavailable')

  context.scale(scale, scale)
  context.translate(-bounds.minX + PADDING, -bounds.minY + PADDING)
  context.fillStyle = '#ffffff'
  context.fillRect(
    bounds.minX - PADDING,
    bounds.minY - PADDING,
    bounds.width + PADDING * 2,
    bounds.height + PADDING * 2
  )

  for (const node of board.nodes) {
    context.fillStyle = '#ffffff'
    context.strokeStyle = '#d4d4d8'
    context.lineWidth = 1
    context.beginPath()
    context.roundRect(
      node.position.x,
      node.position.y,
      node.width,
      node.height,
      12
    )
    context.fill()
    context.stroke()

    context.fillStyle = '#18181b'
    context.font = '600 13px system-ui, sans-serif'
    context.fillText(node.title, node.position.x + 12, node.position.y + 24)

    if (node.kind === 'image' && node.content) {
      const image = await loadImage(node.content)
      if (image) {
        const boxWidth = node.width - 24
        const boxHeight = node.height - 56
        const ratio = Math.min(boxWidth / image.width, boxHeight / image.height)
        const drawWidth = image.width * ratio
        const drawHeight = image.height * ratio
        context.drawImage(
          image,
          node.position.x + 12 + (boxWidth - drawWidth) / 2,
          node.position.y + 36 + (boxHeight - drawHeight) / 2,
          drawWidth,
          drawHeight
        )
      }
    } else if (node.content) {
      context.fillStyle = '#52525b'
      context.font = '12px system-ui, sans-serif'
      const words = node.content.split(/\s+/)
      let line = ''
      let lineY = node.position.y + 56
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word
        if (context.measureText(candidate).width > node.width - 24) {
          context.fillText(line, node.position.x + 12, lineY)
          lineY += 18
          line = word
          if (lineY > node.position.y + node.height - 12) break
        } else {
          line = candidate
        }
      }
      if (line && lineY <= node.position.y + node.height - 12) {
        context.fillText(line, node.position.x + 12, lineY)
      }
    }
  }

  return canvas.toDataURL('image/png')
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  link.click()
}
