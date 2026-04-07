import Anthropic from '@anthropic-ai/sdk'

function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.')
  return lastDot === -1 ? '' : filename.slice(lastDot).toLowerCase()
}

function determineMediaType(
  filename: string
): 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' {
  const ext = getExtension(filename)

  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.gif':
      return 'image/gif'
    case '.webp':
      return 'image/webp'
    default:
      // Default to jpeg for unknown image types
      return 'image/jpeg'
  }
}

export async function extractTextFromImage(
  buffer: Buffer,
  filename: string
): Promise<string> {
  try {
    const client = new Anthropic()
    const mediaType = determineMediaType(filename)
    const base64 = buffer.toString('base64')

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64,
              },
            },
            {
              type: 'text',
              text: 'Please extract and return ALL text visible in this image. Include everything you can read: headings, paragraphs, tables, lists, labels, captions, watermarks, and any other text content. Format the text clearly and maintain the document structure as much as possible.',
            },
          ],
        },
      ],
    })

    const textContent = response.content.find((block) => block.type === 'text')
    if (textContent && textContent.type === 'text') {
      return textContent.text
    }

    return ''
  } catch (e) {
    console.error('[image-parser] error extracting text:', e)
    return ''
  }
}
