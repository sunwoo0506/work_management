import { useState } from 'react'
import { PageHeader } from '../components/ui'
import PlanPanel from '../features/plans/PlanPanel'
import MilestoneList from '../features/plans/MilestoneList'
import EventList from '../features/plans/EventList'

const VIEWS = ['계획', '마일스톤', '일정'] as const
type View = (typeof VIEWS)[number]

export default function PlanPage() {
  const [view, setView] = useState<View>('계획')

  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title="계획"
        description="주 단위·월 단위로 미리 배치하고 되돌아보는 곳입니다."
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
        {view === '계획' && <PlanPanel />}
        {view === '마일스톤' && <MilestoneList />}
        {view === '일정' && <EventList />}
      </div>
    </div>
  )
}
