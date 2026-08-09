import Stage from '../components/Stage'

export default function PlanPage() {
  return (
    <Stage
      stage={7}
      title="계획"
      description="주 단위·월 단위로 미리 배치하고 되돌아보는 곳입니다."
      items={[
        { text: '주간 — 이번 주 목표, 요일별 배치, 회고' },
        { text: '월간 — 이달 목표, 주차별 덩어리, 고정 일정' },
        { text: '마일스톤 — 여러 지시사항을 아우르는 관문' },
      ]}
    />
  )
}
