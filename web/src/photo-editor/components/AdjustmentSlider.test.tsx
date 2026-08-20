import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AdjustmentSlider } from './AdjustmentSlider'

describe('AdjustmentSlider (PHOTO-004)', () => {
  it('shows the current value and has no reset button when at 0', () => {
    render(<AdjustmentSlider label="Brightness" value={0} onChange={vi.fn()} onReset={vi.fn()} />)
    expect(screen.getByRole('spinbutton')).toHaveValue(0)
    expect(screen.queryByTitle('Reset brightness')).not.toBeInTheDocument()
  })

  it('shows a reset button once the value has moved off 0', () => {
    render(<AdjustmentSlider label="Contrast" value={30} onChange={vi.fn()} onReset={vi.fn()} />)
    expect(screen.getByTitle('Reset contrast')).toBeInTheDocument()
  })

  it('dragging the slider calls onChange with the new value', () => {
    const onChange = vi.fn()
    render(<AdjustmentSlider label="Brightness" value={0} onChange={onChange} onReset={vi.fn()} />)
    fireEvent.change(screen.getByRole('slider'), { target: { value: '42' } })
    expect(onChange).toHaveBeenCalledWith(42)
  })

  it('editing the numeric input calls onChange, clamped to -100..100', () => {
    const onChange = vi.fn()
    render(<AdjustmentSlider label="Brightness" value={0} onChange={onChange} onReset={vi.fn()} />)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '500' } })
    expect(onChange).toHaveBeenCalledWith(100)
  })

  it('clicking reset calls onReset', () => {
    const onReset = vi.fn()
    render(<AdjustmentSlider label="Brightness" value={30} onChange={vi.fn()} onReset={onReset} />)
    fireEvent.click(screen.getByTitle('Reset brightness'))
    expect(onReset).toHaveBeenCalled()
  })
})
