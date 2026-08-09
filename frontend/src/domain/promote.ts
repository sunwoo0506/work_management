import type { Priority } from './types'

/** 칸반 카드와 목록 행에서 읽히는 길이. 이보다 길면 제목은 자르고 전문은 detail에 남긴다. */
const TITLE_MAX = 60

export type InboxLike = {
  id: string
  user_id: string
  company_id: string
  content: string
  tag: string | null
  origin: string
}

/** 승격 시점에 사용자가 고르는 값. */
export type PromoteChoice = {
  priority: Priority
  due_date: string | null
  area: string | null
}

export type TaskInsert = {
  user_id: string
  company_id: string
  title: string
  detail: string | null
  source: '인박스'
  status: '할 일'
  priority: Priority
  due_date: string | null
  area: string | null
  progress: 0
}

/**
 * 인박스 항목과 사용자의 선택을 tasks에 넣을 행으로 옮긴다.
 *
 * 길이는 UTF-16 코드 단위 기준이라 자소 단위와 다를 수 있으나,
 * 한글·영문은 BMP라 실사용에서 일치한다. (Intl.Segmenter는 과함)
 */
export function toTaskInsert(item: InboxLike, choice: PromoteChoice): TaskInsert {
  const long = item.content.length > TITLE_MAX
  return {
    user_id: item.user_id,
    company_id: item.company_id,
    title: long ? item.content.slice(0, TITLE_MAX) : item.content,
    detail: long ? item.content : null,
    source: '인박스',
    status: '할 일',
    priority: choice.priority,
    due_date: choice.due_date,
    area: choice.area,
    progress: 0,
  }
}
