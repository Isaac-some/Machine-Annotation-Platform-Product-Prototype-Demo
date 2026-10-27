export interface ExecutorSettings {
  mode: 'default' | 'rigorous' | 'target';
  targetRate: number;
  filterRule: 'exclude' | 'include';
  maxRetries: number;
  afterRetries: 'wait' | 'continue';
  urgentReminder: boolean;
}

export const DEFAULT_EXECUTOR_SETTINGS: ExecutorSettings = {
  mode: 'default', targetRate: 95, filterRule: 'exclude', maxRetries: 3,
  afterRetries: 'wait', urgentReminder: true,
};

export function executorSettings(value?: Partial<ExecutorSettings>): ExecutorSettings {
  return { ...DEFAULT_EXECUTOR_SETTINGS, ...value };
}

export function validateExecutorSettings(settings: ExecutorSettings) {
  if (!['default', 'rigorous', 'target'].includes(settings.mode)
    || !Number.isFinite(settings.targetRate) || settings.targetRate < 0 || settings.targetRate > 100
    || !['exclude', 'include'].includes(settings.filterRule)
    || !Number.isSafeInteger(settings.maxRetries) || settings.maxRetries < 0 || settings.maxRetries > 100
    || !['wait', 'continue'].includes(settings.afterRetries) || typeof settings.urgentReminder !== 'boolean') {
    throw new Error('请检查执行模式、目标成功率和重试次数');
  }
}

export function batchSuccessRate(batch: { total: number; success: number; filtered: number }, rule: ExecutorSettings['filterRule']): number | null {
  const denominator = batch.total - (rule === 'exclude' ? batch.filtered : 0);
  return denominator > 0 ? batch.success / denominator * 100 : null;
}
