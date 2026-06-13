import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton, SkeletonText, SkeletonCard, SkeletonGrid } from './skeleton'

describe('Skeleton', () => {
  it('renders with default classes', () => {
    render(<Skeleton />)
    const skeleton = document.querySelector('.animate-pulse')
    expect(skeleton).toHaveClass('animate-pulse')
    expect(skeleton).toHaveClass('rounded-md')
    expect(skeleton).toHaveClass('bg-muted')
  })

  it('applies custom className', () => {
    render(<Skeleton className="h-10 w-20" />)
    const skeleton = document.querySelector('.animate-pulse')
    expect(skeleton).toHaveClass('h-10')
    expect(skeleton).toHaveClass('w-20')
  })
})

describe('SkeletonText', () => {
  it('renders single line by default', () => {
    render(<SkeletonText />)
    const lines = document.querySelectorAll('.animate-pulse')
    expect(lines).toHaveLength(1)
  })

  it('renders multiple lines', () => {
    render(<SkeletonText lines={3} />)
    const lines = document.querySelectorAll('.animate-pulse')
    expect(lines).toHaveLength(3)
  })
})

describe('SkeletonCard', () => {
  it('renders card structure', () => {
    render(<SkeletonCard />)
    const card = document.querySelector('.rounded-lg.border')
    expect(card).toBeInTheDocument()
    expect(card).toHaveClass('border')
  })
})

describe('SkeletonGrid', () => {
  it('renders correct number of items', () => {
    render(<SkeletonGrid columns={2} rows={2} />)
    const cards = document.querySelectorAll('.rounded-lg.border')
    expect(cards).toHaveLength(4)
  })
})
