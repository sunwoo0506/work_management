const base =
  'w-full text-body bg-canvas border border-hairline rounded-md px-3 py-2 outline-none focus:border-action-focus'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="block text-caption text-ink-soft mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-caption text-ink-mute mt-1">{hint}</span>}
    </label>
  )
}

// React 19 부터 함수 컴포넌트도 ref 를 그냥 prop 으로 받는다.
// ComponentProps 를 쓰면 ref 가 타입에 포함돼서 forwardRef 로 감쌀 필요가 없다.
export function TextInput(props: React.ComponentProps<'input'>) {
  return <input {...props} className={`${base} ${props.className ?? ''}`} />
}

export function TextArea(props: React.ComponentProps<'textarea'>) {
  return <textarea {...props} className={`${base} ${props.className ?? ''}`} />
}

export function Select(props: React.ComponentProps<'select'>) {
  return <select {...props} className={`${base} ${props.className ?? ''}`} />
}

export function PillButton({
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' }) {
  const style =
    variant === 'primary'
      ? 'bg-action text-white font-semibold'
      : 'bg-canvas text-ink-soft border border-hairline'
  return (
    <button
      {...props}
      className={`rounded-full px-[22px] py-[11px] text-body disabled:opacity-40 ${style} ${props.className ?? ''}`}
    />
  )
}
