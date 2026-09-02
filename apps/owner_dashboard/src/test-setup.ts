import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Mock ResizeObserver (used by Radix UI)
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
globalThis.ResizeObserver = MockResizeObserver;

// Mock scrollIntoView (not implemented in JSDOM)
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.Element.prototype.scrollIntoView = vi.fn();

// Mock matchMedia (used by Radix UI components)
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock hasPointerCapture / setPointerCapture (used by Radix UI Select/Dialog in jsdom)
if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = vi.fn().mockReturnValue(false);
}
if (!HTMLElement.prototype.setPointerCapture) {
  HTMLElement.prototype.setPointerCapture = vi.fn();
}

// Override pointer-events for Radix Select options in jsdom
// Radix portals render with computed pointer-events:none that blocks userEvent.click
const style = document.createElement('style');
style.textContent = '[role="option"] { pointer-events: auto !important; }';
document.head.appendChild(style);