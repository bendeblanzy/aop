import {
  Document, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  Packer, ShadingType, PageOrientation, convertInchesToTwip,
  UnderlineType, Header, Footer, PageNumber, NumberFormat,
} from 'docx'

// ─── Couleurs & styles ───────────────────────────────────────────────────────
const BLUE_DARK = '1E3A5F'   // bleu marine officiel
const BLUE_MED  = '2563EB'   // bleu primaire
const GREY_BG   = 'F3F4F6'   // fond gris clair pour en-têtes de tableau
const GREY_LINE = 'D1D5DB'   // bordure grise
const WHITE     = 'FFFFFF'

// ─── Helpers typographiques ──────────────────────────────────────────────────
function run(text: string, opts: Partial<{
  bold: boolean; italic: boolean; size: number; color: string; underline: boolean
}> = {}) {
  return new TextRun({
    text,
    bold: opts.bold ?? false,
    italics: opts.italic ?? false,
    size: (opts.size ?? 11) * 2,        // docx uses half-points
    color: opts.color ?? '111827',
    underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
    font: 'Arial',
  })
}

function para(children: TextRun[], opts: Partial<{
  align: AlignmentType; spaceBefore: number; spaceAfter: number; indent: number
}> = {}) {
  return new Paragraph({
    children,
    alignment: opts.align ?? AlignmentType.LEFT,
    spacing: { before: (opts.spaceBefore ?? 0) * 20, after: (opts.spaceAfter ?? 60) * 20 },
    indent: opts.indent ? { left: opts.indent * 20 } : undefined,
  })
}

function heading1(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 28, color: WHITE, font: 'Arial' })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0 },
    shading: { type: ShadingType.SOLID, color: BLUE_DARK, fill: BLUE_DARK },
    indent: { left: 200, right: 200 },
  })
}

function heading2(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 22, color: BLUE_DARK, font: 'Arial' })],
    spacing: { before: 300, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: BLUE_MED } },
  })
}

function heading3(text: string) {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 20, color: '374151', font: 'Arial' })],
    spacing: { before: 200, after: 80 },
  })
}

// ─── Tableau formulaire (label | valeur) ─────────────────────────────────────
function formRow(label: string, value: string, highlight = false) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 35, type: WidthType.PERCENTAGE },
        shading: highlight
          ? { type: ShadingType.SOLID, color: GREY_BG, fill: GREY_BG }
          : undefined,
        margins: { top: 80, bottom: 80, left: 120, right: 80 },
        borders: formBorders(),
        children: [new Paragraph({
          children: [new TextRun({ text: label, bold: true, size: 20, color: '374151', font: 'Arial' })],
        })],
      }),
      new TableCell({
        width: { size: 65, type: WidthType.PERCENTAGE },
        margins: { top: 80, bottom: 80, left: 120, right: 80 },
        borders: formBorders(),
        children: [new Paragraph({
          children: [new TextRun({ text: value || '[À compléter]', size: 20, color: value ? '111827' : '9CA3AF', font: 'Arial' })],
        })],
      }),
    ],
  })
}

function sectionHeaderRow(text: string) {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        shading: { type: ShadingType.SOLID, color: BLUE_DARK, fill: BLUE_DARK },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        borders: formBorders(),
        children: [new Paragraph({
          children: [new TextRun({ text, bold: true, size: 22, color: WHITE, font: 'Arial' })],
        })],
      }),
    ],
  })
}

function formBorders() {
  const b = { style: BorderStyle.SINGLE, size: 4, color: GREY_LINE }
  return { top: b, bottom: b, left: b, right: b }
}

function formTable(rows: TableRow[]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE } },
    rows,
  })
}

// ─── Tableau à deux colonnes (données) ───────────────────────────────────────
function dataTable(headers: string[], rows: string[][], widths?: number[]) {
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      width: { size: widths?.[i] ?? Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
      shading: { type: ShadingType.SOLID, color: BLUE_DARK, fill: BLUE_DARK },
      margins: { top: 80, bottom: 80, left: 120, right: 80 },
      borders: formBorders(),
      children: [new Paragraph({
        children: [new TextRun({ text: h, bold: true, size: 20, color: WHITE, font: 'Arial' })],
      })],
    })),
  })
  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map((cell, ci) => new TableCell({
      width: { size: widths?.[ci] ?? Math.floor(100 / headers.length), type: WidthType.PERCENTAGE },
      shading: ri % 2 === 1 ? { type: ShadingType.SOLID, color: GREY_BG, fill: GREY_BG } : undefined,
      margins: { top: 80, bottom: 80, left: 120, right: 80 },
      borders: formBorders(),
      children: [new Paragraph({
        children: [new TextRun({ text: cell || '—', size: 20, font: 'Arial' })],
      })],
    })),
  }))
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  })
}

