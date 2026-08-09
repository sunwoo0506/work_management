import { useState } from 'react'
import { Card, EmptyState, PageHeader } from '../components/ui'
import TaskList from '../features/tasks/TaskList'
import TaskBoard from '../features/tasks/TaskBoard'
import TaskDetail from '../features/tasks/TaskDetail'
import InboxPanel from '../features/inbox/InboxPanel'
import SampleDataButton from '../features/seed/SampleDataButton'
import { SAMPLE_MARK } from '../features/seed/sampleData'
import { useTasks } from '../features/tasks/hooks'
import { TASK_STATUSES } from '../domain/types'
import type { Task } from '../features/tasks/api'

type View = '목록' | '칸반'

export default function WorkPage() {
  const { data: tasks, isLoading } = useTasks()
  const [view, setView] = useState<View>('목록')
  const [filter, setFilter] = useState<string>('전체')
  const [open, setOpen] = useState<Task | null>(null)
  const today = new Date()

  const all = tasks ?? []
  const hasSample = all.some((t) => t.title.startsWith(SAMPLE_MARK))
  const shown = filter === '전체' ? all : all.filter((t) => t.status === filter)

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

      {view === '목록' && (
        <div className="flex flex-wrap gap-1.5 mt-5">
          {(['전체', ...TASK_STATUSES] as string[]).map((s) => (
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
              {s !== '전체' && (
                <span className="ml-1 text-ink-mute">
                  {all.filter((t) => t.status === s).length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        {isLoading ? (
          <p className="text-caption text-ink-mute">불러오는 중…</p>
        ) : view === '칸반' ? (
          <TaskBoard tasks={all} today={today} onOpen={setOpen} />
        ) : shown.length === 0 ? (
          <Card>
            <EmptyState
              message={filter === '전체' ? '아직 업무가 없습니다.' : `「${filter}」 업무가 없습니다.`}
              hint="사이드바의 「＋ 새 업무」로 만들거나, 아래 인박스에 던져두고 올리세요."
              action={!hasSample ? <SampleDataButton has={false} /> : undefined}
            />
          </Card>
        ) : (
          <Card>
            <TaskList tasks={shown} today={today} onOpen={setOpen} />
          </Card>
        )}
      </div>

      <InboxPanel />

      {open && <TaskDetail task={open} onClose={() => setOpen(null)} />}
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
