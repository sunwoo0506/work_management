import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { areaOptions, isRetiredArea } from '../../domain/areas'
import { useCompanyId } from '../companies/useCompany'

/**
 * 업무영역 — **여기가 유일한 통로다.**
 *
 * 예전에는 화면마다 목록을 따로 들고 있었다. 업무 등록·절차 화면은 코드에 박힌
 * 11개를, 회의록·인박스는 설정에 등록한 목록을 봤다. 그러면 회의록에서 「자금」으로
 * 분류해 만든 업무를 나중에 열었을 때 **목록에 「자금」이 없어** 값이 사라졌다.
 * 리포트는 영역으로 묶으므로 이게 어긋나면 집계가 두 갈래로 쪼개진다.
 *
 * 그래서 영역 선택칸을 그리는 화면은 전부 이 훅만 본다.
 */

/** 설정에 등록된 업무영역 목록. 「기준 › 설정 › 업무영역」이 원본이다 */
export async function loadAreas(companyId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('company_id', companyId)
    .eq('key', 'areas')
    .maybeSingle()
  if (error) throw error
  const raw = data?.value
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
}

/** 설정에 등록된 목록만 그대로 준다 — 기본 갈래로 채우지 않는다 */
export function useRegisteredAreas(): string[] {
  const companyId = useCompanyId()
  const { data } = useQuery({
    queryKey: ['areas', companyId],
    queryFn: () => loadAreas(companyId as string),
    enabled: !!companyId,
  })
  return data ?? []
}

/**
 * 영역 선택칸에 쓸 목록.
 *
 * @param saved 지금 저장돼 있는 값. 목록에 없어도 잃지 않으려고 받는다
 * @returns `options` 그릴 목록 · `retired` 저장값이 설정에서 지워진 것인가
 */
export function useAreaOptions(saved?: string | null): {
  options: string[]
  retired: boolean
} {
  const companyId = useCompanyId()
  const { data } = useQuery({
    queryKey: ['areas', companyId],
    queryFn: () => loadAreas(companyId as string),
    enabled: !!companyId,
  })
  return { options: areaOptions(data, saved), retired: isRetiredArea(data, saved) }
}
