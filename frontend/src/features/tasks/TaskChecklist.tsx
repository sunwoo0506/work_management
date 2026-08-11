import { useEffect, useState } from 'react'
import { TextArea, TextInput } from '../../components/Field'
import { daysUntil, ddayLabel } from '../../domain/dday'
import { checklistCount, progressFromChecklist } from '../../domain/progress'
import ChecklistFromAI from '../assistant/ChecklistFromAI'
import { useChecklist, useChecklistMutations, useTasks } from './hooks'
import type { ChecklistItem, Task } from './api'

/**
 * 체크리스트 — 할 일이 들어가는 **유일한 입구**.
 *
 * ── 왜 하나로 합쳤나 ─────────────────────────────────────
 * 어제까지 「체크리스트」와 「하위 업무」 둘이 있었다. 사용자가 써 보고 한 말:
 *   *"체크리스트와 관련 세부업무의 차이를 잘 모르겠어. 체크리스트를 만들고
 *     토글 형태로 관련 설명을 더 넣을 수 있게 만들면 간단업무와 기한자료가 다 커버될 거 같아"*
 *
 * 맞는 지적이다. **무엇을 쓸지 매번 고르게 하는 것 자체가 비용**이다.
 * 그래서 항상 여기로 적고, 항목을 펼치면 설명과 기한이 나온다.
 *
 * ── 그래도 「업무로 올리기」가 남아 있는 이유 ─────────────
 * 체크 항목은 **이 업무 안에서만 산다.** 목록·오늘·아카이브·검색 어디에도 안 나온다.
 * 항목 하나가 자기 첨부파일이 필요해지고 「오늘 마감」에 떠야 할 때가 온다.
 * 그때 한 번 눌러 올린다 — 인박스 승격과 같은 방식이다.
 * 처음부터 고르게 하지 않고, **필요해진 것만** 올라간다.
 */
export default function TaskChecklist({
  task,
  onOpenTask,
}: {
  task: Task
  /** 「업무로 올리기」로 만들어진 업무를 열 때 */
  onOpenTask?: (taskId: string) => void
}) {
  const { data: items } = useChecklist(task.id)
  const { data: tasks } = useTasks()
  const m = useChecklistMutations(task.id)
  const [label, setLabel] = useState('')

  const list = items ?? []
  const { done, total } = checklistCount(list)
  const pct = progressFromChecklist(list)
  const today = new Date()

  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-body font-semibold">체크리스트</h3>
        {total > 0 && (
          <span className="text-caption text-ink-mute">
            {done} / {total} · <strong className="font-semibold text-ink">{pct}%</strong>
          </span>
        )}
      </div>

      {/*
        여기엔 막대를 안 둔다.
        진행률 막대는 위쪽 「진행률」 자리에 하나만 있다. 체크리스트 바로 위에
        또 그리면 같은 값이 두 번 보여서 어느 게 진짜인지 헷갈린다.
      */}
      <ul className="mt-2.5">
        {list.map((c) => (
          <Item
            key={c.id}
            item={c}
            today={today}
            onToggle={(v) => m.toggle.mutate({ id: c.id, done: v })}
            onEdit={(patch) => m.edit.mutate({ id: c.id, patch })}
            onRemove={() => m.remove.mutate(c.id)}
            onPromote={() => m.promote.mutate({ item: c, parent: task })}
            promoting={m.promote.isPending}
            onCancelPromote={(alsoDeleteTask) =>
              m.cancelPromote.mutate({
                item: c,
                promoted: tasks?.find((t) => t.id === c.promoted_task_id) ?? null,
                alsoDeleteTask,
              })
            }
            cancelling={m.cancelPromote.isPending}
            promotedTask={tasks?.find((t) => t.id === c.promoted_task_id) ?? null}
            onOpenTask={onOpenTask}
          />
        ))}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const v = label.trim()
          if (!v) return
          m.add.mutate({ label: v, sortOrder: list.length }, { onSuccess: () => setLabel('') })
        }}
        className="mt-2"
      >
        <TextInput
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="할 일을 적고 엔터"
          aria-label="체크리스트 항목 추가"
        />
      </form>

      {/* 클로니에게 초안을 받는 자리. 담는 것은 사람이 누른다 */}
      <ChecklistFromAI task={task} startOrder={total} />

      <p className="text-caption text-ink-mute mt-2.5 leading-relaxed">
        진행률은 여기 체크한 것으로 <strong className="font-semibold">자동 계산</strong>됩니다.
        항목을 눌러 펼치면 <strong className="font-semibold">설명과 기한</strong>을 붙일 수 있고,
        따로 관리해야 할 만큼 커지면 <strong className="font-semibold">업무로 올릴</strong> 수 있습니다.
      </p>
    </section>
  )
}

