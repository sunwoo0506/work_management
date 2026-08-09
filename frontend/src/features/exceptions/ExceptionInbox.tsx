import { useState } from 'react'
import { PillButton, TextInput } from '../../components/Field'
import { Card, EmptyState } from '../../components/ui'
import { useExceptionMutations, usePendingExceptions } from './hooks'
import type { ExceptionRow } from './hooks'

/**
 * 예외 확인함.
 *
 * 사람은 **확인만** 한다. "이번엔 뭐가 달랐는지 적으세요"라고 하면 적지 않는다.
 * 툴이 찾아서 보여주고, 사람은 [예외 맞음] / [정상임] 둘 중 하나를 누른다.
 *
 * 「정상임」을 누르면 사유가 남고 탐지 규칙 개선 대상이 된다 —
 * 헛감지만 내는 규칙은 임계값을 조정해야 한다.
 */
export default function ExceptionInbox() {
  const { data: items, isLoading } = usePendingExceptions()

  return (
    <Card title="⚠️ 예외 확인함" count={items?.length ?? 0}>
      <p className="text-caption text-ink-mute mb-3">
        절차대로 안 된 것을 툴이 찾았습니다. <strong className="font-semibold">확인만</strong> 해주세요.
      </p>

      {isLoading ? (
        <p className="text-caption text-ink-mute">불러오는 중…</p>
      ) : !items?.length ? (
        <EmptyState
          message="확인할 예외가 없습니다."
          hint="회차를 끝내면 절차와 대조해서 다른 점을 찾습니다."
        />
      ) : (
        <ul className="divide-y divide-divider -mx-1">
          {items.map((e) => (
            <ExceptionRowItem key={e.id} item={e} />
          ))}
        </ul>
      )}
    </Card>
  )
}

function ExceptionRowItem({ item }: { item: ExceptionRow }) {
  const m = useExceptionMutations()
  const [note, setNote] = useState('')
  const [open, setOpen] = useState(false)

  return (
    <li className="py-3 px-1">
      <div className="flex items-start gap-2.5">
        <span className="text-caption text-ink-mute bg-parchment rounded-full px-2 py-0.5
                         shrink-0 whitespace-nowrap">
          {item.rule}
        </span>
        <p className="text-body flex-1 leading-snug">{item.detected}</p>
      </div>

      {!open ? (
        <div className="flex gap-1.5 mt-2.5 pl-1">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-caption text-action border border-action rounded-full px-3 py-1"
          >
            예외 맞음
          </button>
          <button
            type="button"
            disabled={m.confirm.isPending}
            onClick={() => m.confirm.mutate({ id: item.id, confirm: '정상' })}
            className="text-caption text-ink-mute border border-hairline rounded-full px-3 py-1"
          >
            정상임
          </button>
        </div>
      ) : (
        <div className="mt-2.5 pl-1">
          <TextInput
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="왜 달랐는지 한 줄 (선택)"
            aria-label="예외 설명"
          />
          <div className="flex gap-2 mt-2">
            <PillButton
              type="button"
              disabled={m.confirm.isPending}
              onClick={() =>
                m.confirm.mutate({ id: item.id, confirm: '예외확정', explanation: note || undefined })
              }
            >
              저장
            </PillButton>
            <PillButton type="button" variant="ghost" onClick={() => setOpen(false)}>
              취소
            </PillButton>
          </div>
          <p className="text-caption text-ink-mute mt-2">
            3단계에서 AI가 붙으면 이 한 줄을 대신 써줍니다. 지금은 직접 적습니다.
          </p>
        </div>
      )}
    </li>
  )
}
