import { isDueToday, scheduleOf } from './dday'
import { sortTasks } from './sort'
import type { TaskStatus } from './types'

/** 묶는 데 필요한 최소한만 본다 — 테스트에서 업무 전체를 만들지 않아도 되게 */
type Groupable = {
  id: string
  area: string | null
  status: TaskStatus | string
  due_date: string | null
  priority: string
}

export type AreaGroup<T> = {
  /** 영역 이름. 영역이 없는 업무는 「영역 없음」으로 모인다 */
  area: string
  tasks: T[]
  overdue: number
  dueToday: number
  /** 지연이나 오늘 마감이 하나라도 있나 — 화면에서 이 묶음을 펼쳐 둘지 정하는 데 쓴다 */
  urgent: boolean
}

/**
 * 영역별로 묶는다.
 *
 * 왜 —
 *   업무 46건을 한 줄씩 늘어놓으면 벽이 된다. 실제로 그렇게 보였다.
 *   「회생지원」과 「인수인계」는 머릿속에서도 다른 서랍인데 화면에서만 섞여 있었다.
 *
 * 묶음 순서는 **급한 것이 위**다. 가나다순이면 오늘 터질 일이 맨 아래로 간다.
 *   ① 지연·오늘 마감이 있는 묶음
 *   ② 그 안에서는 지연 건수가 많은 순
 *   ③ 같으면 업무 수가 많은 순, 그다음 이름순
 *
 * 묶음 **안쪽** 정렬은 sortTasks 를 그대로 쓴다. 여기서 다시 짜면 두 곳이 어긋난다.
 */
export function groupByArea<T extends Groupable>(tasks: readonly T[], today: Date): AreaGroup<T>[] {
  const NONE = '영역 없음'
  const buckets = new Map<string, T[]>()

  for (const t of tasks) {
    const key = t.area?.trim() || NONE
    const list = buckets.get(key)
    if (list) list.push(t)
    else buckets.set(key, [t])
  }

  const groups: AreaGroup<T>[] = [...buckets].map(([area, list]) => {
    const overdue = list.filter((t) => scheduleOf(t, today) === '지연').length
    const dueToday = list.filter((t) => isDueToday(t, today)).length
    return {
      area,
      tasks: sortTasks(list, today),
      overdue,
      dueToday,
      urgent: overdue > 0 || dueToday > 0,
    }
  })

  return groups.sort((a, b) => {
    // 「영역 없음」은 급하지 않은 한 맨 아래로 — 이름이 아니라 미분류라는 뜻이다
    const parkA = a.area === NONE && !a.urgent ? 1 : 0
    const parkB = b.area === NONE && !b.urgent ? 1 : 0
    if (parkA !== parkB) return parkA - parkB

    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
    if (a.overdue !== b.overdue) return b.overdue - a.overdue
    if (a.dueToday !== b.dueToday) return b.dueToday - a.dueToday
    if (a.tasks.length !== b.tasks.length) return b.tasks.length - a.tasks.length
    return a.area.localeCompare(b.area, 'ko')
  })
}
