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
    // 좁은 화면(폰·탭 세로)에서는 메뉴가 위로 올라가므로 세로로 쌓는다
    <div className="flex flex-col lg:flex-row min-h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 min-w-0 px-4 py-5 lg:px-10 lg:py-8 overflow-x-hidden">
        <Routes>
          {/* 첫 화면은 「오늘」. 1단계 데이터로 만들 수 있는 블록만 채워져 있다 */}
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<TodayPage />} />
          <Route path="/work" element={<WorkPage />} />
          <Route path="/procedure" element={<ProcedurePage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/record" element={<RecordPage />} />
          <Route path="/base" element={<BasePage />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </main>
    </div>
  )
}
