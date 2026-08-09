/**
 * 예외 탐지 — AI 없이 계산으로 한다 (설계서 §5.4).
 *
 * 사람에게 "이번엔 뭐가 달랐는지 적으세요"라고 하면 적지 않는다.
 * 그래서 툴이 탐지하고 사람은 확인만 한다.
 *
 * 여기는 **탐지**만 한다. "왜 달랐는지" 설명 문장은 3단계의 AI가 얹는다.
 * 탐지가 순수 함수인 이유 — 테스트할 수 있고, 비용이 0이고,
 * **AI가 죽어도 동작한다.**
 */

export type ExceptionRuleName =
  | '단계 건너뜀'
  | '단계 추가'
  | '소요시간 이탈'
  | '산출물 누락'
  | '사람 개입 증가'
  | '순서 뒤바뀜'

export type StepDef = {
  id: string
  seq: number
  title: string
  required: boolean
  /** 산출물이 정의된 단계인가 */
  hasOutputSpec?: boolean
}

export type StepRun = {
  id: string
  /** 절차에 없던 단계면 null */
  procedureStepId: string | null
  seq: number
  title: string
  done: boolean
  actualMin: number | null
  output: string | null
  humanIntervened: boolean
}

export type Detected = {
  rule: ExceptionRuleName
  runStepId: string | null
  detected: string
}

/** 표본이 이만큼은 있어야 "평소"가 정의된다 */
export const MIN_SAMPLE_FOR_DURATION = 3
export const MIN_SAMPLE_FOR_INTERVENTION = 2

/** 소요시간이 중앙값의 이 배를 넘거나 이 분의 1 아래면 이탈 */
export const DURATION_FACTOR = 2

export function median(values: readonly number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).slice().sort((a, b) => a - b)
  if (xs.length === 0) return null
  const mid = Math.floor(xs.length / 2)
  return xs.length % 2 === 1 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2
}

/**
 * 한 회차를 절차 정의와 과거 회차에 비춰 본다.
 *
 * @param steps      절차 정의
 * @param runSteps   이번 회차의 실제 기록
 * @param history    과거 회차들의 실제 기록 (이번 회차 제외)
 * @param aiDelegated  AI 위임 절차인가 (규칙 5는 여기서만 본다)
 */
export function detectExceptions(
  steps: readonly StepDef[],
  runSteps: readonly StepRun[],
  history: readonly (readonly StepRun[])[],
  aiDelegated = false,
): Detected[] {
  const out: Detected[] = []
  const doneRuns = runSteps.filter((r) => r.done)

  // ── 규칙 1. 단계 건너뜀 — 1회차부터 동작
  for (const s of steps) {
    if (!s.required) continue
    const hit = runSteps.find((r) => r.procedureStepId === s.id)
    if (!hit || !hit.done) {
      out.push({
        rule: '단계 건너뜀',
        runStepId: hit?.id ?? null,
        detected: `필수 단계 「${s.title}」을 하지 않았습니다.`,
      })
    }
  }

  // ── 규칙 2. 단계 추가 — 1회차부터
  for (const r of runSteps) {
    if (r.procedureStepId === null && r.done) {
      out.push({
        rule: '단계 추가',
        runStepId: r.id,
        detected: `절차에 없는 「${r.title}」을 했습니다.`,
      })
    }
  }

  // ── 규칙 4. 산출물 누락 — 1회차부터
  for (const s of steps) {
    if (!s.hasOutputSpec) continue
    const hit = runSteps.find((r) => r.procedureStepId === s.id)
    if (hit?.done && !String(hit.output ?? '').trim()) {
      out.push({
        rule: '산출물 누락',
        runStepId: hit.id,
        detected: `「${s.title}」에 산출물이 없습니다.`,
      })
    }
  }

  // ── 규칙 6. 순서 뒤바뀜 — 1회차부터
  const ordered = doneRuns
    .filter((r) => r.procedureStepId !== null)
    .map((r) => ({ run: r, def: steps.find((s) => s.id === r.procedureStepId) }))
    .filter((x): x is { run: StepRun; def: StepDef } => !!x.def)
    .sort((a, b) => a.run.seq - b.run.seq)

  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].def.seq < ordered[i - 1].def.seq) {
      out.push({
        rule: '순서 뒤바뀜',
        runStepId: ordered[i].run.id,
        detected:
          `「${ordered[i].def.title}」을 「${ordered[i - 1].def.title}」보다 나중에 했습니다. ` +
          '절차에는 반대 순서입니다.',
      })
    }
  }

  // ── 규칙 3. 소요시간 이탈 — 회차 3개 이상
  if (history.length >= MIN_SAMPLE_FOR_DURATION) {
    for (const s of steps) {
      const past = history
        .map((h) => h.find((r) => r.procedureStepId === s.id)?.actualMin)
        .filter((v): v is number => typeof v === 'number' && v > 0)
      if (past.length < MIN_SAMPLE_FOR_DURATION) continue

      const med = median(past)
      if (med === null || med <= 0) continue

      const now = runSteps.find((r) => r.procedureStepId === s.id)
      if (!now?.done || typeof now.actualMin !== 'number' || now.actualMin <= 0) continue

      if (now.actualMin > med * DURATION_FACTOR) {
        out.push({
          rule: '소요시간 이탈',
          runStepId: now.id,
          detected:
            `「${s.title}」에 ${now.actualMin}분 걸렸습니다. ` +
            `평소는 ${med}분입니다.`,
        })
      } else if (now.actualMin < med / DURATION_FACTOR) {
        out.push({
          rule: '소요시간 이탈',
          runStepId: now.id,
          detected:
            `「${s.title}」이 ${now.actualMin}분 만에 끝났습니다. ` +
            `평소는 ${med}분입니다.`,
        })
      }
    }
  }

  // ── 규칙 5. 사람 개입 증가 — AI 위임 절차에서만, 회차 2개 이상
  if (aiDelegated && history.length >= MIN_SAMPLE_FOR_INTERVENTION) {
    const nowCount = doneRuns.filter((r) => r.humanIntervened).length
    const prev = history[0] ?? []
    const prevCount = prev.filter((r) => r.done && r.humanIntervened).length
    if (nowCount > prevCount) {
      out.push({
        rule: '사람 개입 증가',
        runStepId: null,
        detected:
          `사람이 손댄 단계가 ${prevCount}개에서 ${nowCount}개로 늘었습니다.`,
      })
    }
  }

  return out
}
