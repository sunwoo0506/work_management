import { useState } from 'react'
import { PillButton, TextInput } from '../../components/Field'
import { REQUESTED_SOURCES } from '../../domain/types'
import type { TaskSource } from '../../domain/types'
import { useChecklist, useChecklistMutations, useDeleteTask, useUpdateTask } from './hooks'
import TaskForm from './TaskForm'
import type { Task } from './api'

export default function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const [editing, setEditing] = useState(false)
  const update = useUpdateTask()
  const remove = useDeleteTask()

  return (
    <div className="fixed inset-0 bg-ink/20 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-canvas w-full max-w-[560px] h-full overflow-y-auto p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-tagline font-semibold flex-1">{task.title}</h2>
          <button type="button" onClick={onClose} className="text-caption text-ink-mute">닫기</button>
        </div>

        {editing ? (
          <div className="mt-6">
            <TaskForm
              initial={task}
              busy={update.isPending}
              onCancel={() => setEditing(false)}
              onSubmit={(v) =>
                update.mutate(
                  { id: task.id, patch: v },
                  { onSuccess: () => setEditing(false) },
                )
              }
            />
          </div>
        ) : (
          <>
            <dl className="mt-6 grid grid-cols-[88px_1fr] gap-y-2.5 text-body">
              <Row label="출처" value={task.source} />
              <Row label="상태" value={task.status} />
              <Row label="중요도" value={task.priority} />
              <Row label="영역" value={task.area ?? '—'} />
              <Row label="기한" value={task.due_date ?? '—'} />
              <Row label="진행률" value={`${task.progress}%`} />
              {REQUESTED_SOURCES.includes(task.source as TaskSource) && (
                <>
                  <Row label="요청자" value={task.requester ?? '—'} />
                  <Row label="회신" value={task.reply_body ?? '(아직 없음)'} />
                </>
              )}
            </dl>

            {task.detail && (
              <p className="text-body text-ink-soft mt-5 whitespace-pre-wrap leading-relaxed">
                {task.detail}
              </p>
            )}

            <Checklist task={task} />

            <div className="flex flex-wrap gap-2 mt-8">
              <PillButton type="button" onClick={() => setEditing(true)}>수정</PillButton>
              <ShareButton />
              <PillButton
                type="button"
                variant="ghost"
                onClick={() => {
                  if (confirm('이 업무를 삭제할까요?')) {
                    remove.mutate(task.id, { onSuccess: onClose })
                  }
                }}
              >
                삭제
              </PillButton>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-caption text-ink-mute pt-0.5">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </>
  )
}

/** 연동 계약서가 확정되지 않아 6단계에서 연결한다. 자리만 만들어 둔다. */
function ShareButton() {
  const [msg, setMsg] = useState(false)
  return (
    <span className="relative">
      <PillButton type="button" variant="ghost" onClick={() => setMsg((v) => !v)}>
        이슈로 공유
      </PillButton>
      {msg && (
        <span className="block text-caption text-ink-mute mt-2">
          6단계(경영관리서비스 연동)에서 연결됩니다. 연동 계약서가 확정된 뒤에 만듭니다.
        </span>
      )}
    </span>
  )
}

function Checklist({ task }: { task: Task }) {
  const { data: items } = useChecklist(task.id)
  const m = useChecklistMutations(task.id)
  const [label, setLabel] = useState('')

  return (
    <section className="mt-8">
      <h3 className="text-caption text-ink-mute">체크리스트</h3>
      <ul className="mt-2 space-y-1.5">
        {(items ?? []).map((c) => (
          <li key={c.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={c.done}
              onChange={(e) => m.toggle.mutate({ id: c.id, done: e.target.checked })}
              className="accent-[#0066cc]"
            />
            <span className={`text-body flex-1 ${c.done ? 'text-ink-mute line-through' : ''}`}>
              {c.label}
            </span>
            <button
              type="button"
              onClick={() => m.remove.mutate(c.id)}
              className="text-caption text-ink-mute"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          const v = label.trim()
          if (!v) return
          m.add.mutate({ label: v, sortOrder: items?.length ?? 0 }, { onSuccess: () => setLabel('') })
        }}
        className="mt-2"
      >
        <TextInput
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="항목 추가 후 엔터"
          aria-label="체크리스트 항목 추가"
        />
      </form>
    </section>
  )
}
