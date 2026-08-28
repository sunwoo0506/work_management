/**
 * 회의록 양식 — **회사에서 실제로 쓰는 서식**을 그대로 담는다.
 *
 * ── 이 양식은 어디서 왔나 ────────────────────────────────
 * 2026-08-28 사용자가 실무에서 쓰는 회의록 파일을 넘겨주며
 * *"회의록 템플릿은 이걸로 사용해줘"* 라고 했다. 그 서식의 뼈대가 이것이다.
 *
 *   1. 기본정보       일시 · 장소 · 참석 · 작성자 · 작성일자 · 안건 목록
 *   2. 안건별 본문    안건마다 **현재상황 / 논의내용 / 결론 / 조치사항** 네 칸
 *   3. 조치사항 정리  No · 조치 내용 · 담당 · 마감기한 · 비고
 *   4. 다음 회의 주요 점검 사항
 *   5. **참석자 확인란**  ← 넘겨받은 파일 이름에 「확인란」이 붙어 있던 그 칸
 *
 * ── 왜 안건별로 묶는가 ───────────────────────────────────
 * 전에는 「논의」·「결정」·「할 일」이 각각 **전체 목록**이었다. 그러면 한 안건을
 * 되짚을 때 세 목록을 오가며 짝을 맞춰야 한다. 안건 단위로 묶으면
 * *"그 건이 어떻게 됐더라"* 에 대한 답이 **한 덩어리로** 나온다.
 *
 * ── 그래도 지키는 것 — 결론과 조치사항은 반드시 가른다 ───
 * 「A를 도입한다」는 결론이고 「견적 3곳 비교 · 담당 · 8/21」은 조치사항이다.
 * 안건 안에서 칸이 갈라져 있고, 조치사항은 **정리 표로 한 번 더 모인다.**
 * 조치사항은 이 툴에서 인박스를 거쳐 업무가 된다 —
 * 회의록이 기록으로 끝나지 않고 일로 이어지는 자리다 (CLAUDE.md).
 *
 * ⚠️ 여기에는 AI 도 화면도 없다. **글을 칸으로 나누고 다시 글로 만드는 계산**뿐이다.
 */

/**
 * 업무 분류 — 「기준 › 설정 › 업무영역」의 목록을 그대로 쓴다.
 *
 * ── 왜 회의록에 분류를 다나 ──────────────────────────────
 * ① *"이번 달 회의에서 세무 관련 결정이 뭐였나"* 를 찾을 수 있다
 * ② **조치사항이 인박스를 거쳐 업무가 될 때 이 분류가 따라간다.**
 *    그러면 리포트가 영역별로 집계될 때 회의에서 나온 일도 제자리에 들어간다
 *
 * 회의록 전용 분류를 따로 만들지 않는다. 두 벌로 관리하면 반드시 어긋난다.
 */
export type Area = string

/**
 * 안건 하나. 서식의 「안건N.」 아래 네 칸이 그대로 들어온다.
 *
 * 네 칸을 한 칸으로 합치지 않는 이유 —
 * **「무엇이 문제였나(현재상황)」와 「그래서 어떻게 하기로 했나(결론)」는 다른 사실**이다.
 * 섞어 적으면 몇 달 뒤에 결론만 읽고 싶어도 문단 전체를 다시 읽어야 한다.
 */
export type AgendaItem = {
  /** 「안건1. ○○ 확인사항」의 제목 부분 */
  title: string
  /** ■ 현재상황 — 지금 어떤 상태인가 */
  situation: string
  /** ■ 논의내용 — 회의에서 오간 검토 */
  discussion: string
  /** ■ 결론 — 정해진 것. **행동이 아니라 정해진 내용**을 적는다 */
  conclusion: string
  /** ■ 조치사항 — 이 안건에서 나온 후속 조치를 한 줄로. 상세는 아래 정리 표 */
  action: string
  area: Area
}

/**
 * 조치사항 정리 표의 한 줄.
 *
 * `note`(비고)가 서식에서 온 칸이다. 「자료 수령 대기」처럼 **왜 아직 안 됐나**가
 * 여기 적힌다. 그 한 줄이 없으면 다음 회의에서 같은 질문을 다시 한다.
 */
