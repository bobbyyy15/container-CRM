import React, { useState, useEffect, useRef, useId } from 'react'

export interface SuggestItem {
  value: string
  label: string
  sublabel?: string
}

export interface SuggestInputProps {
  value: string
  onChange: (value: string) => void
  onSelect?: (item: SuggestItem) => void
  onBlur?: () => void
  options: (SuggestItem | string)[]
  placeholder?: string
  className?: string
  style?: React.CSSProperties
  inputStyle?: React.CSSProperties
  autoFocus?: boolean
  required?: boolean
  disabled?: boolean
  id?: string
  name?: string
  maxSuggestions?: number
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export const SuggestInput: React.FC<SuggestInputProps> = ({
  value,
  onChange,
  onSelect,
  onBlur,
  options,
  placeholder,
  className = 'inp',
  style,
  inputStyle,
  autoFocus,
  required,
  disabled,
  id,
  name,
  maxSuggestions = 50,
  onKeyDown,
}) => {
  const [open, setOpen] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const generatedId = useId()
  const inputId = id || generatedId

  // Normalize options to SuggestItem[]
  const normalizedOptions: SuggestItem[] = React.useMemo(() => {
    return options.map(opt => {
      if (typeof opt === 'string') {
        return { value: opt, label: opt }
      }
      return opt
    })
  }, [options])

  // Filter and sort options based on typed value
  const filteredOptions = React.useMemo(() => {
    const q = (value || '').trim().toLowerCase()
    if (!q) {
      return normalizedOptions.slice(0, maxSuggestions)
    }

    const matches = normalizedOptions.filter(opt => {
      const v = opt.value.toLowerCase()
      const l = opt.label.toLowerCase()
      const s = (opt.sublabel || '').toLowerCase()
      return v.includes(q) || l.includes(q) || s.includes(q)
    })

    // Sort: exact matches first, then prefix matches, then substring matches
    matches.sort((a, b) => {
      const aVal = a.value.toLowerCase()
      const bVal = b.value.toLowerCase()
      const aStarts = aVal.startsWith(q) || a.label.toLowerCase().startsWith(q)
      const bStarts = bVal.startsWith(q) || b.label.toLowerCase().startsWith(q)
      if (aStarts && !bStarts) return -1
      if (!aStarts && bStarts) return 1
      return aVal.localeCompare(bVal)
    })

    return matches.slice(0, maxSuggestions)
  }, [normalizedOptions, value, maxSuggestions])

  // Reposition dropdown based on input rect
  const updatePosition = () => {
    if (!inputRef.current) return
    const rect = inputRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const dropdownHeight = 220
    const placeAbove = spaceBelow < 160 && rect.top > dropdownHeight

    setDropdownPos({
      top: placeAbove ? Math.max(8, rect.top - dropdownHeight - 4) : rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 210),
    })
  }

  // Update position whenever open changes or window resizes/scrolls
  useEffect(() => {
    if (!open) return
    updatePosition()

    const handleScrollOrResize = () => updatePosition()
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (containerRef.current?.contains(target) || listRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  // Scroll active item into view
  useEffect(() => {
    if (highlightIndex >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement
      if (item) {
        item.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [highlightIndex])

  const handleSelect = (item: SuggestItem) => {
    onChange(item.value)
    if (onSelect) onSelect(item)
    setOpen(false)
    setHighlightIndex(-1)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
    setOpen(true)
    setHighlightIndex(0)
  }

  const handleInputFocus = () => {
    setOpen(true)
    setHighlightIndex(-1)
  }

  const handleInputBlur = () => {
    // Delay slightly so item onMouseDown can execute
    setTimeout(() => {
      if (onBlur) onBlur()
    }, 150)
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1))
        return
      }
      if (e.key === 'Enter') {
        if (highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
          e.preventDefault()
          handleSelect(filteredOptions[highlightIndex])
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        return
      }
      if (e.key === 'Tab') {
        if (highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
          handleSelect(filteredOptions[highlightIndex])
        } else {
          setOpen(false)
        }
      }
    }

    if (onKeyDown) onKeyDown(e)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', ...style }}>
      <input
        ref={inputRef}
        id={inputId}
        name={name}
        className={className}
        style={inputStyle}
        value={value}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required={required}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
      />

      {open && dropdownPos && (
        <div
          ref={listRef}
          style={{
            position: 'fixed',
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            maxHeight: 220,
            overflowY: 'auto',
            background: 'var(--ws, #ffffff)',
            border: '1px solid var(--border, #E5E7EB)',
            borderRadius: 8,
            boxShadow: 'var(--shadow-drop, 0 8px 24px rgba(0,0,0,0.12))',
            padding: '4px',
            zIndex: 9999,
          }}
        >
          {filteredOptions.length === 0 ? (
            <div style={{ padding: '8px 10px', fontSize: 11.5, color: 'var(--t4)', fontStyle: 'italic' }}>
              No matches · press Enter to keep typed value
            </div>
          ) : (
            filteredOptions.map((opt, idx) => {
              const isSelected = opt.value === value
              const isHighlighted = idx === highlightIndex

              return (
                <div
                  key={`${opt.value}-${idx}`}
                  onMouseDown={e => {
                    e.preventDefault() // prevent input blur before select
                    handleSelect(opt)
                  }}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  style={{
                    padding: '7px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12.5,
                    color: isHighlighted ? 'var(--brand, #315EF6)' : 'var(--t1, #1F2937)',
                    background: isHighlighted
                      ? 'var(--s2, #F3F4F6)'
                      : isSelected
                      ? 'rgba(49,94,246,0.07)'
                      : 'transparent',
                    fontWeight: isSelected ? 600 : 400,
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {opt.label}
                  </span>
                  {opt.sublabel && (
                    <span
                      style={{
                        fontSize: 11,
                        color: isHighlighted ? 'var(--brand, #315EF6)' : 'var(--t4, #9CA3AF)',
                        fontFamily: 'var(--mono)',
                        marginLeft: 8,
                        flexShrink: 0,
                      }}
                    >
                      {opt.sublabel}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

export default SuggestInput
