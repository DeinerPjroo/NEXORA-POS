import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { ApiError } from './lib/api'
import { ToastProvider } from './components/ui'
import { SessionProvider } from './features/auth/SessionProvider'
import './styles.css'

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => count < 1 && (!(error instanceof ApiError) || error.status >= 500),
      refetchOnWindowFocus: true,
      staleTime: 15_000,
    },
  },
})
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <BrowserRouter>
        <SessionProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
)
