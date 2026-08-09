import { useState } from 'react'
import { Card, EmptyState } from '../../components/ui'
import { rollupByDirective } from '../../domain/rollup'
import { ddayLabel } from '../../domain/dday'
import {
  axisTicks,
  buildTimeline,
  monthLabel,
  monthWindow,
  shiftMonth,
  todayMarker,
  ymd,
} from '../../domain/timeline'
import type { Bar } from '../../domain/timeline'
import { useDirectives } from './hooks'
import { useTasks } from '../tasks/hooks'
import type { Task } from '../tasks/api'

/**
 * 진행 중 업무 — 지시사항 단위로 묶어 타임라인으로 본다.
 *
 * **마일스톤 역할을 이 블록이 한다** (설계 모형 `layout-v3`).
 * 그래서 「오늘」 화면에 마일스톤 블록을 따로 두지 않는다.
 * 여러 지시사항을 아우르는 큰 관문만 「계획」 탭에 남겼다.
 *
 * 타임라인이 기본이고 목록은 탭으로 둔다 —
 *   타임라인 「지금 어디쯤인가」  진행 띠와 오늘 선을 나란히 놓는다
 *   목록     「몇 건 남았나」    숫자를 정확히 읽는다
 *
 * 진행률만 보면 "55% 했다"이지만, 오늘 선이 80% 지점에 있으면 늦고 있다는
 * 뜻이다. 그 어긋남은 숫자로는 안 보인다. 그게 이 그림의 이유다.
 */