function spacer(lines = 1) {
  return Array.from({ length: lines }, () => new Paragraph({
    children: [new TextRun({ text: ' ' })],
    spacing: { before: 0, after: 100 },
  }))
}

// ─── Document de base (mémoire technique et autres documents libres) ──────────
export async function generateDocx(title: string, sections: { title: string; content: string }[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    heading1(title),
    ...spacer(1),
  ]

  for (const section of sections) {
    children.push(heading2(section.title))
    const lines = section.content.split('\n').filter(l => l.trim())
    for (const line of lines) {
      const isBullet = line.trim().startsWith('-') || line.trim().startsWith('•')
      children.push(new Paragraph({
        children: [run(line.trim().replace(/^[-•]\s*/, ''))],
        bullet: isBullet ? { level: 0 } : undefined,
        spacing: { after: 80 },
      }))
    }
    children.push(...spacer(1))
  }

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    sections: [{
      properties: {
        page: {
          margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1) },
        },
      },
      children: children as Paragraph[],
    }],
  })

  return await Packer.toBuffer(doc)
}

// ─── DC1 — Lettre de candidature ─────────────────────────────────────────────
export async function generateDC1Docx(data: Record<string, string>): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    heading1('DC1 — LETTRE DE CANDIDATURE'),
    para([run('Habilitation du mandataire par ses co-traitants', { italic: true, color: '6B7280' })], { align: AlignmentType.CENTER }),
    para([run('CERFA n° 12156 — Direction des Affaires Juridiques', { italic: true, size: 9, color: '9CA3AF' })], { align: AlignmentType.CENTER }),
    ...spacer(1),

    formTable([
      sectionHeaderRow('A — IDENTIFICATION DE L\'ACHETEUR PUBLIC'),
      formRow('Nom de l\'acheteur', data.acheteur_nom),
      formRow('Adresse', data.acheteur_adresse),
      sectionHeaderRow('B — OBJET DU MARCHÉ'),
      formRow('Objet du marché', data.objet_marche),
      formRow('Référence / numéro', data.reference_marche),
      formRow('Lot(s) candidaté(s)', data.lots_candidats || 'Marché global (sans allotissement)'),
      sectionHeaderRow('C — IDENTIFICATION DU CANDIDAT'),
      formRow('Dénomination sociale', data.raison_sociale),
      formRow('Numéro SIRET', data.siret),
      formRow('Forme juridique', data.forme_juridique || '[À compléter]'),
      formRow('Adresse du siège social', data.adresse_siege),
      formRow('Code postal — Ville', `${data.code_postal || ''} ${data.ville || ''}`.trim() || '[À compléter]'),
      formRow('N° TVA intracommunautaire', data.numero_tva || '[Si applicable]'),
      formRow('Représentant habilité (civilité)', data.representant_civilite),
      formRow('Nom du représentant', data.representant_nom),
      formRow('Prénom du représentant', data.representant_prenom),
      formRow('Qualité / fonction', data.representant_qualite || '[À compléter]'),
    ]),
    ...spacer(1),

    // Section D - Groupement
    formTable([
      sectionHeaderRow('D — CAS DE GROUPEMENT (remplir uniquement si applicable)'),
      formRow('Le candidat est-il en groupement ?', data.groupement === 'oui' ? 'OUI' : 'NON'),
      formRow('Type de groupement', data.groupement === 'oui' ? (data.type_groupement || '[À préciser]') : 'Sans objet'),
      formRow('Mandataire du groupement', data.groupement === 'oui' ? (data.mandataire || '[À préciser]') : 'Sans objet'),
    ]),
    ...spacer(1),

    // Section E - Déclarations
    heading2('E — DÉCLARATIONS SUR L\'HONNEUR'),
    para([run('Je soussigné(e), représentant habilité du candidat, déclare sur l\'honneur que :', { bold: true })]),
    para([run('1. Les renseignements fournis dans le présent document sont exacts et complets.')], { indent: 200 }),
    para([run('2. Le candidat n\'entre dans aucun des cas d\'exclusion prévus aux articles L. 2141-1 à L. 2141-14 du code de la commande publique.')], { indent: 200 }),
    para([run('3. Le candidat est en règle au regard de ses obligations fiscales et sociales.')], { indent: 200 }),
    para([run('4. Le candidat dispose des capacités techniques, professionnelles et financières pour exécuter le marché.')], { indent: 200 }),
    ...spacer(1),

    // Section F - Signature
    heading2('F — SIGNATURE'),
    formTable([
      formRow('Fait à', data.lieu_signature || '[Ville]'),
      formRow('Le', data.date_signature || new Date().toLocaleDateString('fr-FR')),
      formRow('Nom et prénom du signataire', `${data.representant_prenom || ''} ${data.representant_nom || ''}`.trim()),
      formRow('Qualité du signataire', data.representant_qualite || '[Qualité]'),
      new TableRow({
        children: [
          new TableCell({
            columnSpan: 2,
            margins: { top: 300, bottom: 300, left: 120, right: 120 },
            borders: formBorders(),
            children: [
              new Paragraph({ children: [run('Signature :', { bold: true })] }),
              new Paragraph({ children: [run(' ')] }),
              new Paragraph({ children: [run(' ')] }),
              new Paragraph({ children: [run('(Cachet de l\'entreprise)', { italic: true, color: '6B7280', size: 9 })] }),
            ],
          }),
        ],
      }),
    ]),
    ...spacer(1),
    para([run('⚠ Ce document DC1 doit être complété, signé et accompagné des pièces justificatives listées dans le Règlement de Consultation.', { italic: true, size: 9, color: '6B7280' })], { align: AlignmentType.CENTER }),
  ]

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: convertInchesToTwip(0.8), bottom: convertInchesToTwip(0.8), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1) } } },
      children: children as Paragraph[],
    }],
  })
  return await Packer.toBuffer(doc)
}

