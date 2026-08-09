import Stage from '../components/Stage'

export default function TodayPage() {
  return (
    <Stage
      stage={4}
      title="오늘"
      items={[
        '어제 이야기 — 전날 일지의 이슈, 전날 완료한 업무, 업무로 올리지 않은 메모',
        '오늘 할 일 — 어제 일지에서 체크한 것 + 오늘 기한 도래 + 오늘 하기로 찍은 것',
        '진행 중 업무 — 지시사항 단위 묶음. 타임라인 뷰',
        '인박스 — 분류 전 메모 (지금은 「업무」 탭 아래에 있습니다)',
        '우측 — 이번 주 일정, 절차 대기',
      ]}
    />
  )
}
