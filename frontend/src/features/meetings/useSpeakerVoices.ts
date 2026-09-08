import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { useCompanyId } from '../companies/useCompany'
import type { SpeakerVoice } from './api'

/**
 * 「기준 › 목소리 등록」에 넣어 둔 목소리를 읽어 온다 (2026-09-08).
 *
 * 받아쓰기를 부르는 화면이 둘이라(녹음파일 올리기 · 회의록 다시 변환)
 * **읽는 자리를 하나로 둔다.** 각자 읽으면 한쪽만 고치는 일이 생긴다 —
 * 이 저장소가 이미 두 번 겪은 실수다.
 */
export function useSpeakerVoices(): SpeakerVoice[] {
  const companyId = useCompanyId()

  const { data } = useQuery({
    queryKey: ['settings', companyId],
    queryFn: async (): Promise<Record<string, unknown>> => {
      const { data, error } = await supabase
        .from('settings')
        .select('key, value')
        .eq('company_id', companyId as string)
      if (error) throw error
      return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
    },
    enabled: !!companyId,
  })

  return Array.isArray(data?.speakers)
    ? (data.speakers as SpeakerVoice[])
        .filter((v) => v && typeof v.name === 'string' && typeof v.path === 'string')
        // 공급자가 4명까지만 받는다. 넘으면 거절당하므로 여기서 자른다
        .slice(0, 4)
    : []
}
