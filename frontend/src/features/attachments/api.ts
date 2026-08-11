import { supabase } from '../../lib/supabase'
import type { Row } from '../../lib/supabase'
import { extractText } from './extract'

export type Attachment = Row<'attachments'>

export const BUCKET = 'task-files'

export async function listAttachments(taskId: string): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('task_id', taskId)
    .order('created_at')
  if (error) throw error
  return data
}

/**
 * 올리기 — 세 걸음이다.
 *   ① 브라우저에서 글을 뽑는다 (파일은 아직 안 나갔다)
 *   ② Storage 에 파일 실물을 올린다
 *   ③ "무슨 파일인가"를 표에 적는다
 *
 * ②가 되고 ③이 실패하면 **주인 없는 파일**이 남는다. 그래서 ③이 실패하면
 * ②를 되돌린다. 반대 순서면 되돌릴 수 없다.
 */
export async function uploadAttachment(
  companyId: string,
  taskId: string,
  file: File,
): Promise<Attachment> {
  const userId = await currentUserId()
  const extracted = await extractText(file)

  // 경로 맨 앞 칸이 사용자 id 여야 한다 — Storage 정책이 그 칸만 보고 판정한다
  const path = `${userId}/${taskId}/${crypto.randomUUID()}-${safeName(file.name)}`

  const up = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (up.error) throw up.error

  const { data, error } = await supabase
    .from('attachments')
    .insert({
      company_id: companyId,
      user_id: userId,
      task_id: taskId,
      name: file.name,
      storage_path: path,
      mime: file.type || null,
      size_bytes: file.size,
      extracted_text: extracted.text,
      extract_status: extracted.status,
      extract_note: extracted.note,
    })
    .select()
    .single()

  if (error) {
    // 주인 없는 파일을 남기지 않는다
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  return data
}

export async function removeAttachment(a: Attachment): Promise<void> {
  // 표를 먼저 지운다. 파일이 남는 건 낭비지만, 표만 남으면 **깨진 줄**이 보인다
  const { error } = await supabase.from('attachments').delete().eq('id', a.id)
  if (error) throw error
  await supabase.storage.from(BUCKET).remove([a.storage_path])
}

/**
 * 내려받기 주소.
 *
 * 버킷이 비공개라 고정 주소가 없다. 누를 때마다 60초짜리 임시 주소를 받는다.
 * 주소가 새어 나가도 1분 뒤엔 못 쓴다.
 */
export async function signedUrl(a: Attachment): Promise<string> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(a.storage_path, 60, { download: a.name })
  if (error) throw error
  return data.signedUrl
}

/** Storage 경로에 못 쓰는 글자를 지운다. 한글은 그대로 둔다 */
function safeName(name: string): string {
  return name.replace(/[^\w.\-가-힣]+/g, '_').slice(-80)
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error('로그인 정보를 읽지 못했습니다.')
  return id
}
