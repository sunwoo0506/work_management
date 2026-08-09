import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, EmptyState, LaterNote, PageHeader, StatTile } from '../components/ui'
import { PriorityBadge, ScheduleBadge, SourceBadge } from '../components/Badge'
import { daysUntil, ddayLabel, scheduleOf } from '../domain/dday'
import { sortTasks } from '../domain/sort'
import { rollupByDirective } from '../domain/rollup'
import { REQUESTED_SOURCES } from '../domain/types'
import type { TaskSource } from '../domain/types'
import { useTasks } from '../features/tasks/hooks'
import { useInbox } from '../features/inbox/hooks'
import { useDirectives } from '../features/directives/hooks'
import { useLastPeriods, useProcedures } from '../features/procedures/hooks'
import { triggerOf } from '../features/procedures/api'
import { isDue } from '../domain/trigger'
import TaskDetail from '../features/tasks/TaskDetail'
import SampleDataButton from '../features/seed/SampleDataButton'
import { SAMPLE_MARK } from '../features/seed/sampleData'
import type { Task } from '../features/tasks/api'

/**
 * 「오늘」 — 하루의 순서대로 블록을 쌓는다 (설계서 §4.1).
 *
 * 1단계에서 만들 수 있는 것만 만든다.
 * 「어제 이야기」와 업무일지는 업무일지 저장 공간이 있어야 해서 4단계다.
 */
