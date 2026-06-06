import React, { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light'

const Ctx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('authkit-theme') as Theme) || 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    try {
      localStorage.setItem('authkit-theme', theme)
    } catch {
      // ignore
    }
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))

  return <Ctx.Provider value={{ theme, toggle }}>{children}</Ctx.Provider>
}

export function useTheme() {
  return useContext(Ctx)
}
