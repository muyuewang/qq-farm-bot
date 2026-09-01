export const RAIN_POEM_ACTIVITY_WINDOW = {
  startMs: 1787709600 * 1000,
  endMs: 1788883199 * 1000,
  updatedMs: 1787709600 * 1000,
}

// 公益小红花: 2026-09-01 ~ 2026-09-09
export const CHARITY_FLOWER_ACTIVITY_WINDOW = {
  startMs: 1756684800 * 1000,
  endMs: 1757375999 * 1000,
  updatedMs: 1756684800 * 1000,
}

export function isWithinActivityWindowMs(window: { startMs: number, endMs: number }, nowMs = Date.now()) {
  return nowMs >= window.startMs && nowMs <= window.endMs
}
