import { supabase } from '../../lib/supabase'

/**
 * 컴포넌트 파일과 분리해 둔다.
 * 한 파일이 컴포넌트와 함수를 같이 내보내면 Vite의 빠른 새로고침이 깨진다.
 */
export function useSignOut() {
  return () => supabase.auth.signOut()
}
