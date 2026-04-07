export interface ExtractedFile {
  filename: string
  buffer: Buffer
  mimeType: string
  size: number
}

const SUPPORTED_EXTENSIONS = [
  '.pdf',
  '.docx',
  '.doc',
  '.xlsx',
  '.xls',
  '.png',
  '.jpg',
  '.jpeg',
  '.tiff',
  '.tif',
  '.bmp',
]

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.bmp': 'image/bmp',
}

const SKIP_PATTERNS = [
  '__MACOSX',
  '.DS_Store',
  'Thumbs.db',
  '.git',
  '.gitignore',
  '.env',
]

function shouldSkipFile(filename: string): boolean {
  return SKIP_PATTERNS.some(
    (pattern) =>
      filename.includes(pattern) ||
      filename.toLowerCase().startsWith('.')
  )
}

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  return lastDot === -1 ? '' : filename.slice(lastDot).toLowerCase()
}

function getMimeType(filename: string): string {
  const ext = getExtension(filename)
  return MIME_TYPES[ext] || 'application/octet-stream'
}

function isSupportedFile(filename: string): boolean {
  const ext = getExtension(filename)
  return SUPPORTED_EXTENSIONS.includes(ext)
}

export async function extractFilesFromZip(
  buffer: Buffer
): Promise<ExtractedFile[]> {
  try {
    const JSZip = await import('jszip')
    const zip = new JSZip.default()
    await zip.loadAsync(buffer)

    const extractedFiles: ExtractedFile[] = []

    for (const [filename, file] of Object.entries(zip.files)) {
      // Skip directories
      if (file.dir) {
        continue
      }

      // Skip unwanted files
      if (shouldSkipFile(filename)) {
        continue
      }

      // Only extract supported files
      if (!isSupportedFile(filename)) {
        continue
      }

      try {
        const fileBuffer = await file.async('nodebuffer')
        extractedFiles.push({
          filename,
          buffer: fileBuffer,
          mimeType: getMimeType(filename),
          size: fileBuffer.length,
        })
      } catch (e) {
        console.error(`[zip-extractor] failed to extract ${filename}:`, e)
      }
    }

    return extractedFiles
  } catch (e) {
    console.error('[zip-extractor] error extracting files:', e)
    return []
  }
}