export default function TodayPage() {
  const { data: tasks, isLoading } = useTasks()
  const { data: inbox } = useInbox()
  const { data: directives } = useDirectives()
  const { data: procedures } = useProcedures()
  const { data: lastPeriods } = useLastPeriods()
  const [open, setOpen] = useState<Task | null>(null)

  const today = new Date()
  const all = tasks ?? []
  const hasSample = all.some((t) => t.title.startsWith(SAMPLE_MARK))

  const todayStr = fmtDate(today)
  const live = all.filter((t) => t.status !== '완료' && t.status !== '보류')

  // 오늘 할 일 = 기한이 오늘까지 지났거나, 오늘 하기로 찍은 것
  const todo = sortTasks(
    live.filter(
      (t) =>
        t.focus_date === todayStr ||
        (t.due_date !== null && (daysUntil(t.due_date, today) ?? 99) <= 0),
    ),
    today,
  )

  const overdue = live.filter((t) => scheduleOf(t, today) === '지연')
  const awaitingReply = all.filter(
    (t) =>
      REQUESTED_SOURCES.includes(t.source as TaskSource) &&
      t.status !== '완료' &&
      !String(t.reply_body ?? '').trim(),
  )

  // 이번 주 = 오늘부터 7일 이내 마감
  const thisWeek = sortTasks(
    live.filter((t) => {
      const d = daysUntil(t.due_date, today)
      return d !== null && d > 0 && d <= 7
    }),
    today,
  )

  // 진행 중 업무 — 지시사항 단위로 묶는다. 업무가 붙은 것만 보인다
  const rollups = rollupByDirective(directives ?? [], live).filter((r) => r.totalCount > 0)

  // 주기가 도래했고 이번 기간에 아직 안 돌린 절차
  const dueProcedures = (procedures ?? []).filter(
    (p) => p.status === '확정' && isDue(triggerOf(p), today, lastPeriods?.[p.id] ?? null),
  )

  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title="오늘"
        description={fmtLong(today)}
        right={<SampleDataButton has={hasSample} />}
      />

      <div className="grid grid-cols-4 gap-3 mt-6">
        <StatTile label="할 일" value={live.length} />
        <StatTile label="지연" value={overdue.length} warn />
        <StatTile label="회신 대기" value={awaitingReply.length} />
        <StatTile label="인박스" value={inbox?.length ?? 0} />
      </div>

      {isLoading ? (
        <p className="text-caption text-ink-mute mt-6">불러오는 중…</p>
      ) : (
        <div className="grid grid-cols-[1fr_320px] gap-5 mt-5 items-start">
          {/* 왼쪽 — 하루의 순서 */}
          <div className="space-y-5">
            <Card title="어제 이야기">
              <LaterNote stage={4}>
                업무일지를 만들면 전날의 「이슈·막힌 것」과 완료한 업무가 여기 올라옵니다.
              </LaterNote>
            </Card>

            <Card
              title="오늘 할 일"
              count={todo.length}
              action={
                <Link to="/work" className="text-caption text-action hover:underline">
                  업무 전체
                </Link>
              }
            >
              {todo.length === 0 ? (
                <EmptyState
                  message="오늘 할 일이 없습니다."
                  hint="기한이 오늘이거나 오늘 하기로 찍은 업무가 여기 모입니다."
                  action={!hasSample ? <SampleDataButton has={false} /> : undefined}
                />
              ) : (
                <TaskRows tasks={todo} today={today} onOpen={setOpen} />
              )}
            </Card>

            <Card title="진행 중 업무" count={rollups.length}>
              {rollups.length === 0 ? (
                <EmptyState
                  message="지시사항에 연결된 업무가 없습니다."
                  hint="업무를 지시사항에 연결하면 여기에 진행률이 합산됩니다."
                />
              ) : (
                <ul className="space-y-3.5">
                  {rollups.map((r) => (
                    <li key={r.id}>
                      <div className="flex items-baseline gap-2">
                        <span className="text-caption text-ink-mute font-semibold w-11 shrink-0">
                          {r.code}
                        </span>
                        <span className="text-body flex-1 truncate">{r.title}</span>
                        <span className="text-caption text-ink-mute shrink-0">
                          {r.doneCount}/{r.totalCount}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 pl-13">
                        <div className="h-1.5 flex-1 bg-divider rounded-full overflow-hidden">
                          <div className="h-full bg-action" style={{ width: `${r.progress}%` }} />
                        </div>
                        <span className="text-caption text-ink-mute w-9 text-right">
                          {r.progress}%
                        </span>
                        <span className="text-caption text-ink-mute w-16 text-right">
                          {ddayLabel(daysUntil(r.dueDate, today))}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* 오른쪽 — 곁눈질용 */}
          <div className="space-y-5">
            <Card title="이번 주" count={thisWeek.length}>
              {thisWeek.length === 0 ? (
                <p className="text-caption text-ink-mute py-2">7일 이내 마감이 없습니다.</p>
              ) : (
                <ul className="space-y-2.5">
                  {thisWeek.slice(0, 6).map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setOpen(t)}
                        className="w-full text-left group"
                      >
                        <span className="block text-body truncate group-hover:text-action">
                          {t.title}
                        </span>
                        <span className="text-caption text-ink-mute">
                          {ddayLabel(daysUntil(t.due_date, today))}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              title="인박스"
              count={inbox?.length ?? 0}
              action={
                <Link to="/work" className="text-caption text-action hover:underline">
                  열기
                </Link>
              }
            >
              {!inbox?.length ? (
                <p className="text-caption text-ink-mute py-2">비어 있습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {inbox.slice(0, 5).map((i) => (
                    <li key={i.id} className="text-body text-ink-soft leading-snug line-clamp-2">
                      {i.content}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title="절차 대기" count={dueProcedures.length}>
              {dueProcedures.length === 0 ? (
                <p className="text-caption text-ink-mute py-2">
                  지금 도래한 절차가 없습니다.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {dueProcedures.map((p) => (
                    <li key={p.id}>
                      <Link to="/procedure" className="block group">
                        <span className="block text-body group-hover:text-action">{p.title}</span>
                        <span className="text-caption text-action">지금 할 때입니다</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {open && <TaskDetail task={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

function TaskRows({
  tasks, today, onOpen,
}: {
  tasks: Task[]
  today: Date
  onOpen: (t: Task) => void
}) {
  return (
    <ul className="divide-y divide-divider -mx-1">
      {tasks.map((t) => (
        <li key={t.id}>
          <button
            type="button"
            onClick={() => onOpen(t)}
            className="w-full text-left py-2.5 px-1 flex items-center gap-2.5 group"
          >
            <span className="flex-1 min-w-0">
              <span className="block text-body truncate group-hover:text-action">{t.title}</span>
              <span className="flex items-center gap-1.5 mt-1">
                <SourceBadge source={t.source} />
                {t.area && <span className="text-caption text-ink-mute">{t.area}</span>}
              </span>
            </span>
            <PriorityBadge priority={t.priority} />
            <ScheduleBadge
              schedule={scheduleOf(t, today)}
              label={ddayLabel(daysUntil(t.due_date, today))}
            />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** 로컬 달력일. toISOString()은 UTC라 하루가 밀릴 수 있다 */
function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function fmtLong(d: Date): string {
  const week = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${week}요일`
}
