import { describe, expect, it } from 'vitest'
import { formatSize, hwpxSectionToText } from '../extract'

/**
 * 한글(.hwpx) 본문 XML 읽기.
 *
 * 실제 한글 문서에서 뽑은 모양을 줄여 쓴 것이다.
 * 글자는 <hp:t> 안에, 문단은 <hp:p> 로 나뉜다.
 */
describe('hwpxSectionToText', () => {
  it('문단마다 줄을 나눈다 — 안 나누면 표가 한 줄로 뭉개진다', () => {
    const xml = `
      <hs:sec><hp:p id="1"><hp:run><hp:t>첫째 문단</hp:t></hp:run></hp:p>
      <hp:p id="2"><hp:run><hp:t>둘째 문단</hp:t></hp:run></hp:p></hs:sec>`
    expect(hwpxSectionToText(xml)).toBe('첫째 문단\n둘째 문단')
  })

  it('한 문단이 여러 조각으로 나뉘어 있으면 붙인다 — 글꼴이 바뀌면 조각이 갈린다', () => {
    const xml = `<hp:p><hp:run><hp:t>회생계획안 </hp:t></hp:run><hp:run><hp:t>제출 기한</hp:t></hp:run></hp:p>`
    expect(hwpxSectionToText(xml)).toBe('회생계획안 제출 기한')
  })

  it('특수문자를 사람이 읽는 글자로 되돌린다', () => {
    const xml = `<hp:p><hp:t>가&amp;나 &lt;조건&gt; &quot;확정&quot;</hp:t></hp:p>`
    expect(hwpxSectionToText(xml)).toBe('가&나 <조건> "확정"')
  })

  it('&amp;lt; 는 &lt; 로 되돌린다 — 순서를 틀리면 태그로 잘못 바뀐다', () => {
    const xml = `<hp:p><hp:t>&amp;lt;표시&amp;gt;</hp:t></hp:p>`
    expect(hwpxSectionToText(xml)).toBe('&lt;표시&gt;')
  })

  it('숫자 표기 문자도 되돌린다', () => {
    const xml = `<hp:p><hp:t>&#54620;&#44544;</hp:t></hp:p>`
    expect(hwpxSectionToText(xml)).toBe('한글')
  })

  it('<hp:t> 에 속성이 붙어 있어도 읽는다', () => {
    const xml = `<hp:p><hp:t charPrIDRef="3">단가표</hp:t></hp:p>`
    expect(hwpxSectionToText(xml)).toBe('단가표')
  })

  it('빈 문단은 버린다 — 빈 줄만 잔뜩 남으면 AI 가 그걸 글자로 센다', () => {
    const xml = `<hp:p><hp:t></hp:t></hp:p><hp:p><hp:t>내용</hp:t></hp:p><hp:p><hp:t>   </hp:t></hp:p>`
    expect(hwpxSectionToText(xml)).toBe('내용')
  })

  it('글자가 하나도 없으면 빈 문자열 — 부르는 쪽이 「읽을 게 없다」고 판단한다', () => {
    expect(hwpxSectionToText('<hs:sec></hs:sec>')).toBe('')
  })
})

describe('formatSize', () => {
  it('단위를 사람이 읽게 바꾼다', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(2048)).toBe('2 KB')
    expect(formatSize(3_145_728)).toBe('3.0 MB')
  })

  it('크기를 모르면 아무것도 안 쓴다', () => {
    expect(formatSize(null)).toBe('')
  })
})
