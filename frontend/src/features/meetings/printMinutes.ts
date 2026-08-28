import { CONFIRM_NOTICE, CONFIRM_STATEMENT } from '../../domain/minutes'
import type { MinutesDoc } from '../../domain/minutes'
import { timeRange } from '../../domain/transcript'

/**
 * 회의록을 **PDF로 내려받게** 한다. 회사에서 쓰는 서식 그대로 그린다.
 *
 * ── 왜 인쇄 창을 여나 ────────────────────────────────────
 * PDF 를 만드는 라이브러리를 넣으면 **한글 글꼴을 같이 담아야 한다.** 그것만 몇 MB 라
 * 화면 여는 속도가 눈에 띄게 느려진다. 회의록 하나 뽑자고 치를 값이 아니다.
 *
 * 브라우저에는 이미 **「PDF 로 저장」이 들어 있다.** 인쇄 창을 열어 주면
 * 사용자가 그 자리에서 PDF 로 저장한다. 한글도 그대로 나온다 — 브라우저가 쓰던 글꼴이니까.
 *
 * ⚠️ 화면 모양을 그대로 인쇄하지 않는다. 화면은 **고치는 자리**라 입력칸·버튼이 많은데,
 *    그게 종이에 찍히면 회의록이 아니라 화면 사진이 된다. **인쇄용 문서를 따로 그린다.**
 */

export type MinutesHead = {
  title: string
  metOn: string
  place?: string | null
  attendees?: string | null
  writer?: string | null
  durationSec?: number | null
  /** 회의 시작·종료 벽시계 시각. 서식 기본정보의 「시간」 칸 */
  startedAt?: string | null
  endedAt?: string | null
}

