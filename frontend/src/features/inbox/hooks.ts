import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import { useCompanyId } from '../companies/useCompany'
import { toTaskInsert } from '../../domain/promote'
import type { PromoteChoice } from '../../domain/promote'
import { logActivity } from '../tasks/api'

export type InboxItem = Row<'inbox'>

export function useInbox() {
  const companyId = useCompanyId()
  return useQuery({
    queryKey: ['inbox', companyId],
    queryFn: async (): Promise<InboxItem[]> => {
      const { data, error } = await supabase
        .from('inbox')
        .select('*')
        .eq('company_id', companyId as string)
        .is('promoted_task_id', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
    enabled: !!companyId,
  })
}

export function useCaptureInbox() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  return useMutation({
    mutationFn: async (content: string) => {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id
      if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')
      const { error } = await supabase.from('inbox').insert({
        company_id: companyId as string,
        user_id: userId,
        content,
        origin: '직접', // 1단계는 직접 던져둔 메모만 받는다
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox', companyId] }),
  })
}

/**
 * 인박스 → 업무 승격.
 *
 * 필드 매핑은 domain/promote.ts 의 toTaskInsert 를 그대로 쓴다.
 * 60자 넘으면 제목을 자르고 전문을 상세에 넣는 규칙이 이미 테스트돼 있다.
 */
export function usePromoteInbox() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  return useMutation({
    mutationFn: async ({ item, choice }: { item: InboxItem; choice: PromoteChoice }) => {
      const insert = toTaskInsert(
        {
          id: item.id,
          user_id: item.user_id,
          company_id: item.company_id,
          content: item.content,
          tag: item.tag,
          origin: item.origin,
        },
        choice,
      )

      const { data: task, error } = await supabase.from('tasks').insert(insert).select().single()
      if (error) throw error

      const { error: uErr } = await supabase
        .from('inbox')
        .update({ promoted_task_id: task.id })
        .eq('id', item.id)
      if (uErr) throw uErr

      await logActivity(item.company_id, 'inbox', item.id, '승격', { task_id: task.id })
      return task
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['inbox', companyId] })
      void qc.invalidateQueries({ queryKey: ['tasks', companyId] })
    },
  })
}

export function useDiscardInbox() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inbox').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inbox', companyId] }),
  })
}
