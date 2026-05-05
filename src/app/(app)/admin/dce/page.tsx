/** @deprecated Page admin DCE retirée. Redirige vers le dashboard.
 * (Bug #19 : redirigeait vers /admin qui n'existe pas → 404 brutal sans layout.) */
import { redirect } from 'next/navigation'
export default function DeprecatedAdminDcePage() { redirect('/dashboard') }
