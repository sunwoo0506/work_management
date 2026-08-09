import { useState } from 'react'
import TaskForm from '../features/tasks/TaskForm'
import { useCreateTask } from '../features/tasks/hooks'

/**
 * 빠른 입력.
 *
 * 회의록·전화메모는 7단계에서 붙는다. 지금은 눌러도 안내만 뜬다 —
 * 버튼을 아예 안 만들면 "그런 기능이 있었나"를 잊어버린다.
 */
export default function QuickAdd() {
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
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
          onClick={() => setNotice('회의록은 7단계에서 만듭니다.')}
          className="text-caption text-ink-mute bg-canvas border border-hairline rounded-full px-3 py-1.5"
        >
          ＋ 회의록
        </button>
        <button
          type="button"
          onClick={() => setNotice('전화메모는 7단계에서 만듭니다.')}
          className="text-caption text-ink-mute bg-canvas border border-hairline rounded-full px-3 py-1.5"
        >
          ＋ 전화메모
        </button>
      </div>

      {notice && (
        <p className="text-caption text-ink-mute mt-2 px-2 leading-relaxed">{notice}</p>
      )}

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
