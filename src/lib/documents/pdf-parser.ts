export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const { extractText } = await import('unpdf')
    const uint8 = new Uint8Array(buffer)
    const { text } = await extractText(uint8, { mergePages: true })
    return text || ''
  } catch (e) {
    console.error('[pdf-parser] unpdf erreur:', e)
    return ''
  }
}
