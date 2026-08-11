import { useState } from 'react'
import { PillButton, TextArea } from '../../components/Field'
import { useAttachments } from '../attachments/hooks'
import { useChecklist, useChecklistMutations } from '../tasks/hooks'
import type { Task } from '../tasks/api'
import { useAsk, useMessages, useProposeChecklist, useThread } from './hooks'
import type { Message, ProposedItem, Source } from './hooks'

/**
 * AI 업무 지원 — 업무 서랍 안에서.
 *
 * 이 자리에서 하는 일은 둘뿐이다 (사용자가 말한 용도 그대로) —
 *   ① 붙여 둔 파일을 읽고 **체크리스트 초안**을 뽑는다
 *   ② 일하다 모르는 것을 **묻는다**
 *
 * 지키는 것 —
 *   · AI 는 **초안까지**. 체크리스트에 담는 것은 사람이 누른다
 *   · 답에 **근거**를 붙인다. 어느 자료를 보고 한 말인지
 *   · AI 가 죽어도 업무·체크리스트·파일은 그대로 동작한다. 여기만 안 될 뿐이다
 *   · 회사 숫자(손익·재고·현금)는 다루지 않는다 — 경영관리서비스의 몫
 */
export default function AssistantPanel({ task }: { task: Task }) {
  const [tab, setTab] = useState<'질문' | '체크리스트'>('질문')

  return (
    <section className="mt-8 border-t border-hairline pt-6">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-body font-semibold">AI 업무 지원</h3>
        <div className="flex gap-1">
          {(['질문', '체크리스트'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                'text-caption rounded-full px-3 py-1 border',
                tab === t
                  ? 'text-action border-action font-semibold'
                  : 'text-ink-mute border-hairline hover:text-ink',
              ].join(' ')}
            >
              {t === '질문' ? '물어보기' : '체크리스트 뽑기'}
            </button>
          ))}
        </div>
      </div>

      {tab === '질문' ? <Ask task={task} /> : <Propose task={task} />}
    </section>
  )
}

// ── 물어보기 ──────────────────────────────────────────────

function Ask({ task }: { task: Task }) {
  const { data: thread } = useThread(task.id)
  const { data: messages } = useMessages(thread?.id ?? null)
  const ask = useAsk(task.id, task.title)
  const [q, setQ] = useState('')

  const log = messages ?? []

  function send() {
    const v = q.trim()
    if (!v || ask.isPending) return
    const history = log.slice(-8).map((m) => ({
      role: (m.role === '사람' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }))
    ask.mutate({ question: v, history }, { onSuccess: () => setQ('') })
  }

  return (
    <div className="mt-3">
      <p className="text-caption text-ink-mute leading-relaxed">
        이 업무의 <strong className="font-semibold">상세 · 작업 메모 · 체크리스트 · 첨부파일</strong>만
        보고 답합니다. 자료에 없으면 없다고 답합니다.
      </p>

      {log.length > 0 && (
        <ul className="mt-3 space-y-3">
          {log.map((m) => <Bubble key={m.id} message={m} />)}
        </ul>
      )}

      <TextArea
        rows={3}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            send()
          }
        }}
        placeholder="예) 첨부한 공문에서 우리가 기한까지 내야 하는 서류가 뭐죠?"
        className="mt-3"
        aria-label="AI에게 물어보기"
      />

      <div className="flex items-center gap-3 mt-2">
        <PillButton type="button" onClick={send} disabled={ask.isPending || !q.trim()}>
          {ask.isPending ? '묻는 중…' : '물어보기'}
        </PillButton>
        <span className="text-caption text-ink-mute">Ctrl+Enter</span>
      </div>

      {ask.isError && <Failure error={ask.error} />}
    </div>
  )
}

