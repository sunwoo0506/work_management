import { useMemo, useState } from 'react'
import { Card, EmptyState, PageHeader } from '../components/ui'
import { TextInput } from '../components/Field'
import TaskList from '../features/tasks/TaskList'
import TaskSections from '../features/tasks/TaskSections'
import TaskBoard from '../features/tasks/TaskBoard'
import TaskDetail from '../features/tasks/TaskDetail'
import ArchiveSection from '../features/tasks/ArchiveSection'
import InboxPanel from '../features/inbox/InboxPanel'
import SampleDataButton from '../features/seed/SampleDataButton'
import { SAMPLE_MARK } from '../features/seed/sampleData'
import { useTasks } from '../features/tasks/hooks'
import { isDueToday } from '../domain/dday'
import { filterTasks } from '../domain/search'
import type { SearchHit } from '../domain/search'

type View = '목록' | '칸반'

/**
 * 거르개.
 *
 * ── 순서를 왜 이렇게 두나 ────────────────────────────────
 * 사용자가 정해 준 순서다 — *"진행중, 전체, 검토요청, 보류, 오늘마감"*.
 * 「진행중」이 맨 앞이고 기본값이다. 화면을 열면 지금 붙잡고 있는 것만 보인다.
 *
 * ── 「할 일」을 뺀 이유 ───────────────────────────────────
 * 사용자 지적: *"할일은 전체와 중복인 거 같아"*. 지금 46건이 전부 「할 일」 상태라
 * 두 숫자가 똑같이 46 으로 보였다. **틀린 관찰이 아니다** —
 * 지금 상태에서는 실제로 같은 목록이 나온다.
 *
 * 그래서 뺐다. 「전체」가 완료를 뺀 모든 것이므로 「할 일」은 그 안에 들어 있고,
 * 정렬(지연 → 임박 → 중요도)이 어차피 급한 것을 위로 올린다.
 * 거르개 하나를 줄이는 값이 「손도 안 댄 것만 보기」보다 크다.
 *
 * 「오늘 마감」은 상태가 아니라 **기한**으로 거른다. 상태 거르개와 성질이 달라
 * 맨 끝에 따로 둔다.
 */
const FILTERS = ['진행중', '전체', '검토요청', '보류', '오늘 마감'] as const
type Filter = (typeof FILTERS)[number]

const DEFAULT_FILTER: Filter = '진행중'

