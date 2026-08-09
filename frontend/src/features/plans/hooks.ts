import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { planRange } from '../../domain/plan'
import type { Goal, PlanKind, PlanTask } from '../../domain/plan'
import { useCompanyId } from '../companies/useCompany'

export type PlanRow = Row<'plans'>

/** 이 기간의 계획. 아직 없으면 null — 만드는 것은 사용자가 목표를 적을 때 */
export function usePlan(kind: PlanKind, ref: Date) {
  const companyId = useCompanyId()
  const { from } = planRange(kind, ref)

  return useQuery({
    queryKey: ['plan', companyId, kind, from],
    queryFn: async (): Promise<PlanRow | null> => {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('company_id', companyId as string)
        .eq('kind', kind)
        .eq('period_from', from)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })
}

/** 배치 대상 업무. 완료·보류는 domain/plan.ts 가 걸러낸다 */
export function usePlanTasks() {
  const companyId = useCompanyId()
  return useQuery({
    queryKey: ['plan-tasks', companyId],
    queryFn: async (): Promise<PlanTask[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, focus_date, area')
        .eq('company_id', companyId as string)
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })
}

export function usePlanMutations(kind: PlanKind, ref: Date) {
  const companyId = useCompanyId()
  const qc = useQueryClient()
  const { from, to } = planRange(kind, ref)

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['plan'] })
    void qc.invalidateQueries({ queryKey: ['plan-tasks'] })
    void qc.invalidateQueries({ queryKey: ['tasks'] })
  }

  return {
    /** 목표·메모·회고를 저장한다. 없으면 만들면서 저장한다 */
    save: useMutation({
      mutationFn: async (patch: { goals?: Goal[]; memo?: string; retro?: string }) => {
        const { data: auth } = await supabase.auth.getUser()
        const userId = auth.user?.id
        if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

        const { error } = await supabase.from('plans').upsert(
          {
            company_id: companyId as string,
            user_id: userId,
            kind,
            period_from: from,
            period_to: to,
            ...(patch.goals !== undefined && { goals: patch.goals as unknown as Json }),
            ...(patch.memo !== undefined && { memo: patch.memo || null }),
            ...(patch.retro !== undefined && { retro: patch.retro || null }),
          },
          { onConflict: 'company_id,kind,period_from' },
        )
        if (error) throw error
      },
      onSuccess: invalidate,
    }),

    /**
     * 업무를 어느 날에 놓는다.
     *
     * 기한(`due_date`)은 건드리지 않는다 — 기한은 남이 정한 약속이고,
     * 배치일(`focus_date`)은 내가 정하는 것이다. 둘을 섞으면
     * "언제까지"와 "언제 할지"를 구분할 수 없게 된다.
     */
    place: useMutation({
      mutationFn: async ({ taskId, date }: { taskId: string; date: string | null }) => {
        const { error } = await supabase
          .from('tasks')
          .update({ focus_date: date })
          .eq('id', taskId)
        if (error) throw error
      },
      onSuccess: invalidate,
    }),
  }
}
