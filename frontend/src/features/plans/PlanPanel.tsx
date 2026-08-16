import { useEffect, useState } from 'react'
import { Card, EmptyState } from '../../components/ui'
import { PillButton, TextArea, TextInput } from '../../components/Field'
import {
  goalProgress,
  layoutWeek,
  parseGoals,
  planLabel,
  planRange,
  shiftPeriod,
  unplaced,
  ymd,
} from '../../domain/plan'
import type { Goal, PlanKind, PlanTask } from '../../domain/plan'
import { usePlan, usePlanMutations, usePlanTasks } from './hooks'

const KINDS: PlanKind[] = ['주간', '월간']

/**
 * 계획 (설계서 §13 7단계).
 *
 * 리포트가 「지난 주에 무엇을 했나」라면 여기는 「이번 주에 무엇을 할까」다.
 * 같은 주 경계(월~일)를 쓰기 때문에 둘을 나란히 놓고 볼 수 있다.
 *
 * 배치는 `focus_date` 만 바꾼다. 기한은 안 건드린다 —
 * 기한은 남이 정한 약속이고 배치일은 내가 정하는 것이다.
 */
export default function PlanPanel() {
  const [kind, setKind] = useState<PlanKind>('주간')
  const [ref, setRef] = useState(() => new Date())

  const { data: plan } = usePlan(kind, ref)
  const { data: tasks } = usePlanTasks()
  const { save, place } = usePlanMutations(kind, ref)

  const goals = parseGoals(plan?.goals)
  const { from, to } = planRange(kind, ref)
  const isNow = planRange(kind, new Date()).from === from

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={[
                'text-caption rounded-full px-3 py-1.5 border',
                kind === k
                  ? 'text-action border-action font-semibold'
                  : 'text-ink-mute border-hairline hover:text-ink',
              ].join(' ')}
            >
              {k}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <p className="text-caption text-ink-mute">
            {planLabel(kind, ref)}
            <span className="ml-2">{from} ~ {to}</span>
          </p>
          <PillButton type="button" variant="ghost" onClick={() => setRef((r) => shiftPeriod(kind, r, -1))}>
            ←
          </PillButton>
          {!isNow && (
            <PillButton type="button" variant="ghost" onClick={() => setRef(new Date())}>
              지금
            </PillButton>
          )}
          <PillButton type="button" variant="ghost" onClick={() => setRef((r) => shiftPeriod(kind, r, 1))}>
            →
          </PillButton>
        </div>
      </div>

      <GoalBox goals={goals} onSave={(g) => save.mutate({ goals: g })} />

      {kind === '주간' ? (
        <WeekBoard
          ref_={ref}
          tasks={tasks ?? []}
          onPlace={(taskId, date) => place.mutate({ taskId, date })}
        />
      ) : (
        <MonthBoard ref_={ref} tasks={tasks ?? []} />
      )}

      <Unplaced
        kind={kind}
        ref_={ref}
        tasks={tasks ?? []}
        onPlace={(taskId, date) => place.mutate({ taskId, date })}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <NoteBox
          title="메모"
          hint="이 기간에 신경 쓸 것"
          value={plan?.memo ?? ''}
          onSave={(v) => save.mutate({ memo: v })}
        />
        <NoteBox
          title="회고"
          hint="기간이 끝난 뒤에 적습니다. 계획대로 안 된 이유가 다음 계획을 고칩니다."
          value={plan?.retro ?? ''}
          onSave={(v) => save.mutate({ retro: v })}
        />
      </div>
    </div>
  )
}

