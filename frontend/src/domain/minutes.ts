/**
 * 회의록 양식 — **무엇을 결정했고, 누가 언제까지 무엇을 하는지**가 바로 보이게.
 *
 * ── 왜 이 구조인가 ───────────────────────────────────────
 * 회의 내용을 길게 적는 것보다 **결정과 실행이 분리되어 보이는 것**이 훨씬 쓸모 있다.
 *   「A 시스템을 도입하기로 한다」        → 결정사항
 *   「견적 3곳 비교 · 담당 · 8/21까지」  → Action Item
 * 둘을 한 칸에 섞어 적으면 나중에 무엇을 해야 하는지 다시 읽어 찾아야 한다.
 *
 * Action Item 은 이 툴에서 **인박스로 넘어가 업무가 된다.** 회의록이 그냥 기록으로
 * 끝나지 않고 일로 이어지는 자리가 여기다.
 *
 * ⚠️ 여기에는 AI 도 화면도 없다. **글을 칸으로 나누고 다시 글로 만드는 계산**뿐이다.
 */

/**
 * 업무 분류 — 「기준 › 설정 › 업무영역」의 목록을 그대로 쓴다.
 *
 * ── 왜 회의록에 분류를 다나 ──────────────────────────────
 * ① *"이번 달 회의에서 세무 관련 결정이 뭐였나"* 를 찾을 수 있다
 * ② **Action Item 이 인박스를 거쳐 업무가 될 때 이 분류가 따라간다.**
 *    그러면 리포트가 영역별로 집계될 때 회의에서 나온 일도 제자리에 들어간다
 *
 * 회의록 전용 분류를 따로 만들지 않는다. 두 벌로 관리하면 반드시 어긋난다.
 */
export type Area = string

export type Discussion = {
  /** 어느 안건에 대한 이야기인가 */
  topic: string
  points: string
  result: string
  area: Area
}

export type Decision = { text: string; note: string; area: Area }

export type ActionItem = {
  text: string
  owner: string
  /** 완료 기한. 「8/21」처럼 말한 그대로 둔다 — 날짜로 굳히는 것은 사람이 확인한 뒤 */
  due: string
  status: string
  area: Area
}

export type MinutesDoc = {
  /** 이 회의를 왜 하는가 */
  purpose: string[]
  agenda: string[]
  discussions: Discussion[]
  decisions: Decision[]
  actions: ActionItem[]
  /** 미결·추가 확인사항 */
  pending: string[]
  next: { date: string; agenda: string }
  /** 받아쓰기가 잘못 들었을 수 있는 대목 — 이 툴에만 있는 칸 */
  checks: string[]
}

export const EMPTY_MINUTES: MinutesDoc = {
  purpose: [],
  agenda: [],
  discussions: [],
  decisions: [],
  actions: [],
  pending: [],
  next: { date: '', agenda: '' },
  checks: [],
}

const HEADINGS: { key: string; words: string[] }[] = [
  { key: 'purpose', words: ['목적', '회의목적', '회의 목적'] },
  { key: 'agenda', words: ['안건', '주요안건', '주요 안건'] },
  { key: 'discussions', words: ['논의', '논의내용', '논의 내용', '안건별 논의'] },
  { key: 'decisions', words: ['결정', '결정사항'] },
  { key: 'actions', words: ['할 일', '할일', 'action item', 'action', '실행'] },
  { key: 'pending', words: ['미결', '미결사항', '추가확인', '추가 확인'] },
  { key: 'next', words: ['다음 회의', '다음회의', '다음'] },
  { key: 'checks', words: ['확인 필요', '확인필요', '불확실'] },
]