/**
 * 한 줄 — 접혀 있다.
 *
 * 펼치면 설명·기한·올리기가 나온다. 접혀 있을 때는 **한 줄 그대로**다 —
 * 열 개짜리 목록에 칸이 서른 개 보이면 그게 벽이다.
 * 설명이나 기한이 붙어 있으면 접힌 상태에서도 표시가 남는다.
 */
function Item({
  item, today, onToggle, onEdit, onRemove, onPromote, promoting,
  onCancelPromote, cancelling, promotedTask, onOpenTask,
}: {
  item: ChecklistItem
  today: Date
  onToggle: (done: boolean) => void
  onEdit: (patch: { label?: string; note?: string | null; due_date?: string | null }) => void
  onRemove: () => void
  onPromote: () => void
  promoting: boolean
  onCancelPromote: (alsoDeleteTask: boolean) => void
  cancelling: boolean
  promotedTask: Task | null
  onOpenTask?: (taskId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [undoing, setUndoing] = useState(false)
  const [label, setLabel] = useState(item.label)
  const [note, setNote] = useState(item.note ?? '')

  useEffect(() => setLabel(item.label), [item.label])
  useEffect(() => setNote(item.note ?? ''), [item.note])

  const d = daysUntil(item.due_date, today)
  const overdue = d !== null && d < 0 && !item.done
  const noteDirty = note !== (item.note ?? '')

  return (
    <li className="border-b border-divider last:border-b-0">
      <div className="group flex items-center gap-2 py-2">
        <input
          type="checkbox"
          checked={item.done}
          onChange={(e) => onToggle(e.target.checked)}
          className="accent-[#0066cc] shrink-0"
          aria-label={item.label}
        />

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={`flex-1 min-w-0 text-left text-body truncate ${
            item.done ? 'text-ink-mute line-through' : ''
          }`}
        >
          <span className="text-ink-mute text-caption mr-1.5">{open ? '▾' : '▸'}</span>
          {item.label}
        </button>

        {/* 접혀 있어도 무엇이 붙어 있는지는 보인다 */}
        {item.note && !open && (
          <span className="shrink-0 text-caption text-ink-mute" title="설명 있음">✎</span>
        )}
        {item.due_date && (
          <span
            className={`shrink-0 text-caption ${overdue ? 'text-alert font-semibold' : 'text-ink-mute'}`}
          >
            {ddayLabel(d)}
          </span>
        )}
        {item.promoted_task_id && (
          <button
            type="button"
            onClick={() => onOpenTask?.(item.promoted_task_id as string)}
            className="shrink-0 text-caption text-action"
          >
            업무 ↗
          </button>
        )}

        <button
          type="button"
          onClick={onRemove}
          aria-label={`${item.label} 삭제`}
          className="shrink-0 text-caption text-ink-mute hover:text-alert px-1 opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          ×
        </button>
      </div>

      {open && (
        <div className="pl-6 pb-3 space-y-2.5">
          <label className="block">
            <span className="block text-caption text-ink-mute mb-1">할 일</span>
            <TextInput
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={() => {
                const v = label.trim()
                if (!v || v === item.label) { setLabel(item.label); return }
                onEdit({ label: v })
              }}
            />
          </label>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-caption text-ink-mute">설명 — 어떻게 하는 건가 · 무엇이 필요한가</span>
              {noteDirty && (
                <button
                  type="button"
                  onClick={() => onEdit({ note: note.trim() || null })}
                  className="text-caption text-action font-semibold"
                >
                  저장
                </button>
              )}
            </div>
            <TextArea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="예) 단가표는 공유폴더 3분기 자료에. 담당자 확인 먼저"
              className="mt-1"
              aria-label="항목 설명"
            />
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="block text-caption text-ink-mute mb-1">이 항목 기한</span>
              <TextInput
                type="date"
                value={item.due_date ?? ''}
                onChange={(e) => onEdit({ due_date: e.target.value || null })}
                className="w-auto"
              />
            </label>

            {item.promoted_task_id ? (
              <div className="pb-2 flex items-center gap-3">
                <span className="text-caption text-ink-mute">업무로 올려 두었습니다.</span>
                <button
                  type="button"
                  onClick={() => setUndoing(true)}
                  className="text-caption text-action font-semibold"
                >
                  올리기 취소
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onPromote}
                disabled={promoting}
                className="text-caption text-action font-semibold pb-2.5 disabled:opacity-40"
              >
                {promoting ? '올리는 중…' : '업무로 올리기 ↗'}
              </button>
            )}
          </div>

          {undoing && (
            <UndoPromotion
              promoted={promotedTask}
              busy={cancelling}
              onPick={(alsoDelete) => {
                onCancelPromote(alsoDelete)
                setUndoing(false)
              }}
              onCancel={() => setUndoing(false)}
            />
          )}

          {!item.promoted_task_id && (
            <p className="text-caption text-ink-mute leading-relaxed">
              이 항목이 <strong className="font-semibold">자기 첨부파일·자기 대화</strong>가 필요해지거나
              목록의 <strong className="font-semibold">「오늘 마감」에 떠야</strong> 하면 업무로 올리세요.
              올려도 이 줄은 남습니다.
            </p>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * 올리기 취소 — 두 갈래를 **말로 구분해서** 물어본다.
 *
 * 「취소」 한 마디로 처리하면 안 되는 자리다. 올린 업무에 그새 파일이 붙고
 * 클로니와 대화를 했을 수 있는데, 그것까지 조용히 지워지면 되돌릴 방법이 없다.
 *
 * 체크 항목 자체는 **어느 쪽이든 남는다.**
 */
function UndoPromotion({
  promoted, busy, onPick, onCancel,
}: {
  promoted: Task | null
  busy: boolean
  onPick: (alsoDeleteTask: boolean) => void
  onCancel: () => void
}) {
  if (!promoted) {
    // 올린 업무가 이미 지워진 경우 — 줄만 끊으면 된다
    return (
      <div className="bg-parchment rounded-md px-3.5 py-3">
        <p className="text-caption text-ink-soft">올렸던 업무가 이미 없습니다. 연결만 끊습니다.</p>
        <div className="flex gap-3 mt-2">
          <button
            type="button"
            onClick={() => onPick(false)}
            disabled={busy}
            className="text-caption text-action font-semibold disabled:opacity-40"
          >
            연결 끊기
          </button>
          <button type="button" onClick={onCancel} className="text-caption text-ink-mute">그만두기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-parchment rounded-md px-3.5 py-3">
      <p className="text-body">「{promoted.title}」을 어떻게 할까요?</p>

      <div className="mt-2.5 space-y-2.5">
        <div>
          <button
            type="button"
            onClick={() => onPick(true)}
            disabled={busy}
            className="text-caption text-alert font-semibold disabled:opacity-40"
          >
            {busy ? '되돌리는 중…' : '업무를 지우고 체크 항목으로 되돌리기'}
          </button>
          <p className="text-caption text-ink-mute mt-0.5 leading-relaxed">
            잘못 눌렀을 때. 그 업무에 붙은 <strong className="font-semibold">파일과 클로니 대화도 함께 지워집니다.</strong>
            되돌릴 수 없습니다.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => onPick(false)}
            disabled={busy}
            className="text-caption text-action font-semibold disabled:opacity-40"
          >
            연결만 끊고 업무는 그대로 두기
          </button>
          <p className="text-caption text-ink-mute mt-0.5 leading-relaxed">
            그 업무가 이미 제 몫을 하고 있을 때. 따로 사는 업무가 되고, 이 체크 항목과의 줄만 끊깁니다.
          </p>
        </div>
      </div>

      <button type="button" onClick={onCancel} className="text-caption text-ink-mute mt-3">
        그만두기
      </button>
    </div>
  )
}
