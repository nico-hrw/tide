'use client'
import { useEffect, useRef } from 'react'

interface SpinnerInputProps {
  label: string
  value: number | undefined
  onChange: (v: number) => void
  step?: number
  min?: number
  max?: number
  decimals?: number
  placeholder?: string
  unit?: string
}

export default function SpinnerInput({
  label, value, onChange, step = 1, min = 0, max = 9999, decimals = 0, placeholder = '0', unit,
}: SpinnerInputProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)
  useEffect(() => { valueRef.current = value }, [value])
  useEffect(() => { onChangeRef.current = onChange }, [onChange])

  useEffect(() => {
    const el = inputRef.current
    if (!el) return
    const startY = { current: 0 }
    const startVal = { current: 0 }
    const dragging = { current: false }
    function onTouchStart(e: TouchEvent) {
      startY.current = e.touches[0].clientY
      startVal.current = valueRef.current ?? 0
      dragging.current = false
    }
    function onTouchMove(e: TouchEvent) {
      const dy = startY.current - e.touches[0].clientY
      if (Math.abs(dy) > 6) {
        if (!dragging.current) dragging.current = true
        e.preventDefault()
        const steps = Math.round(dy / 14)
        const raw = startVal.current + steps * step
        const clamped = Math.max(min, Math.min(max, raw))
        onChangeRef.current(parseFloat(clamped.toFixed(decimals)))
      }
    }
    function onTouchEnd() { if (dragging.current) el?.blur() }
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el?.removeEventListener('touchstart', onTouchStart)
      el?.removeEventListener('touchmove', onTouchMove)
      el?.removeEventListener('touchend', onTouchEnd)
    }
  }, [step, min, max, decimals])

  return (
    <div className="flex-1">
      <label style={{ display: 'block', color: '#6B7280', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 4, userSelect: 'none' }}>
        {label}{unit ? ` (${unit})` : ''}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          value={value ?? ''}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v)) onChange(Math.max(min, Math.min(max, parseFloat(v.toFixed(decimals)))))
            else if (e.target.value === '') onChange(0)
          }}
          placeholder={placeholder}
          style={{
            width: '100%', fontSize: 28, fontWeight: 800,
            background: '#1E1E24', borderRadius: 12,
            padding: '12px 36px 12px 14px',
            outline: 'none', border: 'none',
            color: '#F9FAFB', touchAction: 'none',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 2, pointerEvents: 'none' }}>
          <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '6px solid #4B5563' }} />
          <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: '6px solid #4B5563' }} />
        </div>
      </div>
    </div>
  )
}
