import { useState } from 'react'
import { groupByArea } from '../../domain/group'
import type { SearchHit } from '../../domain/search'
import TaskList from './TaskList'
import type { Task } from './api'

/**
 * 영역별로 접었다 폈다 하는 목록.
 *
 * 왜 —
 *   사용자가 실제로 써 보고 한 말: *"전체 목록을 첫 화면으로 보여주면 너무 복잡해 보인다"*.
 *   업무 46건이 한 줄씩 늘어서면 벽이 된다.
 *
 * 왜 그냥 나누기만 하지 않고 **접었나** —
 *   나누기만 하면 줄 수는 그대로다. 46줄이 11개 묶음으로 나뉜 46줄이 될 뿐이다.
 *   접어야 화면이 실제로 짧아진다.
 *
 * 그럼 전부 접으면 되나 — 그것도 아니다. 다 접혀 있으면 오늘 봐야 할 것을 보려고
 * 매번 몇 번을 눌러야 한다. 그래서 **지연·오늘 마감이 있는 묶음만 펴 둔다.**
 * 급한 것은 그냥 보이고, 나머지는 접혀 있다. 순서도 급한 묶음이 위다 (domain/group.ts).
 */
export default function TaskSections({
  tasks,
  today,
  onOpen,
  onEdit,
  forceOpen = false,
  hitsById,
  childCount,
  parentTitleById,
}: {
  tasks: Task[]
  today: Date
  onOpen: (t: Task) => void
  onEdit: (t: Task) => void
  /** 검색 중이면 전부 펴 둔다 — 찾으러 왔는데 접혀 있으면 또 눌러야 한다 */
  forceOpen?: boolean
  hitsById?: Record<string, SearchHit[]>
  childCount?: Record<string, { done: number; total: number }>
  parentTitleById?: Record<string, string>
}) {
  const groups = groupByArea(tasks, today)
  /** 사람이 직접 누른 것만 담는다. 안 담긴 묶음은 「급하면 펴짐」 기본값을 따른다 */
  const [flipped, setFlipped] = useState<Record<string, boolean>>({})

  const isOpen = (g: { area: string; urgent: boolean }) =>
    forceOpen || (flipped[g.area] ?? g.urgent)
  const allOpen = groups.every(isOpen)

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-caption text-ink-mute">
          영역 {groups.length}개 · 업무 {tasks.length}건
          {!forceOpen && <span className="ml-1.5">— 급한 것이 있는 영역은 펴 둡니다</span>}
        </p>
        {!forceOpen && (
          <button
            type="button"
            onClick={() =>
              setFlipped(Object.fromEntries(groups.map((g) => [g.area, !allOpen])))
            }
            className="text-caption text-action font-semibold shrink-0"
          >
            {allOpen ? '전부 접기' : '전부 펴기'}
          </button>
        )}
      </div>

      <div className="space-y-2">
        {groups.map((g) => {
          const open = isOpen(g)
          return (
            <section key={g.area} className="bg-parchment rounded-lg border border-hairline">
              <button
                type="button"
                onClick={() => setFlipped((f) => ({ ...f, [g.area]: !open }))}
                aria-expanded={open}
                className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
              >
                <span className="text-caption text-ink-mute w-4 shrink-0">{open ? '▾' : '▸'}</span>
                <span className="text-body font-semibold flex-1 min-w-0 truncate">{g.area}</span>

                {/* 접혀 있어도 그 안에 급한 게 있는지는 보여야 한다 */}
                {g.overdue > 0 && (
                  <span className="text-caption text-alert font-semibold shrink-0">
                    지연 {g.overdue}
                  </span>
                )}
                {g.dueToday > 0 && (
                  <span className="text-caption text-ink font-semibold border border-ink rounded-full px-2 py-0.5 shrink-0">
                    오늘 {g.dueToday}
                  </span>
                )}
                <span className="text-caption text-ink-mute shrink-0 w-10 text-right">
                  {g.tasks.length}건
                </span>
              </button>

              {open && (
                <div className="px-5 pb-3 bg-canvas rounded-b-lg border-t border-hairline">
                  <TaskList
                    tasks={g.tasks}
                    today={today}
                    onOpen={onOpen}
                    onEdit={onEdit}
                    presorted
                    hitsById={hitsById}
                    childCount={childCount}
                    parentTitleById={parentTitleById}
                  />
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
