import { useMemo, useState } from 'react'
import { TextInput } from '../../components/Field'
import { filterTasks } from '../../domain/search'
import type { SearchHit } from '../../domain/search'
import TaskSections from './TaskSections'
import type { Task } from './api'

/**
 * 아카이브 — 같은 화면 맨 아래.
 *
 * ── 왜 별도 탭이 아니라 하단인가 ─────────────────────────
 * 사용자 말: *"아카이브도 해당 화면에서 하단에 보이게 해줘"*
 *
 * 처음엔 위쪽 탭으로 뺐는데, 그러면 **끝낸 일이 눈앞에서 사라진다.**
 * "이거 전에 한 것 같은데" 싶을 때 탭을 갈아타야 한다는 걸 기억해야 하고,
 * 기억해야 하는 건 결국 안 쓰게 된다.
 *
 * 맨 아래에 **접힌 채로** 두면 평소엔 안 거슬리고, 필요할 때 그 자리에 있다.
 * 진행 중인 일 목록을 다 훑고 내려오면 자연스럽게 만난다.
 *
 * 검색은 여기 안에서만 돈다 — 위쪽 목록의 검색과 섞이면 결과가 뒤엉킨다.
 */
export default function ArchiveSection({
  tasks,
  today,
  onOpen,
  onEdit,
  childCount,
  parentTitleById,
}: {
  /** 완료된 업무만 넘어온다 */
  tasks: Task[]
  today: Date
  onOpen: (t: Task) => void
  onEdit: (t: Task) => void
  childCount?: Record<string, { done: number; total: number }>
  parentTitleById?: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const searched = useMemo(() => filterTasks(tasks, query), [tasks, query])
  const hitsById = useMemo(() => {
    const m: Record<string, SearchHit[]> = {}
    for (const r of searched) if (r.hits.length) m[r.task.id] = r.hits
    return m
  }, [searched])
  const shown = searched.map((r) => r.task)
  const searching = query.trim().length > 0

  return (
    <section className="mt-10 border-t border-hairline pt-5">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-body font-semibold text-left flex-1 min-w-0"
        >
          <span className="text-ink-mute text-caption mr-1.5">{open ? '▾' : '▸'}</span>
          아카이브
          <span className="text-ink-mute font-normal ml-2 text-caption">
            끝낸 업무 {tasks.length}건
          </span>
        </button>
      </div>

      {open && (
        <div className="mt-3">
          {tasks.length === 0 ? (
            <p className="text-caption text-ink-mute py-6 text-center">
              아직 끝낸 업무가 없습니다. 업무를 「완료」로 닫으면 여기로 넘어옵니다.
            </p>
          ) : (
            <>
              <TextInput
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="끝낸 업무 찾기 — 예) 회생 단가"
                aria-label="아카이브 검색"
              />
              <p className="text-caption text-ink-mute mt-2 mb-3 leading-relaxed">
                {searching ? (
                  <>{tasks.length}건 중 <strong className="font-semibold text-ink">{shown.length}건</strong>이 걸렸습니다.</>
                ) : (
                  <>제목뿐 아니라 <strong className="font-semibold">상세 · 작업 메모 · 회신 · 영역</strong>까지 찾습니다.</>
                )}
              </p>

              {shown.length === 0 ? (
                <p className="text-caption text-ink-mute py-6 text-center">
                  걸리는 업무가 없습니다. 낱말을 줄이거나 다른 말로 찾아 보세요.
                </p>
              ) : (
                <TaskSections
                  tasks={shown}
                  today={today}
                  onOpen={onOpen}
                  onEdit={onEdit}
                  forceOpen={searching}
                  hitsById={hitsById}
                  childCount={childCount}
                  parentTitleById={parentTitleById}
                />
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}
