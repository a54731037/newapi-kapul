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
/** Uploaded reference images are re-sent to the upstream, so keep them bounded. */
export const MAX_IMAGE_UPLOAD_BYTES = 20 * 1024 * 1024

export const IMAGE_UPLOAD_ACCEPT = 'image/png,image/jpeg,image/webp'

export type ImageUploadFailure = 'type' | 'size'

/** Read a picked file as a data URL the edit endpoint can send. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Unable to read the image'))
    }
    reader.onerror = () => reject(new Error('Unable to read the image'))
    reader.readAsDataURL(file)
  })
}

/**
 * Validate and read an uploaded reference image.
 *
 * Returns the data URL, or throws with the machine-readable failure reason so
 * the caller can show a translated message.
 */
export async function readImageUpload(
  file: File
): Promise<{ source: string } | { failure: ImageUploadFailure }> {
  if (!file.type.startsWith('image/')) return { failure: 'type' }
  if (file.size > MAX_IMAGE_UPLOAD_BYTES) return { failure: 'size' }
  return { source: await fileToDataUrl(file) }
}
