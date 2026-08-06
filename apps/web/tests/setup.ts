import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

const localStorageData = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return localStorageData.size;
  },
  clear: () => localStorageData.clear(),
  getItem: (key) => localStorageData.get(key) ?? null,
  key: (index) => Array.from(localStorageData.keys())[index] ?? null,
  removeItem: (key) => localStorageData.delete(key),
  setItem: (key, value) => localStorageData.set(key, String(value)),
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: localStorageMock,
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.getElementById("headlessui-portal-root")?.remove();
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: ResizeObserverMock,
});
