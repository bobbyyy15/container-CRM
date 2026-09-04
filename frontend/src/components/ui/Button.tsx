import React from 'react'

const Btn = ({ children, variant = 'secondary', sm, className = '', onClick, style, disabled, title, ariaLabel }: {
  children: React.ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  sm?: boolean; className?: string; onClick?: React.MouseEventHandler<HTMLButtonElement>; style?: React.CSSProperties
  disabled?: boolean; title?: string; ariaLabel?: string
}) => (
  <button
    className={`btn btn-${variant}${sm ? ' btn-sm' : ''} ${className}`}
    onClick={onClick} style={style} disabled={disabled} title={title}
    // Icon-only buttons have no text node, so without this a screen reader announces
    // just "button". Falls back to title so a tooltip doubles as the accessible name.
    aria-label={ariaLabel ?? title}
  >{children}</button>
)

export default Btn
