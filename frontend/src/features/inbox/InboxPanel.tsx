import { useState } from 'react'
import { PillButton, Select, TextInput } from '../../components/Field'
import { Card } from '../../components/ui'
import { AREAS, PRIORITIES } from '../../domain/types'
import type { Priority } from '../../domain/types'
import { useCaptureInbox, useDiscardInbox, useInbox, usePromoteInbox } from './hooks'
import type { InboxItem } from './hooks'

/** 인박스 — 떠오른 것을 마찰 없이 던져두는 곳. 엔터 한 번으로 저장된다. */
export default function InboxPanel() {
  const { data: items } = useInbox()
  const capture = useCaptureInbox()
  const [text, setText] = useState('')
  const [promoting, setPromoting] = useState<InboxItem | null>(null)

  // 바깥 여백은 놓는 쪽이 정한다 — 위로 올라가면서 아래 붙박이 여백이 걸리적거렸다
  return (
    <div>
      <Card title="인박스" count={items?.length ?? 0}>
        <p className="text-caption text-ink-mute -mt-1 mb-3">
          분류하지 말고 던져두세요. 나중에 업무로 올리면 됩니다.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            const v = text.trim()
            if (!v) return
            capture.mutate(v, { onSuccess: () => setText('') })
          }}
        >
          <TextInput
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="떠오른 것을 적고 엔터"
            aria-label="인박스에 메모 추가"
          />
        </form>

        {items && items.length > 0 ? (
          <ul className="mt-3 divide-y divide-divider">
            {items.map((it) => (
              <InboxRow key={it.id} item={it} onPromote={() => setPromoting(it)} />
            ))}
          </ul>
        ) : (
          <p className="text-caption text-ink-mute mt-4">비어 있습니다.</p>
        )}
      </Card>

      {promoting && <PromoteDialog item={promoting} onClose={() => setPromoting(null)} />}
    </div>
  )
}

function InboxRow({ item, onPromote }: { item: InboxItem; onPromote: () => void }) {
  const discard = useDiscardInbox()
  return (
    <li className="py-3 flex items-start gap-3">
      <span className="flex-1 text-body">{item.content}</span>
      <button
        type="button"
        onClick={onPromote}
        className="text-caption text-action shrink-0 hover:underline"
      >
        업무로
      </button>
      <button
        type="button"
        onClick={() => discard.mutate(item.id)}
        className="text-caption text-ink-mute shrink-0 hover:text-ink"
      >
        버림
      </button>
    </li>
  )
}

function PromoteDialog({ item, onClose }: { item: InboxItem; onClose: () => void }) {
  const promote = usePromoteInbox()
  const [priority, setPriority] = useState<Priority>('P1')
  const [dueDate, setDueDate] = useState('')
  const [area, setArea] = useState('')

  return (
    <div className="fixed inset-0 bg-ink/20 grid place-items-center px-6 z-50">
      <div className="bg-canvas rounded-lg border border-hairline p-6 w-full max-w-[440px]">
        <h3 className="text-tagline font-semibold">업무로 올리기</h3>
        <p className="text-body text-ink-soft mt-2 line-clamp-3">{item.content}</p>
        {item.content.length > 60 && (
          <p className="text-caption text-ink-mute mt-1">
            60자가 넘어 제목은 잘리고 전문은 상세에 들어갑니다.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
          <label className="block">
            <span className="block text-caption text-ink-soft mb-1.5">중요도</span>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </label>
          <label className="block">
            <span className="block text-caption text-ink-soft mb-1.5">기한</span>
            <TextInput type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-caption text-ink-soft mb-1.5">영역</span>
            <Select value={area} onChange={(e) => setArea(e.target.value)}>
              <option value="">—</option>
              {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </label>
        </div>

        <div className="flex gap-2 mt-6">
          <PillButton
            type="button"
            disabled={promote.isPending}
            onClick={() =>
              promote.mutate(
                { item, choice: { priority, due_date: dueDate || null, area: area || null } },
                { onSuccess: onClose },
              )
            }
          >
            {promote.isPending ? '만드는 중…' : '업무 만들기'}
          </PillButton>
          <PillButton type="button" variant="ghost" onClick={onClose}>
            취소
          </PillButton>
        </div>
      </div>
    </div>
  )
}
