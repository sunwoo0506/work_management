import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TaskForm from '../features/tasks/TaskForm'
import { useCreateTask } from '../features/tasks/hooks'

/**
 * 빠른 입력.
 *
 * 새 업무는 여기서 바로 만들고, 회의록·전화메모는 「기록」 탭의
 * 해당 화면으로 데려간다. 사이드바에서 세 번 누를 것을 한 번에 끝낸다.
 */
export default function QuickAdd() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const create = useCreateTask()

  return (
    <div>
      <p className="text-caption text-ink-mute px-2 mb-2">빠른 입력</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-caption text-action bg-canvas border border-hairline rounded-full px-3 py-1.5"
        >
          ＋ 새 업무
        </button>
        <button
          type="button"
          onClick={() => navigate('/record?view=회의록')}
          className="text-caption text-action bg-canvas border border-hairline rounded-full px-3 py-1.5"
        >
          ＋ 회의록
        </button>
        <button
          type="button"
          onClick={() => navigate('/record?view=전화메모')}
          className="text-caption text-action bg-canvas border border-hairline rounded-full px-3 py-1.5"
        >
          ＋ 전화메모
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 bg-ink/20 z-50 grid place-items-center px-6" onClick={() => setOpen(false)}>
          <div
            className="bg-canvas rounded-lg border border-hairline p-7 w-full max-w-[560px] max-h-[86vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-tagline font-semibold mb-5">새 업무</h2>
            <TaskForm
              busy={create.isPending}
              onCancel={() => setOpen(false)}
              onSubmit={(v) => create.mutate(v, { onSuccess: () => setOpen(false) })}
            />
          </div>
        </div>
      )}
    </div>
  )
}
