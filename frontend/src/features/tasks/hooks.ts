import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCompanyId } from '../companies/useCompany'
import * as api from './api'
import type { Task, TaskInsert, TaskUpdate } from './api'

const KEY = (companyId: string) => ['tasks', companyId] as const

export function useTasks() {
  const companyId = useCompanyId()
  return useQuery({
    queryKey: KEY(companyId ?? ''),
    queryFn: () => api.listTasks(companyId as string),
    enabled: !!companyId,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  return useMutation({
    mutationFn: (input: Omit<TaskInsert, 'user_id' | 'company_id'>) =>
      api.createTask({ ...input, company_id: companyId as string }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(companyId ?? '') }),
  })
}

/**
 * 수정.
 *
 * 수정 전 업무를 통째로 받는다 — 무엇이 바뀌었는지 비교해서
 * 실행이력에 남기기 위해서다 (api.editTask).
 */
export function useUpdateTask() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  return useMutation({
    mutationFn: ({ before, patch }: { before: Task; patch: TaskUpdate }) =>
      api.editTask(before, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY(companyId ?? '') }),
  })
}

/**
 * 상태 변경은 낙관적 업데이트를 쓴다.
 *
 * 칸반에서 카드를 끌어 옮겼는데 서버 응답을 기다리며 원위치에 멈춰 있으면
 * "안 옮겨졌나?" 하고 다시 끌게 된다. 화면을 먼저 바꾸고 실패하면 되돌린다.
 */
export function useChangeStatus() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  const key = KEY(companyId ?? '')

  return useMutation({
    mutationFn: ({ task, status }: { task: Task; status: string }) =>
      api.changeStatus(task, status),

    onMutate: async ({ task, status }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<Task[]>(key)
      qc.setQueryData<Task[]>(key, (old) =>
        (old ?? []).map((t) => (t.id === task.id ? { ...t, status } : t)),
      )
      return { prev }
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },

    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  return useMutation({
    mutationFn: (task: Task) => api.deleteTask(task),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY(companyId ?? '') })
      // 절차에서 나온 업무를 지우면 회차 화면의 연결도 끊긴다
      void qc.invalidateQueries({ queryKey: ['runs'] })
    },
  })
}

// ── 체크리스트 ────────────────────────────────────────────

export function useChecklist(taskId: string | null) {
  return useQuery({
    queryKey: ['checklist', taskId],
    queryFn: () => api.listChecklist(taskId as string),
    enabled: !!taskId,
  })
}

export function useChecklistMutations(taskId: string | null) {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  const invalidate = () => qc.invalidateQueries({ queryKey: ['checklist', taskId] })

  return {
    add: useMutation({
      mutationFn: ({ label, sortOrder }: { label: string; sortOrder: number }) =>
        api.addChecklistItem(companyId as string, taskId as string, label, sortOrder),
      onSuccess: invalidate,
    }),
    toggle: useMutation({
      mutationFn: ({ id, done }: { id: string; done: boolean }) =>
        api.toggleChecklistItem(id, done),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.removeChecklistItem(id),
      onSuccess: invalidate,
    }),
  }
}
