import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Markdown } from '../Markdown'

/**
 * 클로니 답을 읽기 좋게 그리는 부분.
 *
 * 실제로 클로니가 돌려준 글을 그대로 가져다 시험한다 —
 * 만들어 낸 예시로 시험하면 진짜 답의 모양을 놓친다.
 */
describe('Markdown', () => {
  it('별표를 굵은 글씨로 바꾼다 — 그대로 두면 별표가 화면에 보인다', () => {
    render(<Markdown text="경로는 **나의문서함**입니다." />)
    const bold = screen.getByText('나의문서함')
    expect(bold.tagName).toBe('STRONG')
  })

  it('링크를 눌리게 만든다 — 출처를 확인할 수 없으면 근거를 붙인 의미가 없다', () => {
    render(<Markdown text="([ecfs.scourt.go.kr](https://ecfs.scourt.go.kr/psp/help/m.pdf))" />)
    const a = screen.getByRole('link', { name: 'ecfs.scourt.go.kr' })
    expect(a).toHaveAttribute('href', 'https://ecfs.scourt.go.kr/psp/help/m.pdf')
    expect(a).toHaveAttribute('target', '_blank')
    // noreferrer 를 빼면 우리 주소가 그쪽에 넘어간다
    expect(a).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('맨 주소는 도메인만 보여 준다 — 긴 주소가 화면을 밀어낸다', () => {
    render(<Markdown text="https://www.slb.scourt.go.kr/rel/information/min/MinListAction.work?gubun=79" />)
    expect(screen.getByRole('link', { name: 'slb.scourt.go.kr' })).toBeInTheDocument()
  })

  it('목록을 줄로 나눈다', () => {
    render(<Markdown text={'- 첫째 항목\n- 둘째 항목'} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('번호 목록은 번호를 살린다', () => {
    const { container } = render(<Markdown text={'1. 먼저\n2. 다음'} />)
    expect(container.querySelector('ol')).not.toBeNull()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('목록 안에서도 굵게와 링크가 산다', () => {
    render(<Markdown text="- 경로는 **나의문서함** ([법원](https://scourt.go.kr))" />)
    expect(screen.getByText('나의문서함').tagName).toBe('STRONG')
    expect(screen.getByRole('link', { name: '법원' })).toBeInTheDocument()
  })

  it('빈 줄로 문단을 나눈다', () => {
    const { container } = render(<Markdown text={'첫 문단입니다.\n\n둘째 문단입니다.'} />)
    expect(container.querySelectorAll('p')).toHaveLength(2)
  })

  it('한 문단 안의 줄바꿈은 이어 붙인다 — 어색하게 끊기지 않게', () => {
    const { container } = render(<Markdown text={'앞줄이고\n뒷줄입니다.'} />)
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.textContent).toBe('앞줄이고 뒷줄입니다.')
  })

  it('제목 표시를 굵은 줄로 바꾼다', () => {
    render(<Markdown text="### 확인할 것" />)
    expect(screen.getByText('확인할 것')).toBeInTheDocument()
  })

  it('구분선을 그린다', () => {
    const { container } = render(<Markdown text={'앞\n\n---\n\n뒤'} />)
    expect(container.querySelector('hr')).not.toBeNull()
  })

  it('표시가 하나도 없는 글은 그대로 나온다', () => {
    const { container } = render(<Markdown text="그냥 한 줄짜리 답입니다." />)
    expect(container.textContent).toBe('그냥 한 줄짜리 답입니다.')
  })

  it('HTML 을 글자로만 다룬다 — AI 답이 실행 코드가 되면 안 된다', () => {
    const { container } = render(<Markdown text='<img src=x onerror="alert(1)">' />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain('<img')
  })

  it('빈 글은 아무것도 그리지 않는다', () => {
    const { container } = render(<Markdown text="" />)
    expect(container.textContent).toBe('')
  })
})
