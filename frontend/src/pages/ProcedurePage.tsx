import Stage from '../components/Stage'

export default function ProcedurePage() {
  return (
    <Stage
      stage={2}
      title="절차"
      items={[
        '절차 라이브러리 — 이런 일은 이렇게 한다 (트리거·입력자료·단계·판단기준·산출물)',
        '실행이력 — 이번 회차에 실제로 어떻게 했나',
        '반복업무는 여기에 흡수됩니다. 주기가 정해진 절차일 뿐입니다',
        '⚠️ 예외 확인함 — 5단계에서 붙습니다',
        'AI 업무 비서와 문서 초안 — 3단계에서 붙습니다',
      ]}
    />
  )
}
