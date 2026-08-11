import { REQUESTED_SOURCES } from './types'
import type { TaskSource } from './types'

type Completable = {
  source: string
  reply_body: string | null
}

/**
 * 이 업무를 지금 「완료」로 닫을 수 있나 — 못 닫으면 그 이유를 돌려준다.
 *
 * 왜 여기(순수 함수)로 옮겼나 —
 *   이 규칙(설계서 §4.2)이 그동안 **수정 폼 안에만** 있었다.
 *   그래서 칸반에서 카드를 「완료」 열로 끌면 그냥 닫혔다. 규칙이 새는 자리였다.
 *   목록에 완료 버튼까지 생기면 새는 자리가 셋이 된다.
 *   한 곳에 두고 셋이 같이 부른다.
 *
 * 규칙 자체의 이유 —
 *   요청받은 일은 **상대가 답을 기다리고 있다.** 내가 다 했다고 끝이 아니다.
 *   회신 내용을 적게 하면, 적는 순간 "아 아직 회신 안 했지"를 깨닫는다.
 */
export function completionBlock(task: Completable): string | null {
  if (!REQUESTED_SOURCES.includes(task.source as TaskSource)) return null
  if (String(task.reply_body ?? '').trim()) return null
  return '요청받은 업무입니다. 「회신」에 뭐라고 답했는지 적어야 닫을 수 있습니다.'
}
