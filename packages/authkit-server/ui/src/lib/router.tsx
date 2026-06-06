import React, { createContext, useContext, useState, useCallback } from 'react'

type Route =
  | 'overview'
  | 'users'
  | 'sessions'
  | 'clients'
  | 'roles'
  | 'orgs'
  | 'audit'
  | 'settings'

interface RouterCtx {
  route: Route
  navigate: (r: Route) => void
}

const Ctx = createContext<RouterCtx>({ route: 'overview', navigate: () => {} })

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<Route>(() => {
    const hash = window.location.hash.replace('#', '') as Route
    const valid: Route[] = ['overview', 'users', 'sessions', 'clients', 'roles', 'orgs', 'audit', 'settings']
    return valid.includes(hash) ? hash : 'overview'
  })

  const navigate = useCallback((r: Route) => {
    window.location.hash = r
    setRoute(r)
  }, [])

  return <Ctx.Provider value={{ route, navigate }}>{children}</Ctx.Provider>
}

export function useRouter() {
  return useContext(Ctx)
}
