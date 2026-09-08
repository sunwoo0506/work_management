import { CONFIRM_NOTICE, CONFIRM_STATEMENT } from '../../domain/minutes'
import type { MinutesDoc } from '../../domain/minutes'
import { timeRange } from '../../domain/transcript'

/**
 * 회의록을 **워드 파일**로 내려받는다.
 *
 * ── 왜 필요한가 (2026-09-08) ─────────────────────────────
 * 회의록은 **밖으로 나가는 문서**다. 대표이사에게 돌리고 참석자 확인을 받는다.
 * 그런데 내보낼 수 있는 것이 마크다운(.md)과 인쇄(PDF)뿐이었다 —
 * .md 는 워드에서 안 열리고, PDF 는 **받은 사람이 고칠 수 없다.**
 * 회의록은 이견을 받아 고치는 문서라 그게 문제가 된다.
 *
 * ── ★ 왜 라이브러리를 안 쓰나 ────────────────────────────
 * 진짜 .docx 는 압축된 XML 묶음이라 만들려면 라이브러리가 필요하다.
 * 그런데 **워드는 HTML 로 된 문서도 그대로 연다.** 제목·표·굵기가 다 살아 있고,
 * 열어서 고친 뒤 「다른 이름으로 저장」하면 진짜 .docx 가 된다.
 *
 * 라이브러리를 하나 더 얹으면 화면이 그만큼 무거워진다. 이미 500KB 경고가
 * 뜨는 상태다. **얻는 것에 비해 치르는 값이 크다.**
 *
 * ⚠️ 그래서 확장자가 `.docx` 가 아니라 `.doc` 다. 워드가 열 때
 *    「형식이 다르다」고 한 번 물을 수 있는데, 열면 정상이다.
 *
 * ── 서식은 인쇄본과 같은 뼈대다 ──────────────────────────
 * 기본정보 표 → 안건별 → 조치사항 표 → 미결 → 다음 회의 → 참석자 확인란.
 * 회사에서 실제로 쓰는 서식이다 (설계서 §5.8).
 */

const esc = (s: string) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/**
 * 세로줄로 나뉜 줄들을 **진짜 표**로 바꾼다.
 *
 * ── 왜 이게 필요한가 ─────────────────────────────────────
 * 논의내용에 「품목 | 단가 | 산출근거」 같은 표가 들어온다(2026-09-08 부터).
 * 그대로 내보내면 워드에서 **세로줄이 그냥 글자로** 보인다. 실무 회의록은
 * 그 자리가 진짜 표다.
 *
 * **연속한 세로줄 줄만** 표로 묶는다. 한 줄짜리는 표로 만들지 않는다 —
 * 「A는 B다 | 확인 필요」 같은 문장이 표가 되면 오히려 읽기 나쁘다.
 */
function block(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const out: string[] = []
  let table: string[][] = []

  const flush = () => {
    if (table.length === 0) return
    if (table.length === 1) {
      // 한 줄뿐이면 표가 아니다. 원래 글자대로 되돌린다
      out.push(`<p>${esc(table[0].join(' | '))}</p>`)
    } else {
      const rows = table
        .map((cells) => `<tr>${cells.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`)
        .join('')
      out.push(`<table class="grid">${rows}</table>`)
    }
    table = []
  }

  for (const line of lines) {
    if (line.includes('|')) {
      table.push(line.split('|').map((c) => c.trim()))
    } else {
      flush()
      out.push(`<p>${esc(line)}</p>`)
    }
  }
  flush()
  return out.join('')
}

export type WordHead = {
  title: string
  metOn: string
  place?: string | null
  attendees?: string | null
  writer?: string | null
  startedAt?: string | null
  endedAt?: string | null
}

