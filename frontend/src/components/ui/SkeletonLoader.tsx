import React from 'react'

export interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: string | number
  className?: string
  style?: React.CSSProperties
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 16,
  borderRadius,
  className = '',
  style = {},
}) => {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius: borderRadius ?? 'var(--r-xs, 6px)',
        ...style,
      }}
    />
  )
}

export interface TableSkeletonProps {
  rows?: number
  cols?: number
  asTable?: boolean
  columnWidths?: (string | number)[]
  rowHeight?: number
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({
  rows = 6,
  cols = 6,
  asTable = true,
  columnWidths = [],
  rowHeight = 20,
}) => {
  const rowList = Array.from({ length: rows })
  const colList = Array.from({ length: cols })

  if (asTable) {
    return (
      <tbody data-testid="table-skeleton">
        {rowList.map((_, ri) => (
          <tr key={ri} style={{ borderBottom: '1px solid var(--border-s)' }}>
            {colList.map((_, ci) => (
              <td
                key={ci}
                style={{
                  padding: '12px 14px',
                  width: columnWidths[ci] || undefined,
                }}
              >
                <Skeleton
                  height={rowHeight}
                  width={ci === 0 ? '40%' : ci === cols - 1 ? '50%' : '75%'}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    )
  }

  // Div-based grid (e.g. ProspectSheet spreadsheet)
  return (
    <div data-testid="grid-skeleton" style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      {rowList.map((_, ri) => (
        <div
          key={ri}
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 38,
            borderBottom: '1px solid var(--border-s)',
            padding: '0 8px',
            gap: 12,
            background: ri % 2 === 1 ? 'var(--s2)' : 'var(--ws)',
          }}
        >
          {colList.map((_, ci) => (
            <div
              key={ci}
              style={{
                width: columnWidths[ci] || 150,
                minWidth: columnWidths[ci] || 150,
                flexShrink: 0,
              }}
            >
              <Skeleton height={14} width={ci === 0 ? '30%' : '80%'} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

export const CardSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`, gap: 14 }}>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          style={{
            background: 'var(--ws)',
            border: '1px solid var(--border-s)',
            borderRadius: 'var(--r-md, 10px)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <Skeleton width="40%" height={14} />
          <Skeleton width="65%" height={26} />
          <Skeleton width="50%" height={12} />
        </div>
      ))}
    </div>
  )
}

export const PageSkeleton: React.FC = () => {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header bar skeleton */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skeleton width={180} height={24} />
          <Skeleton width={260} height={14} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Skeleton width={90} height={32} />
          <Skeleton width={110} height={32} />
        </div>
      </div>

      {/* Summary cards skeleton */}
      <CardSkeleton count={4} />

      {/* Table skeleton container */}
      <div
        style={{
          background: 'var(--ws)',
          border: '1px solid var(--border-s)',
          borderRadius: 'var(--r-md, 10px)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <Skeleton width={220} height={30} />
          <Skeleton width={140} height={30} />
        </div>
        <TableSkeleton rows={8} cols={5} asTable={false} />
      </div>
    </div>
  )
}

export default Skeleton
