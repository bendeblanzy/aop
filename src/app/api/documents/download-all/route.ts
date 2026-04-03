import { createClient } from '@/lib/supabase/server'
import { adminClient, getOrgIdForUser } from '@/lib/supabase/admin'
import { NextRequest, NextResponse } from 'next/server'
import { generateZip } from '@/lib/documents/zip-generator'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = await getOrgIdForUser(user.id)
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 })

  const { ao_id } = await request.json()
  const { data: ao } = await adminClient.from('appels_offres').select('*').eq('id', ao_id).eq('organization_id', orgId).single()
  if (!ao || !ao.documents_generes?.length) return NextResponse.json({ error: 'No documents' }, { status: 400 })

  const files: { name: string; buffer: Buffer }[] = []
  for (const doc of ao.documents_generes) {
    const res = await fetch(doc.url)
    if (res.ok) {
      files.push({ name: `${doc.type}.docx`, buffer: Buffer.from(await res.arrayBuffer()) })
    }
  }

  const zipBuffer = await generateZip(files)
  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="AO-documents.zip"`,
    },
  })
}
