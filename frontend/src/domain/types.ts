export const PRIORITIES = ['P0', 'P1', 'P2'] as const
export type Priority = (typeof PRIORITIES)[number]

export const TASK_STATUSES = ['할 일', '진행중', '검토요청', '완료', '보류'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** 칸반에 보이는 열. 보류는 별도 영역에 둔다. */
export const BOARD_STATUSES = ['할 일', '진행중', '검토요청', '완료'] as const

export const TASK_SOURCES = ['내 발의', '요청받음', '일지', '인박스', '회의록'] as const
export type TaskSource = (typeof TASK_SOURCES)[number]

export type Schedule = '지연' | '임박' | '정상' | '완료' | '보류' | '기한없음'

export const AREAS = [
  '인수인계', '품목·가격', '원가·단위', '재고', '축별손익',
  '현장손익', '자금·현금', '회계·세무', '회생지원', '데이터·지표', '보고·마감',
] as const
