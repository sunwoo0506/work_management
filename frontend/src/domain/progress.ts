/**
 * 진행률 — 체크리스트가 정한다.
 *
 * 왜 손으로 안 끄나 —
 *   진행률 막대를 손으로 끄는 순간 그 숫자는 **아무 근거가 없는 값**이 된다.
 *   "70%"가 무엇을 뜻하는지 본인도 3일 뒤엔 모른다.
 *   체크리스트에서 계산하면 "5개 중 3개 했다"라는 사실이 뒤에 남는다.
 *
 * 체크리스트가 없으면 null 을 돌려준다 — 그때는 사람이 정한 값을 그대로 둔다.
 * 모든 업무에 체크리스트를 쓰라고 강요하지 않기 위해서다.
 */
export function progressFromChecklist(items: readonly { done: boolean }[]): number | null {
  if (items.length === 0) return null
  const done = items.filter((i) => i.done).length
  return Math.round((done / items.length) * 100)
}

/** 「3 / 5」처럼 보여줄 때 쓴다. 퍼센트만 있으면 몇 개짜리인지 안 보인다. */
export function checklistCount(items: readonly { done: boolean }[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length }
}
