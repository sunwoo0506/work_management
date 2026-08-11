import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCompanyId } from '../companies/useCompany'
import * as api from './api'
import type { Attachment } from './api'

const KEY = (taskId: string | null) => ['attachments', taskId] as const

export function useAttachments(taskId: string | null) {
  return useQuery({
    queryKey: KEY(taskId),
    queryFn: () => api.listAttachments(taskId as string),
    enabled: !!taskId,
  })
}

export function useUploadAttachment(taskId: string) {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  return useMutation({
    mutationFn: (file: File) => api.uploadAttachment(companyId as string, taskId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(taskId) }),
  })
}

export function useRemoveAttachment(taskId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (a: Attachment) => api.removeAttachment(a),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(taskId) }),
  })
}

export type { Attachment }
