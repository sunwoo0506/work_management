/**
 * 소리 파일을 토막으로 나누는 계산.
 *
 * 여기에 소리 자체는 없다. **몇 초부터 몇 초까지 자를지**만 정한다.
 * 브라우저 없이 시험할 수 있어야 하기 때문이다 (CLAUDE.md — domain 은 순수하게).
 */

export type Range = {
  /** 시작 (초) */
  from: number
  /** 끝 (초, 이 지점은 포함하지 않는다) */
  to: number
}

/**
 * 긴 소리를 일정 길이로 나눈다.
 *
 * ── 왜 나누나 ────────────────────────────────────────────
 * 받아쓰기에 한 번에 보낼 수 있는 크기가 정해져 있다. 한 시간짜리 녹음은
 * 그 한도를 훌쩍 넘는다. 그리고 나눠 보내면 **토막마다 글이 돌아와서**
 * 진행 상황이 보이고, 중간에 실패해도 앞부분은 건진다.
 *
 * 마지막 토막이 너무 짧으면(3초 미만) 앞 토막에 붙인다 —
 * 두 글자짜리 토막을 따로 보내면 요금만 나가고 얻는 게 없다.
 */
export function chunkRanges(totalSec: number, chunkSec: number): Range[] {
  if (!(totalSec > 0) || !(chunkSec > 0)) return []

  const out: Range[] = []
  for (let from = 0; from < totalSec; from += chunkSec) {
    out.push({ from, to: Math.min(from + chunkSec, totalSec) })
  }

  const last = out[out.length - 1]
  if (out.length > 1 && last.to - last.from < 3) {
    out[out.length - 2].to = last.to
    out.pop()
  }
  return out
}

/** 나눈 토막이 몇 개인지 미리 알려 준다 — 「12조각으로 나눠 보냅니다」 */
export function chunkCount(totalSec: number, chunkSec: number): number {
  return chunkRanges(totalSec, chunkSec).length
}
