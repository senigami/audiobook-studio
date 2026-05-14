import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest'

// Mock global fetch
global.fetch = vi.fn()
