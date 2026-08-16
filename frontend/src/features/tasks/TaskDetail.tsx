import { useState } from 'react'
import { PillButton } from '../../components/Field'
import { ProgressBar } from '../../components/ui'
import { completionBlock } from '../../domain/complete'
import { resolveProgress } from '../../domain/progress'
import { priorityLabel } from '../../domain/priority'
import { REQUESTED_SOURCES } from '../../domain/types'
import type { TaskSource } from '../../domain/types'
import AttachmentPanel from '../attachments/AttachmentPanel'
import ChatWindow, { ASSISTANT_NAME } from '../assistant/ChatWindow'
import { useMessages, useThread } from '../assistant/hooks'
import TaskHierarchy from './TaskHierarchy'
import {
  useChangeStatus, useChecklist, useDeleteTask, useReturnToChecklist,
  useSourceChecklistItem, useSubtasks, useTasks, useUpdateTask,
} from './hooks'
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
  onOpenOther,
  startEditing = false,
}: {
  task: Task
  onClose: () => void
  /** 세부업무를 눌렀을 때 그 업무로 갈아타기 */
  onOpenOther?: (t: Task) => void
  /** 목록에서 「수정」으로 들어오면 곧장 수정 상태로 연다 */
  startEditing?: boolean
}) {
  const [editing, setEditing] = useState(startEditing)
  const [confirming, setConfirming] = useState(false)
  const [chatting, setChatting] = useState(false)
  const { data: tasks } = useTasks()
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const change = useChangeStatus()
  const { data: checklist } = useChecklist(task.id)
  const children = useSubtasks(task.id)
  const isRequested = REQUESTED_SOURCES.includes(task.source as TaskSource)

  const progress = resolveProgress({
    children,
    checklist: checklist ?? [],
    manual: task.progress,
  })
  const isDone = task.status === '완료'
  const blocked = isDone ? null : completionBlock(task)

  return (
    <div className="fixed inset-0 bg-ink/20 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-canvas w-full max-w-[620px] h-full overflow-y-auto p-5 lg:p-8"
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
                <ProgressBar pct={progress.pct} label={progress.note} />
              </dd>
            </dl>

            {/* 체크 항목에서 올라온 업무라면, 여기서도 되돌릴 수 있어야 한다 */}
            <FromChecklistBanner task={task} onClose={onClose} onOpenOther={onOpenOther} />

            <TaskTextSection task={task} field="detail" label="상세" guide={GUIDES.detail} />

            {/* 클로니 — 상세 바로 다음. 막히는 건 대개 일을 시작하자마자 나온다 */}
            <AssistantLauncher task={task} onOpen={() => setChatting(true)} />

            {/* 파일이 체크리스트 위 — 자료를 먼저 붙이고, 그걸 보고 할 일을 적는다 */}
            <AttachmentPanel taskId={task.id} />

            <TaskChecklist
              task={task}
              onOpenTask={(id) => {
                const t = tasks?.find((x) => x.id === id)
                if (t) onOpenOther?.(t)
              }}
            />

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

            {/* 「이 업무가 어디 속했나」 — 일하는 칸이 아니라 위치를 확인하는 칸이라 맨 아래 */}
            <TaskHierarchy task={task} onOpen={(t) => onOpenOther?.(t)} />

            {confirming ? (
              <DeleteConfirm
                task={task}
                busy={remove.isPending}
                error={remove.error}
                onCancel={() => setConfirming(false)}
                onConfirm={() => remove.mutate(task, { onSuccess: onClose })}
              />
            ) : (
              <div className="mt-8 pt-6 border-t border-hairline">
                {/* 닫는 버튼이 맨 앞이다. 서랍까지 열었다는 건 대개 끝냈다는 뜻이다 */}
                <div className="flex flex-wrap gap-2">
                  {/*
                    닫으면 서랍도 닫는다.
                    사용자 말 — *"완료로 닫기를 누르면 해당 세부업무 창을 닫게 해줘"*.
                    끝냈다고 표시했는데 그 화면이 그대로 떠 있으면 한 번 더 닫아야 한다.
                    다시 열기는 서랍을 유지한다 — 다시 연 건 계속 볼 일이 있다는 뜻이다.
                  */}
                  <PillButton
                    type="button"
                    variant={isDone ? 'ghost' : 'primary'}
                    disabled={change.isPending || !!blocked}
                    onClick={() =>
                      change.mutate(
                        { task, status: isDone ? '진행중' : '완료' },
                        { onSuccess: () => { if (!isDone) onClose() } },
                      )
                    }
                  >
                    {change.isPending ? '바꾸는 중…' : isDone ? '다시 열기' : '✓ 완료로 닫기'}
                  </PillButton>
                  <PillButton type="button" variant="ghost" onClick={() => setEditing(true)}>수정</PillButton>
                  <ShareButton />
                  <PillButton type="button" variant="ghost" onClick={() => setConfirming(true)}>
                    삭제
                  </PillButton>
                </div>

                {blocked && (
                  <p className="text-caption text-ink-soft bg-parchment rounded-md mt-2.5 px-3 py-2" role="alert">
                    {blocked}
                  </p>
                )}
                {isDone && task.completed_at && (
                  <p className="text-caption text-ink-mute mt-2.5">
                    {new Date(task.completed_at).toLocaleString('ko-KR')}에 닫았습니다.
                    아카이브에서 찾을 수 있습니다.
                  </p>
                )}
                {change.isError && (
                  <p className="text-caption text-alert mt-2.5" role="alert">
                    {change.error instanceof Error ? change.error.message : String(change.error)}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/*
        클로니 채팅창은 **서랍 밖**에 뜬다.
        서랍 안에 두면 대화가 길어질 때 아래 칸들이 저 멀리 밀린다.
        떠 있는 창은 안에서만 스크롤되고 서랍은 안 밀린다.
      */}
      {chatting && (
        <div onClick={(e) => e.stopPropagation()}>
          <ChatWindow task={task} onClose={() => setChatting(false)} />
        </div>
      )}
    </div>
  )
}

/**
 * 「이 업무는 체크 항목에서 올라왔습니다」 — 되돌아가는 길.
 *
 * ── 왜 필요했나 ──────────────────────────────────────────
 * 취소 버튼을 **올린 쪽**(부모 서랍의 체크 항목 안)에만 뒀었다.
 * 그런데 사람은 올라온 업무를 보다가 "아 이건 그냥 체크로 충분한데" 하고 깨닫는다.
 * 그 순간 이 화면에는 되돌릴 길이 없었다. 사용자가 그걸 찾다 물었다.
 *
 * 되돌리는 자리는 **깨닫는 자리**에 있어야 한다. 양쪽 다 둔다.
 */
function FromChecklistBanner({
  task,
  onClose,
  onOpenOther,
}: {
  task: Task
  onClose: () => void
  onOpenOther?: (t: Task) => void
}) {
  const { data: item } = useSourceChecklistItem(task.id)
  const { data: tasks } = useTasks()
  const back = useReturnToChecklist()
  const [asking, setAsking] = useState(false)

  if (!item) return null
  const parent = tasks?.find((t) => t.id === item.task_id) ?? null

  return (
    <section className="mt-5 bg-parchment border border-hairline rounded-md px-4 py-3">
      <div className="flex items-center gap-3">
        <p className="text-caption text-ink-soft flex-1 min-w-0 leading-relaxed">
          {parent ? (
            <>
              <button
                type="button"
                onClick={() => onOpenOther?.(parent)}
                className="text-action font-semibold"
              >
                「{parent.title}」
              </button>
              의 체크 항목에서 올라온 업무입니다.
            </>
          ) : (
            '체크 항목에서 올라온 업무입니다.'
          )}
        </p>
        {!asking && (
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="shrink-0 text-caption text-action font-semibold"
          >
            체크리스트로 되돌리기
          </button>
        )}
      </div>

      {asking && (
        <div className="mt-3 space-y-2.5">
          <div>
            <button
              type="button"
              disabled={back.isPending}
              onClick={() =>
                back.mutate(
                  { item, promoted: task, alsoDeleteTask: true },
                  { onSuccess: onClose },
                )
              }
              className="text-caption text-alert font-semibold disabled:opacity-40"
            >
              {back.isPending ? '되돌리는 중…' : '이 업무를 지우고 체크 항목으로 되돌리기'}
            </button>
            <p className="text-caption text-ink-mute mt-0.5 leading-relaxed">
              여기 붙은 <strong className="font-semibold">파일과 클로니 대화도 함께 지워집니다.</strong>
              되돌릴 수 없습니다. 체크 항목은 남습니다.
            </p>
          </div>

          <div>
            <button
              type="button"
              disabled={back.isPending}
              onClick={() => back.mutate({ item, promoted: task, alsoDeleteTask: false })}
              className="text-caption text-action font-semibold disabled:opacity-40"
            >
              연결만 끊고 이 업무는 그대로 두기
            </button>
            <p className="text-caption text-ink-mute mt-0.5 leading-relaxed">
              따로 사는 업무가 됩니다. 체크 항목과의 줄만 끊깁니다.
            </p>
          </div>

          <button type="button" onClick={() => setAsking(false)} className="text-caption text-ink-mute">
            그만두기
          </button>

          {back.isError && (
            <p className="text-caption text-alert" role="alert">
              {back.error instanceof Error ? back.error.message : String(back.error)}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * 클로니 부르기.
 *
 * 대화 내용을 서랍에 늘어놓지 않는다 — 사용자 말대로 *"대화가 부담스러워"*진다.
 * 여기는 **부르는 버튼과 지난 대화가 몇 마디인지**만 보여 준다.
 */
function AssistantLauncher({ task, onOpen }: { task: Task; onOpen: () => void }) {
  const { data: thread } = useThread(task.id)
  const { data: messages } = useMessages(thread?.id ?? null)
  const count = messages?.length ?? 0

  return (
    <section className="mt-7">
      <div className="flex items-center gap-3 bg-parchment border border-hairline rounded-md px-4 py-3">
        <div className="flex-1 min-w-0">
          <p className="text-body font-semibold">{ASSISTANT_NAME}에게 물어보기</p>
          <p className="text-caption text-ink-mute mt-0.5 leading-relaxed">
            {count > 0
              ? `지난 대화 ${count}마디가 남아 있습니다. 이어서 물어볼 수 있습니다.`
              : '이 업무의 상세 · 메모 · 체크리스트 · 첨부파일만 보고 답합니다.'}
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="shrink-0 text-caption text-action font-semibold"
        >
          {count > 0 ? '대화 이어가기' : '대화 열기'}
        </button>
      </div>
    </section>
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
  const children = useSubtasks(task.id)
  const count = items?.length ?? 0
  const fromProcedure = !!task.run_id

  return (
    <div className="mt-8 border border-alert/30 rounded-md p-4">
      <p className="text-body font-semibold">삭제하면 되돌릴 수 없습니다.</p>

      <ul className="mt-2.5 space-y-1 text-caption text-ink-soft leading-relaxed">
        <li>· 업무 「{task.title}」</li>
        {count > 0 && <li>· 체크리스트 {count}건이 함께 지워집니다</li>}
        <li>· 붙여 둔 첨부파일과 AI 대화도 함께 지워집니다</li>
        {/* 하위 업무는 제 몫을 하는 업무다. 소리 없이 사라지면 안 된다 */}
        {children.length > 0 && (
          <li className="text-ink-mute">
            · 세부업무 {children.length}건은 <strong className="font-semibold">지워지지 않습니다</strong> —
            최상위 업무로 올라옵니다
          </li>
        )}
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
