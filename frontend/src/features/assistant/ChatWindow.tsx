import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TextArea } from '../../components/Field'
import { Markdown } from '../../components/Markdown'
import { useAsk, useMessages, useThread } from './hooks'
import type { Message, Source, WebSource } from './hooks'
import type { Task } from '../tasks/api'

/** AI 업무 비서의 이름. 서비스는 「클론미」, 비서는 「클로니」 */
export const ASSISTANT_NAME = '클로니'

/**
 * 클로니 채팅창.
 *
 * ── 왜 서랍 안이 아니라 별도 창인가 ──────────────────────
 * 사용자가 써 보고 한 말:
 *   *"AI업무지원 부분에 대화내용이 별도 섹션으로 계속 보여지면 대화가
 *     부담스러워질거같아. 스크롤 기능이 들어간 이어지는 흐름으로 정리를 하면 좋을 것 같아."*
 *   *"채팅봇처럼 별도 창을 열어서 대화를 하는건 어때? 작업기록 공간에 대화를 남기는것보단"*
 *
 * 맞는 지적이다. 대화는 **길어진다.** 업무 서랍 한가운데에 길어지는 것을 두면
 * 그 아래 있는 체크리스트·메모가 매번 저 멀리 밀려난다. 그러면 대화를 하기가 부담스러워지고,
 * 부담스러워지면 안 묻게 된다. **묻지 않으면 절차가 안 자란다** — 이 제품의 목적이 무너진다.
 *
 * 그래서 대화는 **떠 있는 창**으로 뺐다. 안에서만 스크롤되고, 서랍은 안 밀린다.
 * 닫아도 대화는 저장돼 있고 다시 열면 이어진다.
 *
 * ── 기록은 그대로 남는다 ─────────────────────────────────
 * 화면에서 뺐다고 저장을 안 하는 게 아니다. 「내가 무엇을 물었나」가 절차의 씨앗이다.
 * 다만 이 기록은 AI 가 답변 근거로 **인용할 수 없다** (disclosure_policy) —
 * 내가 AI 에게 뭘 물었는지가 가장 사적인 기록이다.
 */
export default function ChatWindow({ task, onClose }: { task: Task; onClose: () => void }) {
  const { data: thread } = useThread(task.id)
  const { data: messages } = useMessages(thread?.id ?? null)
  const ask = useAsk(task.id, task.title)
  const [q, setQ] = useState('')
  /**
   * 웹 검색은 **기본이 꺼짐**이다.
   *
   * 켜면 질문 글이 밖으로 나간다. 이 툴의 원칙이
   * 「밖으로 나가는 것은 사용자가 「공유」를 누른 것뿐」(CLAUDE.md)이므로,
   * 매번 사용자가 켠다. 창을 닫으면 다시 꺼진다 — 켜 둔 걸 잊고 쓰지 않게.
   */
  const [web, setWeb] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const log = messages ?? []

  // 새 말이 붙으면 맨 아래로. 채팅은 마지막 줄이 늘 보여야 한다
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log.length, ask.isPending])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Esc 로 닫는다 — 채팅창은 자주 여닫는 자리다
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function send() {
    const v = q.trim()
    if (!v || ask.isPending) return
    const history = log.slice(-8).map((m) => ({
      role: (m.role === '사람' ? 'user' : 'assistant') as 'user' | 'assistant',
      content: m.content,
    }))
    ask.mutate({ question: v, history, webSearch: web }, { onSuccess: () => setQ('') })
  }

  return (
    <div
      role="dialog"
      aria-label={`${ASSISTANT_NAME}와 대화`}
      className="fixed right-6 bottom-6 z-[60] w-[min(420px,calc(100vw-3rem))] max-h-[min(640px,calc(100vh-3rem))]
                 flex flex-col bg-canvas border border-hairline rounded-lg overflow-hidden"
    >
      <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-hairline bg-parchment">
        <div className="min-w-0">
          <p className="text-body font-semibold">{ASSISTANT_NAME}</p>
          <p className="text-caption text-ink-mute truncate">{task.title}</p>
        </div>
        <button type="button" onClick={onClose} className="text-caption text-ink-mute shrink-0">
          닫기
        </button>
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {log.length === 0 ? (
          <Intro />
        ) : (
          log.map((m) => <Bubble key={m.id} message={m} />)
        )}

        {ask.isPending && (
          <p className="text-caption text-ink-mute">
            {ASSISTANT_NAME}가 {web ? '웹까지 찾아보는 중…' : '자료를 읽는 중…'}
          </p>
        )}
        {ask.isError && <Failure error={ask.error} />}
      </div>

      <div className="border-t border-hairline px-3 py-2.5">
        <WebToggle on={web} onChange={setWeb} />

        <TextArea
          ref={inputRef}
          rows={2}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
          placeholder={
            web
              ? '예) 법인 회생 신청 시 제출 서류가 뭐가 있나요?'
              : '예) 첨부한 공문에서 기한까지 내야 할 서류가 뭐죠?'
          }
          className="mt-2"
          aria-label={`${ASSISTANT_NAME}에게 물어보기`}
        />
        <div className="flex items-center justify-between gap-3 mt-1.5">
          <span className="text-caption text-ink-mute">Enter 보내기 · Shift+Enter 줄바꿈</span>
          <button
            type="button"
            onClick={send}
            disabled={ask.isPending || !q.trim()}
            className="text-caption text-action font-semibold disabled:opacity-40"
          >
            보내기
          </button>
        </div>
      </div>
    </div>
  )
}

