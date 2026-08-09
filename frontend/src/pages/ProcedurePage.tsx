import Stage from '../components/Stage'

export default function ProcedurePage() {
  return (
    <Stage
      stage={2}
      title="절차"
      description="이런 일은 이렇게 한다. 이 제품이 남기려는 것의 핵심입니다."
      items={[
        { text: '절차 라이브러리 — 트리거 · 입력자료 · 단계 · 판단기준 · 산출물', stage: 2 },
        { text: '실행이력 — 이번 회차에 실제로 어떻게 했나', stage: 2 },
        { text: '반복업무는 여기에 흡수됩니다. 주기가 정해진 절차일 뿐입니다', stage: 2 },
        { text: 'AI 업무 비서 — 일하면서 물어보면 대화에서 절차가 자랍니다', stage: 3 },
        { text: '문서 초안 — 공지 · 공문 · 행정 신고 서류', stage: 3 },
        { text: '⚠️ 예외 확인함 — 절차대로 안 된 것을 툴이 찾아 보여줍니다', stage: 5 },
      ]}
    />
  )
}
