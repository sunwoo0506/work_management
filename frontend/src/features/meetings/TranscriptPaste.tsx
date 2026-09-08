import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui'
import HelpCard from './HelpCard'
import { Field, PillButton, TextArea, TextInput } from '../../components/Field'
import { ymd } from '../../domain/daily'
import { tidyTranscript } from '../../domain/transcript'
import { useCompanyId } from '../companies/useCompany'

/**
 * 다른 데서 전사 내용을 가져와 회의록으로 만든다.
 *
 * ── 왜 이 길이 지금 제일 좋은가 ──────────────────────────
 * 삼성 음성녹음 같은 폰 기본 앱에 **「텍스트로 변환」이 들어 있다.**
 * 그게 폰 안에서 돌기 때문에 —
 *   ① 요금이 0원이고
 *   ② **음성이 밖으로 한 발짝도 안 나간다** (회생·인사 회의에도 쓸 수 있다)
 *   ③ 우리 쪽 AI 크레딧과 무관하다
 *
 * 아쉬운 건 하나 — 그 앱이 다른 앱에 글을 넘겨주는 통로를 안 열어 둬서
 * **자동으로 가져올 수는 없다.** 사람이 복사하거나 파일로 내보내야 한다.
 * 그 두 걸음을 최대한 짧게 만드는 것이 이 화면이 하는 일이다.
 *
 * 여기서 만든 회의록은 **받아쓰기로 만든 것과 똑같이** 다뤄진다 —
 * 글을 고치고, AI 초안을 만들고, Action Item 을 인박스로 보낼 수 있다.
 */
/**
 * AI 초안 작성에 드는 비용·시간을 어림한다.
 *
 * 전사 내용은 15,000자씩 구간으로 나눠 AI 에게 넘긴다(회의록 초안 규칙).
 * 구간 하나에 입력 약 1만 토큰·출력 1,500 토큰이 오가고, 그 단가로 계산하면
 * **구간당 50원 안팎**이다. 시간은 구간당 20~40초.
 *
 * ⚠️ 어림값이다. 단가는 바뀌고 글의 밀도에 따라 토큰 수도 달라진다.
 *    그래도 「0원인지 만 원인지」는 알려 줘야 사람이 누를지 말지 정한다.
 */
function estimate(chars: number): { parts: number; won: number; min: number } {
  const parts = Math.max(1, Math.ceil(chars / 15_000))
  return { parts, won: parts * 50, min: Math.max(1, Math.round((parts * 30) / 60)) }
}

