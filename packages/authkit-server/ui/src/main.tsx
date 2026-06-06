import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import {
  AuthkitClientProvider,
  createAuthkitQueryClient,
} from '@dudousxd/adonis-authkit-react'
import { ThemeProvider } from './lib/theme'
import { RouterProvider } from './lib/router'
import { ToastProvider } from './lib/toast'
import { App } from './app'
import './styles/globals.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

const queryClient = createAuthkitQueryClient()

createRoot(root).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthkitClientProvider>
        <ThemeProvider>
          <RouterProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </RouterProvider>
        </ThemeProvider>
      </AuthkitClientProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
