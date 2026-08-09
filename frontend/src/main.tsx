import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import AuthGate from './features/auth/AuthGate'
import CompanyProvider from './features/companies/CompanyProvider'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 하루 종일 켜두는 도구라 창을 옮길 때마다 다시 부르지 않는다
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: 1,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthGate>
        <CompanyProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </CompanyProvider>
      </AuthGate>
    </QueryClientProvider>
  </StrictMode>,
)
