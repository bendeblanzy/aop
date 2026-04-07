export async function extractTextFromXlsx(buffer: Buffer): Promise<string> {
  try {
    const XLSX = await import('xlsx')
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    const sheets: string[] = []

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName]
      const csvText = XLSX.utils.sheet_to_csv(worksheet)

      sheets.push(`Sheet: ${sheetName}`)
      sheets.push(csvText.trim())
      sheets.push('')
    }

    return sheets.join('\n')
  } catch (e) {
    console.error('[xlsx-parser] error extracting text:', e)
    return ''
  }
}
