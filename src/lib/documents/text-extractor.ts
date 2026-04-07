import { extractTextFromPDF } from './pdf-parser'
import { extractTextFromDocx } from './docx-parser'
import { extractTextFromXlsx } from './xlsx-parser'
import { extractTextFromImage } from './image-parser'
import { extractFilesFromZip } from './zip-extractor'

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  return lastDot === -1 ? '' : filename.slice(lastDot).toLowerCase()
}

export function getMimeType(filename: string): string {
  const ext = getExtension(filename)

  const mimeTypes: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.doc': 'application/msword',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
    '.zip': 'application/zip',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
    '.bmp': 'image/bmp',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  }

  return mimeTypes[ext] || 'application/octet-stream'
}

export function isImage(filename: string): boolean {
  const imageExtensions = [
    '.png',
    '.jpg',
    '.jpeg',
    '.tiff',
    '.tif',
    '.bmp',
    '.gif',
    '.webp',
  ]
  const ext = getExtension(filename)
  return imageExtensions.includes(ext)
}

export function isSupportedDocument(filename: string): boolean {
  const supportedExtensions = [
    '.pdf',
    '.docx',
    '.doc',
    '.xlsx',
    '.xls',
    '.zip',
    '.png',
    '.jpg',
    '.jpeg',
    '.tiff',
    '.tif',
    '.bmp',
    '.gif',
    '.webp',
  ]
  const ext = getExtension(filename)
  return supportedExtensions.includes(ext)
}

export async function extractText(
  buffer: Buffer,
  filename: string
): Promise<string> {
  const ext = getExtension(filename)

  try {
    switch (ext) {
      case '.pdf':
        return await extractTextFromPDF(buffer)

      case '.docx':
      case '.doc':
        return await extractTextFromDocx(buffer)

      case '.xlsx':
      case '.xls':
        return await extractTextFromXlsx(buffer)

      case '.zip':
        {
          // For ZIP files, extract and process each supported file
          const extractedFiles = await extractFilesFromZip(buffer)
          const allTexts: string[] = []

          for (const file of extractedFiles) {
            const fileExt = getExtension(file.filename)
            let text = ''

            if (fileExt === '.pdf') {
              text = await extractTextFromPDF(file.buffer)
            } else if (fileExt === '.docx' || fileExt === '.doc') {
              text = await extractTextFromDocx(file.buffer)
            } else if (fileExt === '.xlsx' || fileExt === '.xls') {
              text = await extractTextFromXlsx(file.buffer)
            } else if (isImage(file.filename)) {
              text = await extractTextFromImage(file.buffer, file.filename)
            }

            if (text) {
              allTexts.push(`\n=== File: ${file.filename} ===\n${text}`)
            }
          }

          return allTexts.join('\n')
        }

      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.tiff':
      case '.tif':
      case '.bmp':
      case '.gif':
      case '.webp':
        return await extractTextFromImage(buffer, filename)

      default:
        console.error(`[text-extractor] unsupported file type: ${ext}`)
        return ''
    }
  } catch (e) {
    console.error('[text-extractor] error extracting text:', e)
    return ''
  }
}
