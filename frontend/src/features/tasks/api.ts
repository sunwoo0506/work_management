import { supabase } from '../../lib/supabase'
import type { Insert, Row, Update } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'

export type Task = Row<'tasks'>
export type TaskInsert = Insert<'tasks'>
export type TaskUpdate = Update<'tasks'>
export type ChecklistItem = Row<'checklist'>

export async function listTasks(companyId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('company_id', companyId)
  if (error) throw error
  return data
}

export async function getTask(id: string): Promise<Task> {
  const { data, error } = await supabase.from('tasks').select('*').eq('id', id).single()
  if (error) throw error
  return data
}

export async function createTask(input: Omit<TaskInsert, 'user_id'>): Promise<Task> {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...input, user_id: userId })
    .select()
    .single()
  if (error) throw error
  await logActivity(data.company_id, 'task', data.id, '생성', { title: data.title })
  return data
}

export async function updateTask(id: string, patch: TaskUpdate): Promise<Task> {
  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function changeStatus(task: Task, status: string): Promise<Task> {
  const updated = await updateTask(task.id, { status })
  await logActivity(task.company_id, 'task', task.id, '상태변경', {
    from: task.status,
    to: status,
  })
  return updated
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
}

// ── 체크리스트 ────────────────────────────────────────────

export async function listChecklist(taskId: string): Promise<ChecklistItem[]> {
  const { data, error } = await supabase
    .from('checklist')
    .select('*')
    .eq('task_id', taskId)
    .order('sort_order')
  if (error) throw error
  return data
}

export async function addChecklistItem(
  companyId: string,
  taskId: string,
  label: string,
  sortOrder: number,
): Promise<ChecklistItem> {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('checklist')
    .insert({ company_id: companyId, user_id: userId, task_id: taskId, label, sort_order: sortOrder })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function toggleChecklistItem(id: string, done: boolean): Promise<void> {
  const { error } = await supabase.from('checklist').update({ done }).eq('id', id)
  if (error) throw error
}

export async function removeChecklistItem(id: string): Promise<void> {
  const { error } = await supabase.from('checklist').delete().eq('id', id)
  if (error) throw error
}

// ── 공통 ─────────────────────────────────────────────────

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('로그인 정보를 읽지 못했습니다.')
  return id
}

/**
 * 무엇이 언제 바뀌었나를 남긴다.
 *
 * DB 트리거가 아니라 여기서 남기는 이유 — 트리거는 모든 변경을 남겨
 * 노이즈가 많다. "무엇이 의미 있는 변경인가"는 업무 규칙이라 앱이 알기 좋다.
 * 대신 앱에서 빠뜨리면 기록이 안 남는다.
 */
export async function logActivity(
  companyId: string,
  targetType: 'task' | 'directive' | 'inbox' | 'checklist',
  targetId: string,
  action: string,
  detail?: { [key: string]: Json | undefined },
): Promise<void> {
  const userId = await currentUserId()
  // 기록 실패가 본 작업을 막으면 안 된다
  await supabase
    .from('activity')
    .insert({
      company_id: companyId,
      user_id: userId,
      target_type: targetType,
      target_id: targetId,
      action,
      detail: detail ?? null,
    })
    .then(({ error }) => {
      if (error) console.warn('activity 기록 실패:', error.message)
    })
}
