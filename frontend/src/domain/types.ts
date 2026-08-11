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
  '내 발의', '요청받음', '일지', '인박스', '회의록', '대표지시', '절차', '체크리스트',
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

// ── 2단계: 절차와 실행이력 ────────────────────────────────

/** 절차가 언제 시작되나. DB의 procedures.trigger_type check 제약과 같아야 한다. */
export const TRIGGER_TYPES = ['일', '주', '월', '분기', '연', '이벤트', '수동'] as const

/** 나중에 AI에게 넘길 때의 스위치 (설계서 §6.2) */
export const AI_DELEGATIONS = ['사람만', 'AI 초안 → 내가 승인', 'AI 자동'] as const
export type AiDelegation = (typeof AI_DELEGATIONS)[number]

export const PROCEDURE_STATUSES = ['초안', '확정', '폐기'] as const
export type ProcedureStatus = (typeof PROCEDURE_STATUSES)[number]

export const RUN_RESULTS = ['진행중', '완료', '중단'] as const
export type RunResult = (typeof RUN_RESULTS)[number]

export const PERFORMERS = ['사람', 'AI', '혼합'] as const

/** 예외 탐지 규칙 6종 (설계서 §5.4). 탐지 자체는 5단계에서 붙는다. */
export const EXCEPTION_RULES = [
  '단계 건너뜀', '단계 추가', '소요시간 이탈',
  '산출물 누락', '사람 개입 증가', '순서 뒤바뀜',
] as const
export type ExceptionRule = (typeof EXCEPTION_RULES)[number]

export const EXCEPTION_CONFIRMS = ['대기', '예외확정', '정상'] as const

export const AREAS = [
  '인수인계', '품목·가격', '원가·단위', '재고', '축별손익',
  '현장손익', '자금·현금', '회계·세무', '회생지원', '데이터·지표', '보고·마감',
] as const
export type Area = (typeof AREAS)[number]
