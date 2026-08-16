import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, PageHeader } from '../components/ui'
import { PillButton } from '../components/Field'
import DailyLogPanel from '../features/daily/DailyLogPanel'
import { shiftDays, ymd } from '../domain/daily'
import ReportPanel from '../features/reports/ReportPanel'
import MeetingList from '../features/meetings/MeetingList'
import LiveMeeting from '../features/meetings/LiveMeeting'
import CallList from '../features/meetings/CallList'

const VIEWS = ['업무일지', '리포트', '회의록', '전화메모'] as const
type View = (typeof VIEWS)[number]

const MEETING_MODES = ['🎙 실시간', '✍ 직접 쓰기'] as const
type MeetingMode = (typeof MEETING_MODES)[number]

function isView(v: string | null): v is View {
  return VIEWS.includes(v as View)
}

export default function RecordPage() {
  const [offset, setOffset] = useState(0)
  const [mode, setMode] = useState<MeetingMode>('🎙 실시간')
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
        <div className="mt-5">
          {/*
            두 갈래를 나란히 둔다.
            「직접 쓰기」를 지우지 않는 이유 — 받아쓰기가 안 되는 브라우저,
            마이크가 없는 자리, 그리고 **민감 회의(회생·인사)** 에서는 여전히 유일한 길이다.
          */}
          <div className="flex gap-1.5 mb-5">
            {MEETING_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={[
                  'text-caption rounded-full px-3 py-1.5 border',
                  mode === m
                    ? 'text-action border-action font-semibold'
                    : 'text-ink-mute border-hairline hover:text-ink',
                ].join(' ')}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === '🎙 실시간' ? (
            <LiveMeeting />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
              <MeetingList />
              <Card title="직접 쓰기는 언제 쓰나">
                <ul className="space-y-2 text-caption text-ink-mute leading-relaxed">
                  <li>· 지나간 회의를 나중에 적을 때</li>
                  <li>· 다른 도구로 이미 전사한 글이 있을 때</li>
                  <li>· 받아쓰기가 안 되는 브라우저에서 (파이어폭스 등)</li>
                </ul>
              </Card>
            </div>
          )}
        </div>
      )}

      {view === '전화메모' && (
        <div className="mt-5">
          <CallList />
        </div>
      )}

      {view === '업무일지' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 mt-6 items-start">
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