// ─── DC2 — Déclaration du candidat ───────────────────────────────────────────
export async function generateDC2Docx(data: Record<string, any>): Promise<Buffer> {
  const refs: any[] = data.references_selectionnees || []
  const children: (Paragraph | Table)[] = [
    heading1('DC2 — DÉCLARATION DU CANDIDAT'),
    para([run('Individuel ou membre du groupement', { italic: true, color: '6B7280' })], { align: AlignmentType.CENTER }),
    para([run('CERFA n° 12571 — Direction des Affaires Juridiques', { italic: true, size: 9, color: '9CA3AF' })], { align: AlignmentType.CENTER }),
    ...spacer(1),

    formTable([
      sectionHeaderRow('A — IDENTIFICATION DU CANDIDAT'),
      formRow('Dénomination sociale', data.raison_sociale),
      formRow('Numéro SIRET', data.siret),
      formRow('Forme juridique', data.forme_juridique || '[À compléter]'),
      formRow('Date de création', data.date_creation || '[À compléter]'),
      formRow('Capital social (€)', data.capital_social ? `${Number(data.capital_social).toLocaleString('fr-FR')} €` : '[À compléter]'),
      formRow('Adresse siège social', data.adresse_siege || '[À compléter]'),
      formRow('Code postal — Ville', `${data.code_postal || ''} ${data.ville || ''}`.trim() || '[À compléter]'),
      formRow('N° TVA intracommunautaire', data.numero_tva || '[Si applicable]'),
      formRow('Code NAF/APE', data.code_naf || '[À compléter]'),
      formRow('Représentant légal', `${data.representant_prenom || ''} ${data.representant_nom || ''}`.trim()),
      formRow('Qualité du représentant', data.representant_qualite || '[À compléter]'),
    ]),
    ...spacer(1),

    formTable([
      sectionHeaderRow('B — SITUATION JURIDIQUE (Déclarations sur l\'honneur)'),
      formRow('Non-interdiction de soumissionner', data.declaration_non_interdiction ? '✓ OUI — Déclaré conforme' : '[À compléter]'),
      formRow('À jour obligations fiscales', data.declaration_a_jour_fiscal ? '✓ OUI — Déclaré conforme' : '[À compléter]'),
      formRow('À jour obligations sociales', data.declaration_a_jour_social ? '✓ OUI — Déclaré conforme' : '[À compléter]'),
    ]),
    ...spacer(1),

    formTable([
      sectionHeaderRow('C — CAPACITÉ ÉCONOMIQUE ET FINANCIÈRE'),
      formRow('Chiffre d\'affaires N-1 (€)', data.ca_n1 ? `${Number(data.ca_n1).toLocaleString('fr-FR')} €` : '[À renseigner]'),
      formRow('Chiffre d\'affaires N-2 (€)', data.ca_n2 ? `${Number(data.ca_n2).toLocaleString('fr-FR')} €` : '[À renseigner]'),
      formRow('Chiffre d\'affaires N-3 (€)', data.ca_n3 ? `${Number(data.ca_n3).toLocaleString('fr-FR')} €` : '[À renseigner]'),
      formRow('Effectif moyen annuel', data.effectif ? `${data.effectif} salariés` : '[À renseigner]'),
    ]),
    ...spacer(1),
  ]

  // Section D - Références
  children.push(heading2('D — CAPACITÉS TECHNIQUES ET PROFESSIONNELLES'))
  if (refs.length > 0) {
    children.push(
      dataTable(
        ['Intitulé du marché', 'Acheteur public', 'Année', 'Montant (€)'],
        refs.map(r => [
          r.intitule_marche || '',
          r.acheteur_public || '',
          String(r.annee_execution || ''),
          r.montant ? `${Number(r.montant).toLocaleString('fr-FR')} €` : '—',
        ]),
        [40, 30, 10, 20]
      )
    )
  } else {
    children.push(para([run('Aucune référence renseignée. Complétez votre profil pour inclure vos références.', { italic: true, color: '6B7280' })]))
  }

  // Certifications
  children.push(...spacer(1))
  children.push(formTable([
    sectionHeaderRow('E — CERTIFICATIONS ET QUALIFICATIONS'),
    formRow('Certifications', (data.certifications || []).join(', ') || 'Aucune certification renseignée'),
    formRow('Assurance RC pro n°', data.assurance_rc_numero || '[À compléter]'),
    formRow('Compagnie d\'assurance RC', data.assurance_rc_compagnie || '[À compléter]'),
    formRow('Validité assurance RC', data.assurance_rc_expiration || '[À compléter]'),
  ]))
  children.push(...spacer(1))

  // Signature
  children.push(heading2('F — DÉCLARATION SUR L\'HONNEUR ET SIGNATURE'))
  children.push(para([run('Je soussigné(e) certifie l\'exactitude des informations fournies dans le présent document et atteste sur l\'honneur de la capacité du candidat à exécuter les prestations demandées.')]))
  children.push(...spacer(1))
  children.push(formTable([
    formRow('Fait à', data.lieu_signature || '[Ville]'),
    formRow('Le', data.date_signature || new Date().toLocaleDateString('fr-FR')),
    formRow('Nom et prénom', `${data.representant_prenom || ''} ${data.representant_nom || ''}`.trim()),
    new TableRow({
      children: [
        new TableCell({
          columnSpan: 2,
          margins: { top: 400, bottom: 400, left: 120, right: 120 },
          borders: formBorders(),
          children: [
            new Paragraph({ children: [run('Signature et cachet :')] }),
            new Paragraph({ children: [run(' ')] }),
            new Paragraph({ children: [run(' ')] }),
          ],
        }),
      ],
    }),
  ]))

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: convertInchesToTwip(0.8), bottom: convertInchesToTwip(0.8), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1) } } },
      children: children as Paragraph[],
    }],
  })
  return await Packer.toBuffer(doc)
}

