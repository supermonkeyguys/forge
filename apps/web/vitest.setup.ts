import '@testing-library/jest-dom'

// Setup mock storage before any imports
const localStorageStore: Record<string, string> = {}

const mockLocalStorage = {
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
  length: Object.keys(localStorageStore).length,
}

Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
})

// Mock document
const mockStyles: Record<string, string> = {}

const mockDocumentElement = {
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
}

Object.defineProperty(global, 'document', {
  value: {
    documentElement: mockDocumentElement,
  },
  writable: true,
})
