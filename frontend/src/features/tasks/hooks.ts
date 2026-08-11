import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCompanyId } from '../companies/useCompany'
import * as api from './api'
import type { ChecklistItem, Task, TaskInsert, TaskUpdate } from './api'

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

    // 하위 업무를 닫으면 부모 진행률이 따라 움직여야 한다
    onSuccess: async (_r, { task }) => {
      if (task.parent_task_id) await api.syncProgress(task.id)
    },

    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}

// ── 하위 업무 ─────────────────────────────────────────────

export function useSubtasks(parentId: string | null) {
  const companyId = useCompanyId()
  const { data: all } = useTasks()
  // 업무는 어차피 전부 불러와 있다. 하위만 다시 물으면 화면이 두 번 깜빡인다
  void companyId
  return (all ?? []).filter((t) => t.parent_task_id === parentId)
}

/** 이 업무가 어느 체크 항목에서 올라왔나. 직접 만든 업무면 null */
export function useSourceChecklistItem(taskId: string | null) {
  return useQuery({
    queryKey: ['source-checklist-item', taskId],
    queryFn: () => api.findSourceChecklistItem(taskId as string),
    enabled: !!taskId,
  })
}

/** 올라온 업무 쪽에서 되돌리기. 업무를 지우면 서랍도 닫아야 한다 */
export function useReturnToChecklist() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  return useMutation({
    mutationFn: ({
      item, promoted, alsoDeleteTask,
    }: {
      item: ChecklistItem
      promoted: Task
      alsoDeleteTask: boolean
    }) => api.cancelPromotion(item, promoted, alsoDeleteTask),
    onSuccess: async (_r, { item }) => {
      await api.syncProgress(item.task_id)
      void qc.invalidateQueries({ queryKey: ['checklist', item.task_id] })
      void qc.invalidateQueries({ queryKey: KEY(companyId ?? '') })
    },
  })
}

/** 다른 업무 밑으로 묶거나 떼어 내기 — 업무는 남고 관계만 바뀐다 */
export function useSetParent() {
  const qc = useQueryClient()
  const companyId = useCompanyId()
  return useMutation({
    mutationFn: ({ task, parentId }: { task: Task; parentId: string | null }) =>
      api.setParent(task, parentId),
    onSuccess: async (_r, { task }) => {
      if (task.parent_task_id) await api.syncProgress(task.parent_task_id)
      void qc.invalidateQueries({ queryKey: KEY(companyId ?? '') })
    },
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

/**
 * 체크리스트를 건드리면 **진행률이 따라 움직인다.**
 *
 * 진행률 막대를 손으로 끄는 건 근거 없는 숫자를 만드는 일이다.
 * 체크 하나가 곧 진행률이므로, 모든 변경 뒤에 다시 맞춘다
 * — 항목을 지워도 분모가 바뀌니 다시 맞춰야 한다.
 */
export function useChecklistMutations(taskId: string | null) {
  const qc = useQueryClient()
  const companyId = useCompanyId()

  const after = async () => {
    if (taskId) await api.syncProgress(taskId)
    void qc.invalidateQueries({ queryKey: ['checklist', taskId] })
    void qc.invalidateQueries({ queryKey: ['tasks', companyId ?? ''] })
  }

  return {
    add: useMutation({
      mutationFn: ({ label, sortOrder }: { label: string; sortOrder: number }) =>
        api.addChecklistItem(companyId as string, taskId as string, label, sortOrder),
      onSuccess: after,
    }),
    addMany: useMutation({
      mutationFn: ({ labels, startOrder }: { labels: string[]; startOrder: number }) =>
        api.addChecklistItems(companyId as string, taskId as string, labels, startOrder),
      onSuccess: after,
    }),
    toggle: useMutation({
      mutationFn: ({ id, done }: { id: string; done: boolean }) =>
        api.toggleChecklistItem(id, done),
      onSuccess: after,
    }),
    edit: useMutation({
      mutationFn: ({
        id, patch,
      }: {
        id: string
        patch: { label?: string; note?: string | null; due_date?: string | null }
      }) => api.editChecklistItem(id, patch),
      onSuccess: after,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.removeChecklistItem(id),
      onSuccess: after,
    }),
    /** 항목 하나를 업무로 올린다. 항목은 남고 올라간 업무를 가리킨다 */
    promote: useMutation({
      mutationFn: ({ item, parent }: { item: ChecklistItem; parent: Task }) =>
        api.promoteChecklistItem(item, parent),
      onSuccess: after,
    }),
    /** 올린 것을 되돌린다. 업무까지 지울지는 부르는 쪽이 정한다 */
    cancelPromote: useMutation({
      mutationFn: ({
        item, promoted, alsoDeleteTask,
      }: {
        item: ChecklistItem
        promoted: Task | null
        alsoDeleteTask: boolean
      }) => api.cancelPromotion(item, promoted, alsoDeleteTask),
      onSuccess: after,
    }),
  }
}
