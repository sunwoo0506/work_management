export const PRIORITIES = ['P0', 'P1', 'P2'] as const
export type Priority = (typeof PRIORITIES)[number]

export const TASK_STATUSES = ['할 일', '진행중', '검토요청', '완료', '보류'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** 칸반에 보이는 열. 보류는 별도 영역에 둔다. */
export const BOARD_STATUSES = ['할 일', '진행중', '검토요청', '완료'] as const

/**
 * 업무가 어디서 왔는가.
 *
 * DB의 tasks.source check 제약과 항상 같아야 한다.
 * 값을 늘릴 때는 마이그레이션과 이 파일을 같은 커밋에 넣는다.
 */
export const TASK_SOURCES = [
  '내 발의', '요청받음', '일지', '인박스', '회의록', '대표지시', '절차',
] as const
export type TaskSource = (typeof TASK_SOURCES)[number]

/** 요청자·회신 정보가 붙는 출처. 이 둘만 회신을 해야 닫힌다. */
export const REQUESTED_SOURCES: readonly TaskSource[] = ['요청받음', '대표지시']

/** 인박스 항목이 어디서 왔는가. DB의 inbox.origin check 제약과 같아야 한다. */
export const INBOX_ORIGINS = ['직접', '회의록', '전화메모', '경영관리서비스'] as const
export type InboxOrigin = (typeof INBOX_ORIGINS)[number]

/** 지시사항 상태. DB의 directives.status check 제약과 같아야 한다. */
export const DIRECTIVE_STATUSES = ['대기', '진행중', '완료', '보류'] as const
export type DirectiveStatus = (typeof DIRECTIVE_STATUSES)[number]

export type Schedule = '지연' | '임박' | '정상' | '완료' | '보류' | '기한없음'

export const AREAS = [
  '인수인계', '품목·가격', '원가·단위', '재고', '축별손익',
  '현장손익', '자금·현금', '회계·세무', '회생지원', '데이터·지표', '보고·마감',
] as const
export type Area = (typeof AREAS)[number]
