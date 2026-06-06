import React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from './lib/theme'
import { RouterProvider } from './lib/router'
import { ToastProvider } from './lib/toast'
import { App } from './app'
import './styles/globals.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <React.StrictMode>
    <ThemeProvider>
      <RouterProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </RouterProvider>
    </ThemeProvider>
  </React.StrictMode>
)
