import { useEffect, useState } from 'react'
import { PillButton, TextArea, TextInput } from '../../components/Field'
import { REQUESTED_SOURCES } from '../../domain/types'
import type { TaskSource } from '../../domain/types'
import { useChecklist, useChecklistMutations, useDeleteTask, useUpdateTask } from './hooks'
import TaskForm from './TaskForm'
import type { Task } from './api'

export default function TaskDetail({
  task,
  onClose,
  startEditing = false,
}: {
  task: Task
  onClose: () => void
  /** 목록에서 「수정」으로 들어오면 곧장 수정 상태로 연다 */
  startEditing?: boolean
}) {
  const [editing, setEditing] = useState(startEditing)
  const [confirming, setConfirming] = useState(false)
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
                  { before: task, patch: v },
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
              <section className="mt-5">
                <h3 className="text-caption text-ink-mute">상세</h3>
                <p className="text-body text-ink-soft mt-1 whitespace-pre-wrap leading-relaxed">
                  {task.detail}
                </p>
              </section>
            )}

            <Notes task={task} />

            <Checklist task={task} />

            {confirming ? (
              <DeleteConfirm
                task={task}
                busy={remove.isPending}
                error={remove.error}
                onCancel={() => setConfirming(false)}
                onConfirm={() => remove.mutate(task, { onSuccess: onClose })}
              />
            ) : (
              <div className="flex flex-wrap gap-2 mt-8">
                <PillButton type="button" onClick={() => setEditing(true)}>수정</PillButton>
                <ShareButton />
                <PillButton type="button" variant="ghost" onClick={() => setConfirming(true)}>
                  삭제
                </PillButton>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/**
 * 삭제 확인.
 *
 * 브라우저 기본 확인창을 안 쓴다. 그 창은 "이 업무를 삭제할까요?" 한 줄뿐이라
 * **같이 사라지는 것**을 못 보여준다. 체크리스트는 딸려서 함께 지워진다.
 *
 * 실행이력에는 「무엇을 언제 지웠나」가 남는다 — 업무는 사라져도 기록은 남는다.
 */
function DeleteConfirm({
  task,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  task: Task
  busy: boolean
  error: unknown
  onCancel: () => void
  onConfirm: () => void
}) {
  const { data: items } = useChecklist(task.id)
  const count = items?.length ?? 0
  const fromProcedure = !!task.run_id

  return (
    <div className="mt-8 border border-alert/30 rounded-md p-4">
      <p className="text-body font-semibold">삭제하면 되돌릴 수 없습니다.</p>

      <ul className="mt-2.5 space-y-1 text-caption text-ink-soft leading-relaxed">
        <li>· 업무 「{task.title}」</li>
        {count > 0 && <li>· 체크리스트 {count}건이 함께 지워집니다</li>}
        {fromProcedure && (
          <li className="text-ink-mute">
            · 이 업무는 절차 회차에서 나왔습니다. <strong className="font-semibold">회차 기록은 남습니다</strong>
          </li>
        )}
        <li className="text-ink-mute">· 「무엇을 언제 지웠나」는 실행이력에 남습니다</li>
      </ul>

      {error != null && (
        <p className="text-caption text-alert mt-2.5" role="alert">
          지우지 못했습니다 — {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      <div className="flex gap-2 mt-4">
        <PillButton type="button" variant="ghost" onClick={onConfirm} disabled={busy}>
          <span className="text-alert font-semibold">{busy ? '지우는 중…' : '지웁니다'}</span>
        </PillButton>
        <PillButton type="button" onClick={onCancel} disabled={busy}>
          그만두기
        </PillButton>
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

/**
 * 작업 메모.
 *
 * 「상세」와 다르다 —
 *   상세 = 이 일이 무엇인가.  시작하기 전에 적는다
 *   메모 = 하면서 알게 된 것.  하는 중에 쌓인다
 *
 * 수정 화면을 열지 않고 여기서 바로 쓴다. 일하다 알게 된 것을 적으려고
 * 폼을 열어 열두 칸을 지나가야 하면 안 적게 된다.
 *
 * 자동저장을 안 하는 이유 — 저장됐는지가 안 보인다. 바꾼 게 있을 때만
 * 저장 버튼이 뜨고, 누르면 사라진다. 그게 저장됐다는 신호다.
 */
function Notes({ task }: { task: Task }) {
  const update = useUpdateTask()
  const saved = task.notes ?? ''
  const [draft, setDraft] = useState(saved)
  useEffect(() => setDraft(saved), [saved])
  const dirty = draft !== saved

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-caption text-ink-mute">작업 메모</h3>
        {dirty && (
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => update.mutate({ before: task, patch: { notes: draft || null } })}
            className="text-caption text-action font-semibold disabled:opacity-40"
          >
            {update.isPending ? '저장 중…' : '저장'}
          </button>
        )}
      </div>

      <TextArea
        rows={5}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="하면서 알게 된 것 · 누구에게 뭘 물었나 · 막힌 지점 · 다음에 할 것"
        className="mt-1.5"
        aria-label="작업 메모"
      />

      <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
        여기 쌓인 것이 나중에 <strong className="font-semibold">절차</strong>가 됩니다. 같은 일을
        세 번 하면 이 메모를 근거로 절차 초안을 제안합니다.
      </p>

      {update.isError && (
        <p className="text-caption text-alert mt-1.5" role="alert">
          저장하지 못했습니다 —{' '}
          {update.error instanceof Error ? update.error.message : String(update.error)}
        </p>
      )}
    </section>
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
