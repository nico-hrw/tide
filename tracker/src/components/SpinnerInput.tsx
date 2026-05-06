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

  // Keep refs to always-current values so the imperative handlers stay fresh
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
      const dy = startY.current - e.touches[0].clientY  // positive = swipe up = increase
      if (Math.abs(dy) > 6) {
        if (!dragging.current) dragging.current = true
        e.preventDefault()
        const steps = Math.round(dy / 14)
        const raw = startVal.current + steps * step
        const clamped = Math.max(min, Math.min(max, raw))
        onChangeRef.current(parseFloat(clamped.toFixed(decimals)))
      }
    }

    function onTouchEnd() {
      if (dragging.current) el?.blur()
    }

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
      <label className="text-xs text-gray-400 uppercase tracking-wide block mb-1 select-none">
        {label}{unit ? ` (${unit})` : ''}
      </label>
      <div className="relative">
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
          className="w-full text-3xl font-bold bg-gray-50 rounded-xl px-4 py-3 outline-none select-none"
          style={{ touchAction: 'none' }}
        />
        {/* subtle up/down indicator */}
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 pointer-events-none">
          <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-b-[6px] border-b-gray-300" />
          <div className="w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-gray-300" />
        </div>
      </div>
    </div>
  )
}
