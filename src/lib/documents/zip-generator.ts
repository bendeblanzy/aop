import archiver from 'archiver'
import { Readable } from 'stream'

export async function generateZip(files: { name: string; buffer: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } })
    const chunks: Buffer[] = []

    archive.on('data', (chunk) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)

    for (const file of files) {
      archive.append(Readable.from(file.buffer), { name: file.name })
    }

    archive.finalize()
  })
}