/** 머리표·괄호·별표를 걷어낸 알맹이 */
function strip(line: string): string {
  return line
    // ⚠️ 숫자를 무턱대고 지우면 안 된다. 「8/25」의 8 이 머리표로 오인돼 잘렸다.
    // 머리표(#, -, ·)와 **번호 매기기(1. 2))** 만 지운다
    .replace(/^\s*[#>*\-·•\][【】]*\s*/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/[*_`]/g, '')
    .replace(/[[\]【】:：]+\s*$/, '')
    .trim()
}

function headingOf(line: string): string | null {
  const bare = strip(line).replace(/[:：]/g, '').trim().toLowerCase()
  if (bare.length === 0 || bare.length > 12) return null
  for (const h of HEADINGS) {
    if (h.words.some((w) => w.toLowerCase() === bare)) return h.key
  }
  return null
}

/** 「가 | 나 | 다」를 칸으로 나눈다. 칸이 모자라면 빈 칸으로 채운다 */
function cells(line: string, want: number): string[] {
  const parts = line.split('|').map((p) => p.trim())
  while (parts.length < want) parts.push('')
  return parts.slice(0, want)
}

/**
 * AI 가 준 글을 회의록 양식으로 나눈다.
 *
 * 형식이 어긋나도 죽지 않는다. 못 알아들은 칸은 비워 두고, 화면이 원문을 함께 보여 준다 —
 * **형식이 틀렸다고 사람이 말한 것을 잃으면 안 된다.**
 */
export function parseMinutesDoc(text: string): MinutesDoc {
  const out: MinutesDoc = {
    purpose: [],
    agenda: [],
    discussions: [],
    decisions: [],
    actions: [],
    pending: [],
    next: { date: '', agenda: '' },
    checks: [],
  }
  let current: string | null = null

  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue

    const heading = headingOf(raw)
    if (heading) {
      current = heading
      continue
    }
    if (!current) continue

    const line = strip(raw)
    if (!line || line === '없음' || line === '-') continue

    switch (current) {
      case 'purpose':
        out.purpose.push(line.slice(0, 300))
        break
      case 'agenda':
        out.agenda.push(line.slice(0, 200))
        break
      /*
        분류는 **맨 뒤 칸**에 온다. 가운데 끼워 넣지 않는 이유 —
        칸 순서를 바꾸면 예전에 저장된 회의록과 AI 가 내놓는 글이 어긋난다.
        뒤에 붙이면 없어도 읽히고 있으면 읽힌다.
      */
      case 'discussions': {
        const [topic, points, result, area] = cells(line, 4)
        out.discussions.push({ topic, points, result, area })
        break
      }
      case 'decisions': {
        const [t, note, area] = cells(line, 3)
        out.decisions.push({ text: t, note, area })
        break
      }
      case 'actions': {
        const [t, owner, due, area] = cells(line, 4)
        out.actions.push({ text: t, owner, due, status: '예정', area })
        break
      }
      case 'pending':
        out.pending.push(line.slice(0, 300))
        break
      case 'next': {
        const [date, agenda] = cells(line, 2)
        // 「예정일 | 안건」 한 줄만 받는다. 여러 줄이면 뒤엣것을 안건에 잇는다
        if (!out.next.date) out.next = { date, agenda }
        else out.next.agenda = [out.next.agenda, line].filter(Boolean).join(' / ')
        break
      }
      case 'checks':
        out.checks.push(line.slice(0, 300))
        break
    }
  }
  return out
}

/** 회의록에 적힌 것이 하나라도 있나 */
export function hasContent(m: MinutesDoc): boolean {
  return (
    m.purpose.length > 0 ||
    m.agenda.length > 0 ||
    m.discussions.length > 0 ||
    m.decisions.length > 0 ||
    m.actions.length > 0 ||
    m.pending.length > 0 ||
    !!m.next.date ||
    !!m.next.agenda
  )
}

/**
 * 회의록을 사람이 읽는 글로 만든다.
 *
 * 밖으로 내보내거나(복사) 인쇄할 때 쓴다. 화면 모양과 따로 두는 이유 —
 * **화면은 고치는 자리이고 이건 읽는 자리다.** 섞으면 둘 다 어정쩡해진다.
 */
export function minutesToText(
  m: MinutesDoc,
  head: { title: string; metOn: string; place?: string | null; attendees?: string | null },
): string {
  const out: string[] = ['# 회의록', '']
  out.push('## 1. 회의 기본정보')
  out.push(`회의명 : ${head.title}`)
  out.push(`일시 : ${head.metOn}`)
  if (head.place) out.push(`장소/방식 : ${head.place}`)
  if (head.attendees) out.push(`참석자 : ${head.attendees}`)

  const block = (title: string, lines: string[]) => {
    if (lines.length === 0) return
    out.push('', title, ...lines)
  }

  block('## 2. 회의 목적', m.purpose.map((p) => `- ${p}`))
  block('## 3. 주요 안건', m.agenda.map((a, i) => `${i + 1}. ${a}`))
  const tag = (area: string) => (area ? ` [${area}]` : '')

  block(
    '## 4. 안건별 논의 내용',
    m.discussions.map(
      (d) => `- ${d.topic}${tag(d.area)} | ${d.points}${d.result ? ` → ${d.result}` : ''}`,
    ),
  )
  block(
    '## 5. 결정사항',
    m.decisions.map((d, i) => `${i + 1}. ${d.text}${tag(d.area)}${d.note ? ` (${d.note})` : ''}`),
  )
  block(
    '## 6. Action Item',
    m.actions.map(
      (a, i) =>
        `${i + 1}. ${a.text}${tag(a.area)} | 담당 ${a.owner || '미정'} | 기한 ${a.due || '미정'} | ${a.status}`,
    ),
  )
  block('## 7. 미결·추가 확인사항', m.pending.map((p) => `- ${p}`))
  if (m.next.date || m.next.agenda) {
    out.push('', '## 8. 다음 회의')
    if (m.next.date) out.push(`예정일 : ${m.next.date}`)
    if (m.next.agenda) out.push(`주요 안건 : ${m.next.agenda}`)
  }
  return out.join('\n')
}

/**
 * 구간별로 뽑은 회의록을 **하나로 합친다.**
 *
 * ── 왜 나눠 뽑나 ─────────────────────────────────────────
 * 한 시간 반짜리 회의의 받아쓴 글은 3만 자가 넘는다. 한 번에 넘기면
 * ① 한도에 걸리고 ② 넘어가도 **앞부분을 흘린다** — 긴 글일수록 가운데가 묽어진다.
 * 그래서 앞에서부터 구간으로 잘라 각각 정리한 뒤 여기서 합친다.
 *
 * ── 합칠 때 지키는 것 ────────────────────────────────────
 * · 같은 말이 두 구간에 걸쳐 나오면 **한 번만** 남긴다 (구간 경계에서 흔하다)
 * · 「목적」은 첫 구간 것을, 「다음 회의」는 마지막 구간 것을 쓴다
 *   — 그 둘은 회의 전체를 봐야 아는 것이라 가운데 구간의 답은 믿지 않는다
 */
export function mergeMinutes(parts: readonly MinutesDoc[]): MinutesDoc {
  if (parts.length === 0) return EMPTY_MINUTES
  if (parts.length === 1) return parts[0]

  /** 같은 줄이 두 번 들어가지 않게 거른다 */
  const uniq = <T>(rows: T[], key: (r: T) => string): T[] => {
    const seen = new Set<string>()
    return rows.filter((r) => {
      const k = key(r).replace(/\s+/g, ' ').trim().toLowerCase()
      if (!k || seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  const all = <K extends keyof MinutesDoc>(k: K) => parts.flatMap((p) => p[k] as never[])

  // 「다음 회의」는 뒤에서부터 찾는다 — 회의 끝에 정해지는 것이다
  const next =
    [...parts].reverse().find((p) => p.next.date || p.next.agenda)?.next ?? { date: '', agenda: '' }

  return {
    // 「목적」은 첫 구간이 가장 정확하다. 뒤 구간은 앞을 못 봤다
    purpose: uniq(
      parts.find((p) => p.purpose.length > 0)?.purpose ?? [],
      (s: string) => s,
    ),
    agenda: uniq(all('agenda') as string[], (s) => s),
    discussions: uniq(all('discussions') as Discussion[], (d) => `${d.topic}|${d.points}`),
    decisions: uniq(all('decisions') as Decision[], (d) => d.text),
    actions: uniq(all('actions') as ActionItem[], (a) => a.text),
    pending: uniq(all('pending') as string[], (s) => s),
    next,
    checks: uniq(all('checks') as string[], (s) => s),
  }
}

/**
 * 긴 글을 구간으로 나눈다.
 *
 * **줄 가운데를 자르지 않는다.** 문장이 반 토막 나면 AI 가 그 대목을 못 읽는다.
 * 줄 단위로 담다가 한도를 넘으면 거기서 끊는다.
 */
export function splitTranscript(text: string, maxChars: number): string[] {
  const lines = text.split('\n')
  const out: string[] = []
  let buf = ''

  for (const line of lines) {
    if (buf && buf.length + line.length + 1 > maxChars) {
      out.push(buf)
      buf = line
    } else {
      buf = buf ? `${buf}\n${line}` : line
    }
  }
  if (buf.trim()) out.push(buf)
  return out.length > 0 ? out : ['']
}
