/**
 * AI 공급자 어댑터 — 경계면.
 *
 * 화면 코드도, 이 함수의 본체도 **어느 회사 AI 인지 모른다.**
 * 공급자를 바꿀 때 고치는 것은 provider/ 아래 파일 하나와 환경변수뿐이다.
 *
 * 원래 Claude 를 쓰려 했으나 호출이 반복 실패해 OpenAI 로 바꿨다
 * (설계서 §14 OQ-11 — 원인 미규명). 그 일이 또 날 수 있으므로 한 겹 둔다.
 */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 웹에서 찾아본 자리. 링크가 없으면 사용자가 확인할 방법이 없다 */
export type WebSource = {
  title: string
  url: string
}

export type ChatResult = {
  text: string
  tokensIn: number | null
  tokensOut: number | null
  model: string
  /** 웹 검색을 켰을 때 실제로 본 자리들 */
  webSources: WebSource[]
}

export type ChatOptions = {
  light?: boolean
  maxTokens?: number
  /**
   * 웹에서도 찾아볼까.
   *
   * ⚠️ 켜면 **질문 글이 밖으로 나간다.** 그래서 기본이 꺼짐이고
   * 사용자가 그때그때 켠다 — 「밖으로 나가는 것은 사용자가 누른 것뿐」(CLAUDE.md).
   */
  webSearch?: boolean
}

export interface Provider {
  /** 공급자 이름. 화면에 보여주지 않고 기록·오류 메시지에만 쓴다 */
  readonly name: string
  chat(messages: ChatMessage[], opts?: ChatOptions): Promise<ChatResult>
}
