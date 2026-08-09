import { useState } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * 매직링크 로그인.
 *
 * 비밀번호를 쓰지 않는다. 혼자 쓰는 도구라 비밀번호를 관리할 이유가 없고,
 * 관리하지 않는 비밀번호가 가장 안전하다.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function send(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <div className="min-h-screen grid place-items-center bg-canvas px-6">
      <div className="w-full max-w-[380px]">
        <p className="text-caption text-ink-mute uppercase tracking-wide">
          Work Management
        </p>
        <h1 className="text-[32px] leading-[1.15] font-semibold mt-2">
          업무관리툴
        </h1>

        {sent ? (
          <div className="mt-8 bg-parchment rounded-lg p-6 border border-hairline">
            <p className="text-body">
              <strong className="font-semibold">{email}</strong> 으로 링크를 보냈습니다.
            </p>
            <p className="text-caption text-ink-mute mt-2 leading-relaxed">
              메일함에서 링크를 누르면 로그인됩니다. 이 창은 닫아도 됩니다.
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
          <form onSubmit={send} className="mt-8">
            <label htmlFor="email" className="block text-caption text-ink-soft">
              이메일
            </label>
            <input
              id="email"
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="mt-2 w-full text-body bg-canvas border border-hairline rounded-md px-4 py-3
                         outline-none focus:border-action-focus"
            />
            <button
              type="submit"
              disabled={busy || !email}
              className="mt-4 w-full bg-action text-white rounded-full px-[22px] py-[11px]
                         text-body font-semibold disabled:opacity-40"
            >
              {busy ? '보내는 중…' : '로그인 링크 받기'}
            </button>
            {error && (
              <p className="text-caption text-alert mt-3" role="alert">
                {error}
              </p>
            )}
            <p className="text-caption text-ink-mute mt-6 leading-relaxed">
              비밀번호가 없습니다. 메일로 오는 링크를 누르면 로그인됩니다.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
