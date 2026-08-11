import type { Priority } from './types'

/**
 * 중요도를 사람 말로 바꾼다.
 *
 * 왜 —
 *   `P0`·`P1`·`P2` 는 개발자들이 쓰는 말이지 일하는 사람의 말이 아니다.
 *   화면에서 「P0」를 보고 그게 높은 건지 낮은 건지 매번 생각해야 한다.
 *
 * 저장되는 값은 그대로 `P0`·`P1`·`P2` 다. 보여줄 때만 바꾼다.
 *   · 데이터베이스 제약과 설계서가 이미 그 값으로 굳어 있다
 *   · 이름을 또 바꾸고 싶어질 때 화면 문구만 고치면 된다
 *
 * 「긴급」을 안 쓴 이유 —
 *   이 칸의 이름은 **중요도**다. 급한 정도는 이미 기한(D-day)이 말하고 있다.
 *   둘을 같은 말로 부르면 "중요하지만 안 급한 일"을 표시할 방법이 없어진다.
 *   실제로 그런 일이 가장 많이 밀린다.
 */
const LABELS: Record<Priority, string> = {
  P0: '최우선',
  P1: '중요',
  P2: '보통',
}

const MEANINGS: Record<Priority, string> = {
  P0: '밀 수 없는 것 — 대표 지시 · 법정 기한',
  P1: '이번 주 안에 손대야 하는 것',
  P2: '밀려도 되는 것',
}

export function priorityLabel(p: string): string {
  return LABELS[p as Priority] ?? p
}

/** 고를 때 보여줄 설명. 고르는 순간에만 필요하고 목록에서는 방해가 된다 */
export function priorityMeaning(p: string): string {
  return MEANINGS[p as Priority] ?? ''
}
