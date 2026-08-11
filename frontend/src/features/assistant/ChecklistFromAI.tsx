import { useState } from 'react'
import { TextArea } from '../../components/Field'
import { Markdown } from '../../components/Markdown'
import { useAttachments } from '../attachments/hooks'
import { useChecklistMutations } from '../tasks/hooks'
import type { Task } from '../tasks/api'
import { ASSISTANT_NAME, Failure } from './ChatWindow'
import { useProposeChecklist } from './hooks'
import type { ProposedItem } from './hooks'

/**
 * 클로니가 뽑아 주는 체크리스트 초안.
 *
 * ── 왜 체크리스트 섹션 안에 있나 ─────────────────────────
 * 사용자 말: *"AI체크리스트 추출 버튼을 체크리스트 섹션에 배치"*
 *
 * 맞다. 이건 **대화가 아니라 체크리스트를 만드는 일**이다.
 * 저 위 별도 칸에 있으면 "체크리스트를 채워야지" 하고 있는 사람이 그걸 못 찾는다.
 * 도구는 그걸 쓰는 자리에 있어야 한다.
 *
 * ── 지키는 것 ────────────────────────────────────────────
 * **AI 는 초안까지. 담는 것은 사람이 누른다** (CLAUDE.md).
 * 각 항목에 근거가 붙어 나온다 — 어느 자료의 어느 대목을 보고 낸 것인지.
 */
export default function ChecklistFromAI({ task, startOrder }: { task: Task; startOrder: number }) {
  const [open, setOpen] = useState(false)
  const { data: files } = useAttachments(task.id)
  const propose = useProposeChecklist(task.id)
  const m = useChecklistMutations(task.id)

  const readable = (files ?? []).filter((f) => f.extract_status === '성공')
  const [picked, setPicked] = useState<string[] | null>(null) // null = 전부
  const [hint, setHint] = useState('')
  const [taken, setTaken] = useState<Set<string>>(new Set())

  const items = propose.data?.items ?? []

  function take(item: ProposedItem, offset: number) {
    m.add.mutate(
      { label: item.label, sortOrder: startOrder + offset },
      { onSuccess: () => setTaken((s) => new Set(s).add(item.label)) },
    )
  }

  function takeAll() {
    const rest = items.filter((i) => !taken.has(i.label))
    if (rest.length === 0) return
    m.addMany.mutate(
      { labels: rest.map((i) => i.label), startOrder },
      { onSuccess: () => setTaken(new Set(items.map((i) => i.label))) },
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 text-caption text-action font-semibold"
      >
        ✨ {ASSISTANT_NAME}에게 체크리스트 초안 받기
        {readable.length > 0 && (
          <span className="text-ink-mute font-normal ml-1.5">첨부 {readable.length}개를 읽습니다</span>
        )}
      </button>
    )
  }

  return (
    <div className="mt-3 border border-hairline rounded-md p-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-body font-semibold">{ASSISTANT_NAME}에게 초안 받기</h4>
        <button type="button" onClick={() => setOpen(false)} className="text-caption text-ink-mute shrink-0">
          접기
        </button>
      </div>
      <p className="text-caption text-ink-mute mt-1 leading-relaxed">
        <strong className="font-semibold">첨부파일 · 상세 · 작업 메모</strong>를 읽고 할 일 초안을 냅니다.
        담는 것은 직접 고르십니다.
      </p>

      {readable.length === 0 ? (
        <p className="text-caption text-ink-mute mt-2.5 leading-relaxed">
          읽을 수 있는 첨부파일이 없습니다. 위에서 PDF·docx·txt 를 올리시면 그 내용을 봅니다.
          <br />
          파일 없이 「상세」와 「작업 메모」만 보고 뽑을 수도 있습니다.
        </p>
      ) : (
        <fieldset className="mt-3">
          <legend className="text-caption text-ink-mute mb-1.5">읽을 파일</legend>
          <div className="flex flex-wrap gap-1.5">
            <Chip on={picked === null} onClick={() => setPicked(null)}>전부 ({readable.length})</Chip>
            {readable.map((f) => (
              <Chip
                key={f.id}
                on={picked !== null && picked.includes(f.id)}
                onClick={() =>
                  setPicked((p) => {
                    const cur = p ?? []
                    return cur.includes(f.id) ? cur.filter((x) => x !== f.id) : [...cur, f.id]
                  })
                }
              >
                {f.name}
              </Chip>
            ))}
          </div>
        </fieldset>
      )}

      <TextArea
        rows={2}
        value={hint}
        onChange={(e) => setHint(e.target.value)}
        placeholder="예) 제출 기한이 있는 것만 — 없으면 비워 두세요"
        className="mt-3"
        aria-label="초안 뽑을 때 참고할 점"
      />

      <button
        type="button"
        disabled={propose.isPending}
        onClick={() => {
          setTaken(new Set())
          propose.mutate({
            attachmentIds: picked && picked.length > 0 ? picked : undefined,
            hint: hint.trim() || undefined,
          })
        }}
        className="mt-2 text-caption text-action font-semibold disabled:opacity-40"
      >
        {propose.isPending ? `${ASSISTANT_NAME}가 읽는 중…` : '초안 뽑기'}
      </button>

      {propose.isError && <div className="mt-2.5"><Failure error={propose.error} /></div>}

      {propose.data && items.length > 0 && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <h4 className="text-caption text-ink-mute">초안 {items.length}개 — 담을 것을 고르세요</h4>
            <button
              type="button"
              onClick={takeAll}
              disabled={m.addMany.isPending}
              className="text-caption text-action font-semibold disabled:opacity-40"
            >
              전부 담기
            </button>
          </div>
          <ul className="mt-2 divide-y divide-divider">
            {items.map((it, i) => (
              <li key={`${it.label}-${i}`} className="py-2.5 flex items-start gap-3">
                <span className="flex-1 min-w-0">
                  <span className="block text-body">{it.label}</span>
                  {it.why && (
                    <span className="block text-caption text-ink-mute mt-0.5 leading-relaxed">
                      근거 — {it.why}
                    </span>
                  )}
                </span>
                {taken.has(it.label) ? (
                  <span className="text-caption text-ink-mute shrink-0 pt-0.5">담김</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => take(it, i)}
                    disabled={m.add.isPending}
                    className="text-caption text-action font-semibold shrink-0 pt-0.5 disabled:opacity-40"
                  >
                    담기
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 형식을 못 알아들었을 때 — 원문이라도 보여 준다. 사람이 읽고 손으로 담으면 된다 */}
      {propose.data && items.length === 0 && (
        <div className="mt-4 bg-parchment rounded-md px-3.5 py-3">
          <p className="text-caption text-ink-mute mb-1.5">항목으로 나누지 못했습니다. 답변 원문입니다.</p>
          <div className="text-body"><Markdown text={propose.data.text} /></div>
        </div>
      )}
    </div>
  )
}

function Chip({
  on, onClick, children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'text-caption rounded-full px-3 py-1 border max-w-[220px] truncate',
        on ? 'text-action border-action font-semibold' : 'text-ink-mute border-hairline hover:text-ink',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
