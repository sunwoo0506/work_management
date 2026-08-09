import { useState } from 'react'
import TaskList from '../features/tasks/TaskList'
import TaskBoard from '../features/tasks/TaskBoard'
import TaskDetail from '../features/tasks/TaskDetail'
import InboxPanel from '../features/inbox/InboxPanel'
import { useTasks } from '../features/tasks/hooks'
import type { Task } from '../features/tasks/api'

type View = '목록' | '칸반'

export default function WorkPage() {
  const { data: tasks, isLoading } = useTasks()
  const [view, setView] = useState<View>('목록')
  const [open, setOpen] = useState<Task | null>(null)
  const today = new Date()

  return (
    <div className="max-w-[900px]">
      <div className="flex items-baseline justify-between">
        <h1 className="text-[28px] leading-[1.2] font-semibold">업무</h1>
        <div className="flex gap-1">
          {(['목록', '칸반'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={[
                'text-caption rounded-full px-3 py-1.5 border',
                view === v
                  ? 'text-action border-action font-semibold'
                  : 'text-ink-mute border-hairline',
              ].join(' ')}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        {isLoading ? (
          <p className="text-caption text-ink-mute">불러오는 중…</p>
        ) : view === '목록' ? (
          <TaskList tasks={tasks ?? []} today={today} onOpen={setOpen} />
        ) : (
          <TaskBoard tasks={tasks ?? []} today={today} onOpen={setOpen} />
        )}
      </div>

      <InboxPanel />

      {open && <TaskDetail task={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