function Intro() {
  return (
    <div className="text-caption text-ink-mute leading-relaxed">
      <p className="text-body text-ink">이 업무에 대해 물어보세요.</p>
      <p className="mt-2">
        보는 것은 <strong className="font-semibold">이 업무의 상세 · 작업 메모 · 체크리스트 ·
        첨부파일</strong>뿐입니다. 자료에 없으면 없다고 답합니다.
      </p>
      <p className="mt-2">
        회사 숫자(손익·재고·현금)는 다루지 않습니다 — 그건 경영관리서비스의 몫입니다.
      </p>
      <p className="mt-2">
        법령·기한·절차처럼 <strong className="font-semibold">밖에서 확인해야 하는 것</strong>은
        아래 「웹에서도 찾아보기」를 켜세요. 찾은 자리의 링크가 답에 함께 붙습니다.
      </p>
    </div>
  )
}

/**
 * 웹 검색 스위치.
 *
 * ── 왜 기본이 꺼짐인가 ───────────────────────────────────
 * 켜면 **질문 글이 밖으로 나간다.** 이 툴의 대원칙이
 * 「밖으로 나가는 것은 사용자가 누른 것뿐」이라, 매번 누르게 한다.
 *
 * 켰을 때 무엇이 나가는지 그 자리에서 말해 준다. 스위치만 있고 설명이 없으면
 * 사람은 켜 두고 잊는다. 계약서·급여대장을 다루는 자리라 그러면 안 된다.
 */
function WebToggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-[#0066cc]"
        />
        <span className="text-caption text-ink-soft">웹에서도 찾아보기</span>
      </label>
      {on && (
        <p className="text-caption text-ink-mute mt-1 leading-relaxed">
          ⚠️ 질문 글이 <strong className="font-semibold">밖으로 나갑니다.</strong> 회사 이름·거래처·금액은
          적지 마세요. 첨부파일은 나가지 않습니다.
        </p>
      )}
    </div>
  )
}

function Bubble({ message }: { message: Message }) {
  const mine = message.role === '사람'
  const all = (message.sources ?? []) as unknown as (Source | WebSource)[]
  // url 이 있으면 웹에서 찾은 것, 없으면 이 업무 안의 자료다
  const web = all.filter((s): s is WebSource => 'url' in s)
  const own = all.filter((s): s is Source => !('url' in s))

  return (
    <div className={mine ? 'flex justify-end' : ''}>
      <div
        className={[
          'rounded-lg px-3.5 py-2.5 max-w-[92%]',
          mine ? 'bg-action text-white' : 'bg-parchment',
        ].join(' ')}
      >
        {/*
          내가 쓴 말은 있는 그대로 둔다 — 내가 별표를 적었으면 별표가 보여야 한다.
          클로니 답만 굵게·목록·링크를 살려서 그린다.
        */}
        {mine ? (
          <p className="text-body whitespace-pre-wrap leading-relaxed">{message.content}</p>
        ) : (
          <div className="text-body">
            <Markdown text={message.content} />
          </div>
        )}

        {!mine && (own.length > 0 || web.length > 0) && (
          <div className="mt-2 pt-2 border-t border-hairline space-y-1">
            {own.length > 0 && (
              <p className="text-caption text-ink-mute">
                이 업무 자료 — {own.map((s) => `${s.kind}(${s.label})`).join(' · ')}
              </p>
            )}
            {web.length > 0 && (
              <div className="text-caption text-ink-mute">
                <p>웹에서 찾은 자리 — 눌러서 확인하세요</p>
                <ul className="mt-0.5 space-y-0.5">
                  {web.map((s) => (
                    <li key={s.url} className="truncate">
                      ·{' '}
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-action hover:underline"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * 클로니가 안 될 때.
 *
 * 여기가 실패해도 업무는 멀쩡하다는 걸 말해 준다 — 안 그러면
 * "업무관리툴이 고장났다"고 읽는다.
 */
export function Failure({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error)
  // 공급자 환경변수 이름을 화면 코드에 적지 않는다 —
  // 빌드 산출물 열쇠 검사에 걸려서 진짜 유출과 구분이 안 된다
  const noKey = msg.includes('열쇠')

  return (
    <div className="border border-hairline rounded-md px-3.5 py-3 bg-parchment" role="alert">
      <p className="text-body">{ASSISTANT_NAME}를 부르지 못했습니다.</p>
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
