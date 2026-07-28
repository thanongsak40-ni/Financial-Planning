import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { AuthProvider } from './hooks/useAuth'
import { ToastProvider } from './components/Toast'

const queryClient = new QueryClient({
  defaultOptions: {
    // โหมดเต็มจอบนมือถือไม่มีปุ่มรีเฟรชของเบราว์เซอร์ —
    // ดึงข้อมูลใหม่เองเมื่อสลับกลับเข้าแอป (ถ้าข้อมูลเก่ากว่า staleTime)
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  </StrictMode>,
)
