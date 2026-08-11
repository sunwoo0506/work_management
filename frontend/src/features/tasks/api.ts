import { supabase } from '../../lib/supabase'
import type { Insert, Row, Update } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { progressFromChecklist } from '../../domain/progress'

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

/** 화면에 보이는 값 중 「무엇이 바뀌었나」를 적을 만한 것들 */
const TRACKED: { key: keyof Task; label: string }[] = [
  { key: 'title', label: '제목' },
  { key: 'status', label: '상태' },
  { key: 'priority', label: '중요도' },
  { key: 'area', label: '영역' },
  { key: 'due_date', label: '기한' },
  { key: 'start_date', label: '시작일' },
  { key: 'progress', label: '진행률' },
  { key: 'source', label: '출처' },
  { key: 'directive_id', label: '지시사항' },
  { key: 'reply_body', label: '회신' },
]

/**
 * 수정 — 무엇이 무엇으로 바뀌었는지를 같이 남긴다.
 *
 * 상세 내용은 남기지 않고 **어느 칸이 바뀌었나만** 남긴다.
 * 이 제품이 남겨야 하는 건 "무엇을 했나"가 아니라 "어떻게 했나"인데,
 * 기한이 세 번 밀렸다는 사실은 그 자체가 신호다.
 *
 * 기록이 실패해도 수정은 이미 저장돼 있다 — logActivity 가 삼킨다.
 */
export async function editTask(before: Task, patch: TaskUpdate): Promise<Task> {
  const updated = await updateTask(before.id, patch)

  const changed = TRACKED.filter(
    (f) => f.key in patch && !same(before[f.key], (patch as Record<string, unknown>)[f.key]),
  )
  if (changed.length > 0) {
    await logActivity(before.company_id, 'task', before.id, '수정', {
      fields: changed.map((f) => f.label).join(', '),
      // 상태와 기한은 값까지 남긴다. 나중에 되짚을 때 가장 많이 찾는 둘이다
      ...(changed.some((f) => f.key === 'status') && {
        status: `${before.status} → ${updated.status}`,
      }),
      ...(changed.some((f) => f.key === 'due_date') && {
        due_date: `${before.due_date ?? '없음'} → ${updated.due_date ?? '없음'}`,
      }),
    })
  }
  return updated
}

/** null 과 빈 문자열은 사용자에게 같은 「비어 있음」이다 */
function same(a: unknown, b: unknown): boolean {
  const norm = (v: unknown) => (v === null || v === undefined || v === '' ? null : v)
  return norm(a) === norm(b)
}

export async function changeStatus(task: Task, status: string): Promise<Task> {
  const updated = await updateTask(task.id, { status })
  await logActivity(task.company_id, 'task', task.id, '상태변경', {
    from: task.status,
    to: status,
  })
  return updated
}

/**
 * 삭제 — 지우기 **전에** 기록을 남긴다.
 *
 * 순서가 중요하다. 지운 뒤에 남기려 하면 company_id 를 다시 읽을 수 없다.
 * 업무 자체는 사라지지만 「무엇을 언제 지웠나」는 실행이력에 남는다.
 *
 * DB 의 표들은 업무가 사라지면 딸려서 지워진다(체크리스트·첨부 기록).
 * 그런데 **파일 실물과 AI 대화는 안 딸려 온다** —
 *   · 파일 실물은 DB 가 아니라 별도 보관소에 있다. 표만 지우면 주인 없는 파일이
 *     계속 쌓이고, 그건 요금과 정보 유출로 남는다.
 *   · AI 대화는 스키마상 업무 연결만 끊기고 살아남게 되어 있다. 없어진 업무에
 *     대한 대화가 떠도는 건, 그것도 가장 사적인 기록이 떠도는 건 좋지 않다.
 * 그래서 여기서 직접 치운다.
 *
 * 치우기가 실패해도 업무 삭제는 진행한다. 사용자가 「지웁니다」를 눌렀는데
 * 곁다리 정리 실패로 안 지워지면 그게 더 이상하다.
 */
export async function deleteTask(task: Task): Promise<void> {
  await logActivity(task.company_id, 'task', task.id, '삭제', {
    title: task.title,
    status: task.status,
  })

  await cleanupSideEffects(task.id)

  const { error } = await supabase.from('tasks').delete().eq('id', task.id)
  if (error) throw error
}

async function cleanupSideEffects(taskId: string): Promise<void> {
  try {
    const { data: files } = await supabase
      .from('attachments')
      .select('storage_path')
      .eq('task_id', taskId)
    if (files?.length) {
      await supabase.storage.from('task-files').remove(files.map((f) => f.storage_path))
    }
  } catch (e) {
    console.warn('첨부파일 실물 정리 실패:', e)
  }

  try {
    // 메시지는 대화에 딸려 지워진다 (on delete cascade)
    await supabase.from('assistant_threads').delete().eq('task_id', taskId)
  } catch (e) {
    console.warn('AI 대화 정리 실패:', e)
  }
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

/** 항목 글귀 고치기. 잘못 쓴 항목을 지웠다 다시 만들면 체크 상태가 날아간다 */
export async function renameChecklistItem(id: string, label: string): Promise<void> {
  const { error } = await supabase.from('checklist').update({ label }).eq('id', id)
  if (error) throw error
}

export async function removeChecklistItem(id: string): Promise<void> {
  const { error } = await supabase.from('checklist').delete().eq('id', id)
  if (error) throw error
}

/** 여러 개를 한 번에 담는다 — AI 초안을 「전부 담기」로 받을 때 쓴다 */
export async function addChecklistItems(
  companyId: string,
  taskId: string,
  labels: string[],
  startOrder: number,
): Promise<void> {
  if (labels.length === 0) return
  const userId = await currentUserId()
  const { error } = await supabase.from('checklist').insert(
    labels.map((label, i) => ({
      company_id: companyId,
      user_id: userId,
      task_id: taskId,
      label,
      sort_order: startOrder + i,
    })),
  )
  if (error) throw error
}

/**
 * 진행률을 체크리스트에 맞춘다.
 *
 * 왜 여기서 다시 읽나 — 방금 바꾼 결과를 화면의 옛 목록으로 계산하면
 * 한 칸씩 밀린 값이 저장된다. DB 에서 다시 읽는 편이 짧고 확실하다.
 *
 * 체크리스트가 없으면 아무것도 안 한다. 그때는 사람이 정한 값이 맞다.
 * 실패해도 조용히 넘어간다 — 체크 표시 자체는 이미 저장돼 있고,
 * 진행률이 잠깐 어긋나는 것보다 오류창이 뜨는 게 더 방해가 된다.
 */
export async function syncProgress(taskId: string): Promise<void> {
  try {
    const items = await listChecklist(taskId)
    const next = progressFromChecklist(items)
    if (next === null) return

    const { data: task } = await supabase
      .from('tasks')
      .select('progress')
      .eq('id', taskId)
      .maybeSingle()
    if (!task || task.progress === next) return

    await supabase.from('tasks').update({ progress: next }).eq('id', taskId)
  } catch (e) {
    console.warn('진행률 반영 실패:', e)
  }
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
