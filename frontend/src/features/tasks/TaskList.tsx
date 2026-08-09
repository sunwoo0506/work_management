import { sortTasks } from '../../domain/sort'
import { daysUntil, ddayLabel, scheduleOf } from '../../domain/dday'
import { PriorityBadge, ScheduleBadge, SourceBadge } from '../../components/Badge'
import type { Task } from './api'

/**
 * 업무 목록.
 *
 * 정렬과 D-day를 여기서 다시 계산하지 않는다.
 * src/domain/ 에 있고 테스트가 붙어 있다. 화면에서 또 짜면 두 곳이 어긋난다.
 */
export default function TaskList({
  tasks,
  today,
  onOpen,
}: {
  tasks: Task[]
  today: Date
  onOpen: (task: Task) => void
}) {
  const sorted = sortTasks(tasks, today)

  if (sorted.length === 0) {
    return (
      <p className="text-body text-ink-mute py-10 text-center">
        아직 업무가 없습니다. 「＋ 새 업무」로 만들거나 인박스에서 올리세요.
      </p>
    )
  }

  return (
    <ul className="divide-y divide-divider">
      {sorted.map((t) => {
        const schedule = scheduleOf(t, today)
        const d = daysUntil(t.due_date, today)
        return (
          <li key={t.id}>
            <button
              type="button"
              onClick={() => onOpen(t)}
              className="w-full text-left py-3.5 px-2 hover:bg-parchment flex items-center gap-3"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-body truncate">{t.title}</span>
                <span className="flex items-center gap-1.5 mt-1">
                  <SourceBadge source={t.source} />
                  {t.area && <span className="text-caption text-ink-mute">{t.area}</span>}
                </span>
              </span>
              <PriorityBadge priority={t.priority} />
              <ScheduleBadge schedule={schedule} label={ddayLabel(d)} />
              <span className="text-caption text-ink-mute w-14 text-right">{t.status}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
