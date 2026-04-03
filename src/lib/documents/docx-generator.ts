import { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, Packer } from 'docx'

interface Section {
  title: string
  content: string | Record<string, unknown>
}

export async function generateDocx(title: string, sections: Section[]): Promise<Buffer> {
  const children: Paragraph[] = [
    new Paragraph({
      text: title,
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
  ]

  for (const section of sections) {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 100 },
      })
    )

    const contentStr = typeof section.content === 'string'
      ? section.content
      : JSON.stringify(section.content, null, 2)

    const lines = contentStr.split('\n')
    for (const line of lines) {
      if (line.trim()) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line, size: 22 })],
            spacing: { after: 100 },
          })
        )
      }
    }
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  })

  return await Packer.toBuffer(doc)
}