function Bubble({ message }: { message: Message }) {
  const mine = message.role === '사람'
  const sources = (message.sources ?? []) as unknown as Source[]

  return (
    <li
      className={[
        'rounded-md px-3.5 py-3 border',
        mine ? 'bg-parchment border-hairline' : 'bg-canvas border-hairline',
      ].join(' ')}
    >
      <p className="text-caption text-ink-mute mb-1">{mine ? '나' : 'AI'}</p>
      <p className="text-body whitespace-pre-wrap leading-relaxed">{message.content}</p>
      {!mine && sources.length > 0 && (
        <p className="text-caption text-ink-mute mt-2 pt-2 border-t border-divider">
          본 자료 — {sources.map((s) => `${s.kind}(${s.label})`).join(' · ')}
        </p>
      )}
    </li>
  )
}

// ── 체크리스트 뽑기 ───────────────────────────────────────

function Propose({ task }: { task: Task }) {
  const { data: files } = useAttachments(task.id)
  const { data: existing } = useChecklist(task.id)
  const propose = useProposeChecklist(task.id)
  const m = useChecklistMutations(task.id)

  const readable = (files ?? []).filter((f) => f.extract_status === '성공')
  const [picked, setPicked] = useState<string[] | null>(null) // null = 전부
  const [hint, setHint] = useState('')
  const [taken, setTaken] = useState<Set<string>>(new Set())

  const items = propose.data?.items ?? []
  const startOrder = existing?.length ?? 0

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

  return (
    <div className="mt-3">
      <p className="text-caption text-ink-mute leading-relaxed">
        붙여 둔 파일과 상세·메모를 읽고 <strong className="font-semibold">할 일 초안</strong>을 뽑습니다.
        담는 것은 직접 고르십니다 — 저절로 들어가지 않습니다.
      </p>

      {readable.length === 0 ? (
        <p className="text-caption text-ink-mute mt-3 bg-parchment border border-hairline rounded-md px-3.5 py-3 leading-relaxed">
          읽을 수 있는 첨부파일이 없습니다. 위에서 PDF·docx·txt 를 올리시면 그 내용을 봅니다.
          <br />
          파일 없이도 「상세」와 「작업 메모」만 보고 뽑을 수는 있습니다.
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
        placeholder="특별히 봐 줬으면 하는 것 (없으면 비워 두세요) — 예) 제출 기한이 있는 것만"
        className="mt-3"
        aria-label="체크리스트 뽑을 때 참고할 점"
      />

      <PillButton
        type="button"
        className="mt-2"
        disabled={propose.isPending}
        onClick={() => {
          setTaken(new Set())
          propose.mutate({
            attachmentIds: picked && picked.length > 0 ? picked : undefined,
            hint: hint.trim() || undefined,
          })
        }}
      >
        {propose.isPending ? '읽는 중…' : '체크리스트 초안 뽑기'}
      </PillButton>

      {propose.isError && <Failure error={propose.error} />}

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
        <div className="mt-4 bg-parchment border border-hairline rounded-md px-3.5 py-3">
          <p className="text-caption text-ink-mute mb-1.5">항목으로 나누지 못했습니다. 답변 원문입니다.</p>
          <p className="text-body whitespace-pre-wrap leading-relaxed">{propose.data.text}</p>
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

/**
 * AI 가 안 될 때.
 *
 * 여기가 실패해도 업무는 멀쩡하다는 걸 말해 준다 — 안 그러면
 * "업무관리툴이 고장났다"고 읽는다.
 */
function Failure({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error)
  // 공급자 환경변수 이름을 화면 코드에 적지 않는다 —
  // 빌드 산출물에 열쇠 관련 문자열이 있는지 검사할 때 걸려서 진짜 유출과 구분이 안 된다
  const noKey = msg.includes('열쇠')

  return (
    <div className="mt-3 border border-hairline rounded-md px-3.5 py-3 bg-parchment" role="alert">
      <p className="text-body">AI를 부르지 못했습니다.</p>
      <p className="text-caption text-ink-mute mt-1 leading-relaxed">{msg}</p>
      {noKey && (
        <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
          AI 열쇠가 아직 등록되지 않았습니다. 등록하면 이 자리가 바로 동작합니다.
        </p>
      )}
      <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
        업무 · 체크리스트 · 파일은 영향을 받지 않습니다. 이 칸만 안 될 뿐입니다.
      </p>
    </div>
  )
}
