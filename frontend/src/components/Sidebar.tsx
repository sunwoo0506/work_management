import { NavLink } from 'react-router-dom'
import { useCompany } from '../features/companies/useCompany'
import { useSignOut } from '../features/auth/useSignOut'
import QuickAdd from './QuickAdd'
import Glance from './Glance'

/**
 * 메뉴.
 *
 * ── 화면 폭에 따라 **모양이 바뀐다** ─────────────────────
 *   넓은 화면(노트북)  왼쪽에 세로로 선다 — 지금까지의 모습
 *   좁은 화면(폰·탭)   **위쪽 가로 줄**로 눕는다
 *
 * 왜 클래스 하나로 안 되나 — 세로 기둥과 가로 줄은 「같은 것의 다른 크기」가
 * 아니라 **다른 물건**이다. 좁은 화면에서는 「오늘 한눈에」와 빠른 입력을
 * 접어 두어야 하고, 메뉴는 옆으로 밀어 보게 해야 한다.
 * 억지로 한 벌로 만들면 두 쪽 다 어정쩡해진다.
 *
 * 기준은 1024px — 갤럭시탭을 가로로 눕히면 넓은 화면, 세로로 세우거나
 * 폰이면 좁은 화면으로 잡힌다.
 */

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

  const selector = showSelector && (
    <select
      value={company?.id ?? ''}
      onChange={(e) => setCompanyId(e.target.value)}
      className="text-caption bg-canvas border border-hairline rounded-md px-3 py-2"
      aria-label="업체 선택"
    >
      {companies.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </select>
  )

  return (
    <>
      {/* ── 좁은 화면: 위쪽 가로 줄 ──────────────────── */}
      <header
        className="lg:hidden sticky top-0 z-40 bg-parchment border-b border-hairline
                   px-4 pt-3 pb-2"
      >
        <div className="flex items-center gap-3 mb-2">
          {selector}
          <div className="ml-auto flex items-center gap-3">
            <QuickAdd compact />
            <button
              type="button"
              onClick={signOut}
              className="text-caption text-ink-mute shrink-0"
            >
              로그아웃
            </button>
          </div>
        </div>

        {/*
          메뉴 6개를 좁은 화면에 다 넣으면 글자가 뭉갠다.
          가로로 밀어 보게 두되, 미는 막대는 감춘다 — 손가락으로 미는 화면이라
          막대가 보일 이유가 없다
        */}
        <nav className="-mx-4 px-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ul className="flex gap-1 w-max">
            {MENU.map((m) => (
              <li key={m.to}>
                <NavLink
                  to={m.to}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-1.5 px-3 py-2 rounded-full text-body whitespace-nowrap',
                      isActive
                        ? 'text-action font-semibold bg-canvas border border-action'
                        : 'text-ink-soft border border-transparent',
                    ].join(' ')
                  }
                >
                  <span aria-hidden>{m.icon}</span>
                  {m.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* ── 넓은 화면: 왼쪽 기둥 ─────────────────────── */}
      <aside
        className="hidden lg:flex w-[248px] shrink-0 h-screen sticky top-0 bg-parchment
                   border-r border-hairline flex-col px-5 py-6 overflow-y-auto"
      >
        {/* 업체가 1개면 셀렉터를 숨긴다 (설계서 §5.9) */}
        {showSelector && <div className="mb-6 [&>select]:w-full">{selector}</div>}

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
    </>
  )
}
