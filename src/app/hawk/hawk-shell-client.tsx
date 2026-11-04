"use client";

import dynamic from "next/dynamic";
import { Alert } from 'antd';
import { useWorkspaceRuntime } from '@/components/sites/hawk/data/use-workspace-runtime';
import "@ant-design/v5-patch-for-react-19";

// ProLayout 依赖 window 计算（断点/尺寸），SSR 属性必然不匹配；
// 本地工具站无 SEO 需求，直接客户端渲染，彻底消除 hydration 报错。
const HawkShell = dynamic(() => import("@/components/sites/hawk/hawk-shell").then((m) => m.HawkShell), {
  ssr: false,
  loading: () => <div style={{ minHeight: "100vh", background: "#f0f2f5" }} />,
});

export function HawkShellClient({ children }: { children: React.ReactNode }) {
  const runtimeError = useWorkspaceRuntime();
  return <HawkShell>{runtimeError && <Alert type="error" role="alert" message={runtimeError} />}{children}</HawkShell>;
}
