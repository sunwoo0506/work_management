import { useState } from 'react'
import { PillButton } from '../../components/Field'
import { ProgressBar } from '../../components/ui'
import { checklistCount } from '../../domain/progress'
import { priorityLabel } from '../../domain/priority'
import { REQUESTED_SOURCES } from '../../domain/types'
import type { TaskSource } from '../../domain/types'
import AttachmentPanel from '../attachments/AttachmentPanel'
import AssistantPanel from '../assistant/AssistantPanel'
import { useChecklist, useDeleteTask, useUpdateTask } from './hooks'
import { GUIDES } from './guides'
import TaskChecklist from './TaskChecklist'
import TaskTextSection from './TaskTextSection'
import TaskForm from './TaskForm'
import type { Task } from './api'

/**
 * 업무 서랍.
 *
 * 위에서 아래로 일하는 순서를 따른다 —
 *   무엇인가(상세) → 뭘 해야 하나(체크리스트) → 자료(첨부) → 막히면(AI) → 알게 된 것(메모)
 *
 * 「작업 메모」가 맨 아래인 이유 — 그건 일이 끝나갈 때 적는 칸이다.
 * 위에 두면 빈 칸이 먼저 보이고 무엇을 적어야 할지 모른다.
 */
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
  const { data: checklist } = useChecklist(task.id)
  const isRequested = REQUESTED_SOURCES.includes(task.source as TaskSource)

  const { done, total } = checklistCount(checklist ?? [])
  const progressNote = total > 0 ? `체크리스트 ${done} / ${total}` : '손으로 정한 값'

  return (
    <div className="fixed inset-0 bg-ink/20 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-canvas w-full max-w-[620px] h-full overflow-y-auto p-8"
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
            <dl className="mt-6 grid grid-cols-[88px_1fr] gap-y-2.5 text-body items-baseline">
              <Row label="출처" value={task.source} />
              <Row label="상태" value={task.status} />
              <Row label="중요도" value={priorityLabel(task.priority)} />
              <Row label="영역" value={task.area ?? '—'} />
              <Row label="기한" value={task.due_date ?? '—'} />
              {isRequested && <Row label="요청자" value={task.requester ?? '—'} />}

              <dt className="text-caption text-ink-mute pt-1">진행률</dt>
              <dd className="text-ink">
                <ProgressBar pct={task.progress} label={progressNote} />
              </dd>
            </dl>

            <TaskTextSection task={task} field="detail" label="상세" guide={GUIDES.detail} />

            <TaskChecklist task={task} />

            <AttachmentPanel taskId={task.id} />

            <AssistantPanel task={task} />

            <TaskTextSection
              task={task}
              field="notes"
              label="작업 메모"
              guide={GUIDES.notes}
              footer={
                <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
                  여기 쌓인 것이 나중에 <strong className="font-semibold">절차</strong>가 됩니다. 같은 일을
                  세 번 하면 이 메모를 근거로 절차 초안을 제안합니다.
                </p>
              }
            />

            {isRequested && (
              <TaskTextSection
                task={task}
                field="reply_body"
                label="회신"
                guide={GUIDES.reply}
                rows={3}
                footer={
                  <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
                    요청받은 업무는 이 칸을 적어야 <strong className="font-semibold">「완료」로 닫을 수</strong> 있습니다.
                  </p>
                }
              />
            )}

            {confirming ? (
              <DeleteConfirm
                task={task}
                busy={remove.isPending}
                error={remove.error}
                onCancel={() => setConfirming(false)}
                onConfirm={() => remove.mutate(task, { onSuccess: onClose })}
              />
            ) : (
              <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t border-hairline">
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
 * **같이 사라지는 것**을 못 보여준다. 체크리스트와 첨부파일이 딸려서 함께 지워진다.
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
        <li>· 붙여 둔 첨부파일과 AI 대화도 함께 지워집니다</li>
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
