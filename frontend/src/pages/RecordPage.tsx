import { useState } from 'react'
import { Card, LaterNote, PageHeader } from '../components/ui'
import { PillButton } from '../components/Field'
import DailyLogPanel from '../features/daily/DailyLogPanel'
import { shiftDays, ymd } from '../domain/daily'
import ReportPanel from '../features/reports/ReportPanel'

export default function RecordPage() {
  const [offset, setOffset] = useState(0)
  const [view, setView] = useState<'업무일지' | '리포트'>('업무일지')
  const date = shiftDays(new Date(), offset)
  const dateStr = ymd(date)
  const isToday = offset === 0

  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title="기록"
        description="되돌아보는 것들이 모입니다. 연말에 여기 한 곳만 열면 되도록."
        right={
          <div className="flex items-center gap-1.5">
            <PillButton type="button" variant="ghost" onClick={() => setOffset((o) => o - 1)}>
              ← 이전
            </PillButton>
            {!isToday && (
              <PillButton type="button" variant="ghost" onClick={() => setOffset(0)}>
                오늘
              </PillButton>
            )}
            <PillButton
              type="button"
              variant="ghost"
              disabled={isToday}
              onClick={() => setOffset((o) => Math.min(0, o + 1))}
            >
              다음 →
            </PillButton>
          </div>
        }
      />

      <div className="flex gap-1.5 mt-5">
        {(['업무일지', '리포트'] as const).map((v) => (
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

      {view === '리포트' ? (
        <div className="mt-5">
          <ReportPanel />
        </div>
      ) : (
      <div className="grid grid-cols-[1fr_320px] gap-5 mt-6 items-start">
        <div>
          <h2 className="text-tagline font-semibold mb-4">
            업무일지 <span className="text-ink-mute font-normal">{dateStr}</span>
            {isToday && <span className="text-caption text-action ml-2">오늘</span>}
          </h2>
          <DailyLogPanel date={date} />
        </div>

        <div className="space-y-5">
          <Card title="일지가 하는 일">
            <p className="text-body text-ink-soft leading-relaxed">
              일지는 기록이 아니라 <strong className="font-semibold">어제와 오늘을 잇는 장치</strong>입니다.
            </p>
            <ul className="mt-3 space-y-2 text-caption text-ink-mute leading-relaxed">
              <li>· 「이슈·막힌 것」은 다음날 「어제 이야기」에 올라옵니다</li>
              <li>· 「내일 할 일」 중 체크한 것만 업무가 됩니다</li>
              <li>· 확정하면 그날 진행한 업무가 <strong className="font-semibold">굳어서</strong> 나중에 안 변합니다</li>
            </ul>
          </Card>

          <Card title="앞으로 들어올 것">
            <ul className="space-y-2.5">
              <li>
                <LaterNote stage={7}>
                  회의록 · 전화메모 — 폰 녹음을 올리면 회의록이 됩니다
                </LaterNote>
              </li>
            </ul>
          </Card>
        </div>
      </div>
      )}
    </div>
  )
}