function GoalBox({ goals, onSave }: { goals: Goal[]; onSave: (g: Goal[]) => void }) {
  const [draft, setDraft] = useState('')
  const pct = goalProgress(goals)

  return (
    <Card title="목표" count={goals.length}>
      {goals.length > 0 && (
        <div className="flex items-center gap-3 mb-3">
          <div className="h-1.5 flex-1 bg-divider rounded-full overflow-hidden">
            <div className="h-full bg-action" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-caption text-ink-mute w-10 text-right">{pct}%</span>
        </div>
      )}

      {goals.length === 0 ? (
        <p className="text-caption text-ink-mute mb-3">
          이 기간에 반드시 끝낼 것 두세 개만 적습니다. 많으면 목표가 아닙니다.
        </p>
      ) : (
        <ul className="space-y-1.5 mb-3">
          {goals.map((g, i) => (
            <li key={`${g.text}-${i}`} className="flex items-start gap-2.5 group">
              <input
                type="checkbox"
                checked={g.done}
                onChange={() =>
                  onSave(goals.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))
                }
                className="mt-1 accent-action"
              />
              <span className={`text-body flex-1 ${g.done ? 'text-ink-mute line-through' : ''}`}>
                {g.text}
              </span>
              <button
                type="button"
                onClick={() => onSave(goals.filter((_, j) => j !== i))}
                className="text-caption text-ink-mute opacity-0 group-hover:opacity-100 hover:text-alert"
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          const text = draft.trim()
          if (!text) return
          onSave([...goals, { text, done: false }])
          setDraft('')
        }}
      >
        <TextInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="목표 한 줄"
        />
        <PillButton type="submit" variant="ghost" className="shrink-0">
          추가
        </PillButton>
      </form>
    </Card>
  )
}

function WeekBoard({
  ref_,
  tasks,
  onPlace,
}: {
  ref_: Date
  tasks: PlanTask[]
  onPlace: (taskId: string, date: string | null) => void
}) {
  const slots = layoutWeek(ref_, tasks)
  const today = ymd(new Date())

  // 주간표는 7칸을 줄이지 않는다 — 요일이 뭉개지면 표가 아니다.
  // 좁은 화면에서는 옆으로 밀어 본다
  return (
    <div className="overflow-x-auto">
    <div className="grid grid-cols-7 gap-2 min-w-[640px]">
      {slots.map((s) => (
        <div
          key={s.date}
          className={[
            'bg-parchment rounded-lg border min-h-[140px] p-3',
            s.date === today ? 'border-action' : 'border-hairline',
          ].join(' ')}
        >
          <p className="text-caption mb-2">
            <span className={s.date === today ? 'text-action font-semibold' : 'text-ink-mute'}>
              {s.name}
            </span>
            <span className="text-ink-mute ml-1.5">{s.date.slice(8)}</span>
          </p>
          <ul className="space-y-1.5">
            {s.tasks.map((t) => (
              <li key={t.id} className="group">
                <p className="text-caption leading-snug">{t.title}</p>
                <button
                  type="button"
                  onClick={() => onPlace(t.id, null)}
                  className="text-caption text-ink-mute opacity-0 group-hover:opacity-100 hover:text-action"
                >
                  빼기
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
    </div>
  )
}

/**
 * 월간은 요일 칸을 만들지 않는다.
 * 한 달을 요일로 쪼개면 칸이 30개가 되어 아무것도 안 보인다.
 * 대신 주차별 덩어리로 본다.
 */
function MonthBoard({ ref_, tasks }: { ref_: Date; tasks: PlanTask[] }) {
  const { from, to } = planRange('월간', ref_)
  const live = tasks.filter((t) => {
    if (t.status === '완료' || t.status === '보류') return false
    const at = t.focus_date ?? t.due_date
    return !!at && at >= from && at <= to
  })

  const weeks = new Map<string, PlanTask[]>()
  for (const t of live) {
    const at = (t.focus_date ?? t.due_date) as string
    const d = new Date(Number(at.slice(0, 4)), Number(at.slice(5, 7)) - 1, Number(at.slice(8, 10)))
    const key = planLabel('주간', d)
    weeks.set(key, [...(weeks.get(key) ?? []), t])
  }

  if (weeks.size === 0) {
    return (
      <Card>
        <EmptyState
          message="이달에 놓인 업무가 없습니다."
          hint="아래 「아직 안 놓은 것」에서 날짜를 정하면 여기 나타납니다."
        />
      </Card>
    )
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {[...weeks.entries()].sort().map(([label, list]) => (
        <Card key={label} title={label} count={list.length}>
          <ul className="space-y-1.5">
            {list.map((t) => (
              <li key={t.id} className="text-body text-ink-soft flex gap-2">
                <span aria-hidden className="text-ink-mute">·</span>
                <span className="flex-1">{t.title}</span>
                <span className="text-caption text-ink-mute shrink-0">
                  {(t.focus_date ?? t.due_date)?.slice(5)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

function Unplaced({
  kind,
  ref_,
  tasks,
  onPlace,
}: {
  kind: PlanKind
  ref_: Date
  tasks: PlanTask[]
  onPlace: (taskId: string, date: string | null) => void
}) {
  const list = unplaced(kind, ref_, tasks)
  const { from, to } = planRange(kind, ref_)

  return (
    <Card title="아직 안 놓은 것" count={list.length}>
      <p className="text-caption text-ink-mute mb-3">
        기한이 이 기간 안인데 며칠에 할지 안 정한 것, 그리고 날짜가 아예 없는 것.
        <strong className="font-semibold"> 여기가 비어야 한 기간이 배치된 겁니다.</strong>
      </p>
      {list.length === 0 ? (
        <p className="text-body text-ink-mute py-1">전부 놓였습니다.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id} className="flex items-center gap-3">
              <span className="text-body flex-1 truncate">{t.title}</span>
              {t.due_date && (
                <span className="text-caption text-ink-mute shrink-0">기한 {t.due_date.slice(5)}</span>
              )}
              <input
                type="date"
                min={from}
                max={to}
                onChange={(e) => e.target.value && onPlace(t.id, e.target.value)}
                className="text-caption bg-canvas border border-hairline rounded-md px-2 py-1 outline-none focus:border-action-focus shrink-0"
              />
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** 저장 버튼을 누를 때만 저장한다. 자동저장은 "언제 저장됐나"가 안 보인다 */
function NoteBox({
  title,
  hint,
  value,
  onSave,
}: {
  title: string
  hint: string
  value: string
  onSave: (v: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  const dirty = draft !== value

  return (
    <Card
      title={title}
      action={
        dirty && (
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="text-caption text-action font-semibold"
          >
            저장
          </button>
        )
      }
    >
      <p className="text-caption text-ink-mute mb-2">{hint}</p>
      <TextArea rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} />
    </Card>
  )
}