export default function TranscriptPaste({ onMade }: { onMade?: (id: string) => void } = {}) {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  /** 회의명을 안 적었을 때 그 칸으로 데려가기 위한 손잡이 */
  const titleRef = useRef<HTMLInputElement>(null)

  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [metOn, setMetOn] = useState(ymd(new Date()))
  const [attendees, setAttendees] = useState('')
  const [place, setPlace] = useState('')
  /** 회생·인사 회의 표시. 막지는 않고 표시만 남긴다 (설계서 §5.8 · OQ-16) */
  const [sensitive, setSensitive] = useState(false)
  /** 회의 중 직접 적은 메모. 전사문과 섞지 않는다 */
  const [myNotes, setMyNotes] = useState('')
  const [done, setDone] = useState<string | null>(null)
  /** 저장이 안 되는 이유. 버튼을 잠그는 대신 눌렀을 때 알려 준다 */
  const [why, setWhy] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error('업체 정보를 읽지 못했습니다.')
      const clean = tidyTranscript(text)
      if (!clean.trim()) throw new Error('붙여넣은 내용이 없습니다.')

      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

      const { data, error } = await supabase.from('meetings').insert({
        company_id: companyId,
        user_id: userId,
        met_on: metOn,
        title: title.trim() || '제목 없는 회의',
        attendees: attendees.trim() || null,
        place: place.trim() || null,
        transcript: clean,
        my_notes: myNotes.trim() || null,
        sensitive,
        transcript_source: '직접입력',
      })
        // 만든 회의의 번호를 받아 온다 — 바로 열어 주려면 이게 있어야 한다
        .select('id')
        .single()
      if (error) throw error
      return data?.id as string | undefined
    },
    onSuccess: (id) => {
      setDone('회의록을 만들었습니다. 아래에서 바로 AI 초안을 만드실 수 있습니다.')
      setText('')
      setTitle('')
      setAttendees('')
      setPlace('')
      setMyNotes('')
      setSensitive(false)
      if (fileRef.current) fileRef.current.value = ''
      void qc.invalidateQueries({ queryKey: ['meetings'] })
      // 방금 만든 회의록을 바로 열어 준다 — 찾아가게 하지 않는다
      if (id) onMade?.(id)
    },
  })

  const chars = text.trim().length

  /*
    ── 세 탭이 같은 순서를 갖는다 ────────────────────────────
      ① 무엇을 하는 자리인가 + 실행 버튼
      ② 도움말 (접혀 있음)
      ③ 내용
    실시간 받아쓰기가 이 순서라, 나머지 둘도 같게 맞춘다.
    탭을 옮겨도 **눈이 같은 자리를 찾게** 하는 것이 목적이다.
  */
  return (
    /*
      좁은 화면에서는 **「이 회의」 칸이 위로 온다.** 회의명을 먼저 적고 내용을 넣는
      순서라, 폰에서 본문이 위에 있으면 회의명 칸을 찾으러 한참 내려야 한다.
      실시간 탭과 같은 방식이다.
    */
    <div className="flex flex-col-reverse gap-5 lg:grid lg:grid-cols-[1fr_320px] lg:items-start">
      <div className="space-y-5">
        {/* ── ① 이 자리가 무엇을 하는가 ─────────────── */}
        <Card title="📝 음성텍스트 가져오기">
          <p className="text-caption text-ink-mute leading-relaxed">
            <strong className="font-semibold">전사문</strong>(음성을 문자로 옮긴 문서)을 가져와
            회의록으로 만듭니다.
          </p>

          {/*
            비용을 세 단계로 나눠 적는다. 「휴대폰에서 변환하니 비용이 없다」만 적었더니
            **회의록 만드는 것까지 무료로 읽혔다.**
          */}
          <dl className="grid grid-cols-[132px_1fr] gap-y-1 mt-2.5 text-caption">
            <dt className="text-ink-mute">① 문자 변환</dt>
            <dd className="text-ink-soft">
              <strong className="font-semibold">비용 없음</strong> — 휴대폰 안에서 변환되므로 음성이
              외부로 전송되지 않습니다
            </dd>
            <dt className="text-ink-mute">② 가져와 저장</dt>
            <dd className="text-ink-soft">
              <strong className="font-semibold">비용 없음</strong>
            </dd>
            <dt className="text-ink-mute">③ AI 회의록 초안</dt>
            <dd className="text-ink-soft">
              <strong className="font-semibold">비용 발생</strong> — 붙여넣으면 예상 금액이 표시됩니다
            </dd>
          </dl>

          <div className="mt-3">
            <p className="text-caption text-ink-soft mb-1.5">
              텍스트 파일이 있으면 여기서 선택하세요{' '}
              <span className="text-ink-mute">(.txt · .srt · .vtt)</span>
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.srt,.vtt,text/plain"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setText(await f.text())
                if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
              }}
              className="block w-full text-caption file:mr-3 file:rounded-full file:border file:border-hairline
                         file:bg-canvas file:text-action file:px-3 file:py-1.5 file:text-caption"
            />
          </div>
        </Card>

        {/* ── ② 도움말 ──────────────────────────────── */}
        <HelpCard title="음성텍스트 가져오는 방법">
          <p>
            <strong className="font-semibold">삼성 음성녹음</strong>
            <br />
            녹음 파일 열기 → <strong className="font-semibold">텍스트로 변환</strong> → 변환된 내용{' '}
            <strong className="font-semibold">전체 선택 후 복사</strong> → 아래 칸에 붙여넣기
          </p>
          <p>
            「텍스트 파일로 저장 · 공유」 기능이 있으면 그 파일을 위에서 선택해도 됩니다.
          </p>
          <p className="text-ink-mute">
            다른 앱(클로바노트 등)으로 만든 전사문도 그대로 붙여넣으면 됩니다. 발언자 표시
            (「화자 1:」)가 있으면 <strong className="font-semibold">지우지 말고 그대로</strong> 두세요 —
            누가 말했는지는 회의록에서 값진 정보입니다.
          </p>
          <p className="text-ink-mute">
            앞에 붙은 시각(00:12 등)도 그대로 두시면 됩니다. 저장할 때 형식이 자동으로 맞춰집니다.
          </p>
        </HelpCard>

        {/* ── ③ 내용 ────────────────────────────────── */}
        <Card title="음성텍스트 내용" count={chars > 0 ? chars : undefined}>
          <TextArea
            rows={14}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="휴대폰에서 변환한 내용을 붙여넣으세요 (Ctrl+V)"
            className="text-caption leading-relaxed"
          />

          {chars > 0 && (
            <div className="bg-parchment rounded-md p-3.5 mt-3">
              <p className="text-body">
                {chars.toLocaleString()}자 · 회의{' '}
                <strong className="font-semibold">약 {Math.max(1, Math.round(chars / 300))}분</strong>{' '}
                분량
              </p>
              <dl className="grid grid-cols-[110px_1fr] gap-y-1 mt-2 text-caption">
                <dt className="text-ink-mute">가져오기</dt>
                <dd className="text-ink-soft">
                  <strong className="font-semibold">비용 없음</strong>
                </dd>
                <dt className="text-ink-mute">AI 초안 작성</dt>
                <dd className="text-ink-soft">
                  약{' '}
                  <strong className="font-semibold">{estimate(chars).won.toLocaleString()}원</strong>{' '}
                  · {estimate(chars).parts}구간 · 약 {estimate(chars).min}분
                </dd>
              </dl>
              <p className="text-caption text-ink-mute mt-1.5 leading-relaxed">
                <strong className="font-semibold">지금 저장하는 것까지는 비용이 없습니다.</strong>{' '}
                초안 작성은 저장한 뒤 「📋 지난 회의록」에서 직접 누를 때만 실행됩니다. 양식을 직접
                작성하시면 비용 없이도 회의록을 완성할 수 있습니다.
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-3">
            {/*
              ⚠️ 버튼을 잠그지 않는다.
              잠가 두면 눌러도 아무 일이 없어 **「저장이 안 된다」로 보인다.**
              누를 수 있게 두고, 왜 안 되는지 말해 주고, 그 칸으로 데려간다.
            */}
            <PillButton
              type="button"
              disabled={create.isPending}
              onClick={() => {
                if (!title.trim()) {
                  setDone(null)
                  setWhy('회의명을 입력해 주세요. 오른쪽 「이 회의」 칸에 있습니다.')
                  titleRef.current?.focus()
                  return
                }
                if (chars === 0) {
                  setDone(null)
                  setWhy('저장할 내용이 없습니다. 위 칸에 전사문을 붙여넣어 주세요.')
                  return
                }
                setWhy(null)
                create.mutate()
              }}
            >
              {create.isPending ? '저장하는 중…' : '회의록 저장'}
            </PillButton>
            {why && <span className="text-caption text-alert">{why}</span>}
          </div>

          {done && <p className="text-caption text-ink-soft mt-2">{done}</p>}
          {create.isError && (
            <p className="text-caption text-alert mt-2">{(create.error as Error).message}</p>
          )}
        </Card>
      </div>

      {/* ── 오른쪽: 회의 정보 · 내 메모 ───────────────── */}
      <div className="space-y-5">
        <Card title="이 회의">
          <div className="space-y-3">
            <Field label="회의명">
              <TextInput
                ref={titleRef}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (e.target.value.trim()) setWhy(null)
                }}
                placeholder="예: 자재 단가 협의"
              />
            </Field>
            <Field label="일자">
              <TextInput type="date" value={metOn} onChange={(e) => setMetOn(e.target.value)} />
            </Field>
            <Field label="참석자" hint="역할로 적습니다">
              <TextInput
                value={attendees}
                onChange={(e) => setAttendees(e.target.value)}
                placeholder="예: 대표, 구매사업본부 담당자"
              />
            </Field>
            <Field label="장소/방식">
              <TextInput
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="예: 본사 회의실 / Zoom"
              />
            </Field>

            <label className="flex items-start gap-2 text-body pt-1">
              <input
                type="checkbox"
                checked={sensitive}
                onChange={(e) => setSensitive(e.target.checked)}
                className="accent-action mt-1.5 shrink-0"
              />
              <span>
                민감 회의 (회생 · 인사)
                <span className="block text-caption text-ink-mute leading-relaxed mt-0.5">
                  표시만 해 둡니다. 저장은 동일하게 진행되며, 이후 보안 정책을 정할 때 이 표시로
                  선별하기 위한 것입니다.
                </span>
              </span>
            </label>
          </div>
        </Card>

        <Card title="내 메모">
          <p className="text-caption text-ink-mute mb-2 leading-relaxed">
            음성에 없는 내용 — 판단, 확인할 사항. 전사문과 구분해 따로 저장됩니다.
          </p>
          <TextArea rows={8} value={myNotes} onChange={(e) => setMyNotes(e.target.value)} />
        </Card>
      </div>
    </div>
  )
}