export default function WorkPage() {
  const { data: tasks, isLoading } = useTasks()
  const [view, setView] = useState<View>('목록')
  const [filter, setFilter] = useState<Filter>(DEFAULT_FILTER)
  const [query, setQuery] = useState('')
  /**
   * 열려 있는 업무를 **id 로만** 들고 있는다.
   *
   * 업무 객체를 통째로 담으면 그건 열던 순간의 사본이라, 수정해도
   * 서랍에는 옛 값이 그대로 남는다. id 로 두고 목록에서 매번 찾으면
   * 수정한 값이 바로 보이고, 지워졌을 때 서랍도 알아서 닫힌다.
   */
  const [openId, setOpenId] = useState<string | null>(null)
  /** 목록의 「수정」으로 열었나 — 그러면 서랍이 곧장 수정 상태로 뜬다 */
  const [openEditing, setOpenEditing] = useState(false)
  const today = new Date()

  const all = useMemo(() => tasks ?? [], [tasks])
  const open = all.find((t) => t.id === openId) ?? null
  const hasSample = all.some((t) => t.title.startsWith(SAMPLE_MARK))

  const archived = all.filter((t) => t.status === '완료')
  const live = all.filter((t) => t.status !== '완료')

  const countOf = (f: Filter) =>
    f === '전체'
      ? live.length
      : f === '오늘 마감'
        ? live.filter((t) => isDueToday(t, today)).length
        : live.filter((t) => t.status === f).length

  /**
   * 묶인 업무를 보여주는 데 필요한 두 가지.
   *
   * 묶인 업무는 목록에서 **빠지지 않는다.** 제 몫을 하는 업무이기 때문이다.
   * 대신 어디 소속인지(↳ 상위 제목)와, 상위 쪽에 몇 건 달렸는지를 표시한다.
   */
  const { childCount, parentTitleById } = useMemo(() => {
    const counts: Record<string, { done: number; total: number }> = {}
    const titles: Record<string, string> = {}
    const byId = new Map(all.map((t) => [t.id, t]))
    for (const t of all) {
      if (!t.parent_task_id) continue
      const c = (counts[t.parent_task_id] ??= { done: 0, total: 0 })
      c.total += 1
      if (t.status === '완료') c.done += 1
      const p = byId.get(t.parent_task_id)
      if (p) titles[t.id] = p.title
    }
    return { childCount: counts, parentTitleById: titles }
  }, [all])

  const searched = useMemo(() => filterTasks(live, query), [live, query])
  const hitsById = useMemo(() => {
    const m: Record<string, SearchHit[]> = {}
    for (const r of searched) if (r.hits.length) m[r.task.id] = r.hits
    return m
  }, [searched])

  const shown = searched
    .map((r) => r.task)
    .filter((t) =>
      filter === '전체'
        ? true
        : filter === '오늘 마감'
          ? isDueToday(t, today)
          : t.status === filter,
    )

  // 「전체」일 때만 영역별로 묶는다. 한 갈래만 볼 때는 목록이 짧아 나눌 이유가 없다
  const grouped = filter === '전체'
  const searching = query.trim().length > 0

  const openTask = (t: { id: string }) => {
    setOpenEditing(false)
    setOpenId(t.id)
  }
  const editTask = (t: { id: string }) => {
    setOpenEditing(true)
    setOpenId(t.id)
  }

  const listProps = { hitsById, childCount, parentTitleById }

  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title="업무"
        description="이번에 무엇을 했나. 끝낸 것은 맨 아래 아카이브로 내려갑니다."
        right={
          <>
            <SampleDataButton has={hasSample} />
            <Toggle value={view} onChange={setView} options={['목록', '칸반']} />
          </>
        }
      />

      {/*
        인박스를 맨 위로 올렸다.
        사용자가 써 보고 한 말 — *"인박스가 하단에 있어서 불편하더라"*.
        떠오른 것을 던져두는 자리인데 스크롤을 내려야 하면 그냥 안 던진다.
      */}
      <div className="mt-6">
        <InboxPanel />
      </div>

      {view === '목록' && (
        <div className="mt-8 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={[
                  'text-caption rounded-full px-3 py-1.5 border',
                  filter === f
                    ? 'text-action border-action font-semibold'
                    : 'text-ink-mute border-hairline hover:text-ink',
                ].join(' ')}
              >
                {f}
                <span className="ml-1 text-ink-mute">{countOf(f)}</span>
              </button>
            ))}
          </div>

          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="찾기 — 상세·메모·회신·영역까지 봅니다"
            aria-label="업무 찾기"
          />
        </div>
      )}

      <div className="mt-4">
        {isLoading ? (
          <p className="text-caption text-ink-mute">불러오는 중…</p>
        ) : view === '칸반' ? (
          <TaskBoard tasks={live} today={today} onOpen={openTask} />
        ) : shown.length === 0 ? (
          <Card>
            <EmptyState
              message={searching ? '걸리는 업무가 없습니다.' : `「${filter}」 업무가 없습니다.`}
              hint={emptyHint(filter, searching, live.length)}
              action={
                !hasSample && all.length === 0 && !searching ? <SampleDataButton has={false} /> : undefined
              }
            />
          </Card>
        ) : grouped ? (
          <TaskSections
            tasks={shown}
            today={today}
            onOpen={openTask}
            onEdit={editTask}
            /* 검색 중에는 다 펴 둔다 — 찾으러 왔는데 접혀 있으면 또 눌러야 한다 */
            forceOpen={searching}
            {...listProps}
          />
        ) : (
          <Card>
            <TaskList tasks={shown} today={today} onOpen={openTask} onEdit={editTask} {...listProps} />
          </Card>
        )}
      </div>

      {/* 끝낸 일은 눈앞에서 사라지지 않고 맨 아래에 접혀 있다 */}
      {view === '목록' && (
        <ArchiveSection
          tasks={archived}
          today={today}
          onOpen={openTask}
          onEdit={editTask}
          childCount={childCount}
          parentTitleById={parentTitleById}
        />
      )}

      {open && (
        <TaskDetail
          // 수정으로 열었는지에 따라 서랍을 새로 만든다.
          // key 가 같으면 안쪽 상태가 남아 두 번째 「수정」이 안 먹는다
          key={`${open.id}-${openEditing}`}
          task={open}
          startEditing={openEditing}
          onOpenOther={(t) => openTask(t)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

function emptyHint(filter: Filter, searching: boolean, liveCount: number): string {
  if (searching) return '낱말을 줄이거나 다른 말로 찾아 보세요. 여러 낱말은 전부 들어 있어야 걸립니다.'
  if (filter === '오늘 마감') return '오늘까지인 업무가 없습니다. 「전체」에서 앞으로 올 것을 볼 수 있습니다.'
  if (filter === DEFAULT_FILTER && liveCount > 0) {
    return `업무 ${liveCount}건이 아직 시작 전입니다. 「전체」를 눌러 보세요.`
  }
  return '위 인박스에 던져두었다가 업무로 올려도 됩니다.'
}

function Toggle<T extends string>({
  value, onChange, options,
}: {
  value: T
  onChange: (v: T) => void
  options: readonly T[]
}) {
  return (
    <div className="flex gap-1">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={[
            'text-caption rounded-full px-3 py-1.5 border',
            value === o
              ? 'text-action border-action font-semibold'
              : 'text-ink-mute border-hairline hover:text-ink',
          ].join(' ')}
        >
          {o}
        </button>
      ))}
    </div>
  )
}
