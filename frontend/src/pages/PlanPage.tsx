import Stage from '../components/Stage'

export default function PlanPage() {
  return (
    <Stage
      stage={7}
      title="계획"
      items={[
        '주간 — 이번 주 목표, 요일별 배치, 회고',
        '월간 — 이달 목표, 주차별 덩어리, 고정 일정',
        '마일스톤 — 여러 지시사항을 아우르는 관문',
      ]}
    />
  )
}
