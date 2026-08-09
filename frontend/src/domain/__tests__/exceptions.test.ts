import { describe, expect, it } from 'vitest'
import { detectExceptions, median } from '../exceptions'
import type { StepDef, StepRun } from '../exceptions'

const STEPS: StepDef[] = [
  { id: 'S1', seq: 1, title: '자료 추출', required: true, hasOutputSpec: true },
  { id: 'S2', seq: 2, title: '원장 대사', required: true },
  { id: 'S3', seq: 3, title: '세무대리인 확인', required: true },
  { id: 'S4', seq: 4, title: '증빙 보관', required: false },
]

function run(over: Partial<StepRun> & { id: string }): StepRun {
  return {
    procedureStepId: null, seq: 1, title: '', done: true,
    actualMin: null, output: null, humanIntervened: true,
    ...over,
  }
}

/** 정상 회차 — 절차대로 순서대로 전부 함 */
function normalRun(): StepRun[] {
  return [
    run({ id: 'R1', procedureStepId: 'S1', seq: 1, title: '자료 추출', output: '매출집계.xlsx', actualMin: 30 }),
    run({ id: 'R2', procedureStepId: 'S2', seq: 2, title: '원장 대사', actualMin: 60 }),
    run({ id: 'R3', procedureStepId: 'S3', seq: 3, title: '세무대리인 확인', actualMin: 20 }),
  ]
}

describe('median', () => {
  it('홀수 개', () => expect(median([1, 5, 3])).toBe(3))
  it('짝수 개는 가운데 둘의 평균', () => expect(median([1, 3, 5, 7])).toBe(4))
  it('비었으면 null', () => expect(median([])).toBeNull())
})

describe('규칙 1 — 단계 건너뜀 (1회차부터)', () => {
  it('필수 단계를 안 했으면 잡는다', () => {
    const steps = normalRun().filter((r) => r.procedureStepId !== 'S3')
    const out = detectExceptions(STEPS, steps, [])
    expect(out.filter((o) => o.rule === '단계 건너뜀')).toHaveLength(1)
    expect(out[0].detected).toContain('세무대리인 확인')
  })

  it('체크만 안 했어도 건너뛴 것으로 본다', () => {
    const steps = normalRun().map((r) =>
      r.procedureStepId === 'S3' ? { ...r, done: false } : r,
    )
    expect(detectExceptions(STEPS, steps, []).some((o) => o.rule === '단계 건너뜀')).toBe(true)
  })

  it('필수가 아닌 단계는 안 해도 잡지 않는다', () => {
    // S4 는 required: false
    expect(detectExceptions(STEPS, normalRun(), [])).toHaveLength(0)
  })
})

describe('규칙 2 — 단계 추가 (1회차부터)', () => {
  it('절차에 없던 단계를 했으면 잡는다', () => {
    const steps = [...normalRun(), run({ id: 'RX', procedureStepId: null, seq: 9, title: '면세 매출 확인' })]
    const out = detectExceptions(STEPS, steps, [])
    expect(out.filter((o) => o.rule === '단계 추가')).toHaveLength(1)
    expect(out[0].detected).toContain('면세 매출 확인')
  })

  it('추가했지만 체크 안 했으면 잡지 않는다', () => {
    const steps = [
      ...normalRun(),
      run({ id: 'RX', procedureStepId: null, seq: 9, title: '메모', done: false }),
    ]
    expect(detectExceptions(STEPS, steps, []).some((o) => o.rule === '단계 추가')).toBe(false)
  })
})

describe('규칙 4 — 산출물 누락 (1회차부터)', () => {
  it('산출물이 정의된 단계인데 비었으면 잡는다', () => {
    const steps = normalRun().map((r) =>
      r.procedureStepId === 'S1' ? { ...r, output: '  ' } : r,
    )
    const out = detectExceptions(STEPS, steps, [])
    expect(out.filter((o) => o.rule === '산출물 누락')).toHaveLength(1)
  })

  it('산출물 정의가 없는 단계는 비어도 잡지 않는다', () => {
    // S2 는 hasOutputSpec 없음
    expect(detectExceptions(STEPS, normalRun(), [])).toHaveLength(0)
  })
})

