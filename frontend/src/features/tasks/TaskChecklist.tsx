import { useEffect, useRef, useState } from 'react'
import { TextInput } from '../../components/Field'
import { checklistCount, progressFromChecklist } from '../../domain/progress'
import { useChecklist, useChecklistMutations } from './hooks'
import type { ChecklistItem, Task } from './api'

/**
 * 체크리스트.
 *
 * 두 가지가 사용자 요구로 바뀌었다 —
 *   ① 항목 글귀를 **고칠 수 있다.** 전엔 지웠다 다시 만드는 수밖에 없었고,
 *      그러면 체크해 둔 것이 날아갔다.
 *   ② 여기 체크한 것이 곧 **진행률**이다. 손으로 끄는 막대는 근거가 없다.
 */
export default function TaskChecklist({ task }: { task: Task }) {
  const { data: items } = useChecklist(task.id)
  const m = useChecklistMutations(task.id)
  const [label, setLabel] = useState('')

  const list = items ?? []
  const { done, total } = checklistCount(list)
  const pct = progressFromChecklist(list)

  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-caption text-ink-mute">체크리스트</h3>
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
        여기서는 「3 / 5 · 60%」 숫자로 충분하다 — 몇 개짜리인지가 더 중요하다.
      */}
      <ul className="mt-2.5 space-y-0.5">
        {list.map((c) => (
          <Item
            key={c.id}
            item={c}
            onToggle={(v) => m.toggle.mutate({ id: c.id, done: v })}
            onRename={(v) => m.rename.mutate({ id: c.id, label: v })}
            onRemove={() => m.remove.mutate(c.id)}
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
          placeholder="할 일을 한 줄로 적고 엔터 — 예) 지난 분기 단가표 받기"
          aria-label="체크리스트 항목 추가"
        />
      </form>

      <p className="text-caption text-ink-mute mt-2 leading-relaxed">
        {total > 0 ? (
          <>진행률은 여기 체크한 것으로 <strong className="font-semibold">자동 계산</strong>됩니다. 손으로 끄지 않습니다.</>
        ) : (
          <>항목을 하나라도 만들면 그때부터 <strong className="font-semibold">진행률이 자동</strong>으로 계산됩니다.</>
        )}
      </p>
    </section>
  )
}

/**
 * 한 줄.
 *
 * 글귀를 누르면 그 자리에서 고친다. 엔터·포커스가 떠나면 저장, Esc 면 되돌린다.
 * 별도 수정 버튼을 두지 않은 이유 — 줄마다 버튼이 셋이면 목록이 시끄러워진다.
 */
function Item({
  item,
  onToggle,
  onRename,
  onRemove,
}: {
  item: ChecklistItem
  onToggle: (done: boolean) => void
  onRename: (label: string) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.label)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => setDraft(item.label), [item.label])
  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  function commit() {
    const v = draft.trim()
    setEditing(false)
    if (!v || v === item.label) {
      setDraft(item.label)
      return
    }
    onRename(v)
  }

  return (
    <li className="group flex items-center gap-2 py-1">
      <input
        type="checkbox"
        checked={item.done}
        onChange={(e) => onToggle(e.target.checked)}
        className="accent-[#0066cc] shrink-0"
        aria-label={item.label}
      />

      {editing ? (
        <input
          ref={ref}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
            if (e.key === 'Escape') {
              setDraft(item.label)
              setEditing(false)
            }
          }}
          className="flex-1 min-w-0 text-body bg-canvas border border-action rounded-sm px-2 py-0.5 outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          title="눌러서 고치기"
          className={`flex-1 min-w-0 text-left text-body truncate ${
            item.done ? 'text-ink-mute line-through' : ''
          }`}
        >
          {item.label}
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
    </li>
  )
}
