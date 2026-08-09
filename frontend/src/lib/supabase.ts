import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// 값이 없으면 조용히 실패하지 않고 여기서 멈춘다.
// 없는 채로 흘러가면 "왜 아무것도 안 나오지"를 한참 헤매게 된다.
if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL 또는 VITE_SUPABASE_ANON_KEY가 없습니다. frontend/.env.local을 확인하세요.',
  )
}

/** 앱 전체가 쓰는 단 하나의 클라이언트. 여러 개 만들면 세션이 어긋난다. */
export const supabase = createClient<Database>(url, anonKey)

export type Tables = Database['public']['Tables']
export type Row<T extends keyof Tables> = Tables[T]['Row']
export type Insert<T extends keyof Tables> = Tables[T]['Insert']
export type Update<T extends keyof Tables> = Tables[T]['Update']
