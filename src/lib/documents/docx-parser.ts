import mammoth from 'mammoth'

export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  } catch (e) {
    console.error('DOCX parse error:', e)
    return ''
  }
}
