import { scheduleOf } from '../domain/dday'
import { REQUESTED_SOURCES } from '../domain/types'
import type { TaskSource } from '../domain/types'
import { useTasks } from '../features/tasks/hooks'
import { useInbox } from '../features/inbox/hooks'

/**
 * 「오늘 한눈에」.
 *
 * 지연 건수는 domain/dday.ts 의 scheduleOf 로 계산한다. 화면에서 날짜를
 * 다시 비교하지 않는다 — 서머타임 처리가 거기 들어 있다.
 *
 * ⚠️예외 카운터는 5단계에서 붙는다.
 */
export default function Glance() {
  const { data: tasks } = useTasks()
  const { data: inbox } = useInbox()
  const today = new Date()

  const open = (tasks ?? []).filter((t) => t.status !== '완료' && t.status !== '보류')
  const overdue = open.filter((t) => scheduleOf(t, today) === '지연')
  const awaitingReply = (tasks ?? []).filter(
    (t) =>
      REQUESTED_SOURCES.includes(t.source as TaskSource) &&
      t.status !== '완료' &&
      !String(t.reply_body ?? '').trim(),
  )

  const rows: [string, number, boolean][] = [
    ['할 일', open.length, false],
    ['지연', overdue.length, overdue.length > 0],
    ['회신 대기', awaitingReply.length, false],
    ['인박스', inbox?.length ?? 0, false],
  ]

  return (
    <section className="mt-7">
      <p className="text-caption text-ink-mute px-2 mb-2">오늘 한눈에</p>
      <ul className="px-2 space-y-1">
        {rows.map(([label, n, warn]) => (
          <li key={label} className="flex items-baseline justify-between">
            <span className="text-caption text-ink-mute">{label}</span>
            <span className={`text-body ${warn ? 'text-alert font-semibold' : 'text-ink-soft'}`}>
              {n}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
