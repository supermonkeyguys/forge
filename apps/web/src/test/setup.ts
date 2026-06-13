import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Setup mock localStorage
const localStorageStore: Record<string, string> = {}

Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: (key: string): string | null => localStorageStore[key] || null,
    setItem: (key: string, value: string): void => {
      localStorageStore[key] = value
    },
    removeItem: (key: string): void => {
      delete localStorageStore[key]
    },
    clear: (): void => {
      Object.keys(localStorageStore).forEach((k) => {
        delete localStorageStore[k]
      })
    },
    key: (index: number): string | null => Object.keys(localStorageStore)[index] || null,
    get length() { return Object.keys(localStorageStore).length },
  },
  writable: true,
})

// Mock document.documentElement.style
const mockStyles: Record<string, string> = {}

Object.defineProperty(global.document, 'documentElement', {
  value: {
    style: {
      setProperty(key: string, value: string) {
        mockStyles[key] = value
      },
      getPropertyValue(key: string): string {
        return mockStyles[key] ?? ''
      },
      removeProperty(key: string) {
        delete mockStyles[key]
      },
    },
  },
  writable: true,
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
class MockIntersectionObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: MockIntersectionObserver,
})

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: MockResizeObserver,
})

// Mock scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
})
