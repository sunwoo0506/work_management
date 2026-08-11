import { useState } from 'react'
import { PriorityBadge, ScheduleBadge } from '../../components/Badge'
import { daysUntil, ddayLabel, isDueToday, scheduleOf } from '../../domain/dday'
import { sortTasks } from '../../domain/sort'
import { useSetParent, useTasks } from './hooks'
import type { Task } from './api'

/**
 * 「이 업무가 어디에 속해 있나」 — 서랍 맨 아래.
 *
 * ── 왜 맨 아래인가 ───────────────────────────────────────
 * 사용자 말: *"상위업무는 제일 하단에 토글 적용된 하이라키 구조로 보여주면
 * 좋지 않을까? 해당 상위업무에 속한 다른 업무도 확인할 겸"*
 *
 * 맞다. 이건 **일하는 데 쓰는 칸이 아니라 위치를 확인하는 칸**이다.
 * 일은 위(상세 → 파일 → 체크리스트 → 메모)에서 다 하고, 다 하고 나서
 * "이게 어디 속한 거였지"를 본다. 그래서 맨 아래에 접혀 있다.
 *
 * ── 무엇을 보여주나 ──────────────────────────────────────
 * 부모 하나만 보여주면 반쪽이다. **형제까지** 보여야 "이 묶음이 지금 어디까지 왔나"가 보인다.
 *
 *     상위업무: 회생 자료 정리
 *       ├ 채권자 목록 정리          ← 지금 보고 있는 것
 *       ├ 담보 내역 확인
 *       └ 회생계획안 초안
 */
export default function TaskHierarchy({
  task,
  onOpen,
}: {
  task: Task
  onOpen: (t: Task) => void
}) {
  const { data: all } = useTasks()
  const setParent = useSetParent()
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(false)
  const today = new Date()

  const rows = all ?? []
  const parent = rows.find((t) => t.id === task.parent_task_id) ?? null
  // 부모가 있으면 형제를, 없으면 내 밑에 달린 것을 보여 준다
  const groupHead = parent ?? task
  const siblings = sortTasks(rows.filter((t) => t.parent_task_id === groupHead.id), today)

  const has = !!parent || siblings.length > 0
  const summary = parent
    ? `「${parent.title}」 아래 ${siblings.length}건`
    : siblings.length > 0
      ? `이 업무 아래 ${siblings.length}건`
      : '어디에도 묶여 있지 않습니다'

  return (
    <section className="mt-8 border-t border-hairline pt-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-body font-semibold text-left flex-1 min-w-0"
        >
          <span className="text-caption text-ink-mute mr-1.5">{open ? '▾' : '▸'}</span>
          관련업무 보기
          <span className="text-caption text-ink-mute font-normal ml-2">{summary}</span>
        </button>
        {!open && !has && (
          <button
            type="button"
            onClick={() => { setOpen(true); setPicking(true) }}
            className="text-caption text-action font-semibold shrink-0"
          >
            묶기
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3">
          {has && (
            <div className="bg-parchment rounded-md border border-hairline p-3.5">
              <button
                type="button"
                onClick={() => groupHead.id !== task.id && onOpen(groupHead)}
                disabled={groupHead.id === task.id}
                className="text-body font-semibold text-left disabled:cursor-default"
              >
                {groupHead.title}
                {groupHead.id === task.id && (
                  <span className="text-caption text-ink-mute font-normal ml-2">지금 보는 업무</span>
                )}
              </button>

              <ul className="mt-2 space-y-0.5">
                {siblings.map((s, i) => (
                  <Row
                    key={s.id}
                    task={s}
                    today={today}
                    last={i === siblings.length - 1}
                    current={s.id === task.id}
                    onOpen={onOpen}
                  />
                ))}
              </ul>
            </div>
          )}

          {picking || !has ? (
            <ParentSelect
              task={task}
              rows={rows}
              busy={setParent.isPending}
              onPick={(parentId) => {
                setParent.mutate({ task, parentId })
                setPicking(false)
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="text-caption text-action font-semibold mt-2"
            >
              묶음 바꾸기
            </button>
          )}
        </div>
      )}
    </section>
  )
}

function Row({
  task, today, last, current, onOpen,
}: {
  task: Task
  today: Date
  last: boolean
  current: boolean
  onOpen: (t: Task) => void
}) {
  const done = task.status === '완료'
  return (
    <li className="flex items-center gap-2">
      <span className="text-caption text-ink-mute shrink-0 select-none">{last ? '└' : '├'}</span>
      <button
        type="button"
        onClick={() => !current && onOpen(task)}
        disabled={current}
        className={[
          'flex-1 min-w-0 text-left text-body truncate py-1',
          done ? 'text-ink-mute line-through' : '',
          current ? 'font-semibold cursor-default' : 'hover:text-action',
        ].join(' ')}
      >
        {task.title}
        {current && <span className="text-caption text-ink-mute font-normal ml-2">지금 보는 중</span>}
      </button>
      <PriorityBadge priority={task.priority} />
      <ScheduleBadge
        schedule={scheduleOf(task, today)}
        label={ddayLabel(daysUntil(task.due_date, today))}
        today={isDueToday(task, today)}
      />
    </li>
  )
}

/** 상위 업무 고르기. 자기 자신과 자기 자식은 뺀다 — 고리가 생기면 진행률 계산이 돈다 */
function ParentSelect({
  task, rows, busy, onPick,
}: {
  task: Task
  rows: Task[]
  busy: boolean
  onPick: (parentId: string | null) => void
}) {
  const candidates = rows.filter(
    (t) => t.id !== task.id && t.parent_task_id !== task.id && t.status !== '완료',
  )

  return (
    <label className="block mt-2">
      <span className="block text-caption text-ink-mute mb-1.5">상위 업무</span>
      <select
        value={task.parent_task_id ?? ''}
        disabled={busy}
        onChange={(e) => onPick(e.target.value || null)}
        className="w-full text-body bg-canvas border border-hairline rounded-md px-3 py-2 outline-none focus:border-action-focus"
      >
        <option value="">— 없음 (최상위 업무)</option>
        {candidates.map((t) => (
          <option key={t.id} value={t.id}>{t.title}</option>
        ))}
      </select>
    </label>
  )
}