/** 인쇄용 문서를 그린다 */
function html(m: MinutesDoc, head: MinutesHead): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  /** 줄바꿈을 살려서 찍는다 — 논의내용은 여러 줄로 적는 칸이다 */
  const multi = (s: string) => esc(s).replace(/\n/g, '<br />')

  const rows = (arr: string[]) =>
    arr.length ? arr.map((x) => `<li>${esc(x)}</li>`).join('') : '<li class="none">없음</li>'

  const when = [
    esc(head.metOn),
    timeRange(head.startedAt, head.endedAt) ? esc(timeRange(head.startedAt, head.endedAt)) : '',
    head.durationSec ? `(${Math.round(head.durationSec / 60)}분)` : '',
  ]
    .filter(Boolean)
    .join(' ')

  /*
    안건 목록은 서식에서 기본정보 표의 한 칸에 「1. …  2. …」로 들어간다.
    줄을 나누지 않고 이어 붙이는 것이 원본 모양이다.
  */
  const agendaLine =
    m.agenda.length > 0
      ? m.agenda.map((a, i) => `${i + 1}. ${esc(a)}`).join('&nbsp;&nbsp; ')
      : '<span class="none">없음</span>'

  const block = (label: string, text: string) =>
    text.trim() ? `<p class="blk"><span class="blk-h">■ ${label}</span><br />${multi(text)}</p>` : ''

  const items = m.items
    .map(
      (it, i) => `<section class="item">
        <h3>안건${i + 1}. ${esc(it.title)}${it.area ? ` <span class="area">[${esc(it.area)}]</span>` : ''}</h3>
        ${block('현재상황', it.situation)}
        ${block('논의내용', it.discussion)}
        ${block('결론', it.conclusion)}
        ${block('조치사항', it.action)}
      </section>`,
    )
    .join('')

  const actionRows = m.actions
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

  /*
    확인란은 「이름(미확인)」 형태로 늘어놓는다. 확인을 받은 사람만 굵게 표시한다 —
    종이에서 **아직 확인 안 된 사람이 누구인지**가 한눈에 보여야 한다.
  */
  const confirmLine = m.confirms
    .map((c) =>
      c.confirmed
        ? `<strong>${esc(c.name)}(확인)</strong>`
        : `${esc(c.name)}<span class="none">(미확인)</span>`,
    )
    .join(', ')

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8" />
<title>${esc(head.title)} 회의록</title>
<style>
  /* 종이에 맞춘 서식. 화면 서식(Tailwind)과 섞지 않는다 */
  @page { size: A4; margin: 18mm 16mm; }
  body { font-family: -apple-system, "Malgun Gothic", "맑은 고딕", sans-serif;
         color: #1d1d1f; font-size: 10.5pt; line-height: 1.55; }
  .org { text-align: center; color: #666; font-size: 9.5pt; margin: 0 0 2px; }
  h1 { font-size: 20pt; margin: 0 0 16px; letter-spacing: 8px; text-align: center; }
  h2 { font-size: 12pt; margin: 22px 0 8px; padding-bottom: 4px;
       border-bottom: 1px solid #d0d0d0; }
  h3 { font-size: 11pt; margin: 0 0 6px; }
  ul { margin: 0; padding-left: 18px; }
  li { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { border: 1px solid #d0d0d0; padding: 6px 8px; text-align: left;
           vertical-align: top; word-break: break-word; }
  th { background: #f5f5f7; font-weight: 600; }
  td.c { text-align: center; width: 32px; }
  .info th { width: 78px; white-space: nowrap; }
  .item { margin: 0 0 14px; padding: 10px 12px; border: 1px solid #e2e2e4; }
  .blk { margin: 6px 0 0; }
  .blk-h { font-weight: 600; }
  .area { color: #666; font-weight: 400; font-size: 9.5pt; }
  .none { color: #999; }
  .confirm { margin-top: 8px; padding: 10px 12px; border: 1px solid #d0d0d0; }
  .foot { margin-top: 10px; color: #777; font-size: 9pt; line-height: 1.5; }
  /* 표·안건이 쪽 경계에서 잘리지 않게 */
  tr, li, .item { break-inside: avoid; }
</style></head>
<body>
  ${m.orgLine ? `<p class="org">${esc(m.orgLine)}</p>` : ''}
  <h1>회 의 록</h1>

  <table class="info">
    <tbody>
      <tr>
        <th>일　　시</th><td>${when}</td>
        <th>작 성 자</th><td>${esc(head.writer ?? '') || '<span class="none">—</span>'}</td>
      </tr>
      <tr>
        <th>장　　소</th><td>${esc(head.place ?? '') || '<span class="none">—</span>'}</td>
        <th>작성일자</th><td>${esc(m.writtenOn) || '<span class="none">—</span>'}</td>
      </tr>
      <tr>
        <th>회 의 명</th><td colspan="3">${esc(head.title)}</td>
      </tr>
      <tr>
        <th>참　　석</th><td colspan="3">${esc(head.attendees ?? '') || '<span class="none">—</span>'}</td>
      </tr>
      <tr>
        <th>안　　건</th><td colspan="3">${agendaLine}</td>
      </tr>
    </tbody>
  </table>

  ${m.purpose.length > 0 ? `<h2>회의 목적</h2><ul>${rows(m.purpose)}</ul>` : ''}

  ${items || '<h2>안건별 논의</h2><p class="none">없음</p>'}

  <h2>조치사항 정리</h2>
  ${
    actionRows
      ? `<table>
          <thead><tr><th>No</th><th>조치 내용</th><th>담당</th><th>마감기한</th><th>비고</th></tr></thead>
          <tbody>${actionRows}</tbody>
        </table>`
      : '<p class="none">없음</p>'
  }

  ${m.pending.length > 0 ? `<h2>미결 · 추가 확인사항</h2><ul>${rows(m.pending)}</ul>` : ''}

  ${
    m.nextChecks.length > 0 || m.next.date || m.next.agenda
      ? `<h2>다음 회의 주요 점검 사항</h2>
         ${
           m.next.date || m.next.agenda
             ? `<p>예정일 ${esc(m.next.date) || '미정'}${
                 m.next.agenda ? ` · 주요 안건 ${esc(m.next.agenda)}` : ''
               }</p>`
             : ''
         }
         ${m.nextChecks.length > 0 ? `<ul>${rows(m.nextChecks)}</ul>` : ''}`
      : ''
  }

  ${
    m.confirms.length > 0
      ? `<h2>참석자 확인</h2>
         <div class="confirm">
           <p>${esc(CONFIRM_STATEMENT)}</p>
           <p>${confirmLine}</p>
         </div>
         <p class="foot">${esc(CONFIRM_NOTICE)}</p>`
      : ''
  }

  ${
    m.checks.length > 0
      ? `<h2>확인 필요</h2><ul>${rows(m.checks)}</ul>
         <p class="foot">위 항목은 자동 받아쓰기에서 잘못 들렸을 수 있는 대목입니다. 확인 후 확정하세요.</p>`
      : ''
  }
</body></html>`
}

/**
 * 인쇄 창을 연다. 사용자가 거기서 「PDF 로 저장」을 고른다.
 *
 * 새 창이 막혀 있으면(팝업 차단) 알려 준다 — 조용히 아무 일도 안 일어나면
 * 「눌렀는데 안 된다」가 된다.
 */
export function printMinutes(m: MinutesDoc, head: MinutesHead): boolean {
  const win = window.open('', '_blank', 'width=900,height=1000')
  if (!win) return false

  win.document.write(html(m, head))
  win.document.close()
  // 글꼴·서식이 자리 잡은 뒤에 인쇄 창을 띄운다
  win.onload = () => {
    win.focus()
    win.print()
  }
  setTimeout(() => {
    try {
      win.focus()
      win.print()
    } catch {
      // 이미 떴으면 무시
    }
  }, 400)
  return true
}
