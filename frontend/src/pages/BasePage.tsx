import { useState } from 'react'
import { Card, LaterNote, PageHeader } from '../components/ui'
import DirectiveList from '../features/directives/DirectiveList'
import { useDirectives } from '../features/directives/hooks'
import HandoverList from '../features/base/HandoverList'
import ContactList from '../features/base/ContactList'
import TaskDetail from '../features/tasks/TaskDetail'
import { useTasks } from '../features/tasks/hooks'

/*
  「설정」은 2026-09-08 에 별도 탭(/settings)으로 떼어냈다.
  여기 남은 셋은 **일하다가 들춰 보는 자료**이고, 설정은 **툴이 어떻게 동작할지
  정하는 곳**이라 성격이 다르다. 자주 여는 것과 어쩌다 여는 것을 한 페이지에
  묶어 두면 어쩌다 여는 쪽을 못 찾는다 — 실제로 못 찾으셨다.
*/
const VIEWS = ['지시사항', '인수인계', '연락처'] as const
type View = (typeof VIEWS)[number]

export default function BasePage() {
  const today = new Date()
  const [view, setView] = useState<View>('지시사항')
  const { data: directives } = useDirectives()
  // 업무 객체가 아니라 id 만 들고 있는다 — 이유는 WorkPage 주석 참고
  const { data: tasks } = useTasks()
  const [openId, setOpenId] = useState<string | null>(null)
  const open = (tasks ?? []).find((t) => t.id === openId) ?? null

  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title="기준"
        description="바뀌지 않는 것들. 지시사항·인수인계·연락처가 여기 모입니다."
      />

      <div className="flex gap-1.5 mt-5">
        {VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={[
              'text-caption rounded-full px-3 py-1.5 border',
              view === v
                ? 'text-action border-action font-semibold'
                : 'text-ink-mute border-hairline hover:text-ink',
            ].join(' ')}
          >
            {v}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {view === '지시사항' && (
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
            <Card title="지시사항" count={directives?.length ?? 0}>
              <p className="text-caption text-ink-mute mb-3">
                줄을 누르면 <strong className="font-semibold">무엇을 · 왜 먼저인가 · 딸린 업무</strong>가
                펼쳐집니다. 업무를 지시사항에 연결하면 여기에 진행률이 합산됩니다.
              </p>
              <DirectiveList today={today} onOpenTask={(t) => setOpenId(t.id)} />
            </Card>

            <Card title="앞으로 들어올 것">
              <ul className="space-y-2.5">
                <li>
                  <LaterNote stage={6}>
                    이슈 발행 — 경영관리서비스로 내보내기
                  </LaterNote>
                </li>
                <li>
                  <LaterNote stage="나중에">
                    업체 관리 — 두 번째 업체가 생길 때 만듭니다
                  </LaterNote>
                </li>
              </ul>
            </Card>
          </div>
        )}
        {view === '인수인계' && <HandoverList />}
        {view === '연락처' && <ContactList />}
      </div>

      {open && <TaskDetail task={open} onClose={() => setOpenId(null)} />}
    </div>
  )
}
