import { supabase } from '../../lib/supabase'

/**
 * 화면을 눈으로 보기 위한 샘플 업무.
 *
 * 실제 업무가 아니다. 「샘플 지우기」로 한 번에 지울 수 있게
 * 제목 앞에 표식을 붙인다.
 *
 * ⚠️ 금액·실명·사업이해자료 본문을 넣지 않는다 (CLAUDE.md).
 */
export const SAMPLE_MARK = '[샘플] '

function shift(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  // 로컬 달력일 기준. toISOString()은 UTC라 하루가 밀릴 수 있다
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

type Sample = {
  title: string
  detail?: string
  source: string
  area: string
  priority: 'P0' | 'P1' | 'P2'
  status: string
  dueOffset: number | null
  progress: number
  focusToday?: boolean
  requester?: string
  requesterDept?: string
  replyBody?: string
}

/** 지연·임박·정상·완료·보류가 모두 보이도록 기한을 흩어 놓았다. */
const SAMPLES: Sample[] = [
  {
    title: '8월 재고 실사 차이 원인 정리',
    detail: '창고별 장부수량과 실사수량 차이를 품목 단위로 대조하고, 차이 사유를 분류한다.',
    source: '대표지시', area: '재고', priority: 'P0', status: '진행중',
    dueOffset: -3, progress: 60, focusToday: true,
    requester: '대표', requesterDept: '경영진',
  },
  {
    title: '판매가 미등록 품목 확인 요청 회신',
    source: '요청받음', area: '품목·가격', priority: 'P0', status: '검토요청',
    dueOffset: -1, progress: 80,
    requester: '구매사업본부 담당자', requesterDept: '구매사업본부',
  },
  {
    title: '월 마감 자료 취합',
    detail: '이카운트 매출·매입 자료와 위하고 원장을 대사한다.',
    source: '내 발의', area: '보고·마감', priority: 'P0', status: '진행중',
    dueOffset: 0, progress: 35, focusToday: true,
  },
  {
    title: '일일 현금표 양식 정리',
    source: '내 발의', area: '자금·현금', priority: 'P1', status: '할 일',
    dueOffset: 2, progress: 0, focusToday: true,
  },
  {
    title: '단위 환산 기준표 초안',
    detail: '㎡ ↔ ea ↔ 롤 환산 계수를 품목별로 정리한다.',
    source: '인박스', area: '원가·단위', priority: 'P1', status: '할 일',
    dueOffset: 6, progress: 0,
  },
  {
    title: '축별 계정 귀속 기준 검토',
    source: '내 발의', area: '축별손익', priority: 'P1', status: '할 일',
    dueOffset: 14, progress: 0,
  },
  {
    title: '현장 손익 기존 양식 수집',
    source: '요청받음', area: '현장손익', priority: 'P2', status: '완료',
    dueOffset: -8, progress: 100,
    requester: '현장 담당자', requesterDept: '시공본부',
    replyBody: '기존 양식 3종을 받아 정리해 회신했습니다.',
  },
  {
    title: '불용재고 판정 기준 정하기',
    detail: '연령·회전율 기준과 예외 처리를 정한다. 구매·경영지원 합의 필요.',
    source: '회의록', area: '재고', priority: 'P1', status: '보류',
    dueOffset: null, progress: 10,
  },
  {
    title: '회생 지원 제출 서류 목록화',
    source: '대표지시', area: '회생지원', priority: 'P0', status: '진행중',
    dueOffset: 4, progress: 20,
    requester: '대표', requesterDept: '경영진',
  },
]

const SAMPLE_INBOX = [
  '위하고 계정 권한 다시 확인할 것',
  '타이벡 규격별 단위 환산표 어디 있는지 물어보기',
  '다음 주 월요일 구매본부 미팅 — 재고 차이 건 안건으로 올리기',
]

export async function insertSampleData(companyId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) throw new Error('로그인 정보를 읽지 못했습니다.')

  const today = shift(0)

  const tasks = SAMPLES.map((s, i) => ({
    company_id: companyId,
    user_id: userId,
    title: SAMPLE_MARK + s.title,
    detail: s.detail ?? null,
    source: s.source,
    area: s.area,
    priority: s.priority,
    status: s.status,
    due_date: s.dueOffset === null ? null : shift(s.dueOffset),
    focus_date: s.focusToday ? today : null,
    progress: s.progress,
    requester: s.requester ?? null,
    requester_dept: s.requesterDept ?? null,
    reply_body: s.replyBody ?? null,
    sort_order: i,
  }))

  const { error: tErr } = await supabase.from('tasks').insert(tasks)
  if (tErr) throw tErr

  const inbox = SAMPLE_INBOX.map((content) => ({
    company_id: companyId,
    user_id: userId,
    content: SAMPLE_MARK + content,
    origin: '직접',
  }))
  const { error: iErr } = await supabase.from('inbox').insert(inbox)
  if (iErr) throw iErr
}

export async function removeSampleData(companyId: string): Promise<void> {
  const { error: tErr } = await supabase
    .from('tasks')
    .delete()
    .eq('company_id', companyId)
    .like('title', `${SAMPLE_MARK}%`)
  if (tErr) throw tErr

  const { error: iErr } = await supabase
    .from('inbox')
    .delete()
    .eq('company_id', companyId)
    .like('content', `${SAMPLE_MARK}%`)
  if (iErr) throw iErr
}