export type ActionItem = {
  text: string
  /** 담당. 「경영지원 → 대표」처럼 넘기는 방향을 적기도 한다 */
  owner: string
  /** 마감기한. 「8/21」처럼 말한 그대로 둔다 — 날짜로 굳히는 것은 사람이 확인한 뒤 */
  due: string
  /** 비고 — 조건 · 왜 아직 안 됐나 · 참고 */
  note: string
  status: string
  area: Area
}

/**
 * 참석자 확인란 한 줄.
 *
 * ── 왜 이 칸이 필요한가 ──────────────────────────────────
 * 회의록의 값어치는 **"이렇게 합의된 게 맞다"를 참석자가 인정했을 때** 생긴다.
 * 확인을 안 받으면 나중에 *"그렇게 말한 적 없다"* 가 나오고, 그때는 회의록이
 * 근거가 아니라 한쪽 주장이 된다.
 *
 * 그래서 기본값이 **미확인**이다. 작성자가 마음대로 확인으로 바꾸는 칸이 아니라,
 * 회신을 받고 나서 바꾸는 칸이다.
 */
export type Attendee = {
  /** 역할·직책으로 적는다. 실명을 남기지 않는다 (CLAUDE.md 보안 규칙) */
  name: string
  confirmed: boolean
}

export type MinutesDoc = {
  /** 「주식회사 ○○ · 경영지원팀」 — 서식 맨 위 머리줄 */
  orgLine: string
  /** 작성일자. 회의한 날(met_on)과 다르다 — 회의록은 나중에 쓰기도 한다 */
  writtenOn: string
  /** 이 회의를 왜 하는가 */
  purpose: string[]
  /** 기본정보 표의 안건 목록 */
  agenda: string[]
  /** ★ 안건별 본문 — 이 양식의 몸통 */
  items: AgendaItem[]
  /** 조치사항 정리 표 */
  actions: ActionItem[]
  /** 미결 · 추가 확인사항 */
  pending: string[]
  /** 다음 회의 주요 점검 사항 */
  nextChecks: string[]
  next: { date: string; agenda: string }
  /** 참석자 확인란 */
  confirms: Attendee[]
  /** 받아쓰기가 잘못 들었을 수 있는 대목 — 이 툴에만 있는 칸 */
  checks: string[]
}

/**
 * 참석자 확인란에 늘 붙는 문구.
 *
 * 회의록마다 저장하지 않고 **상수로 둔다.** 회의마다 달라지는 말이 아니고,
 * 문구가 바뀌면 지난 회의록까지 한꺼번에 바뀌는 편이 맞다.
 */
export const CONFIRM_STATEMENT =
  '본인은 위 회의록의 내용이 회의에서 논의·합의된 사항과 일치함을 확인합니다.'

export const CONFIRM_NOTICE =
  '※ 내용 확인 후 이견이 없으시면 「미확인」을 「확인」으로 변경 부탁드립니다. ' +
  '배포일로부터 3영업일 이내 이견 회신이 없는 경우 본 회의록의 내용에 동의한 것으로 봅니다. ' +
  '수정·보완 의견은 작성자에게 회신 바랍니다.'

export const EMPTY_MINUTES: MinutesDoc = {
  orgLine: '',
  writtenOn: '',
  purpose: [],
  agenda: [],
  items: [],
  actions: [],
  pending: [],
  nextChecks: [],
  next: { date: '', agenda: '' },
  confirms: [],
  checks: [],
}

export const EMPTY_ITEM: AgendaItem = {
  title: '',
  situation: '',
  discussion: '',
  conclusion: '',
  action: '',
  area: '',
}

const HEADINGS: { key: string; words: string[] }[] = [
  { key: 'purpose', words: ['목적', '회의목적', '회의 목적'] },
  { key: 'agenda', words: ['안건', '주요안건', '주요 안건'] },
  // 「논의」는 옛 형식(안건|논의|결과)이다. 아래 parse 가 칸 수를 보고 알아서 읽는다
  {
    key: 'items',
    words: ['안건별', '안건별 정리', '안건별 논의', '논의', '논의내용', '논의 내용'],
  },
  { key: 'actions', words: ['조치사항', '조치', '할 일', '할일', 'action item', 'action', '실행'] },
  { key: 'pending', words: ['미결', '미결사항', '추가확인', '추가 확인'] },
  {
    key: 'nextChecks',
    words: ['다음 점검', '다음점검', '점검사항', '점검 사항', '다음 회의 주요 점검 사항'],
  },
  { key: 'next', words: ['다음 회의', '다음회의', '다음'] },
  { key: 'checks', words: ['확인 필요', '확인필요', '불확실'] },
]

