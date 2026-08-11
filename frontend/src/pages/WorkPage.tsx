import { useState } from 'react'
import { Card, EmptyState, PageHeader } from '../components/ui'
import TaskList from '../features/tasks/TaskList'
import TaskSections from '../features/tasks/TaskSections'
import TaskBoard from '../features/tasks/TaskBoard'
import TaskDetail from '../features/tasks/TaskDetail'
import InboxPanel from '../features/inbox/InboxPanel'
import SampleDataButton from '../features/seed/SampleDataButton'
import { SAMPLE_MARK } from '../features/seed/sampleData'
import { useTasks } from '../features/tasks/hooks'
import { isDueToday } from '../domain/dday'
import { TASK_STATUSES } from '../domain/types'

type View = '목록' | '칸반'

/** 처음 여는 자리. 전체 46건이 아니라 **지금 붙잡고 있는 것**만 보인다 */
const DEFAULT_FILTER = '진행중'

export default function WorkPage() {
  const { data: tasks, isLoading } = useTasks()
  const [view, setView] = useState<View>('목록')
  const [filter, setFilter] = useState<string>(DEFAULT_FILTER)
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

  const all = tasks ?? []
  const open = all.find((t) => t.id === openId) ?? null
  const hasSample = all.some((t) => t.title.startsWith(SAMPLE_MARK))
  const shown = filter === '전체' ? all : all.filter((t) => t.status === filter)

  // 「전체」일 때만 영역별로 묶는다. 한 상태만 볼 때는 목록이 짧아 나눌 이유가 없다
  const grouped = filter === '전체'
  const dueToday = all.filter((t) => isDueToday(t, today)).length

  const openTask = (t: { id: string }) => {
    setOpenEditing(false)
    setOpenId(t.id)
  }
  const editTask = (t: { id: string }) => {
    setOpenEditing(true)
    setOpenId(t.id)
  }

  return (
    <div className="max-w-[1120px]">
      <PageHeader
        title="업무"
        description="이번에 무엇을 했나. 출처로 어디서 온 일인지 구분합니다."
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
        마찰이 0에 가까워야 하는 칸이라 첫 화면에서 손이 닿는 자리에 둔다.
      */}
      <div className="mt-6">
        <InboxPanel />
      </div>

      {view === '목록' && (
        <div className="flex flex-wrap items-center gap-1.5 mt-8">
          {([...TASK_STATUSES, '전체'] as string[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFilter(s)}
              className={[
                'text-caption rounded-full px-3 py-1.5 border',
                filter === s
                  ? 'text-action border-action font-semibold'
                  : 'text-ink-mute border-hairline hover:text-ink',
              ].join(' ')}
            >
              {s}
              <span className="ml-1 text-ink-mute">
                {s === '전체' ? all.length : all.filter((t) => t.status === s).length}
              </span>
            </button>
          ))}

          {dueToday > 0 && (
            <span className="text-caption text-ink font-semibold border border-ink rounded-full px-3 py-1 ml-2">
              오늘 마감 {dueToday}
            </span>
          )}
        </div>
      )}

      <div className="mt-4">
        {isLoading ? (
          <p className="text-caption text-ink-mute">불러오는 중…</p>
        ) : view === '칸반' ? (
          <TaskBoard tasks={all} today={today} onOpen={openTask} />
        ) : shown.length === 0 ? (
          <Card>
            <EmptyState
              message={
                filter === '전체' ? '아직 업무가 없습니다.' : `「${filter}」 업무가 없습니다.`
              }
              hint={
                filter === DEFAULT_FILTER && all.length > 0
                  ? `업무 ${all.length}건이 다른 상태에 있습니다. 위에서 「전체」를 눌러 보세요.`
                  : '위 인박스에 던져두었다가 업무로 올려도 됩니다.'
              }
              action={!hasSample && all.length === 0 ? <SampleDataButton has={false} /> : undefined}
            />
          </Card>
        ) : grouped ? (
          <TaskSections tasks={shown} today={today} onOpen={openTask} onEdit={editTask} />
        ) : (
          <Card>
            <TaskList tasks={shown} today={today} onOpen={openTask} onEdit={editTask} />
          </Card>
        )}
      </div>

      {open && (
        <TaskDetail
          // 수정으로 열었는지에 따라 서랍을 새로 만든다.
          // key 가 같으면 안쪽 상태가 남아 두 번째 「수정」이 안 먹는다
          key={`${open.id}-${openEditing}`}
          task={open}
          startEditing={openEditing}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
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