function buildHtml(m: MinutesDoc, head: WordHead): string {
  const when = [esc(head.metOn), timeRange(head.startedAt, head.endedAt)]
    .filter(Boolean)
    .join('  ')

  const agendaLine =
    m.agenda.length > 0
      ? m.agenda.map((a, i) => `${i + 1}. ${esc(a)}`).join('&nbsp;&nbsp; ')
      : '&mdash;'

  const items = m.items
    .map((it, i) => {
      const part = (label: string, v: string) =>
        v.trim() ? `<p class="sub">■ ${label}</p>${block(v)}` : ''
      return `
        <h3>안건${i + 1}. ${esc(it.title)}${it.area ? ` <span class="area">[${esc(it.area)}]</span>` : ''}</h3>
        ${part('현재상황', it.situation)}
        ${part('논의내용', it.discussion)}
        ${part('결론', it.conclusion)}
        ${part('조치사항', it.action)}`
    })
    .join('')

  const actions = m.actions
    .map(
      (a, i) => `<tr>
        <td class="c">${i + 1}</td>
        <td>${esc(a.text)}${a.area ? ` <span class="area">[${esc(a.area)}]</span>` : ''}</td>
        <td>${esc(a.owner)}</td>
        <td>${esc(a.due)}</td>
        <td>${esc(a.note)}</td>
      </tr>`,
    )
    .join('')

  const list = (rows: string[]) => rows.map((r) => `<p>· ${esc(r)}</p>`).join('')

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${esc(head.title)} 회의록</title>
<style>
  body { font-family: "맑은 고딕", "Malgun Gothic", sans-serif; font-size: 10.5pt; color: #1d1d1f; }
  h1 { font-size: 18pt; text-align: center; letter-spacing: 8pt; margin: 0 0 4pt; }
  .org { text-align: center; color: #6e6e73; font-size: 9pt; margin: 0 0 14pt; }
  h2 { font-size: 12pt; margin: 18pt 0 6pt; border-bottom: 1pt solid #1d1d1f; padding-bottom: 3pt; }
  h3 { font-size: 11pt; margin: 12pt 0 4pt; }
  p { margin: 3pt 0; line-height: 1.5; }
  .sub { font-weight: bold; margin-top: 7pt; }
  .area { color: #6e6e73; font-weight: normal; font-size: 9pt; }
  table { border-collapse: collapse; width: 100%; margin: 5pt 0; }
  td, th { border: 0.5pt solid #c9c9cf; padding: 4pt 6pt; vertical-align: top; font-size: 10pt; }
  th { background: #f2f2f5; font-weight: bold; text-align: left; }
  .info th { width: 70pt; white-space: nowrap; }
  .c { text-align: center; width: 24pt; }
  .foot { color: #6e6e73; font-size: 9pt; margin-top: 10pt; }
</style>
</head>
<body>
  <h1>회 의 록</h1>
  ${m.orgLine ? `<p class="org">${esc(m.orgLine)}</p>` : ''}

  <table class="info">
    <tr><th>회 의 명</th><td colspan="3">${esc(head.title)}</td></tr>
    <tr>
      <th>일　　시</th><td>${when}</td>
      <th>작 성 자</th><td>${esc(head.writer ?? '') || '&mdash;'}</td>
    </tr>
    <tr>
      <th>장　　소</th><td>${esc(head.place ?? '') || '&mdash;'}</td>
      <th>작성일자</th><td>${esc(m.writtenOn) || '&mdash;'}</td>
    </tr>
    <tr><th>참　　석</th><td colspan="3">${esc(head.attendees ?? '') || '&mdash;'}</td></tr>
    <tr><th>안　　건</th><td colspan="3">${agendaLine}</td></tr>
  </table>

  ${m.purpose.length > 0 ? `<h2>회의 목적</h2>${list(m.purpose)}` : ''}

  ${m.items.length > 0 ? `<h2>안건별 논의</h2>${items}` : ''}

  ${
    m.actions.length > 0
      ? `<h2>조치사항</h2>
    <table>
      <tr><th class="c">No</th><th>조치 내용</th><th>담당</th><th>마감기한</th><th>비고</th></tr>
      ${actions}
    </table>`
      : ''
  }

  ${m.pending.length > 0 ? `<h2>미결 · 추가 확인사항</h2>${list(m.pending)}` : ''}

  ${
    m.nextChecks.length > 0 || m.next.date || m.next.agenda
      ? `<h2>다음 회의</h2>
         ${m.next.date ? `<p>예정일 : ${esc(m.next.date)}</p>` : ''}
         ${m.next.agenda ? `<p>주요 안건 : ${esc(m.next.agenda)}</p>` : ''}
         ${m.nextChecks.length > 0 ? `<p class="sub">주요 점검 사항</p>${list(m.nextChecks)}` : ''}`
      : ''
  }

  ${
    m.confirms.length > 0
      ? `<h2>참석자 확인</h2>
         <p>${esc(CONFIRM_STATEMENT)}</p>
         <p>${m.confirms
           .map((c) => `${esc(c.name)}(${c.confirmed ? '확인' : '미확인'})`)
           .join(',&nbsp; ')}</p>
         <p class="foot">${esc(CONFIRM_NOTICE)}</p>`
      : ''
  }

  ${
    m.checks.length > 0
      ? `<h2>확인 필요 (받아쓰기 오인식 의심)</h2>${list(m.checks)}
         <p class="foot">※ 이 칸은 기계가 받아쓴 글에서 흐릿했던 대목입니다. 확인 후 지우고 배포하세요.</p>`
      : ''
  }
</body>
</html>`
}

/** 워드 파일로 내려받는다 */
export function downloadWord(m: MinutesDoc, head: WordHead): void {
  /*
    맨 앞의 ﻿ 는 **한글이 깨지지 않게** 하는 표시다.
    없으면 워드가 파일을 다른 글자표로 읽어 제목부터 깨진다.
  */
  const blob = new Blob(['﻿' + buildHtml(m, head)], {
    type: 'application/msword;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${`${head.metOn}_${head.title}_회의록`.replace(/[\\/:*?"<>|]/g, '_')}.doc`
  a.click()
  URL.revokeObjectURL(url)
}
