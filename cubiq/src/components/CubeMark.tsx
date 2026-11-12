export function CubeMark({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="m16 3 12 7v13l-12 7-12-7V10L16 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="m4 10 12 7 12-7M16 17v13M10 6.5l12 7v13M22 6.5l-12 7v13M4 16.5l12 7 12-7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  )
}
