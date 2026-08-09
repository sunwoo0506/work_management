import { useState } from 'react'
import { Card, LaterNote, PageHeader } from '../components/ui'
import DirectiveList from '../features/directives/DirectiveList'
import { useDirectives } from '../features/directives/hooks'
import HandoverList from '../features/base/HandoverList'
import ContactList from '../features/base/ContactList'
import SettingsPanel from '../features/base/SettingsPanel'

const VIEWS = ['지시사항', '인수인계', '연락처', '설정'] as const
type View = (typeof VIEWS)[number]

export default function BasePage() {
  const today = new Date()
  const [view, setView] = useState<View>('지시사항')
  const { data: directives } = useDirectives()

  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title="기준"
        description="바뀌지 않는 것들. 지시사항·인수인계·연락처·설정이 여기 모입니다."
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
          <div className="grid grid-cols-[1fr_320px] gap-5 items-start">
            <Card title="지시사항" count={directives?.length ?? 0}>
              <p className="text-caption text-ink-mute mb-3">
                업무를 지시사항에 연결하면 여기에 진행률이 합산됩니다.
              </p>
              <DirectiveList today={today} />
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
        {view === '설정' && <SettingsPanel />}
      </div>
    </div>
  )
}
