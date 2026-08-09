/**
 * 최초 진입 시 넣는 기본 데이터 (설계서 §12).
 *
 * 마이그레이션 SQL이 아니라 여기 있는 이유는 user_id 때문이다.
 * SQL에 특정 사용자 UUID를 박으면 다른 환경에서 안 돌아간다.
 *
 * ⚠️ 금액·수치를 넣지 않는다. 확정 회계수치가 아니라 원장·실사로 대사해야 할
 *    참고값이고, 애초에 경영관리서비스가 다룰 영역이다.
 * ⚠️ 실명을 넣지 않는다. 역할·부서로 적는다.
 * ⚠️ 사업이해자료 본문을 옮겨 적지 않는다. 조항 번호만 참조한다.
 */

export const SEED_COMPANY = {
  name: '제우스',
  color: '#0066cc',
} as const

type SeedDirective = {
  code: string
  title: string
  /** 사업이해자료의 조항 번호만. 본문은 옮기지 않는다 */
  source_ref: string
  area: string
  priority: 'P0' | 'P1' | 'P2'
}

/**
 * 지시사항 13건.
 *
 * ⚠️ D-01 ~ D-07의 제목은 자리표시자다.
 *    사업이해자료 §9의 실제 항목명을 확인해 고쳐야 한다.
 *    → docs/plans/2026-08-10-user-confirmations.md C-02
 */
export const SEED_DIRECTIVES: SeedDirective[] = [
  { code: 'D-01', title: '지시사항 1 — 제목 확인 필요', source_ref: '§9-1', area: '품목·가격', priority: 'P0' },
  { code: 'D-02', title: '지시사항 2 — 제목 확인 필요', source_ref: '§9-2', area: '원가·단위', priority: 'P0' },
  { code: 'D-03', title: '지시사항 3 — 제목 확인 필요', source_ref: '§9-3', area: '재고', priority: 'P0' },
  { code: 'D-04', title: '지시사항 4 — 제목 확인 필요', source_ref: '§9-4', area: '재고', priority: 'P0' },
  { code: 'D-05', title: '지시사항 5 — 제목 확인 필요', source_ref: '§9-5', area: '축별손익', priority: 'P1' },
  { code: 'D-06', title: '지시사항 6 — 제목 확인 필요', source_ref: '§9-6', area: '자금·현금', priority: 'P1' },
  { code: 'D-07', title: '지시사항 7 — 제목 확인 필요', source_ref: '§9-7', area: '보고·마감', priority: 'P1' },
  { code: 'D-08', title: '승급률 기준 수립', source_ref: '§7', area: '데이터·지표', priority: 'P1' },
  { code: 'D-09', title: '현장별 손익 관리 체계', source_ref: '§5-3', area: '현장손익', priority: 'P1' },
  { code: 'D-10', title: '축3 대사', source_ref: '§6-3', area: '축별손익', priority: 'P1' },
  { code: 'D-11', title: '일일 현금표', source_ref: '§13', area: '자금·현금', priority: 'P0' },
  { code: 'D-12', title: '회생 지원', source_ref: '§10', area: '회생지원', priority: 'P0' },
  { code: 'D-13', title: '제조업 여부 점검', source_ref: '§4-1', area: '회계·세무', priority: 'P2' },
]
