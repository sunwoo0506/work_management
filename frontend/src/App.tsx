import { Navigate, Route, Routes } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import TodayPage from './pages/TodayPage'
import WorkPage from './pages/WorkPage'
import ProcedurePage from './pages/ProcedurePage'
import PlanPage from './pages/PlanPage'
import RecordPage from './pages/RecordPage'
import BasePage from './pages/BasePage'

export default function App() {
  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 px-10 py-8 overflow-x-hidden">
        <Routes>
          {/*
            1단계에서는 「업무」로 보낸다. 「오늘」 화면은 4단계에서 만들어지고,
            그전까지 첫 화면이 자리표시자면 매일 열 이유가 없다.
            4단계에서 이 줄을 지우면 원래 설계(「오늘」이 첫 화면)로 돌아간다.
          */}
          <Route path="/" element={<Navigate to="/work" replace />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/work" element={<WorkPage />} />
          <Route path="/procedure" element={<ProcedurePage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/record" element={<RecordPage />} />
          <Route path="/base" element={<BasePage />} />
          <Route path="*" element={<Navigate to="/work" replace />} />
        </Routes>
      </main>
    </div>
  )
}