// ─── Mémoire technique (document libre, bien formaté) ────────────────────────
export async function generateMemoireDocx(titre: string, sections: { title: string; content: string }[]): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    heading1(`MÉMOIRE TECHNIQUE\n${titre}`),
    ...spacer(2),
  ]

  for (let i = 0; i < sections.length; i++) {
    const s = sections[i]
    children.push(heading2(`${i + 1}. ${s.title}`))
    const lines = s.content.split('\n').filter(l => l.trim())
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('###') ) {
        children.push(heading3(trimmed.replace(/^###\s*/, '')))
      } else if (trimmed.startsWith('##')) {
        children.push(heading2(trimmed.replace(/^##\s*/, '')))
      } else if (trimmed.startsWith('-') || trimmed.startsWith('•')) {
        children.push(new Paragraph({
          children: [run(trimmed.replace(/^[-•]\s*/, ''))],
          bullet: { level: 0 },
          spacing: { after: 60 },
        }))
      } else if (trimmed) {
        children.push(para([run(trimmed)], { spaceAfter: 8 }))
      }
    }
    children.push(...spacer(1))
  }

  const doc = new Document({
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 } } },
    },
    sections: [{
      properties: { page: { margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(1), left: convertInchesToTwip(1.2), right: convertInchesToTwip(1) } } },
      headers: {
        default: new Header({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'MÉMOIRE TECHNIQUE — ', bold: true, size: 16, color: BLUE_DARK, font: 'Arial' }),
              new TextRun({ text: titre, size: 16, color: '6B7280', font: 'Arial' }),
            ],
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: GREY_LINE } },
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            children: [
              new TextRun({ text: 'Page ', size: 16, font: 'Arial', color: '9CA3AF' }),
              new PageNumber({ format: NumberFormat.DECIMAL }),
            ],
            alignment: AlignmentType.RIGHT,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: GREY_LINE } },
          })],
        }),
      },
      children: children as Paragraph[],
    }],
  })
  return await Packer.toBuffer(doc)
}
