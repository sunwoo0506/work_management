import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCompanyId } from '../companies/useCompany'
import * as api from './api'
import type { Procedure, ProcedureInsert, ProcedureStep, ProcedureUpdate, Run } from './api'

/** 화면이 채우는 부분. company_id·user_id 는 훅이 붙인다 */
type ProcedureDraft = Omit<ProcedureInsert, 'user_id' | 'company_id'>

export function useProcedures() {
  const companyId = useCompanyId()
  return useQuery({
    queryKey: ['procedures', companyId],
    queryFn: () => api.listProcedures(companyId as string),
    enabled: !!companyId,
  })
}

/** 절차별 마지막 회차의 대상기간. 「이번 기간에 이미 돌렸나」 판단용 */
export function useLastPeriods() {
  const companyId = useCompanyId()
  return useQuery({
    queryKey: ['runs', 'lastPeriods', companyId],
    queryFn: () => api.lastPeriods(companyId as string),
    enabled: !!companyId,
  })
}

export function useProcedureMutations() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['procedures', companyId] })

  return {
    create: useMutation({
      mutationFn: (input: ProcedureDraft) =>
        api.createProcedure({ ...input, company_id: companyId as string }),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: ProcedureUpdate }) =>
        api.updateProcedure(id, patch),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.deleteProcedure(id),
      onSuccess: invalidate,
    }),
  }
}

// ── 절차 단계 ────────────────────────────────────────────

export function useSteps(procedureId: string | null) {
  return useQuery({
    queryKey: ['procedure_steps', procedureId],
    queryFn: () => api.listSteps(procedureId as string),
    enabled: !!procedureId,
  })
}

export function useStepMutations(procedureId: string | null) {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['procedure_steps', procedureId] })

  return {
    add: useMutation({
      mutationFn: ({ seq, title }: { seq: number; title: string }) =>
        api.addStep(companyId as string, procedureId as string, seq, title),
      onSuccess: invalidate,
    }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateStep>[1] }) =>
        api.updateStep(id, patch),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.removeStep(id),
      onSuccess: invalidate,
    }),
  }
}

// ── 실행(회차) ───────────────────────────────────────────

export function useRuns(procedureId: string | null) {
  return useQuery({
    queryKey: ['runs', procedureId],
    queryFn: () => api.listRuns(procedureId as string),
    enabled: !!procedureId,
  })
}

export function useOpenRuns() {
  const companyId = useCompanyId()
  return useQuery({
    queryKey: ['runs', 'open', companyId],
    queryFn: () => api.listOpenRuns(companyId as string),
    enabled: !!companyId,
  })
}

export function useRunSteps(runId: string | null) {
  return useQuery({
    queryKey: ['run_steps', runId],
    queryFn: () => api.listRunSteps(runId as string),
    enabled: !!runId,
  })
}

export function useStartRun() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  return useMutation({
    mutationFn: ({
      procedure,
      steps,
    }: {
      procedure: Procedure
      steps: ProcedureStep[]
    }) => api.startRun(procedure, steps, new Date()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['runs'] })
      void qc.invalidateQueries({ queryKey: ['tasks', companyId] })
    },
  })
}

export function useRunMutations(runId: string | null) {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['run_steps', runId] })
    void qc.invalidateQueries({ queryKey: ['runs'] })
  }

  return {
    updateStep: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.updateRunStep>[1] }) =>
        api.updateRunStep(id, patch),
      onSuccess: invalidate,
    }),
    addAdhoc: useMutation({
      mutationFn: ({ run, seq, title }: { run: Run; seq: number; title: string }) =>
        api.addAdhocRunStep(run, seq, title),
      onSuccess: invalidate,
    }),
    finish: useMutation({
      mutationFn: ({ id, result }: { id: string; result: '완료' | '중단' }) =>
        api.finishRun(id, result),
      onSuccess: () => {
        invalidate()
        void qc.invalidateQueries({ queryKey: ['tasks', companyId] })
      },
    }),
  }
}
