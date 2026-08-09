import { describe, it, expect } from 'vitest'
import { daysUntil, scheduleOf, ddayLabel } from '../dday'

// 로컬 벽시계 기준. ISO 문자열(절대 시각)로 바꾸면 UTC 오프셋이 음수인 지역에서 하루가 밀려 깨진다.
const TODAY = new Date(2026, 7, 11, 9, 0)

describe('daysUntil', () => {
  it('오늘이면 0', () => {
    expect(daysUntil('2026-08-11', TODAY)).toBe(0)
  })
  it('내일이면 1', () => {
    expect(daysUntil('2026-08-12', TODAY)).toBe(1)
  })
  it('어제면 -1', () => {
    expect(daysUntil('2026-08-10', TODAY)).toBe(-1)
  })
  it('시각이 늦어도 날짜만 본다', () => {
    expect(daysUntil('2026-08-11', new Date(2026, 7, 11, 23, 59))).toBe(0)
  })
  it('기한이 없으면 null', () => {
    expect(daysUntil(null, TODAY)).toBeNull()
  })
})

describe('scheduleOf', () => {
  it('완료된 업무는 기한이 지났어도 완료', () => {
    expect(scheduleOf({ status: '완료', due_date: '2026-08-01' }, TODAY)).toBe('완료')
  })
  it('보류는 보류', () => {
    expect(scheduleOf({ status: '보류', due_date: '2026-08-01' }, TODAY)).toBe('보류')
  })
  it('기한이 지나면 지연', () => {
    expect(scheduleOf({ status: '할 일', due_date: '2026-08-10' }, TODAY)).toBe('지연')
  })
  it('오늘 마감은 임박', () => {
    expect(scheduleOf({ status: '할 일', due_date: '2026-08-11' }, TODAY)).toBe('임박')
  })
  it('7일 이내는 임박', () => {
    expect(scheduleOf({ status: '할 일', due_date: '2026-08-18' }, TODAY)).toBe('임박')
  })
  it('8일 뒤는 정상', () => {
    expect(scheduleOf({ status: '할 일', due_date: '2026-08-19' }, TODAY)).toBe('정상')
  })
  it('기한이 없으면 기한없음', () => {
    expect(scheduleOf({ status: '할 일', due_date: null }, TODAY)).toBe('기한없음')
  })
})

describe('ddayLabel', () => {
  it('오늘', () => expect(ddayLabel(0)).toBe('오늘 마감'))
  it('미래', () => expect(ddayLabel(13)).toBe('D-13'))
  it('과거', () => expect(ddayLabel(-3)).toBe('3일 지연'))
  it('없음', () => expect(ddayLabel(null)).toBe('기한 미정'))
})