describe('규칙 6 — 순서 뒤바뀜 (1회차부터)', () => {
  it('절차와 반대로 했으면 잡는다', () => {
    const steps = [
      run({ id: 'R1', procedureStepId: 'S1', seq: 1, title: '자료 추출', output: 'x' }),
      run({ id: 'R3', procedureStepId: 'S3', seq: 2, title: '세무대리인 확인' }),
      run({ id: 'R2', procedureStepId: 'S2', seq: 3, title: '원장 대사' }),
    ]
    const out = detectExceptions(STEPS, steps, [])
    expect(out.filter((o) => o.rule === '순서 뒤바뀜')).toHaveLength(1)
  })

  it('절차 순서대로면 잡지 않는다', () => {
    expect(detectExceptions(STEPS, normalRun(), []).some((o) => o.rule === '순서 뒤바뀜')).toBe(false)
  })
})

describe('규칙 3 — 소요시간 이탈 (회차 3개 이상)', () => {
  const past = [normalRun(), normalRun(), normalRun()] // S2 가 매번 60분

  it('회차가 2개뿐이면 계산하지 않는다', () => {
    const steps = normalRun().map((r) =>
      r.procedureStepId === 'S2' ? { ...r, actualMin: 300 } : r,
    )
    const out = detectExceptions(STEPS, steps, [normalRun(), normalRun()])
    expect(out.some((o) => o.rule === '소요시간 이탈')).toBe(false)
  })

  it('중앙값의 2배를 넘으면 잡는다', () => {
    const steps = normalRun().map((r) =>
      r.procedureStepId === 'S2' ? { ...r, actualMin: 180 } : r,
    )
    const out = detectExceptions(STEPS, steps, past)
    const hit = out.find((o) => o.rule === '소요시간 이탈')
    expect(hit).toBeDefined()
    expect(hit?.detected).toContain('180분')
    expect(hit?.detected).toContain('60분')
  })

  it('중앙값의 절반 아래여도 잡는다 — 너무 빨리 끝난 것도 이상하다', () => {
    const steps = normalRun().map((r) =>
      r.procedureStepId === 'S2' ? { ...r, actualMin: 10 } : r,
    )
    expect(detectExceptions(STEPS, steps, past).some((o) => o.rule === '소요시간 이탈')).toBe(true)
  })

  it('평소 범위면 잡지 않는다', () => {
    const steps = normalRun().map((r) =>
      r.procedureStepId === 'S2' ? { ...r, actualMin: 90 } : r,
    )
    expect(detectExceptions(STEPS, steps, past).some((o) => o.rule === '소요시간 이탈')).toBe(false)
  })

  it('소요시간을 안 적었으면 잡지 않는다', () => {
    const steps = normalRun().map((r) =>
      r.procedureStepId === 'S2' ? { ...r, actualMin: null } : r,
    )
    expect(detectExceptions(STEPS, steps, past).some((o) => o.rule === '소요시간 이탈')).toBe(false)
  })
})

describe('규칙 5 — 사람 개입 증가 (AI 위임 절차, 회차 2개 이상)', () => {
  const auto = (over: Partial<StepRun> & { id: string }) => run({ humanIntervened: false, ...over })

  const prevAuto: StepRun[] = [
    auto({ id: 'P1', procedureStepId: 'S1', seq: 1, title: 'a', output: 'x' }),
    auto({ id: 'P2', procedureStepId: 'S2', seq: 2, title: 'b' }),
    auto({ id: 'P3', procedureStepId: 'S3', seq: 3, title: 'c' }),
  ]

  it('AI 위임이 아니면 보지 않는다', () => {
    const out = detectExceptions(STEPS, normalRun(), [prevAuto, prevAuto], false)
    expect(out.some((o) => o.rule === '사람 개입 증가')).toBe(false)
  })

  it('AI 위임인데 사람 손이 늘었으면 잡는다', () => {
    const out = detectExceptions(STEPS, normalRun(), [prevAuto, prevAuto], true)
    const hit = out.find((o) => o.rule === '사람 개입 증가')
    expect(hit).toBeDefined()
    expect(hit?.detected).toContain('0개에서 3개로')
  })

  it('그대로면 잡지 않는다', () => {
    const out = detectExceptions(STEPS, prevAuto, [prevAuto, prevAuto], true)
    expect(out.some((o) => o.rule === '사람 개입 증가')).toBe(false)
  })
})

describe('정상 회차', () => {
  it('절차대로 다 했으면 아무것도 안 잡는다', () => {
    expect(detectExceptions(STEPS, normalRun(), [normalRun(), normalRun(), normalRun()])).toEqual([])
  })
})
