/** Bounded sampling; a growing source never moves the baseline of a started run. */
export function observationThreshold(total: number) { return Number.isSafeInteger(total) && total > 0 ? Math.min(1000, Math.max(1, Math.ceil(total * .05))) : 500; }
export function observationStep(total: number) { return Number.isSafeInteger(total) && total > 0 ? Math.min(400, Math.max(1, Math.ceil(total * .02))) : 200; }
export function observationCheckpoints(total: number): number[] {
  const first = observationThreshold(total), step = observationStep(total);
  return Array.from({ length: Math.min(10000, Math.ceil((Math.max(total || 10000, first) - first) / step) + 1) }, (_, i) => first + i * step).slice(0, 10000);
}
export const MAX_DEMO_INPUTS = 10000;
export function validateDemoCount(count: number) {
  if (!Number.isSafeInteger(count) || count < 1 || count > MAX_DEMO_INPUTS) throw new Error('原型模拟输入须为 1–10,000 条；请使用演示场景快速验收');
}
