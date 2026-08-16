import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Card, PageHeader } from '../components/ui'
import { PillButton } from '../components/Field'
import DailyLogPanel from '../features/daily/DailyLogPanel'
import { shiftDays, ymd } from '../domain/daily'
import ReportPanel from '../features/reports/ReportPanel'
import MeetingList from '../features/meetings/MeetingList'
import AudioVault from '../features/meetings/AudioVault'
import AudioUpload from '../features/meetings/AudioUpload'
import TranscriptPaste from '../features/meetings/TranscriptPaste'
import LiveMeeting from '../features/meetings/LiveMeeting'
import CallList from '../features/meetings/CallList'

const VIEWS = ['업무일지', '리포트', '회의록', '전화메모'] as const
type View = (typeof VIEWS)[number]

/**
 * 회의록 화면의 갈래 — **한 줄로 편다.**
 *
 * ── 왜 단계를 없앴나 ─────────────────────────────────────
 * 처음에는 두 단계였다. 「회의록 만들기 / 지난 회의록」을 고르고, 만들기 안에서
 * 다시 세 가지 방법을 골랐다. 그랬더니 화면 위쪽에 **알약 모양 줄이 세 줄** 쌓였다
 * (기록 탭 → 만들기/지난 → 방법 셋). 어디를 눌러야 할지 눈이 헤맨다.
 *
 * 「만들기」는 **누르면 아무 일도 안 일어나는 중간 단계**였다. 결국 방법을 또 골라야 했다.
 * 그런 단계는 없애고 **처음부터 갈 곳을 다 보여 준다.**
 */
const MEETING_TABS = [
  '🎙 실시간 받아쓰기',
  '📝 음성텍스트 가져오기',
  '🎧 녹음 파일 올리기',
  '📋 지난 회의록',
] as const
type MeetingTab = (typeof MEETING_TABS)[number]

/** 각 갈래가 무엇을 하는 자리인지 한 줄로 */
const TAB_HINT: Record<MeetingTab, string> = {
  '🎙 실시간 받아쓰기': '회의를 진행하면서 발언을 문자로 기록합니다.',
  '📝 음성텍스트 가져오기':
    '휴대폰 녹음 앱이 음성을 문자로 바꾼 문서(전사문)를 가져옵니다. 가져오기까지는 비용이 없고, AI 회의록 초안을 작성할 때만 비용이 발생합니다.',
  '🎧 녹음 파일 올리기':
    '녹음 파일을 올려 서버에서 문자로 변환합니다. 음성 길이에 비례해 비용이 발생합니다.',
  '📋 지난 회의록': '저장된 회의록을 열어 수정 · 초안 작성 · 내려받기 · 삭제합니다.',
}

function isView(v: string | null): v is View {
  return VIEWS.includes(v as View)
}

export default function RecordPage() {
  const [offset, setOffset] = useState(0)
  const [meetingTab, setMeetingTab] = useState<MeetingTab>('🎙 실시간 받아쓰기')
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
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            {MEETING_TABS.map((t, i) => (
              <span key={t} className="contents">
                {/* 「지난 회의록」은 성격이 달라(만들기 ↔ 보관) 한 칸 띄운다 */}
                {i === 3 && <span className="w-4" aria-hidden />}
                <button
                  type="button"
                  onClick={() => setMeetingTab(t)}
                  className={[
                    'text-caption rounded-full px-3 py-1.5 border',
                    meetingTab === t
                      ? 'text-action border-action font-semibold'
                      : 'text-ink-mute border-hairline hover:text-ink',
                  ].join(' ')}
                >
                  {t}
                </button>
              </span>
            ))}
          </div>
          <p className="text-caption text-ink-mute mb-5 leading-relaxed">{TAB_HINT[meetingTab]}</p>

          {meetingTab === '🎙 실시간 받아쓰기' && <LiveMeeting />}

          {/*
            폭을 따로 묶지 않는다. 한때 이 둘만 720px 로 감싸 두었더니
            **실시간 탭만 넓고 나머지는 좁아** 탭을 옮길 때마다 화면이 출렁였다.
            세 탭 모두 같은 2단 배치(본문 + 320px 곁칸)를 쓰므로 폭도 같아야 한다.
          */}
          {meetingTab === '📝 음성텍스트 가져오기' && <TranscriptPaste />}

          {meetingTab === '🎧 녹음 파일 올리기' && <AudioUpload />}

          {meetingTab === '📋 지난 회의록' && (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 items-start">
              <MeetingList />
              <div className="space-y-5">
                <Card title="여기서 할 수 있는 것">
                  <ul className="space-y-2 text-caption text-ink-mute leading-relaxed">
                    <li>· 전사 내용을 수정합니다</li>
                    <li>· 회의록 초안을 작성합니다</li>
                    <li>· Action Item 을 인박스로 보냅니다</li>
                    <li>· 회의록을 파일(.md) 또는 PDF로 내려받습니다</li>
                    <li>· 회의록을 수정하거나 삭제합니다</li>
                  </ul>
                </Card>
                <AudioVault />
              </div>
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
