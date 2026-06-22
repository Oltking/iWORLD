/** Shimmer placeholders — calmer than "one moment…" while data loads. */
export function SkeletonRow() {
  return (
    <div className="sk-row">
      <div className="sk sk-orb" />
      <div className="sk-lines">
        <div className="sk sk-line" style={{ width: '55%' }} />
        <div className="sk sk-line" style={{ width: '78%' }} />
        <div className="sk sk-line" style={{ width: '35%' }} />
      </div>
      <div className="sk sk-pill" />
    </div>
  )
}

export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <div className="listings">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}
