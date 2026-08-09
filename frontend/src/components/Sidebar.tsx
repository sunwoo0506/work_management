import { NavLink } from 'react-router-dom'
import { useCompany } from '../features/companies/useCompany'
import { useSignOut } from '../features/auth/useSignOut'
import QuickAdd from './QuickAdd'
import Glance from './Glance'

const MENU = [
  { to: '/today', icon: '📌', label: '오늘' },
  { to: '/work', icon: '📋', label: '업무' },
  { to: '/procedure', icon: '⚙️', label: '절차' },
  { to: '/plan', icon: '🗓', label: '계획' },
  { to: '/record', icon: '✏️', label: '기록' },
  { to: '/base', icon: '📖', label: '기준' },
]

export default function Sidebar() {
  const { companies, company, setCompanyId, showSelector } = useCompany()
  const signOut = useSignOut()

  return (
    <aside className="w-[248px] shrink-0 h-screen sticky top-0 bg-parchment border-r border-hairline
                      flex flex-col px-5 py-6 overflow-y-auto">
      {/* 업체가 1개면 셀렉터를 숨긴다 (설계서 §5.9) */}
      {showSelector && (
        <select
          value={company?.id ?? ''}
          onChange={(e) => setCompanyId(e.target.value)}
          className="w-full text-caption bg-canvas border border-hairline rounded-md px-3 py-2 mb-6"
          aria-label="업체 선택"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      )}

      <QuickAdd />

      <nav className="mt-7">
        <p className="text-caption text-ink-mute px-2 mb-2">메뉴</p>
        <ul>
          {MENU.map((m) => (
            <li key={m.to}>
              <NavLink
                to={m.to}
                className={({ isActive }) =>
                  [
                    'flex items-center gap-2.5 px-2 py-2 rounded-md text-body',
                    isActive ? 'text-action font-semibold' : 'text-ink-soft hover:bg-canvas',
                  ].join(' ')
                }
              >
                <span aria-hidden className="w-5 text-center">{m.icon}</span>
                {m.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <Glance />

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={signOut}
          className="text-caption text-ink-mute hover:text-ink"
        >
          로그아웃
        </button>
      </div>
    </aside>
  )
}
