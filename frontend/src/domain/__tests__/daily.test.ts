import { describe, expect, it } from 'vitest'
import { buildSnapshot, buildYesterdayStory, hasStory, shiftDays, ymd } from '../daily'
import type { LogSnapshotItem } from '../daily'

/** 로컬 벽시계 리터럴. ISO 문자열은 시간대에 따라 하루가 밀린다 */
const 화요일 = new Date(2026, 7, 11) // 2026-08-11

function task(over: Partial<{
  id: string; title: string; status: string; area: string | null
  progress: number; updated_at: string
}> = {}) {
  return {
    id: 'T1', title: '업무', status: '진행중', area: null, progress: 0,
    updated_at: new Date(2026, 7, 11, 14, 0).toISOString(),
    ...over,
  }
}

describe('ymd — 로컬 달력일', () => {
  it('한 자리 월·일을 0으로 채운다', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('연말에도 밀리지 않는다', () => {
    expect(ymd(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('shiftDays', () => {
  it('전날', () => {
    expect(ymd(shiftDays(화요일, -1))).toBe('2026-08-10')
  })

  it('달을 넘어간다', () => {
    expect(ymd(shiftDays(new Date(2026, 7, 1), -1))).toBe('2026-07-31')
  })

  it('연을 넘어간다', () => {
    expect(ymd(shiftDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31')
  })
})

describe('buildSnapshot — 그날 진행한 업무를 굳힌다', () => {
  it('그날 갱신된 것만 담는다', () => {
    const rows = [
      task({ id: 'A', updated_at: new Date(2026, 7, 11, 9, 0).toISOString() }),
      task({ id: 'B', updated_at: new Date(2026, 7, 10, 9, 0).toISOString() }),
    ]
    const snap = buildSnapshot(rows, 화요일)
    expect(snap.map((s) => s.taskId)).toEqual(['A'])
  })

  it('자정 직전·직후를 같은 날로 묶지 않는다', () => {
    const rows = [
      task({ id: 'A', updated_at: new Date(2026, 7, 11, 23, 59).toISOString() }),
      task({ id: 'B', updated_at: new Date(2026, 7, 12, 0, 1).toISOString() }),
    ]
    expect(buildSnapshot(rows, 화요일).map((s) => s.taskId)).toEqual(['A'])
  })

  it('필요한 값만 담는다', () => {
    const snap = buildSnapshot(
      [task({ id: 'A', title: '월 마감', status: '완료', area: '보고·마감', progress: 100 })],
      화요일,
    )
    expect(snap[0]).toEqual({
      taskId: 'A', title: '월 마감', status: '완료', area: '보고·마감', progress: 100,
    })
  })

  it('그날 아무것도 안 했으면 빈 배열', () => {
    expect(buildSnapshot([], 화요일)).toEqual([])
  })
})

describe('buildYesterdayStory — 어제 이야기', () => {
  const snapshot: LogSnapshotItem[] = [
    { taskId: 'A', title: '월 마감', status: '완료', area: null, progress: 100 },
    { taskId: 'B', title: '재고 대사', status: '진행중', area: null, progress: 40 },
  ]

  it('전날 일지가 없으면 빈 이야기', () => {
    const s = buildYesterdayStory(null, [])
    expect(s).toEqual({ issues: null, finished: [], keptAsMemo: [] })
    expect(hasStory(s)).toBe(false)
  })

  it('완료한 것만 골라 온다', () => {
    const s = buildYesterdayStory({ issues: null, snapshot }, [])
    expect(s.finished.map((f) => f.taskId)).toEqual(['A'])
  })

  it('업무로 올리지 않은 할 일은 메모로 남는다', () => {
    const s = buildYesterdayStory({ issues: null, snapshot }, [
      { id: '1', title: '위하고 권한 확인', promote: false, promoted_task_id: null },
      { id: '2', title: '실사표 정리', promote: true, promoted_task_id: 'T9' },
    ])
    expect(s.keptAsMemo).toEqual(['위하고 권한 확인'])
  })

  it('이슈가 공백뿐이면 없는 것으로 본다', () => {
    expect(buildYesterdayStory({ issues: '   ', snapshot: [] }, []).issues).toBeNull()
  })

  it('이슈를 그대로 옮긴다', () => {
    const s = buildYesterdayStory({ issues: '위하고 계정이 안 열림', snapshot: [] }, [])
    expect(s.issues).toBe('위하고 계정이 안 열림')
    expect(hasStory(s)).toBe(true)
  })

  it('스냅샷이 배열이 아니어도 깨지지 않는다', () => {
    expect(buildYesterdayStory({ issues: null, snapshot: null }, []).finished).toEqual([])
  })
})
