import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import { useCompanyId } from '../companies/useCompany'
import { detectExceptions } from '../../domain/exceptions'
import type { StepDef, StepRun } from '../../domain/exceptions'

export type ExceptionRow = Row<'exceptions'>

export function usePendingExceptions() {
  const companyId = useCompanyId()
  return useQuery({
    queryKey: ['exceptions', 'pending', companyId],
    queryFn: async (): Promise<ExceptionRow[]> => {
      const { data, error } = await supabase
        .from('exceptions')
        .select('*')
        .eq('company_id', companyId as string)
        .eq('confirm', '대기')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })
}

export function useExceptionMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['exceptions'] })

  return {
    confirm: useMutation({
      mutationFn: async ({
        id, confirm, explanation,
      }: {
        id: string
        confirm: '예외확정' | '정상'
        explanation?: string
      }) => {
        const { error } = await supabase
          .from('exceptions')
          .update({ confirm, explanation: explanation ?? null })
          .eq('id', id)
        if (error) throw error
      },
      onSuccess: invalidate,
    }),
    reflect: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase
          .from('exceptions')
          .update({ reflected: true })
          .eq('id', id)
        if (error) throw error
      },
      onSuccess: invalidate,
    }),
  }
}

/**
 * 회차가 끝날 때 예외를 탐지해 기록한다.
 *
 * 탐지는 domain/exceptions.ts 의 순수 함수가 한다 — AI 없이 계산된다.
 * 여기서는 그 결과를 DB 에 담는 일만 한다.
 *
 * 같은 회차를 다시 탐지하면 기존 탐지 결과를 지우고 새로 넣는다.
 * 사용자가 이미 확인한 것은 건드리지 않는다.
 */
export function useDetectForRun() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (runId: string): Promise<number> => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

      const { data: run, error: rErr } = await supabase
        .from('runs')
        .select('*, procedures(*)')
        .eq('id', runId)
        .single()
      if (rErr) throw rErr

      const procedure = (run as unknown as { procedures: Row<'procedures'> }).procedures

      const { data: defs, error: dErr } = await supabase
        .from('procedure_steps')
        .select('*')
        .eq('procedure_id', run.procedure_id)
        .order('seq')
      if (dErr) throw dErr

      const { data: mine, error: sErr } = await supabase
        .from('run_steps')
        .select('*')
        .eq('run_id', runId)
        .order('seq')
      if (sErr) throw sErr

      // 과거 회차 — 최근 것부터
      const { data: pastRuns, error: pErr } = await supabase
        .from('runs')
        .select('id')
        .eq('procedure_id', run.procedure_id)
        .eq('result', '완료')
        .neq('id', runId)
        .order('seq', { ascending: false })
        .limit(10)
      if (pErr) throw pErr

      const history: StepRun[][] = []
      for (const p of pastRuns ?? []) {
        const { data } = await supabase.from('run_steps').select('*').eq('run_id', p.id).order('seq')
        history.push((data ?? []).map(toStepRun))
      }

      const steps: StepDef[] = (defs ?? []).map((d) => ({
        id: d.id,
        seq: d.seq,
        title: d.title,
        required: d.required,
        // 절차에 산출물 목록이 있으면 모든 단계에 산출물을 기대한다고 본다.
        // 단계별 산출물 정의는 3단계(문서)에서 세분화한다.
        hasOutputSpec: Array.isArray(procedure?.outputs) && procedure.outputs.length > 0,
      }))

      const found = detectExceptions(
        steps,
        (mine ?? []).map(toStepRun),
        history,
        procedure?.ai_delegation !== '사람만',
      )

      // 아직 확인 안 한 기존 탐지만 지운다
      await supabase.from('exceptions').delete().eq('run_id', runId).eq('confirm', '대기')

      if (found.length > 0) {
        const rows = found.map((f) => ({
          company_id: run.company_id,
          user_id: userId,
          run_id: runId,
          run_step_id: f.runStepId,
          rule: f.rule,
          detected: f.detected,
        }))
        const { error } = await supabase.from('exceptions').insert(rows)
        if (error) throw error
      }

      return found.length
    },

    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['exceptions'] })
    },
  })
}

function toStepRun(r: Row<'run_steps'>): StepRun {
  return {
    id: r.id,
    procedureStepId: r.procedure_step_id,
    seq: r.seq,
    title: r.title,
    done: r.done,
    actualMin: r.actual_min,
    output: r.output,
    humanIntervened: r.human_intervened,
  }
}
