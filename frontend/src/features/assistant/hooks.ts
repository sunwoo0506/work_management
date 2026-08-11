import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCompanyId } from '../companies/useCompany'
import * as api from './api'
import type { AssistReply, Message, ProposedItem, Source } from './api'

export function useThread(taskId: string | null) {
  return useQuery({
    queryKey: ['assistant-thread', taskId],
    queryFn: () => api.getThread(taskId as string),
    enabled: !!taskId,
  })
}

export function useMessages(threadId: string | null) {
  return useQuery({
    queryKey: ['assistant-messages', threadId],
    queryFn: () => api.listMessages(threadId as string),
    enabled: !!threadId,
  })
}

/**
 * 물어보기.
 *
 * 기록을 먼저 남기고 AI 를 부른다 — AI 가 실패해도 **무엇을 물었는지는 남는다.**
 * 답을 못 받았다는 사실 자체가 나중에 볼 만한 기록이다.
 *
 * AI 호출이 실패해도 업무·체크리스트는 아무 영향을 받지 않는다 (CLAUDE.md).
 */
export function useAsk(taskId: string, taskTitle: string) {
  const qc = useQueryClient()
  const companyId = useCompanyId()

  return useMutation({
    mutationFn: async ({
      question,
      history,
    }: {
      question: string
      history: { role: 'user' | 'assistant'; content: string }[]
    }): Promise<AssistReply> => {
      const thread = await api.ensureThread(companyId as string, taskId, taskTitle)
      await api.addMessage({
        companyId: companyId as string,
        threadId: thread.id,
        role: '사람',
        content: question,
      })
      qc.setQueryData(['assistant-thread', taskId], thread)
      void qc.invalidateQueries({ queryKey: ['assistant-messages', thread.id] })

      const reply = await api.callAssist({ mode: '질문', taskId, question, history })

      await api.addMessage({
        companyId: companyId as string,
        threadId: thread.id,
        role: 'AI',
        content: reply.text,
        sources: reply.sources,
        tokensIn: reply.tokensIn,
        tokensOut: reply.tokensOut,
      })
      void qc.invalidateQueries({ queryKey: ['assistant-messages', thread.id] })
      return reply
    },
  })
}

/** 첨부파일을 읽고 체크리스트 초안을 뽑는다. **담는 것은 사람이 누른다.** */
export function useProposeChecklist(taskId: string) {
  return useMutation({
    mutationFn: ({ attachmentIds, hint }: { attachmentIds?: string[]; hint?: string }) =>
      api.callAssist({ mode: '체크리스트', taskId, attachmentIds, hint }),
  })
}

export type { AssistReply, Message, ProposedItem, Source }
