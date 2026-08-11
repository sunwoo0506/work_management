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

/** 진행률이 어디서 나온 값인가. 화면이 「무엇을 근거로 이 숫자인지」를 말해 줘야 한다 */
export type ProgressSource = '하위업무' | '체크리스트' | '손으로'

export type ResolvedProgress = {
  pct: number
  from: ProgressSource
  /** 「하위 2 / 5」 처럼 옆에 붙일 말 */
  note: string
}

/**
 * 진행률의 근거를 하나로 정한다.
 *
 * 근거가 셋이다 — 체크리스트 · 묶인 하위 업무 · 손으로 끈 막대.
 * **셋을 다 살려 두면 어느 게 맞는지 알 수 없다.** 순서를 못 박는다.
 *
 *   체크리스트가 있으면      → 체크한 비율
 *   없고 하위 업무가 있으면   → 하위 업무들의 진행률 평균
 *   둘 다 없으면             → 사람이 정한 값
 *
 * ⚠️ 체크리스트가 하위 업무보다 **위**인 이유 (한 번 반대로 짰다가 고쳤다) —
 *   체크 항목 하나를 「업무로 올려도」 그 항목 줄은 체크리스트에 그대로 남는다.
 *   그래서 체크리스트가 **늘 전체 그림**이고 하위 업무는 그중 일부다.
 *   하위 업무를 위에 두면, 다섯 중 하나만 올린 순간 나머지 넷이 계산에서 사라진다.
 *   (올린 업무를 완료하면 그 체크 항목도 같이 체크된다 — api.changeStatus)
 *
 * 하위 업무를 「완료 개수 ÷ 전체」가 아니라 **평균**으로 세는 이유 —
 *   다섯 중 넷이 90% 씩 가 있는데 완료가 0건이면 개수로는 0% 다.
 *   그건 실제와 너무 다르다.
 */
export function resolveProgress(input: {
  children: readonly { progress: number; status: string }[]
  checklist: readonly { done: boolean }[]
  manual: number
}): ResolvedProgress {
  const { children, checklist, manual } = input

  const fromList = progressFromChecklist(checklist)
  if (fromList !== null) {
    const { done, total } = checklistCount(checklist)
    return { pct: fromList, from: '체크리스트', note: `체크리스트 ${done} / ${total}` }
  }

  if (children.length > 0) {
    const sum = children.reduce((a, c) => a + effective(c), 0)
    const doneCount = children.filter((c) => c.status === '완료').length
    return {
      pct: Math.round(sum / children.length),
      from: '하위업무',
      note: `묶인 업무 ${doneCount} / ${children.length} 완료`,
    }
  }

  return { pct: manual, from: '손으로', note: '손으로 정한 값' }
}

/**
 * 하위 업무 한 건이 부모 진행률에 기여하는 값.
 *
 * 「완료」로 닫힌 것은 무조건 100 으로 센다.
 * 체크리스트를 다 안 채우고 닫는 일은 흔한데, 그걸 그대로 평균에 넣으면
 * 다 끝난 부모가 영원히 80% 에 머문다. **상태가 진행률보다 강하다.**
 * (체크 안 한 항목이 남았다는 사실 자체는 그 하위 업무 안에 그대로 남는다)
 *
 * 「보류」는 특별 취급하지 않는다 — 멈춰 있어도 한 일은 한 일이다.
 */
function effective(child: { progress: number; status: string }): number {
  return child.status === '완료' ? 100 : child.progress
}
