export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse a des problèmes avec Next.js App Router — import dynamique requis
    // On passe les options pour éviter qu'il lise des fichiers de test
    const pdfParseModule = await import('pdf-parse/lib/pdf-parse.js')
    const pdfParse = pdfParseModule.default ?? pdfParseModule

    const data = await pdfParse(buffer, {
      // Éviter le chargement de fichiers de test internes à pdf-parse
      max: 0,
    })

    if (!data || !data.text) return ''
    return data.text
  } catch (e) {
    console.error('[pdf-parser] Erreur extraction:', e)
    // Fallback: essayer l'import standard
    try {
      const pdfParseModule2 = await import('pdf-parse')
      const pdfParse2 = (pdfParseModule2 as any).default ?? pdfParseModule2
      const data2 = await pdfParse2(buffer)
      return data2?.text || ''
    } catch (e2) {
      console.error('[pdf-parser] Fallback échoué:', e2)
      return ''
    }
  }
}
