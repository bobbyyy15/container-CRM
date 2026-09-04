import React from 'react'
import { Ic, I } from '../ui/icons'
import { NAV } from '../../app/navigation'
import type { Screen } from '../../app/types'

const Sidebar = ({ active, onNav, expanded, pinned, onTogglePin, role }: {
  active: Screen; onNav: (s: Screen) => void; expanded: boolean;
  pinned: boolean; onTogglePin: () => void;
  role?: string;
}) => {
  // Administration (User Management) and individual items with a `roles` allowlist (e.g.
  // Inquiry Validation, Procurement-only) are access-controlled; everything else is visible
  // to any authenticated role, see docs/CUSTOMERS_MODULE.md §5 for why that's a known,
  // not-yet-addressed gap for the rest of the app.
  const visibleGroups = NAV
    .filter(group => group.label !== 'Administration' || role === 'admin')
    .map(group => ({ ...group, items: group.items.filter(item => !item.roles || (role && item.roles.includes(role))) }))
    .filter(group => group.items.length > 0)

  return (
    <aside className={`sidebar${expanded ? ' expanded' : ''}`}>
      {/* Logo */}
      <div className="sb-logo">
        <div className="sb-logo-icon">
          <Ic n={I.container} size={17} style={{ color: 'white' }} />
        </div>
        {expanded && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'white', letterSpacing: '-0.02em', lineHeight: 1.2 }}>ContainerCRM</div>
            <div style={{ fontSize: 10, color: 'var(--sb-text)', fontWeight: 500 }}>Enterprise</div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="sb-nav">
        {visibleGroups.map(group => (
          <div key={group.label}>
            <div className="sb-group-label">{group.label}</div>
            {group.items.map(item => (
              <button
                type="button"
                key={item.id}
                className={`sb-item${active === item.id ? ' active' : ''}`}
                onClick={() => onNav(item.id)}
                data-tooltip={item.label}
                title={expanded ? undefined : item.label}
                aria-current={active === item.id ? 'page' : undefined}
                aria-label={item.label}
              >
                <div className="sb-icon-wrap">
                  <Ic n={item.icon} size={16} style={{ color: active === item.id ? 'white' : 'var(--sb-icon)' }} />
                </div>
                <span className="sb-item-label">{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="sb-bottom">
        <button
          type="button"
          className="sb-item"
          data-tooltip={pinned ? 'Collapse Sidebar' : 'Pin Sidebar Open'}
          title={pinned ? 'Collapse Sidebar' : 'Pin Sidebar Open'}
          aria-label={pinned ? 'Collapse sidebar' : 'Pin sidebar open'}
          aria-pressed={pinned}
          onClick={onTogglePin}
        >
          <div className="sb-icon-wrap">
            <Ic n={pinned ? I.chevLeft : I.chevRight} size={16} style={{ color: 'var(--sb-icon)' }} />
          </div>
          <span className="sb-item-label">{pinned ? 'Collapse' : 'Pin Open'}</span>
        </button>
      </div>
    </aside>
  )
}


export default Sidebar
