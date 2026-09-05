import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Card } from '../../components/ui'
import { PillButton } from '../../components/Field'

/**
 * 비밀번호를 정하는 자리.
 *
 * ── 왜 생겼나 (2026-09-05) ───────────────────────────────
 * 원래 이 툴은 **비밀번호가 없었다.** 혼자 쓰는 도구라 관리할 이유가 없고,
 * 관리하지 않는 비밀번호가 가장 안전하다고 봤다(설계서 §8).
 *
 * 그런데 그 대가가 실제로 나왔다. 로그인할 때마다 **메일이 한 통 나가는데,**
 * Supabase 가 무료로 얹어 주는 발송기는 **시간당 두 통이 끝**이다.
 * 2026-09-05 에 그 한도에 걸려 **로그인 자체를 못 했다.**
 * 늘리는 설정이 없다 — 발송기를 바꾸거나, 메일을 안 쓰는 길을 하나 두는 수밖에 없다.
 *
 * **부장님이 「비밀번호 로그인도 함께」로 정하셨다.** 메일 링크는 그대로 두고,
 * 메일이 막혔을 때 쓸 **두 번째 문**을 낸 것이다.
 *
 * ⚠️ **비밀번호를 정하려면 먼저 로그인해 있어야 한다.** 그래서 이 카드는
 *    설정 화면에 있다. 처음 한 번은 메일 링크로 들어와야 하고, 그 뒤로는
 *    메일 없이 들어올 수 있다.
 */

/** 여기서 요구하는 길이. Supabase 기본값(6자)보다 길게 잡았다 — 아래 주석 참고 */
const MIN = 10

export default function PasswordCard() {
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const tooShort = pw.length > 0 && pw.length < MIN
  const mismatch = again.length > 0 && pw !== again
  const ready = pw.length >= MIN && pw === again && !busy

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNote(null)

    const { error } = await supabase.auth.updateUser({ password: pw })

    setBusy(false)
    if (error) {
      setError(explainUpdate(error.message))
      return
    }
    setPw('')
    setAgain('')
    setNote('비밀번호를 저장했습니다. 다음부터는 로그인 화면에서 「비밀번호」를 골라 들어오실 수 있습니다.')
  }

  return (
    <Card title="로그인 비밀번호">
      <p className="text-caption text-ink-mute mb-3 leading-relaxed">
        <strong className="font-semibold">메일 링크가 막혔을 때 쓰는 두 번째 문입니다.</strong>{' '}
        Supabase 가 무료로 보내 주는 로그인 메일은 <strong className="font-semibold">시간당
        두 통</strong>이 끝이라, 몇 번 눌러 보면 바로 막힙니다. 비밀번호를 정해 두시면
        그때 메일 없이 들어오실 수 있습니다.
      </p>

      <form onSubmit={save} className="space-y-2.5">
        <div>
          <label htmlFor="pw" className="block text-caption text-ink-soft">
            새 비밀번호
          </label>
          <input
            id="pw"
            type="password"
            autoComplete="new-password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            className="mt-1.5 w-full text-body bg-canvas border border-hairline rounded-md px-4 py-2.5
                       outline-none focus:border-action-focus"
          />
          {/*
            ⚠️ 10자로 잡았다. Supabase 기본값은 6자인데 그건 너무 짧다 —
            이 계정 하나가 뚫리면 **회의록·업무·AI 대화가 통째로 넘어간다.**
            길이를 요구하는 것이 규칙을 복잡하게 만드는 것보다 낫다
            (「대문자+숫자+기호」 규칙은 오히려 짧고 뻔한 비밀번호를 만든다)
          */}
          <p className="text-caption text-ink-mute mt-1">
            {tooShort ? (
              <span className="text-alert">{MIN}자 이상으로 정해 주세요.</span>
            ) : (
              `${MIN}자 이상. 외우기 쉬운 문장을 그대로 쓰셔도 됩니다.`
            )}
          </p>
        </div>

        <div>
          <label htmlFor="pw2" className="block text-caption text-ink-soft">
            한 번 더
          </label>
          <input
            id="pw2"
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            className="mt-1.5 w-full text-body bg-canvas border border-hairline rounded-md px-4 py-2.5
                       outline-none focus:border-action-focus"
          />
          {mismatch && <p className="text-caption text-alert mt-1">두 칸이 다릅니다.</p>}
        </div>

        <PillButton type="submit" disabled={!ready}>
          {busy ? '저장 중…' : '비밀번호 저장'}
        </PillButton>
      </form>

      {note && <p className="text-caption text-ink-soft mt-3 leading-relaxed">{note}</p>}
      {error && (
        <p className="text-caption text-alert mt-3 leading-relaxed" role="alert">
          {error}
        </p>
      )}

      <p className="text-caption text-ink-mute mt-4 leading-relaxed">
        비밀번호를 정해도 <strong className="font-semibold">메일 링크는 그대로 됩니다.</strong>{' '}
        두 길 중 편한 쪽으로 들어오시면 됩니다.
      </p>
    </Card>
  )
}

/** 저장이 막혔을 때 무엇을 해야 하는지 우리말로 */
function explainUpdate(raw: string): string {
  const m = raw.toLowerCase()
  if (m.includes('should be different')) {
    return '지금 쓰고 계신 것과 같은 비밀번호입니다. 다른 것으로 정해 주세요.'
  }
  if (m.includes('at least') || m.includes('weak') || m.includes('short')) {
    return `비밀번호가 너무 짧거나 단순합니다. ${MIN}자 이상으로 정해 주세요.`
  }
  if (m.includes('session') || m.includes('jwt') || m.includes('not authenticated')) {
    return '로그인이 풀렸습니다. 새로고침해서 다시 로그인한 뒤에 정해 주세요.'
  }
  return `저장하지 못했습니다 — ${raw}`
}