/** 머리표·괄호·별표를 걷어낸 알맹이 */
function strip(line: string): string {
  return line
    // ⚠️ 숫자를 무턱대고 지우면 안 된다. 「8/25」의 8 이 머리표로 오인돼 잘렸다.
    // 머리표(#, -, ·, ■)와 **번호 매기기(1. 2))** 만 지운다
    .replace(/^\s*[#>*\-·•■□▪][\s#>*\-·•■□▪]*/, '')
    .replace(/^\s*[\][【】]+\s*/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/[*_`]/g, '')
    .replace(/[[\]【】:：]+\s*$/, '')
    .trim()
}

function headingOf(line: string): string | null {
  const bare = strip(line).replace(/[:：]/g, '').trim().toLowerCase()
  // 「다음 회의 주요 점검 사항」이 13자다. 머리말은 이보다 길지 않다
  if (bare.length === 0 || bare.length > 16) return null
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
 * AI 가 줄 끝에 붙인 **근거 표기**를 떼어 낸다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────
 * AI 에게는 「근거를 밝혀라」가 기본 규칙이다. 질문에 답할 때는 그게 맞다 —
 * 어느 자료를 보고 한 말인지 없으면 사용자가 믿을 수 없다.
 *
 * 그런데 **회의록에서는 근거가 하나뿐이다.** 받아쓴 글. 줄마다 다시 적을 이유가
 * 없는데도 적어서, `분류` 칸이 「원가·단위 ([받아쓴 글 00:20~00:52])」가 됐다.
 * 그 값이 그대로 인박스를 거쳐 **업무의 영역**이 된다. 리포트가 그걸로 집계한다.
 *
 * 규칙으로도 막지만(프롬프트) **여기서 한 번 더 막는다.** 규칙은 안 지켜질 수 있고,
 * 모델을 갈아끼우면 또 달라진다. 계산으로 되는 것은 계산이 막는다.
 *
 * 아무 괄호나 떼면 안 된다 — 「견적 받기 (수요일까지)」의 괄호는 내용이다.
 * **근거처럼 생긴 것만** 뗀다.
 */
function dropCitation(cell: string): string {
  return cell
    .replace(/\s*[(（]\s*\[[^)）]*[)）]\s*$/, '')
    .replace(/\s*[(（][^)）]*(?:받아쓴\s*글|전사문|사내\s*용어집)[^)）]*[)）]\s*$/, '')
    .trim()
}

/**
 * 분류 칸을 거른다 — **등록된 영역이 아니면 비운다.**
 *
 * AI 가 목록 밖의 말을 지어내면 리포트 집계가 그만큼 조각난다.
 * 「비워 두는 것이 틀리게 채우는 것보다 낫다」 — 빈 칸은 눈에 띄지만
 * 잘못 채운 칸은 틀린 줄 모르고 지나간다 (2026-08-17 결정).
 *
 * `areas` 를 안 넘기면 거르지 않는다. 설정이 비어 있으면 애초에 분류를
 * 요구하지 않으므로, 그때는 AI 가 낸 값을 그대로 두는 편이 잃는 게 없다.
 */
function pickArea(cell: string, areas?: readonly string[]): string {
  const v = dropCitation(cell)
  if (!v) return ''
  if (!areas || areas.length === 0) return v
  return areas.some((a) => a.trim() === v) ? v : ''
}

/** 「안건1. ○○ 확인사항」에서 번호 머리를 뗀다 */
function bareTitle(s: string): string {
  return s.replace(/^안건\s*\d+\s*[.)]?\s*/, '').trim()
}

/**
 * AI 가 준 글을 회의록 양식으로 나눈다.
 *
 * 형식이 어긋나도 죽지 않는다. 못 알아들은 칸은 비워 두고, 화면이 원문을 함께 보여 준다 —
 * **형식이 틀렸다고 사람이 말한 것을 잃으면 안 된다.**
 *
 * @param areas 「기준 › 설정 › 업무영역」 목록. 넘기면 **그 안의 값만** 분류로 받는다.
 *              AI 가 지어낸 분류를 여기서 걸러 낸다 — 프롬프트만 믿지 않는다.
 */
export function parseMinutesDoc(text: string, areas?: readonly string[]): MinutesDoc {
  const out: MinutesDoc = {
    orgLine: '',
    writtenOn: '',
    purpose: [],
    agenda: [],
    items: [],
    actions: [],
    pending: [],
    nextChecks: [],
    next: { date: '', agenda: '' },
    confirms: [],
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
        out.purpose.push(dropCitation(line).slice(0, 300))
        break
      case 'agenda':
        out.agenda.push(bareTitle(dropCitation(line)).slice(0, 200))
        break
      /*
        분류는 **맨 뒤 칸**에 온다. 가운데 끼워 넣지 않는 이유 —
        칸 순서를 바꾸면 예전에 저장된 회의록과 AI 가 내놓는 글이 어긋난다.
        뒤에 붙이면 없어도 읽히고 있으면 읽힌다.
      */
      case 'items': {
        const parts = line.split('|').map((p) => p.trim())
        /*
          칸 수를 보고 새 서식과 옛 형식을 가른다.
            5칸 이상 → 안건 | 현재상황 | 논의내용 | 결론 | 조치사항 | 분류  (새 서식)
            4칸 이하 → 안건 | 논의내용 | 결론 | 분류                      (옛 형식)
          프롬프트를 바꿔도 모델은 옛 버릇대로 답할 때가 있다. 그때 통째로
          잃는 것보다 **읽을 수 있는 만큼 읽는** 편이 낫다.
        */
        if (parts.length >= 5) {
          const [title, situation, discussion, conclusion, action, area] = cells(line, 6)
          out.items.push({
            title: bareTitle(title),
            situation: dropCitation(situation),
            discussion: dropCitation(discussion),
            conclusion: dropCitation(conclusion),
            action: dropCitation(action),
            area: pickArea(area, areas),
          })
        } else {
          const [title, discussion, conclusion, area] = cells(line, 4)
          out.items.push({
            title: bareTitle(title),
            situation: '',
            discussion: dropCitation(discussion),
            conclusion: dropCitation(conclusion),
            action: '',
            area: pickArea(area, areas),
          })
        }
        break
      }
      case 'actions': {
        const parts = line.split('|').map((p) => p.trim())
        const [text2, owner, due] = cells(line, 3)
        let note = ''
        let area = ''
        if (parts.length >= 5) {
          note = dropCitation(parts[3])
          area = pickArea(parts[4], areas)
        } else if (parts.length === 4) {
          /*
            옛 형식의 4번째 칸은 분류였고 새 서식은 비고다. 둘을 가르는 방법 —
            **등록된 영역 목록에 있으면 분류, 아니면 비고.**
            목록이 없으면 판정할 근거가 없으므로 비고로 둔다. 비고는 틀려도
            눈에 보이지만, 분류가 틀리면 리포트 집계가 조용히 어긋난다.
          */
          const maybe = areas && areas.length > 0 ? pickArea(parts[3], areas) : ''
          if (maybe) area = maybe
          else note = dropCitation(parts[3])
        }
        out.actions.push({
          text: text2,
          owner,
          // 기한 칸에도 근거가 붙는다. 여기 쓰레기가 들어가면 기한이 안 읽힌다
          due: dropCitation(due),
          note,
          status: '예정',
          area,
        })
        break
      }
      case 'pending':
        out.pending.push(dropCitation(line).slice(0, 300))
        break
      case 'nextChecks':
        out.nextChecks.push(dropCitation(line).slice(0, 300))
        break
      case 'next': {
        const [date, agenda] = cells(line, 2).map(dropCitation)
        // 「예정일 | 안건」 한 줄만 받는다. 여러 줄이면 뒤엣것을 안건에 잇는다
        if (!out.next.date) out.next = { date, agenda }
        else out.next.agenda = [out.next.agenda, line].filter(Boolean).join(' / ')
        break
      }
      case 'checks':
        out.checks.push(dropCitation(line).slice(0, 300))
        break
    }
  }
  return out
}

/**
 * 안건별 「결론」을 모아 준다.
 *
 * ── 왜 따로 저장하지 않고 뽑아 쓰나 ──────────────────────
 * 결정사항을 별도 목록으로도 저장하면 **같은 말이 두 군데 적힌다.** 한쪽만 고치면
 * 그때부터 어느 것이 맞는지 알 수 없다. 결론은 안건 안에 한 번만 두고,
 * 목록이 필요한 자리(복사·인쇄·회의록 목록의 한 줄 요약)에서는 **계산해서 꺼낸다.**
 */
export function decisionsOf(m: MinutesDoc): { text: string; topic: string; area: Area }[] {
  return m.items
    .filter((it) => it.conclusion.trim().length > 0)
    .map((it) => ({ text: it.conclusion, topic: it.title, area: it.area }))
}

/**
 * 회의록을 **네 칸으로 줄여** 준다 — 실시간 회의 화면이 훑어볼 때 쓴다.
 *
 * 회의 직후에는 양식을 다 채우기 전이라 **「무슨 얘기였고, 뭘 정했고, 뭘 해야 하나」**
 * 만 빠르게 보고 싶다. 그 화면을 위해 양식을 따로 한 벌 더 만들지 않고 여기서 뽑는다 —
 * 두 벌로 나누던 옛 구조에서 한쪽만 고쳐 놓아 「요약」이 늘 비어 있던 적이 있다.
 */
export function draftView(m: MinutesDoc): {
  summary: string[]
  decisions: string[]
  followUps: string[]
  checks: string[]
} {
  return {
    summary: m.agenda.length > 0 ? m.agenda : m.items.map((it) => it.title).filter(Boolean),
    decisions: decisionsOf(m).map((d) => d.text),
    followUps: m.actions.map((a) => a.text).filter(Boolean),
    checks: m.checks,
  }
}

/** 회의록에 적힌 것이 하나라도 있나 */
export function hasContent(m: MinutesDoc): boolean {
  return (
    m.purpose.length > 0 ||
    m.agenda.length > 0 ||
    m.items.length > 0 ||
    m.actions.length > 0 ||
    m.pending.length > 0 ||
    m.nextChecks.length > 0 ||
    m.confirms.length > 0 ||
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
  head: {
    title: string
    metOn: string
    place?: string | null
    attendees?: string | null
    writer?: string | null
  },
): string {
  const out: string[] = []
  if (m.orgLine) out.push(m.orgLine)
  out.push('# 회의록', '')

  out.push('## 1. 기본정보')
  out.push(`회의명 : ${head.title}`)
  out.push(`일 시 : ${head.metOn}`)
  if (head.place) out.push(`장 소 : ${head.place}`)
  if (head.attendees) out.push(`참 석 : ${head.attendees}`)
  if (head.writer) out.push(`작성자 : ${head.writer}`)
  if (m.writtenOn) out.push(`작성일자 : ${m.writtenOn}`)
  if (m.agenda.length > 0) {
    out.push(`안 건 : ${m.agenda.map((a, i) => `${i + 1}. ${a}`).join('   ')}`)
  }

  if (m.purpose.length > 0) {
    out.push('', '## 2. 회의 목적', ...m.purpose.map((p) => `- ${p}`))
  }

  const tag = (area: string) => (area ? ` [${area}]` : '')

  if (m.items.length > 0) {
    out.push('', '## 3. 안건별 논의')
    m.items.forEach((it, i) => {
      out.push('', `안건${i + 1}. ${it.title}${tag(it.area)}`)
      if (it.situation) out.push('■ 현재상황', it.situation)
      if (it.discussion) out.push('■ 논의내용', it.discussion)
      if (it.conclusion) out.push('■ 결론', it.conclusion)
      if (it.action) out.push('■ 조치사항', it.action)
    })
  }

  if (m.actions.length > 0) {
    out.push('', '## 4. 조치사항 정리')
    m.actions.forEach((a, i) => {
      const cols = [
        `${i + 1}. ${a.text}${tag(a.area)}`,
        `담당 ${a.owner || '미정'}`,
        `마감 ${a.due || '미정'}`,
      ]
      if (a.note) cols.push(`비고 ${a.note}`)
      out.push(cols.join(' | '))
    })
  }

  if (m.pending.length > 0) {
    out.push('', '## 5. 미결 · 추가 확인사항', ...m.pending.map((p) => `- ${p}`))
  }

  if (m.nextChecks.length > 0 || m.next.date || m.next.agenda) {
    out.push('', '## 6. 다음 회의')
    if (m.next.date) out.push(`예정일 : ${m.next.date}`)
    if (m.next.agenda) out.push(`주요 안건 : ${m.next.agenda}`)
    if (m.nextChecks.length > 0) {
      out.push('주요 점검 사항', ...m.nextChecks.map((c) => `- ${c}`))
    }
  }

  if (m.confirms.length > 0) {
    out.push('', '## 참석자 확인', CONFIRM_STATEMENT)
    out.push(m.confirms.map((c) => `${c.name}(${c.confirmed ? '확인' : '미확인'})`).join(', '))
    out.push(CONFIRM_NOTICE)
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
 * · **같은 안건이 두 구간에 걸치면 칸끼리 이어 붙인다.** 안건은 구간 경계에서
 *   잘리는 일이 잦은데, 앞 구간의 「현재상황」과 뒤 구간의 「결론」을 각각 버리면
 *   그 안건만 반쪽이 된다
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

  /*
    같은 안건 제목이면 칸끼리 이어 붙인다.
    제목이 비어 있으면 합치지 않는다 — 빈 제목끼리 묶으면 서로 다른 안건이 뭉개진다.
  */
  const items: AgendaItem[] = []
  for (const it of all('items') as AgendaItem[]) {
    const key = it.title.replace(/\s+/g, '').toLowerCase()
    const found = key ? items.find((x) => x.title.replace(/\s+/g, '').toLowerCase() === key) : null
    if (!found) {
      items.push({ ...it })
      continue
    }
    const join = (a: string, b: string) => (!b || a.includes(b) ? a : a ? `${a} / ${b}` : b)
    found.situation = join(found.situation, it.situation)
    found.discussion = join(found.discussion, it.discussion)
    found.conclusion = join(found.conclusion, it.conclusion)
    found.action = join(found.action, it.action)
    found.area = found.area || it.area
  }

  // 「다음 회의」는 뒤에서부터 찾는다 — 회의 끝에 정해지는 것이다
  const next =
    [...parts].reverse().find((p) => p.next.date || p.next.agenda)?.next ?? { date: '', agenda: '' }

  return {
    orgLine: parts.find((p) => p.orgLine)?.orgLine ?? '',
    writtenOn: parts.find((p) => p.writtenOn)?.writtenOn ?? '',
    // 「목적」은 첫 구간이 가장 정확하다. 뒤 구간은 앞을 못 봤다
    purpose: uniq(parts.find((p) => p.purpose.length > 0)?.purpose ?? [], (s: string) => s),
    agenda: uniq(all('agenda') as string[], (s) => s),
    items,
    actions: uniq(all('actions') as ActionItem[], (a) => a.text),
    pending: uniq(all('pending') as string[], (s) => s),
    nextChecks: uniq(all('nextChecks') as string[], (s) => s),
    next,
    confirms: uniq(all('confirms') as Attendee[], (c) => c.name),
    checks: uniq(all('checks') as string[], (s) => s),
  }
}

/**
 * 참석자 적은 것을 확인란 줄로 바꾼다.
 *
 * 이미 확인을 받아 둔 사람은 **그 표시를 지키고**, 새로 들어온 이름만 미확인으로 붙인다.
 * 참석자 칸을 한 글자 고쳤다고 받아 둔 확인이 날아가면 안 된다.
 */
export function attendeesToConfirms(
  attendees: string | null | undefined,
  prev: readonly Attendee[] = [],
): Attendee[] {
  const names = (attendees ?? '')
    .split(/[,·\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: Attendee[] = []
  for (const n of names) {
    if (out.some((o) => o.name === n)) continue
    out.push({ name: n, confirmed: prev.find((p) => p.name === n)?.confirmed ?? false })
  }
  return out
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
