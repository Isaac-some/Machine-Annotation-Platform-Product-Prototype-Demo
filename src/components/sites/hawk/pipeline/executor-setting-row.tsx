import type { ReactNode } from 'react';

/** ItemContent + ItemActions pattern, adapted to the platform's existing controls. */
export function ExecutorSettingRow({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="hawk-executor-setting-row"><div><strong>{title}</strong><p>{description}</p></div><div className="hawk-executor-setting-action">{children}</div></div>;
}