export default function ProgressBlock({
  today,
  onOpenTask,
}: {
  today: Date
  onOpenTask?: (task: Task) => void
}) {
  const { data: directives } = useDirectives()
  const { data: tasks } = useTasks()
  const [view, setView] = useState<'타임라인' | '목록'>('타임라인')
  const [ref, setRef] = useState(today)

  const live = (tasks ?? []).filter((t) => t.status !== '보류')
  const rollups = rollupByDirective(directives ?? [], live)
  const w = monthWindow(ref)
  const todayStr = ymd(today)
  const bars = buildTimeline(rollups, w, todayStr)
  const marker = todayMarker(w, todayStr)
  const thisMonth = monthWindow(today).from === w.from

  return (
    <Card
      title="진행 중 업무"
      count={bars.length}
      action={
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {(['타임라인', '목록'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={[
                  'text-caption rounded-full px-2.5 py-1',
                  view === v ? 'text-action font-semibold bg-canvas' : 'text-ink-mute hover:text-ink',
                ].join(' ')}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 text-caption text-ink-mute">
            <button
              type="button"
              aria-label="이전 달"
              onClick={() => setRef((r) => shiftMonth(r, -1))}
              className="px-1.5 hover:text-action"
            >
              ‹
            </button>
            <span className="w-[74px] text-center">{monthLabel(ref)}</span>
            <button
              type="button"
              aria-label="다음 달"
              onClick={() => setRef((r) => shiftMonth(r, 1))}
              className="px-1.5 hover:text-action"
            >
              ›
            </button>
            {!thisMonth && (
              <button
                type="button"
                onClick={() => setRef(today)}
                className="text-action font-semibold px-1.5"
              >
                오늘
              </button>
            )}
          </div>
        </div>
      }
    >
      <p className="text-caption text-ink-mute mb-3">
        지시사항 단위로 묶었습니다. <strong className="font-semibold">여기가 마일스톤 역할</strong>을
        합니다.
      </p>

      {bars.length === 0 ? (
        <EmptyState
          message="지시사항에 연결된 업무가 없습니다."
          hint="업무를 만들 때 지시사항에 연결하면 여기에 기간과 진행률이 합산됩니다."
        />
      ) : view === '타임라인' ? (
        <Timeline bars={bars} marker={marker} ticks={axisTicks(w)} />
      ) : (
        <ListView bars={bars} />
      )}

      {onOpenTask && bars.length > 0 && (
        <p className="text-caption text-ink-mute mt-3">
          지시사항별 업무는 「기준」 탭에서 펼쳐 볼 수 있습니다.
        </p>
      )}
    </Card>
  )
}

const LABEL_W = 'w-[150px] shrink-0'
const RIGHT_W = 'w-[78px] shrink-0'

function Timeline({
  bars,
  marker,
  ticks,
}: {
  bars: Bar[]
  marker: number | null
  ticks: { label: string; at: number }[]
}) {
  return (
    <div>
      {/* 날짜축 */}
      <div className="flex items-end mb-1.5">
        <div className={LABEL_W} />
        <div className="relative flex-1 h-4">
          {ticks.map((t) => (
            <span
              key={t.label}
              className="absolute text-caption text-ink-mute"
              style={{ left: `${t.at}%` }}
            >
              {t.label}
            </span>
          ))}
        </div>
        <div className={RIGHT_W} />
      </div>

      <ul className="space-y-2">
        {bars.map((b) => (
          <li key={b.id} className="flex items-center">
            <div className={`${LABEL_W} pr-2 min-w-0`}>
              <p className="text-caption truncate">
                <span className="text-ink-mute font-semibold mr-1.5">{b.code}</span>
                {b.title}
              </p>
              <p className="text-caption text-ink-mute">
                {b.end === null
                  ? '기간 미정'
                  : `${b.startUnknown ? '시작 미정' : (b.start as string).slice(5)} → ${b.end.slice(5)}`}
              </p>
            </div>

            <div className="relative flex-1 h-4 bg-divider rounded-full">
              {b.width > 0 && (
                <>
                  {/* 전체 기간 — 연한 띠 */}
                  <div
                    className="absolute inset-y-0 bg-action/20 rounded-full"
                    style={{ left: `${b.left}%`, width: `${b.width}%` }}
                  />
                  {/* 완료된 만큼 — 진한 띠 */}
                  {b.doneWidth > 0 && (
                    <div
                      className="absolute inset-y-0 bg-action rounded-full"
                      style={{ left: `${b.left}%`, width: `${b.doneWidth}%` }}
                    />
                  )}
                  {/* 창 밖으로 이어진다는 표시 */}
                  {b.clippedLeft && (
                    <span className="absolute left-0 -translate-x-2 top-0 text-caption text-ink-mute">‹</span>
                  )}
                  {b.clippedRight && (
                    <span className="absolute right-0 translate-x-2 top-0 text-caption text-ink-mute">›</span>
                  )}
                </>
              )}
              {/* 오늘 */}
              {marker !== null && (
                <div
                  className="absolute -top-1 -bottom-1 w-px bg-alert"
                  style={{ left: `${marker}%` }}
                  aria-hidden
                />
              )}
            </div>

            <div className={`${RIGHT_W} text-right`}>
              <span className="text-caption text-ink-mute">{b.progress}%</span>
              <span className={`text-caption ml-1.5 ${b.overdue ? 'text-alert' : 'text-ink-mute'}`}>
                {b.end === null ? '—' : ddayLabel(b.daysLeft)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-4 mt-3 text-caption text-ink-mute">
        <Legend className="bg-action">완료된 만큼</Legend>
        <Legend className="bg-action/20">전체 기간</Legend>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block w-px h-2.5 bg-alert" />
          오늘
        </span>
      </div>
    </div>
  )
}

function Legend({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={`inline-block w-2.5 h-2.5 rounded-sm ${className}`} />
      {children}
    </span>
  )
}

function ListView({ bars }: { bars: Bar[] }) {
  return (
    <table className="w-full text-caption">
      <thead>
        <tr className="text-ink-mute text-left border-b border-hairline">
          <th className="font-normal pb-2">지시사항</th>
          <th className="font-normal pb-2 w-[104px]">기간</th>
          <th className="font-normal pb-2 w-[56px] text-right">남은</th>
          <th className="font-normal pb-2 w-[110px] pl-4">진행</th>
          <th className="font-normal pb-2 w-[48px] text-right">업무</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-divider">
        {bars.map((b) => (
          <tr key={b.id}>
            <td className="py-2 pr-2">
              <span className="text-ink-mute font-semibold mr-1.5">{b.code}</span>
              <span className="text-body">{b.title}</span>
            </td>
            <td className="py-2 text-ink-mute">
              {b.end === null
                ? '미정'
                : `${b.startUnknown ? '?' : (b.start as string).slice(5)} → ${b.end.slice(5)}`}
            </td>
            <td className={`py-2 text-right ${b.overdue ? 'text-alert' : 'text-ink-mute'}`}>
              {b.end === null ? '—' : ddayLabel(b.daysLeft)}
            </td>
            <td className="py-2 pl-4">
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 bg-divider rounded-full overflow-hidden">
                  <div className="h-full bg-action" style={{ width: `${b.progress}%` }} />
                </div>
                <span className="text-ink-mute w-8 text-right">{b.progress}%</span>
              </div>
            </td>
            <td className="py-2 text-right text-ink-mute">
              {b.doneCount}/{b.totalCount}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
