import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import LoginPage from './LoginPage'

/**
 * 로그인 상태에 따라 앱을 열거나 로그인 화면을 보여준다.
 *
 * 세션 변화를 구독하므로 다른 탭에서 로그아웃해도 즉시 반영된다.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setReady(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  // 세션을 확인하는 동안 로그인 화면이 깜빡이지 않게 한다
  if (!ready) {
    return (
      <div className="min-h-screen grid place-items-center bg-canvas">
        <p className="text-caption text-ink-mute">불러오는 중…</p>
      </div>
    )
  }

  if (!session) return <LoginPage />

  return <>{children}</>
}
