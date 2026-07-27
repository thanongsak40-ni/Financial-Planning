import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import { YearProvider } from './hooks/useYear'
import { Spinner } from './components/ui'
import SetupNotice from './pages/SetupNotice'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Milestone from './pages/Milestone'
import Grid from './pages/Grid'
import Compare from './pages/Compare'
import Savings from './pages/Savings'
import Allocation from './pages/Allocation'
import Portfolio from './pages/Portfolio'
import Balance from './pages/Balance'
import Goals from './pages/Goals'
import Tax from './pages/Tax'
import Settings from './pages/Settings'

function Protected({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid h-full place-items-center"><Spinner /></div>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

export default function App() {
  const { isConfigured, user, loading } = useAuth()

  // ยังไม่ได้ตั้งค่า Supabase → แสดงหน้าแนะนำวิธีตั้งค่าแทนหน้าจอขาว
  if (!isConfigured) return <SetupNotice />

  return (
    <Routes>
      <Route
        path="/login"
        element={loading ? <div className="grid h-full place-items-center"><Spinner /></div> : user ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/*"
        element={
          <Protected>
            <YearProvider>
              <Layout>
                <Routes>
                  <Route index element={<Dashboard />} />
                  <Route path="milestone" element={<Milestone />} />
                  <Route path="actual" element={<Grid type="actual" />} />
                  <Route path="plan" element={<Grid type="plan" />} />
                  <Route path="compare" element={<Compare />} />
                  <Route path="savings" element={<Savings />} />
                  <Route path="allocation" element={<Allocation />} />
                  <Route path="portfolio" element={<Portfolio />} />
                  <Route path="balance" element={<Balance />} />
                  <Route path="goals" element={<Goals />} />
                  <Route path="tax" element={<Tax />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </YearProvider>
          </Protected>
        }
      />
    </Routes>
  )
}
