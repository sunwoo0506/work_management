import { supabase } from '../../lib/supabase'
import type { Insert, Row, Update } from '../../lib/supabase'
import type { Json } from '../../lib/database.types'
import { resolveProgress } from '../../domain/progress'
import { completionBlock } from '../../domain/complete'

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
  { key: 'parent_task_id', label: '상위 업무' },
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

/**
 * 상태 바꾸기.
 *
 * 두 가지를 여기서 챙긴다 —
 *   ① **완료 규칙**(설계서 §4.2). 그동안 수정 폼 안에만 있어서 칸반에서
 *      카드를 끌면 그냥 닫혔다. 상태를 바꾸는 길이 셋이 되었으므로
 *      길목 하나로 모은다.
 *   ② **끝난 시각**. 아카이브를 「최근 끝난 순」으로 늘어놓는 데 쓴다.
 *      다시 열면 지운다 — 안 지우면 열려 있는 업무에 완료 시각이 남는다.
 */
export async function changeStatus(task: Task, status: string): Promise<Task> {
  if (status === '완료') {
    const blocked = completionBlock(task)
    if (blocked) throw new Error(blocked)
  }

  const patch: TaskUpdate = { status }
  if (status === '완료' && !task.completed_at) patch.completed_at = new Date().toISOString()
  if (status !== '완료' && task.completed_at) patch.completed_at = null

  const updated = await updateTask(task.id, patch)
  await logActivity(task.company_id, 'task', task.id, '상태변경', {
    from: task.status,
    to: status,
  })
  await syncPromotedItem(task.id, status === '완료')
  return updated
}

/**
 * 체크 항목에서 올라온 업무를 닫으면 **그 항목도 같이 체크된다.**
 *
 * 안 그러면 같은 일을 두 번 표시해야 한다 — 업무를 닫고, 부모로 돌아가 체크를 하고.
 * 두 번 해야 하는 표시는 결국 한 번만 하게 되고, 그러면 두 숫자가 어긋난다.
 *
 * 실패해도 넘어간다. 업무 상태는 이미 바뀌었고, 체크 하나가 늦는 것보다
 * 오류창이 뜨는 게 더 방해다.
 */
async function syncPromotedItem(taskId: string, done: boolean): Promise<void> {
  try {
    const { data } = await supabase
      .from('checklist')
      .update({ done })
      .eq('promoted_task_id', taskId)
      .select('task_id')
    // 그 부모 업무의 진행률도 다시 맞춘다
    const parentId = data?.[0]?.task_id
    if (parentId) await syncProgress(parentId)
  } catch (e) {
    console.warn('올린 항목 체크 반영 실패:', e)
  }
}

// ── 하위 업무 ─────────────────────────────────────────────
//
// 하위 업무는 **제 몫을 하는 업무**다 (사용자 말: *"각각의 세부업무는 별도로
// 존재하지만 업무창에서는 관련 세부업무가 하단에 보이는거지"*).
// 목록에도 제 줄로 나오고 자기 기한·체크리스트·AI 대화를 갖는다.
// 부모 서랍에서는 그것들이 모여 보일 뿐이다.

