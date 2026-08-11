import { useState } from 'react'
import { sortTasks } from '../../domain/sort'
import { daysUntil, ddayLabel, isDueToday, scheduleOf } from '../../domain/dday'
import { PriorityBadge, ScheduleBadge, SourceBadge } from '../../components/Badge'
import { useDeleteTask } from './hooks'
import type { Task } from './api'

/**
 * 업무 목록.
 *
 * 정렬과 D-day를 여기서 다시 계산하지 않는다.
 * src/domain/ 에 있고 테스트가 붙어 있다. 화면에서 또 짜면 두 곳이 어긋난다.
 *
 * 수정·삭제를 줄에서 바로 할 수 있다. 서랍을 열어야만 지울 수 있으면
 * 잘못 만든 업무 하나 지우는 데 세 번을 눌러야 한다.
 */
export default function TaskList({
  tasks,
  today,
  onOpen,
  onEdit,
  presorted = false,
  emptyMessage,
}: {
  tasks: Task[]
  today: Date
  onOpen: (task: Task) => void
  onEdit?: (task: Task) => void
  /** 이미 정렬해서 넘겼나 — 영역별로 묶을 때는 묶는 쪽이 정렬해 둔다 */
  presorted?: boolean
  emptyMessage?: string
}) {
  const sorted = presorted ? tasks : sortTasks(tasks, today)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const remove = useDeleteTask()

  if (sorted.length === 0) {
    return (
      <p className="text-body text-ink-mute py-10 text-center">
        {emptyMessage ?? '아직 업무가 없습니다. 「＋ 새 업무」로 만들거나 인박스에서 올리세요.'}
      </p>
    )
  }

  return (
    <ul className="divide-y divide-divider">
      {sorted.map((t) => {
        if (confirmId === t.id) {
          return (
            <li key={t.id} className="py-3.5 px-2 flex items-center gap-3">
              <span className="text-body flex-1 min-w-0 truncate">
                「{t.title}」을 지웁니다. 되돌릴 수 없습니다.
              </span>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() =>
                  remove.mutate(t, { onSuccess: () => setConfirmId(null) })
                }
                className="text-caption text-alert font-semibold px-2 disabled:opacity-40"
              >
                {remove.isPending ? '지우는 중…' : '지웁니다'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="text-caption text-action font-semibold px-2"
              >
                그만두기
              </button>
            </li>
          )
        }

        const schedule = scheduleOf(t, today)
        const d = daysUntil(t.due_date, today)
        const todayDue = isDueToday(t, today)

        return (
          <li
            key={t.id}
            className={[
              'group flex items-center',
              // 오늘 마감은 줄 전체를 들어 올린다.
              //
              // 색을 새로 만들지 않는다 — 파란색은 「누를 수 있는 것」이고
              // 빨간색은 「기한 초과」다 (CLAUDE.md). 오늘 마감은 둘 다 아니다.
              // 그래서 **밝기와 왼쪽 기둥**으로만 구분한다. 배경이 밝아지고
              // 왼쪽에 잉크색 기둥이 서면 훑을 때 눈이 그 줄에서 걸린다.
              todayDue
                ? 'bg-pearl border-l-[3px] border-l-ink pl-0.5 hover:bg-parchment'
                : 'hover:bg-parchment',
            ].join(' ')}
          >
            <button
              type="button"
              onClick={() => onOpen(t)}
              className="flex-1 min-w-0 text-left py-3.5 px-2 flex items-center gap-3"
            >
              <span className="flex-1 min-w-0">
                <span className={`block text-body truncate ${todayDue ? 'font-semibold' : ''}`}>
                  {t.title}
                </span>
                <span className="flex items-center gap-1.5 mt-1">
                  <SourceBadge source={t.source} />
                  {t.area && <span className="text-caption text-ink-mute">{t.area}</span>}
                  {/* 메모가 있으면 표시한다 — 열어보지 않고도 어디에 기록이 쌓였는지 보인다 */}
                  {t.notes && <span className="text-caption text-ink-mute" title="작업 메모 있음">✎</span>}
                  {t.progress > 0 && t.progress < 100 && (
                    <span className="text-caption text-ink-mute">{t.progress}%</span>
                  )}
                </span>
              </span>
              <PriorityBadge priority={t.priority} />
              <ScheduleBadge schedule={schedule} label={ddayLabel(d)} today={todayDue} />
              <span className="text-caption text-ink-mute w-14 text-right">{t.status}</span>
            </button>

            {/* 평소엔 숨어 있다가 줄에 올려야 나온다. 목록이 버튼으로 시끄러워지지 않게 */}
            <span className="shrink-0 flex items-center gap-1 pr-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(t)}
                  className="text-caption text-ink-mute hover:text-action px-1.5 py-1"
                >
                  수정
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmId(t.id)}
                className="text-caption text-ink-mute hover:text-alert px-1.5 py-1"
              >
                삭제
              </button>
            </span>
          </li>
        )
      })}
    </ul>
  )
}
