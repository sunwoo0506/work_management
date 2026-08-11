import { describe, expect, it } from 'vitest'
import { numberCitations } from '../citations'

const 법원 = { title: '전자소송포털', url: 'https://ecfs.scourt.go.kr/psp/help/manual.pdf' }
const 서울회생 = { title: '서울회생법원', url: 'https://slb.scourt.go.kr/rel/information/min/List.work?gubun=79' }

describe('numberCitations', () => {
  it('같은 자리를 세 번 인용해도 목록은 한 줄 — 실제로 화면이 이랬다', () => {
    const text = [
      '- 경로는 전체송달문서입니다. ([ecfs.scourt.go.kr](https://ecfs.scourt.go.kr/psp/help/manual.pdf))',
      '- 미확인 문서라면 여기서도 됩니다. ([ecfs.scourt.go.kr](https://ecfs.scourt.go.kr/psp/help/manual.pdf))',
      '- 설명서는 2026년 기준입니다. ([ecfs.scourt.go.kr](https://ecfs.scourt.go.kr/psp/help/manual.pdf))',
    ].join('\n')

    const r = numberCitations(text, [법원])
    expect(r.text).toBe(
      '- 경로는 전체송달문서입니다. [1]\n' +
      '- 미확인 문서라면 여기서도 됩니다. [1]\n' +
      '- 설명서는 2026년 기준입니다. [1]',
    )
    expect(r.sources).toHaveLength(1)
  })

  it('출처가 여럿이면 번호가 갈린다', () => {
    const text = '가 ([a](https://ecfs.scourt.go.kr/psp/help/manual.pdf)) 나 ([b](https://slb.scourt.go.kr/rel/information/min/List.work?gubun=79))'
    const r = numberCitations(text, [법원, 서울회생])
    expect(r.text).toContain('[1]')
    expect(r.text).toContain('[2]')
  })

  it('추적 꼬리표가 붙어 있어도 같은 자리로 본다 — 안 그러면 번호가 둘로 갈린다', () => {
    const text = '경로 ([ecfs](https://ecfs.scourt.go.kr/psp/help/manual.pdf?utm_source=openai))'
    const r = numberCitations(text, [법원])
    expect(r.text).toBe('경로 [1]')
  })

  it('끝 슬래시와 www 차이도 같은 자리로 본다', () => {
    const text = '가 ([x](https://www.ecfs.scourt.go.kr/psp/help/manual.pdf/))'
    const r = numberCitations(text, [법원])
    expect(r.text).toBe('가 [1]')
  })

  it('물음표 값이 진짜로 다르면 다른 자리다 — 다른 문서일 수 있다', () => {
    const text = '가 ([x](https://slb.scourt.go.kr/rel/information/min/List.work?gubun=80))'
    const r = numberCitations(text, [서울회생])
    // gubun 이 다르므로 못 찾고 원래 링크가 남는다
    expect(r.text).toContain('https://slb.scourt.go.kr')
  })

  it('목록에 없는 링크는 그대로 둔다 — 함부로 지우면 근거가 사라진다', () => {
    const text = '참고 ([다른곳](https://example.com/a))'
    const r = numberCitations(text, [법원])
    expect(r.text).toContain('example.com')
  })

  it('링크를 걷어낸 자리에 빈 괄호를 안 남긴다', () => {
    const text = '경로입니다. ([ecfs](https://ecfs.scourt.go.kr/psp/help/manual.pdf))'
    const r = numberCitations(text, [법원])
    expect(r.text).not.toContain('()')
  })

  it('문장부호 앞 공백을 안 남긴다', () => {
    const text = '경로 ([ecfs](https://ecfs.scourt.go.kr/psp/help/manual.pdf)) .'
    const r = numberCitations(text, [법원])
    expect(r.text).toBe('경로 [1].')
  })

  it('웹을 안 켠 답은 손대지 않는다', () => {
    const text = '첨부한 공문에 그렇게 되어 있습니다.'
    const r = numberCitations(text, [])
    expect(r.text).toBe(text)
    expect(r.sources).toEqual([])
  })

  it('주소 모양이 아니어도 죽지 않는다', () => {
    const r = numberCitations('가 [x](https://ecfs.scourt.go.kr/psp/help/manual.pdf)', [
      { title: '깨진 주소', url: 'not-a-url' },
      법원,
    ])
    expect(r.text).toBe('가 [2]')
  })
})
