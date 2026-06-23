import React from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { NuqsAdapter } from 'nuqs/adapters/react'
import {
  AuthkitClientProvider,
  createAuthkitQueryClient,
} from '@adonis-agora/authkit-react'
import { ThemeProvider } from './lib/theme'
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
        <NuqsAdapter>
          <ThemeProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </ThemeProvider>
        </NuqsAdapter>
      </AuthkitClientProvider>
    </QueryClientProvider>
  </React.StrictMode>
)
