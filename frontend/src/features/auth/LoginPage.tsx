import { useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * 로그인이 막혔을 때 **무엇을 해야 하는지**를 우리말로 말해 준다.
 *
 * ── 왜 필요한가 (2026-09-05) ─────────────────────────────
 * 하루에 두 번, **뜻을 알 수 없는 영어 한 줄** 앞에서 막혔다.
 *
 *   `Failed to fetch`             → 서버가 잠들어 주소가 사라진 것이었다
 *   `email rate limit exceeded`   → 메일 발송 한도를 다 쓴 것이었다
 *
 * 둘 다 **비밀번호나 이메일 주소 문제가 아니다.** 그런데 화면에는 로그인 칸 밑에
 * 빨간 영어가 뜨니, 보는 사람은 자기가 뭘 잘못 적었나부터 의심하게 된다.
 * **아무것도 안 적어서 못 고치는 게 아니라, 무엇을 고쳐야 할지를 몰라 못 고친다.**
 *
 * ⚠️ 원문을 지우지 않고 **뒤에 붙여 둔다.** 우리가 짐작해 요약하면 정작 필요한
 *    단서가 지워진다 — 받아쓰기·AI 쪽에서 이미 같은 이유로 원문을 남기고 있다
 *    (`_shared/provider/failure.ts`).
 */
function explain(raw: string): string {
  const m = raw.toLowerCase()

  // ① 메일 발송 한도. Supabase 가 무료로 얹어 주는 발송기는 시간당 두 통뿐이다
  if (m.includes('email rate limit') || m.includes('over_email_send_rate_limit')) {
    return (
      '메일 발송 한도를 다 썼습니다. 로그인 정보가 틀린 것이 아닙니다. ' +
      '먼저 메일함(스팸함 포함)을 확인해 주세요 — 이미 도착한 링크가 있을 수 있고 1시간 동안 유효합니다. ' +
      '없으면 1시간 뒤에 한 번만 다시 눌러 주세요. 여러 번 누르면 한도만 더 씁니다. ' +
      '비밀번호를 정해 두시면 이 한도에 걸리지 않습니다.'
    )
  }

  // ② 같은 주소로 너무 빨리 다시 눌렀을 때. 이건 몇십 초면 풀린다
  const after = raw.match(/after (\d+) seconds?/i)
  if (after) {
    return `${after[1]}초 뒤에 다시 눌러 주세요. 방금 보낸 것이 아직 처리 중입니다.`
  }

  // ③ 서버에 닿지도 못한 것. 2026-09-05 에 실제로 겪었다 — 프로젝트가 잠들어 있었다
  if (m.includes('failed to fetch') || m.includes('networkerror') || m.includes('load failed')) {
    return (
      '서버에 연결하지 못했습니다. 인터넷이 되는데도 이러면 ' +
      'Supabase 프로젝트가 잠들어 있을 수 있습니다 (며칠 안 쓰면 자동으로 잠듭니다). ' +
      'supabase.com 대시보드에서 프로젝트를 되살린 뒤(Restore) 2~5분 기다렸다가 다시 시도해 주세요.'
    )
  }

  // ④ 비밀번호가 틀렸거나, 아직 안 정했거나 — **둘을 구분해 주지 않는다.**
  //    있는지 없는지 알려 주면 남이 「이 주소로 계정이 있다」를 알아낼 수 있다.
  //    그래서 둘 다 말해 준다 — 「틀렸습니다」만 띄우면 안 정한 사람이 영영 못 들어온다
  if (m.includes('invalid login credentials') || m.includes('invalid_credentials')) {
    return (
      '비밀번호가 맞지 않습니다. 아직 비밀번호를 정하지 않으셨을 수도 있습니다 — ' +
      '그때는 「메일 링크」로 들어오신 뒤 기준 › 설정 › 로그인 비밀번호에서 정해 주세요.'
    )
  }

  return `로그인 요청이 실패했습니다 — ${raw}`
}

/**
 * 로그인 — 문이 둘이다.
 *
 * ── 왜 둘인가 (2026-09-05) ───────────────────────────────
 * 원래는 매직링크 하나였다. 비밀번호를 안 쓰는 것이 설계였다 —
 * 혼자 쓰는 도구라 관리할 이유가 없고, **관리하지 않는 비밀번호가 가장 안전하다**.
 *
 * 그 대가가 실제로 나왔다. 로그인마다 메일이 한 통 나가는데 Supabase 가 무료로
 * 얹어 주는 발송기는 **시간당 두 통이 끝**이다. 그 한도에 걸려 **로그인 자체를
 * 못 했다.** 늘리는 설정이 없다.
 *
 * 부장님이 **「비밀번호 로그인도 함께」**로 정하셨다. 메일 링크를 없애지 않고
 * **두 번째 문을 낸다** — 처음 오는 사람은 비밀번호가 없으니 메일 링크가 필요하고,
 * 그 뒤로는 메일 없이 들어올 수 있다.
 */
export default function LoginPage() {
  /**
   * 어느 문으로 들어갈까.
   *
   * **비밀번호를 앞에 둔다.** 메일 링크는 막힐 수 있는 길이고 비밀번호는 안 막힌다.
   * 다만 메일 링크를 **같은 화면에** 남겨 둔다 — 탭 안쪽으로 숨기면
   * 아직 비밀번호를 못 정한 사람이 갇힌다.
   */
  const [way, setWay] = useState<'비밀번호' | '메일 링크'>('비밀번호')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** 메일로 링크를 보낸다. 그 링크를 누르면 로그인된다 */
  async function sendLink(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(explain(error.message))
    else setSent(true)
  }

  /** 비밀번호로 바로 들어간다. **메일이 나가지 않으므로 한도에 안 걸린다** */
  async function signIn(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    // 성공하면 로그인 상태가 바뀌면서 이 화면이 통째로 사라진다 (AuthGate)
    if (error) setError(explain(error.message))
  }

  const emailField = (
    <div>
      <label htmlFor="email" className="block text-caption text-ink-soft">
        이메일
      </label>
      <input
        id="email"
        type="email"
        required
        autoFocus
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@example.com"
        className="mt-2 w-full text-body bg-canvas border border-hairline rounded-md px-4 py-3
                   outline-none focus:border-action-focus"
      />
    </div>
  )

  return (
    <div className="min-h-screen grid place-items-center bg-canvas px-6">
      <div className="w-full max-w-[380px]">
        {/*
          서비스 이름은 「클론미」. AI 비서는 「클로니」.
          저장소·폴더 이름은 WorkManagement 그대로 둔다 — OneDrive 안에서
          폴더를 옮기다 저장소가 깨진 적이 있어(회고 2026-08-09_v01) 건드리지 않는다.
        */}
        <p className="text-caption text-ink-mute uppercase tracking-wide">
          Clone Me
        </p>
        <h1 className="text-title leading-[1.15] font-semibold mt-2">
          클론미
        </h1>
        <p className="text-body text-ink-mute mt-2 leading-relaxed">
          내가 일하는 방식을 남겨서, 언젠가 클로니가 이어받게.
        </p>

        {sent ? (
          <div className="mt-8 bg-parchment rounded-lg p-6 border border-hairline">
            <p className="text-body">
              <strong className="font-semibold">{email}</strong> 으로 링크를 보냈습니다.
            </p>
            <p className="text-caption text-ink-mute mt-2 leading-relaxed">
              메일함에서 링크를 누르면 로그인됩니다. 이 창은 닫아도 됩니다.
              안 보이면 <strong className="font-semibold">스팸함</strong>도 확인해 주세요.
            </p>
            <p className="text-caption text-ink-mute mt-2 leading-relaxed">
              들어오신 뒤 <strong className="font-semibold">기준 › 설정 › 로그인 비밀번호</strong>에서
              비밀번호를 정해 두시면, 다음부터는 메일을 안 거치셔도 됩니다.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-caption text-action mt-4 hover:underline"
            >
              다른 주소로 다시 보내기
            </button>
          </div>
        ) : (
          <div className="mt-8">
            {/* ── 어느 문으로 ───────────────────────────── */}
            <div className="flex flex-wrap gap-1.5">
              {(['비밀번호', '메일 링크'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => {
                    setWay(w)
                    setError(null)
                  }}
                  className={[
                    'text-caption rounded-full px-3 py-1.5 border',
                    way === w
                      ? 'text-action border-action font-semibold'
                      : 'text-ink-mute border-hairline',
                  ].join(' ')}
                >
                  {w}
                </button>
              ))}
            </div>

            {way === '비밀번호' ? (
              <form onSubmit={signIn} className="mt-4 space-y-3">
                {emailField}
                <div>
                  <label htmlFor="password" className="block text-caption text-ink-soft">
                    비밀번호
                  </label>
                  <input
                    id="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-2 w-full text-body bg-canvas border border-hairline rounded-md px-4 py-3
                               outline-none focus:border-action-focus"
                  />
                </div>
                <button
                  type="submit"
                  disabled={busy || !email || !password}
                  className="w-full bg-action text-white rounded-full px-[22px] py-[11px]
                             text-body font-semibold disabled:opacity-40"
                >
                  {busy ? '들어가는 중…' : '로그인'}
                </button>
              </form>
            ) : (
              <form onSubmit={sendLink} className="mt-4 space-y-3">
                {emailField}
                <button
                  type="submit"
                  disabled={busy || !email}
                  className="w-full bg-action text-white rounded-full px-[22px] py-[11px]
                             text-body font-semibold disabled:opacity-40"
                >
                  {busy ? '보내는 중…' : '로그인 링크 받기'}
                </button>
              </form>
            )}

            {error && (
              <p className="text-caption text-alert mt-3 leading-relaxed" role="alert">
                {error}
              </p>
            )}

            {/*
              ⚠️ **두 길의 성격이 다르다는 것을 밝힌다.**
              메일 링크는 시간당 두 통에서 막힌다 — 2026-09-05 에 실제로 막혀
              로그인을 못 했다. 그래서 비밀번호를 정해 두시라고 여기서 권한다
            */}
            <p className="text-caption text-ink-mute mt-6 leading-relaxed">
              {way === '비밀번호' ? (
                <>
                  비밀번호는 <strong className="font-semibold">기준 › 설정 › 로그인 비밀번호</strong>에서
                  정합니다. 아직 정하지 않으셨으면 먼저 「메일 링크」로 들어오세요.
                </>
              ) : (
                <>
                  비밀번호 없이, 메일로 오는 링크를 누르면 로그인됩니다.{' '}
                  <strong className="font-semibold">이 메일은 시간당 두 통까지만 나갑니다</strong> —
                  자주 쓰실 거면 비밀번호를 정해 두시는 편이 낫습니다.
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
