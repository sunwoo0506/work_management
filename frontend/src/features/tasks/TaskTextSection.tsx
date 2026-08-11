import { useEffect, useState } from 'react'
import { TextArea } from '../../components/Field'
import { GuideHint } from '../../components/GuideHint'
import type { WriteGuide } from './guides'
import { useUpdateTask } from './hooks'
import type { Task, TaskUpdate } from './api'

/**
 * 서랍에서 바로 쓰는 긴 글 칸 — 「상세」와 「작업 메모」가 같이 쓴다.
 *
 * 왜 하나로 합쳤나 — 두 칸이 따로 만들어져 있으면 안내 문구도, 저장 방식도
 * 조금씩 달라진다. 사용자 눈에는 "왜 여긴 되고 저긴 안 되지"로 보인다.
 *
 * 수정 화면을 열지 않고 여기서 바로 쓴다. 일하다 알게 된 것을 적으려고
 * 폼을 열어 열두 칸을 지나가야 하면 안 적게 된다.
 *
 * 자동저장을 안 하는 이유 — 저장됐는지가 안 보인다. 바꾼 게 있을 때만
 * 저장 버튼이 뜨고, 누르면 사라진다. 그게 저장됐다는 신호다.
 */
export default function TaskTextSection({
  task,
  field,
  label,
  guide,
  rows = 5,
  footer,
}: {
  task: Task
  field: 'detail' | 'notes' | 'reply_body'
  label: string
  guide: WriteGuide
  rows?: number
  /** 칸 아래에 덧붙이는 한 줄 (「여기 쌓인 게 절차가 됩니다」 같은 것) */
  footer?: React.ReactNode
}) {
  const update = useUpdateTask()
  const saved = task[field] ?? ''
  const [draft, setDraft] = useState(saved)
  useEffect(() => setDraft(saved), [saved])
  const dirty = draft !== saved

  return (
    <section className="mt-7">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-body font-semibold">{label}</h3>
        {dirty && (
          <button
            type="button"
            disabled={update.isPending}
            onClick={() =>
              update.mutate({ before: task, patch: { [field]: draft || null } as TaskUpdate })
            }
            className="text-caption text-action font-semibold disabled:opacity-40"
          >
            {update.isPending ? '저장 중…' : '저장'}
          </button>
        )}
      </div>

      {/* 비어 있으면 안내를 펼쳐 둔다 — 처음 적는 사람에게만 설명이 필요하다 */}
      <GuideHint guide={guide} openByDefault={!saved} />

      <TextArea
        rows={rows}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={guide.placeholder}
        className="mt-2"
        aria-label={label}
      />

      {footer}

      {update.isError && (
        <p className="text-caption text-alert mt-1.5" role="alert">
          저장하지 못했습니다 —{' '}
          {update.error instanceof Error ? update.error.message : String(update.error)}
        </p>
      )}
    </section>
  )
}
