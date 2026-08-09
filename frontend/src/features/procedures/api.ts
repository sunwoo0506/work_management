import { supabase } from '../../lib/supabase'
import type { Insert, Row, Update } from '../../lib/supabase'
import { periodLabel } from '../../domain/trigger'
import type { Trigger, TriggerRule, TriggerType } from '../../domain/trigger'

export type Procedure = Row<'procedures'>
export type ProcedureStep = Row<'procedure_steps'>
export type Run = Row<'runs'>
export type RunStep = Row<'run_steps'>

export type ProcedureInsert = Insert<'procedures'>
export type ProcedureUpdate = Update<'procedures'>

/** DB에 jsonb로 담긴 트리거 규칙을 도메인 타입으로 꺼낸다 */
export function triggerOf(p: Procedure): Trigger {
  return {
    type: p.trigger_type as TriggerType,
    rule: (p.trigger_rule ?? {}) as TriggerRule,
  }
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('로그인 정보를 읽지 못했습니다.')
  return id
}

// ── 절차 ─────────────────────────────────────────────────

export async function listProcedures(companyId: string): Promise<Procedure[]> {
  const { data, error } = await supabase
    .from('procedures')
    .select('*')
    .eq('company_id', companyId)
    .neq('status', '폐기')
    .order('sort_order')
  if (error) throw error
  return data
}

export async function createProcedure(
  input: Omit<ProcedureInsert, 'user_id'>,
): Promise<Procedure> {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('procedures')
    .insert({ ...input, user_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateProcedure(
  id: string,
  patch: ProcedureUpdate,
): Promise<Procedure> {
  const { data, error } = await supabase
    .from('procedures')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteProcedure(id: string): Promise<void> {
  const { error } = await supabase.from('procedures').delete().eq('id', id)
  if (error) throw error
}

// ── 절차 단계 ────────────────────────────────────────────

export async function listSteps(procedureId: string): Promise<ProcedureStep[]> {
  const { data, error } = await supabase
    .from('procedure_steps')
    .select('*')
    .eq('procedure_id', procedureId)
    .order('seq')
  if (error) throw error
  return data
}

export async function addStep(
  companyId: string,
  procedureId: string,
  seq: number,
  title: string,
): Promise<ProcedureStep> {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('procedure_steps')
    .insert({ company_id: companyId, user_id: userId, procedure_id: procedureId, seq, title })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateStep(
  id: string,
  patch: Update<'procedure_steps'>,
): Promise<void> {
  const { error } = await supabase.from('procedure_steps').update(patch).eq('id', id)
  if (error) throw error
}

export async function removeStep(id: string): Promise<void> {
  const { error } = await supabase.from('procedure_steps').delete().eq('id', id)
  if (error) throw error
}

// ── 실행(회차) ───────────────────────────────────────────

export async function listRuns(procedureId: string): Promise<Run[]> {
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('procedure_id', procedureId)
    .order('seq', { ascending: false })
  if (error) throw error
  return data
}

export async function listOpenRuns(companyId: string): Promise<Run[]> {
  const { data, error } = await supabase
    .from('runs')
    .select('*')
    .eq('company_id', companyId)
    .eq('result', '진행중')
    .order('started_at', { ascending: false })
  if (error) throw error
  return data
}

/** 절차별 마지막 회차의 대상기간. "이번 기간에 이미 돌렸나"를 판단하는 데 쓴다 */
export async function lastPeriods(companyId: string): Promise<Record<string, string | null>> {
  const { data, error } = await supabase
    .from('runs')
    .select('procedure_id, period_label, seq')
    .eq('company_id', companyId)
    .order('seq', { ascending: false })
  if (error) throw error

  const out: Record<string, string | null> = {}
  for (const r of data) {
    if (!(r.procedure_id in out)) out[r.procedure_id] = r.period_label
  }
  return out
}

/**
 * 회차를 시작한다.
 *
 * 한 번에 셋을 만든다 —
 *   ① 실행 기록  ② 절차 단계를 복사한 실행 단계들  ③ 연결된 업무 1건
 *
 * ③ 을 만드는 이유 — 절차가 업무를 대체하는 게 아니라 업무를 만들어낸다.
 * 사용자는 평소처럼 칸반에서 업무를 옮기면 되고, 그 뒤에서 이력이 쌓인다.
 */
export async function startRun(
  procedure: Procedure,
  steps: ProcedureStep[],
  today: Date,
): Promise<{ run: Run; taskId: string }> {
  const userId = await currentUserId()
  const trigger = triggerOf(procedure)

  const { data: prev } = await supabase
    .from('runs')
    .select('seq')
    .eq('procedure_id', procedure.id)
    .order('seq', { ascending: false })
    .limit(1)
  const seq = (prev?.[0]?.seq ?? 0) + 1
  const period = periodLabel(trigger, today)

  const { data: run, error: rErr } = await supabase
    .from('runs')
    .insert({
      company_id: procedure.company_id,
      user_id: userId,
      procedure_id: procedure.id,
      seq,
      period_label: period,
    })
    .select()
    .single()
  if (rErr) throw rErr

  if (steps.length > 0) {
    const rows = steps.map((s) => ({
      company_id: procedure.company_id,
      user_id: userId,
      run_id: run.id,
      procedure_step_id: s.id,
      seq: s.seq,
      // 절차 단계 이름을 그대로 베껴 둔다. 절차가 나중에 바뀌어도
      // 그때 무엇을 했는지가 남아야 한다
      title: s.title,
    }))
    const { error: sErr } = await supabase.from('run_steps').insert(rows)
    if (sErr) throw sErr
  }

  const { data: task, error: tErr } = await supabase
    .from('tasks')
    .insert({
      company_id: procedure.company_id,
      user_id: userId,
      title: `${procedure.title} (${period})`,
      detail: procedure.purpose,
      source: '절차',
      area: procedure.area,
      status: '진행중',
      procedure_id: procedure.id,
      run_id: run.id,
      focus_date: ymd(today),
    })
    .select('id')
    .single()
  if (tErr) throw tErr

  return { run, taskId: task.id }
}

export async function listRunSteps(runId: string): Promise<RunStep[]> {
  const { data, error } = await supabase
    .from('run_steps')
    .select('*')
    .eq('run_id', runId)
    .order('seq')
  if (error) throw error
  return data
}

export async function updateRunStep(id: string, patch: Update<'run_steps'>): Promise<void> {
  const { error } = await supabase.from('run_steps').update(patch).eq('id', id)
  if (error) throw error
}

/** 절차에 없던 단계가 실행됐을 때. 예외 규칙 2번(단계 추가)이 보는 자리다 */
export async function addAdhocRunStep(
  run: Run,
  seq: number,
  title: string,
): Promise<void> {
  const userId = await currentUserId()
  const { error } = await supabase.from('run_steps').insert({
    company_id: run.company_id,
    user_id: userId,
    run_id: run.id,
    procedure_step_id: null,
    seq,
    title,
  })
  if (error) throw error
}

export async function finishRun(runId: string, result: '완료' | '중단'): Promise<void> {
  const { error } = await supabase
    .from('runs')
    .update({ result, finished_at: new Date().toISOString() })
    .eq('id', runId)
  if (error) throw error
}

function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
