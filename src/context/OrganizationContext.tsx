'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface OrgContext {
  orgId: string | null
  orgName: string | null
  role: 'admin' | 'member' | null
  loading: boolean
  refresh: () => void
}

const OrganizationContext = createContext<OrgContext>({
  orgId: null,
  orgName: null,
  role: null,
  loading: true,
  refresh: () => {},
})

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<Omit<OrgContext, 'refresh'>>({
    orgId: null,
    orgName: null,
    role: null,
    loading: true,
  })

  async function load() {
    try {
      const res = await fetch('/api/organizations/me')
      if (res.ok) {
        const data = await res.json()
        setCtx({ orgId: data.id, orgName: data.name, role: data.role, loading: false })
      } else {
        setCtx(p => ({ ...p, loading: false }))
      }
    } catch {
      setCtx(p => ({ ...p, loading: false }))
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <OrganizationContext.Provider value={{ ...ctx, refresh: load }}>
      {children}
    </OrganizationContext.Provider>
  )
}

export const useOrganization = () => useContext(OrganizationContext)