/** 이미 있는 업무를 부모 밑으로 옮기거나 떼어 낸다 */
export async function setParent(task: Task, parentId: string | null): Promise<Task> {
  if (parentId === task.id) throw new Error('자기 자신을 부모로 둘 수 없습니다.')
  return editTask(task, { parent_task_id: parentId })
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

/**
 * 항목 고치기 — 글귀·설명·기한.
 *
 * 잘못 쓴 항목을 지웠다 다시 만들면 체크 상태가 날아간다.
 * 설명과 기한은 「펼치면 나오는 것」이다 — 대부분의 항목은 비어 있다.
 */
export async function editChecklistItem(
  id: string,
  patch: { label?: string; note?: string | null; due_date?: string | null },
): Promise<void> {
  const { error } = await supabase.from('checklist').update(patch).eq('id', id)
  if (error) throw error
}

/**
 * 체크 항목 하나를 **업무로 올린다.**
 *
 * 언제 쓰나 — 항목 하나가 자기 첨부파일이 필요해지고, 클로니와 따로 상의해야 하고,
 * 「오늘 마감」에 떠야 할 때. 체크리스트 항목은 이 업무 안에서만 살아서
 * 목록·오늘·아카이브 어디에도 안 나온다.
 *
 * 인박스 승격과 같은 방식이다 — 처음부터 무엇을 쓸지 고르게 하지 않고,
 * 필요해진 것만 올린다.
 *
 * 항목은 **지우지 않는다.** 체크 표시로 남고, 올라간 업무를 가리킨다.
 * 지우면 "내가 뭘 하려던 거였지"가 된다.
 */
export async function promoteChecklistItem(item: ChecklistItem, parent: Task): Promise<Task> {
  const task = await createTask({
    company_id: item.company_id,
    parent_task_id: parent.id,
    title: item.label,
    detail: item.note,
    due_date: item.due_date ?? parent.due_date,
    // 출처는 「이 업무가 어디서 생겼나」다. 부모가 인박스에서 왔다는 것과
    // 이 업무가 체크 항목에서 올라왔다는 것은 다른 사실이라 물려받지 않는다
    source: '체크리스트',
    area: parent.area,
    priority: parent.priority,
    directive_id: parent.directive_id,
    status: '할 일',
  })

  const { error } = await supabase
    .from('checklist')
    .update({ promoted_task_id: task.id })
    .eq('id', item.id)
  if (error) throw error

  return task
}

/**
 * 올린 것을 되돌린다.
 *
 * 두 가지가 있다 —
 *   ① 연결만 끊기  — 올린 업무는 그대로 두고 체크 항목과의 줄만 끊는다.
 *                    그 업무가 이미 제 몫을 하고 있을 때 (파일·대화가 붙었을 때).
 *   ② 업무까지 지우기 — 잘못 눌렀을 때. 원래대로 체크 항목만 남는다.
 *
 * 체크 항목은 **어느 쪽이든 남는다.** 지우면 "내가 뭘 하려던 거였지"가 된다.
 *
 * 무엇이 사라지는지는 화면에서 미리 보여 준다 — deleteTask 가 파일 실물과
 * AI 대화까지 치우기 때문에 되돌릴 수 없다.
 */
export async function cancelPromotion(
  item: ChecklistItem,
  promoted: Task | null,
  alsoDeleteTask: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('checklist')
    .update({ promoted_task_id: null })
    .eq('id', item.id)
  if (error) throw error

  if (alsoDeleteTask && promoted) await deleteTask(promoted)
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
    const { data: task } = await supabase
      .from('tasks')
      .select('progress, parent_task_id')
      .eq('id', taskId)
      .maybeSingle()
    if (!task) return

    const [children, checklist] = await Promise.all([
      listSubtasks(taskId),
      listChecklist(taskId),
    ])

    const next = resolveProgress({
      children,
      checklist,
      manual: task.progress,
    })

    if (next.from !== '손으로' && task.progress !== next.pct) {
      await supabase.from('tasks').update({ progress: next.pct }).eq('id', taskId)
    }

    // 하위 업무가 움직이면 부모도 움직여야 한다.
    // 한 단계만 올라간다 — 손자까지 두는 구조가 아니고, 무한히 타고 올라가면
    // 고리가 생겼을 때 멈추지 않는다.
    if (task.parent_task_id) await syncParentOnly(task.parent_task_id)
  } catch (e) {
    console.warn('진행률 반영 실패:', e)
  }
}

/** 부모만 다시 계산한다. 여기서 또 위로 올라가지 않는다 */
async function syncParentOnly(parentId: string): Promise<void> {
  const { data: parent } = await supabase
    .from('tasks')
    .select('progress')
    .eq('id', parentId)
    .maybeSingle()
  if (!parent) return

  const [children, checklist] = await Promise.all([
    listSubtasks(parentId),
    listChecklist(parentId),
  ])
  const next = resolveProgress({ children, checklist, manual: parent.progress })
  if (next.from !== '손으로' && parent.progress !== next.pct) {
    await supabase.from('tasks').update({ progress: next.pct }).eq('id', parentId)
  }
}

/**
 * 이 업무가 **어느 체크 항목에서 올라왔나.**
 *
 * 올린 쪽(부모 서랍)에만 취소 버튼을 뒀더니 정작 올라온 업무를 보고 있을 때는
 * 되돌릴 길이 없었다. 사용자가 그걸 찾다 물었다 —
 *   *"체크리스트에서 온 경우엔 다시 체크리스트로 보내기 버튼이 어디 있는거니"*
 *
 * 그래서 반대 방향도 찾을 수 있게 한다. 없으면 null (직접 만든 업무).
 */
export async function findSourceChecklistItem(taskId: string): Promise<ChecklistItem | null> {
  const { data, error } = await supabase
    .from('checklist')
    .select('*')
    .eq('promoted_task_id', taskId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function listSubtasks(parentId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('parent_task_id', parentId)
    .order('created_at')
  if (error) throw error
  return data
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
