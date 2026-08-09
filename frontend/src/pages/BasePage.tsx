import { Card, LaterNote, PageHeader } from '../components/ui'
import DirectiveList from '../features/directives/DirectiveList'
import { useDirectives } from '../features/directives/hooks'

export default function BasePage() {
  const today = new Date()
  const { data: directives } = useDirectives()

  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title="기준"
        description="바뀌지 않는 것들. 지시사항·인수인계·연락처·설정이 여기 모입니다."
      />

      <div className="grid grid-cols-[1fr_320px] gap-5 mt-6 items-start">
        <Card
          title="지시사항"
          count={directives?.length ?? 0}
        >
          <p className="text-caption text-ink-mute mb-3">
            업무를 지시사항에 연결하면 여기에 진행률이 합산됩니다.
          </p>
          <DirectiveList today={today} />
        </Card>

        <div className="space-y-5">
          <Card title="앞으로 들어올 것">
            <ul className="space-y-2.5">
              <li><LaterNote stage={7}>인수인계 · 연락처</LaterNote></li>
              <li><LaterNote stage={7}>설정 — 업무영역 분류, 사내 용어집</LaterNote></li>
              <li>
                <LaterNote stage="나중에">
                  업체 관리 — 두 번째 업체가 생길 때 만듭니다
                </LaterNote>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  )
}
