import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row, Update } from '../../lib/supabase'
import { useCompanyId } from '../companies/useCompany'
import { buildSnapshot, shiftDays, ymd } from '../../domain/daily'
import type { LogSnapshotItem } from '../../domain/daily'
import { logActivity } from '../tasks/api'

export type DailyLog = Row<'daily_logs'>
export type LogTodo = Row<'log_todos'>

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('로그인 정보를 읽지 못했습니다.')
  return id
}

/** 그날 일지. 없으면 null — 만들지는 않는다 */
export function useDailyLog(companyId: string | null, date: string) {
  return useQuery({
    queryKey: ['daily_log', companyId, date],
    queryFn: async (): Promise<DailyLog | null> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('company_id', companyId as string)
        .eq('log_date', date)
        .maybeSingle()
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })
}

export function useLogTodos(logId: string | null) {
  return useQuery({
    queryKey: ['log_todos', logId],
    queryFn: async (): Promise<LogTodo[]> => {
      const { data, error } = await supabase
        .from('log_todos')
        .select('*')
        .eq('daily_log_id', logId as string)
        .order('sort_order')
      if (error) throw error
      return data
    },
    enabled: !!logId,
  })
}

/** 어제 이야기에 쓸 전날 일지와 그 할 일 목록 */
export function useYesterday(companyId: string | null, today: Date) {
  const date = ymd(shiftDays(today, -1))
  const log = useDailyLog(companyId, date)
  const todos = useLogTodos(log.data?.id ?? null)
  return { date, log: log.data ?? null, todos: todos.data ?? [] }
}

/** 오늘 일지를 연다. 없으면 만든다 */
export function useOpenTodayLog() {
  const qc = useQueryClient()
  const companyId = useCompanyId()

  return useMutation({
    mutationFn: async (date: string): Promise<DailyLog> => {
      const userId = await currentUserId()
      const { data: existing } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('company_id', companyId as string)
        .eq('log_date', date)
        .maybeSingle()
      if (existing) return existing

      const { data, error } = await supabase
        .from('daily_logs')
        .insert({ company_id: companyId as string, user_id: userId, log_date: date })
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: (log) => {
      void qc.invalidateQueries({ queryKey: ['daily_log', companyId, log.log_date] })
    },
  })
}

export function useLogMutations(log: DailyLog | null) {
  const qc = useQueryClient()
  const companyId = useCompanyId()

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['daily_log', companyId, log?.log_date] })
    void qc.invalidateQueries({ queryKey: ['log_todos', log?.id] })
  }

  return {
    update: useMutation({
      mutationFn: async (patch: Update<'daily_logs'>) => {
        const { error } = await supabase.from('daily_logs').update(patch).eq('id', log!.id)
        if (error) throw error
      },
      onSuccess: invalidate,
    }),

    addTodo: useMutation({
      mutationFn: async ({ title, sortOrder }: { title: string; sortOrder: number }) => {
        const userId = await currentUserId()
        const { error } = await supabase.from('log_todos').insert({
          company_id: log!.company_id,
          user_id: userId,
          daily_log_id: log!.id,
          title,
          sort_order: sortOrder,
        })
        if (error) throw error
      },
      onSuccess: invalidate,
    }),

    updateTodo: useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: Update<'log_todos'> }) => {
        const { error } = await supabase.from('log_todos').update(patch).eq('id', id)
        if (error) throw error
      },
      onSuccess: invalidate,
    }),

    removeTodo: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await supabase.from('log_todos').delete().eq('id', id)
        if (error) throw error
      },
      onSuccess: invalidate,
    }),
  }
}

/**
 * 일지를 확정한다.
 *
 * 두 가지가 한 번에 일어난다 —
 *   ① 그날 진행한 업무를 **스냅샷으로 굳힌다**. 나중에 업무를 고쳐도 안 변한다
 *   ② 「업무로」 체크한 할 일을 **내일 기한의 업무로 만든다**
 *
 * ①이 이 제품의 약속이다. 연말에 "3월에 뭐 했더라"를 되짚으려면
 * 그때의 기록이 그대로 남아 있어야 한다.
 */
export function useCloseLog() {
  const qc = useQueryClient()
  const companyId = useCompanyId()

  return useMutation({
    mutationFn: async ({
      log,
      todos,
      today,
    }: {
      log: DailyLog
      todos: LogTodo[]
      today: Date
    }) => {
      const userId = await currentUserId()

      // ① 스냅샷
      const { data: tasks, error: tErr } = await supabase
        .from('tasks')
        .select('id, title, status, area, progress, updated_at')
        .eq('company_id', log.company_id)
      if (tErr) throw tErr

      const snapshot: LogSnapshotItem[] = buildSnapshot(tasks, today)

      // ② 체크한 할 일 → 내일 기한의 업무
      const tomorrow = ymd(shiftDays(today, 1))
      const toPromote = todos.filter((t) => t.promote && !t.promoted_task_id)

      for (const t of toPromote) {
        const { data: task, error } = await supabase
          .from('tasks')
          .insert({
            company_id: log.company_id,
            user_id: userId,
            title: t.title,
            source: '일지',
            priority: t.priority,
            status: '할 일',
            due_date: tomorrow,
            focus_date: tomorrow,
          })
          .select('id')
          .single()
        if (error) throw error

        await supabase.from('log_todos').update({ promoted_task_id: task.id }).eq('id', t.id)
      }

      const { error: cErr } = await supabase
        .from('daily_logs')
        .update({ snapshot, closed_at: new Date().toISOString() })
        .eq('id', log.id)
      if (cErr) throw cErr

      await logActivity(log.company_id, 'task', log.id, '일지확정', {
        date: log.log_date,
        snapshot_count: snapshot.length,
        promoted: toPromote.length,
      })

      return { snapshotCount: snapshot.length, promoted: toPromote.length }
    },

    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['daily_log'] })
      void qc.invalidateQueries({ queryKey: ['log_todos'] })
      void qc.invalidateQueries({ queryKey: ['tasks', companyId] })
    },
  })
}
