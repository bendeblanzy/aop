// Dynamic import to avoid build issues
export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParseModule = await import('pdf-parse') as any
    const pdfParse = pdfParseModule.default ?? pdfParseModule
    const data = await pdfParse(buffer)
    return data.text
  } catch (e) {
    console.error('PDF parse error:', e)
    return ''
  }
}
