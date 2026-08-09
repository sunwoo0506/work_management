import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, LaterNote, PageHeader } from '../components/ui'
import { PillButton } from '../components/Field'
import DailyLogPanel from '../features/daily/DailyLogPanel'
import { shiftDays, ymd } from '../domain/daily'
import ReportPanel from '../features/reports/ReportPanel'
import MeetingList from '../features/meetings/MeetingList'
import CallList from '../features/meetings/CallList'

const VIEWS = ['업무일지', '리포트', '회의록', '전화메모'] as const
type View = (typeof VIEWS)[number]

function isView(v: string | null): v is View {
  return VIEWS.includes(v as View)
}

export default function RecordPage() {
  const [offset, setOffset] = useState(0)
  // 빠른 입력에서 「＋ 회의록」을 누르면 /record?view=회의록 으로 들어온다
  const [params, setParams] = useSearchParams()
  const raw = params.get('view')
  const view: View = isView(raw) ? raw : '업무일지'
  const setView = (v: View) => setParams(v === '업무일지' ? {} : { view: v })
  const date = shiftDays(new Date(), offset)
  const dateStr = ymd(date)
  const isToday = offset === 0

  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title="기록"
        description="되돌아보는 것들이 모입니다. 연말에 여기 한 곳만 열면 되도록."
        right={
          view === '업무일지' && (
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
          )
        }
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

      {view === '리포트' && (
        <div className="mt-5">
          <ReportPanel />
        </div>
      )}

      {view === '회의록' && (
        <div className="grid grid-cols-[1fr_320px] gap-5 mt-5 items-start">
          <MeetingList />
          <Card title="녹음은 아직입니다">
            <p className="text-body text-ink-soft leading-relaxed">
              폰으로 녹음한 파일을 올리면 회의록이 되는 기능은{' '}
              <strong className="font-semibold">브라우저만으로는 안 됩니다.</strong>
            </p>
            <p className="text-caption text-ink-mute mt-2 leading-relaxed">
              음성을 글로 바꾸는 일은 컴퓨터에서 따로 도는 프로그램이 필요합니다. 그때까지는
              전사문을 붙여넣어 주세요.
            </p>
            <div className="mt-3">
              <LaterNote stage="미정">녹음 자동 전사 — 설계서 OQ-14</LaterNote>
            </div>
          </Card>
        </div>
      )}

      {view === '전화메모' && (
        <div className="mt-5">
          <CallList />
        </div>
      )}

      {view === '업무일지' && (
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
          </div>
        </div>
      )}
    </div>
  )
}
