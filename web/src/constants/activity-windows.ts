export const RAIN_POEM_ACTIVITY_WINDOW = {
  startMs: 1787709600 * 1000,
  endMs: 1788883199 * 1000,
  updatedMs: 1787709600 * 1000,
}

export const CHARITY_FLOWER_ACTIVITY_WINDOW = {
  startMs: 1788192000 * 1000,
  endMs: 1788969599 * 1000,
  updatedMs: 1788220800 * 1000,
}

export function isWithinActivityWindowMs(window: { startMs: number, endMs: number }, nowMs = Date.now()) {
  return nowMs >= window.startMs && nowMs <= window.endMs
}
