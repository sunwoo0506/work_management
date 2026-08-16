import {
  DndContext, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { BOARD_STATUSES } from '../../domain/types'
import { daysUntil, ddayLabel, isDueToday, scheduleOf } from '../../domain/dday'
import { sortTasks } from '../../domain/sort'
import { PriorityBadge, ScheduleBadge } from '../../components/Badge'
import { useChangeStatus } from './hooks'
import type { Task } from './api'

/**
 * 칸반.
 *
 * 「보류」는 열로 두지 않고 하단 별도 영역에 둔다 (설계서 §6.1).
 * 열로 두면 보류 카드가 쌓여 시야를 가린다.
 */
export default function TaskBoard({
  tasks,
  today,
  onOpen,
}: {
  tasks: Task[]
  today: Date
  onOpen: (t: Task) => void
}) {
  const change = useChangeStatus()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const held = tasks.filter((t) => t.status === '보류')

  function onDragEnd(e: DragEndEvent) {
    const status = e.over?.id
    const task = tasks.find((t) => t.id === e.active.id)
    if (!task || typeof status !== 'string' || task.status === status) return
    change.mutate({ task, status })
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      {/*
        못 옮긴 이유를 말해 준다.
        카드가 소리 없이 제자리로 돌아가면 "끌기가 고장났나" 하고 또 끈다.
        (요청받은 업무는 회신을 적어야 「완료」로 닫힌다 — 설계서 §4.2)
      */}
      {change.isError && (
        <p className="text-caption text-ink-soft bg-parchment rounded-md px-3.5 py-2.5 mb-3" role="alert">
          {change.error instanceof Error ? change.error.message : String(change.error)}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {BOARD_STATUSES.map((s) => (
          <Column
            key={s}
            status={s}
            tasks={sortTasks(tasks.filter((t) => t.status === s), today)}
            today={today}
            onOpen={onOpen}
          />
        ))}
      </div>

      {held.length > 0 && (
        <section className="mt-6">
          <p className="text-caption text-ink-mute mb-2">보류 {held.length}</p>
          <div className="flex flex-wrap gap-2">
            {held.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onOpen(t)}
                className="text-caption text-ink-mute bg-parchment border border-hairline
                           rounded-full px-3 py-1.5"
              >
                {t.title}
              </button>
            ))}
          </div>
        </section>
      )}
    </DndContext>
  )
}

function Column({
  status, tasks, today, onOpen,
}: {
  status: string
  tasks: Task[]
  today: Date
  onOpen: (t: Task) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={[
        'rounded-lg p-3 min-h-[220px] border',
        isOver ? 'bg-canvas border-action' : 'bg-parchment border-hairline',
      ].join(' ')}
    >
      <p className="text-caption text-ink-mute mb-2.5">
        {status} <span className="text-ink-mute">{tasks.length}</span>
      </p>
      <ul className="space-y-2">
        {tasks.map((t) => (
          <li key={t.id}>
            <Card task={t} today={today} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </div>
  )
}

function Card({ task, today, onOpen }: { task: Task; today: Date; onOpen: (t: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: task.id })
  const schedule = scheduleOf(task, today)
  const todayDue = isDueToday(task, today)

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen(task)}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={[
        'bg-canvas rounded-md p-3 cursor-grab select-none border',
        // 목록과 같은 규칙 — 오늘 마감은 색이 아니라 테두리 굵기로 세운다
        todayDue ? 'border-ink' : 'border-hairline',
        isDragging ? 'opacity-50' : '',
      ].join(' ')}
    >
      <p className={`text-body leading-snug ${todayDue ? 'font-semibold' : ''}`}>{task.title}</p>
      <div className="flex items-center gap-1.5 mt-2">
        <PriorityBadge priority={task.priority} />
        <ScheduleBadge
          schedule={schedule}
          label={ddayLabel(daysUntil(task.due_date, today))}
          today={todayDue}
        />
      </div>
    </div>
  )
}
