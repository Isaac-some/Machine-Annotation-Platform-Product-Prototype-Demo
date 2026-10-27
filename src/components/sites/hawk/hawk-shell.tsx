"use client";

/**
 * HAWK 平台壳：侧边栏菜单 + 顶栏（logo / 标题 / 任务运行中 / 用户名）。
 * 结构对齐源站 Ant Design Pro Layout（mix 模式、256px 侧边栏、56px 顶栏）。
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ProLayout } from "@ant-design/pro-components";
import { ConfigProvider, theme as antdTheme } from "antd";
import {
  AppstoreOutlined,
  DownOutlined,
  LineChartOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Popover, Segmented, Typography } from "antd";
import { DatabaseOutlined, ExportOutlined } from "@ant-design/icons";
import { CLUSTER_LOAD, TASKS } from "./data/mock-projects";
import { publicAsset } from "@/lib/demo-navigation";
import { CURRENT_USER } from "./data/names";



/** 实时任务流面板 —— 逐元素对齐源站实测值（icon #EEF4FF/#4388FF、任务卡 r12 m0 4 12、∿ 18px #5B8FF9、进度 3px #5B8FF9） */
function TaskPanel() {
  const [tab, setTab] = useState<"all" | "running" | "done">("all");
  const [othersExpanded, setOthersExpanded] = useState(false);
  const filter = (arr: typeof TASKS) =>
    tab === "all" ? arr : tab === "running" ? arr.filter((t) => t.progress < 100) : arr.filter((t) => t.progress >= 100);
  const mine = filter(TASKS.filter((t) => t.mine));
  const others = filter(TASKS.filter((t) => !t.mine));
  const shownOthers = othersExpanded ? others : others.slice(0, 2);

  const TaskCard = ({ t }: { t: (typeof TASKS)[number] }) => (
    <div style={{ background: "#fff", border: "1px solid #e9ebef", borderRadius: 12, padding: "12px 16px", margin: "0 4px 12px" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ color: "#5b8ff9", fontSize: 18, marginRight: 10, lineHeight: 1 }}>∿</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#1f2329", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
          <div style={{ display: "flex", gap: 10, fontSize: 11, marginTop: 2 }}>
            <span style={{ color: "#8f959e" }}>ID：{t.id}</span>
            <span style={{ color: "#8f959e" }}>创建者：{t.creator}</span>
            <span style={{ color: "#646a77" }}>总量 {t.total}</span>
          </div>
        </div>
        <Button type="text" size="small" icon={<ExportOutlined style={{ color: "#8f959e", fontSize: 14 }} />} />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <strong style={{ fontSize: 14, fontWeight: 700, color: "#1f2329" }}>{t.progress} %</strong>
        <div style={{ display: "flex", gap: 8, fontSize: 11 }}>
          <span style={{ color: "#36b37e", fontWeight: 600 }}>{t.success} 成功</span>
          <span style={{ color: "#ef4444", fontWeight: 600 }}>{t.failed} 失败</span>
          <span style={{ color: "#646a77", fontWeight: 600 }}>{t.aborted} 中止</span>
        </div>
      </div>
      <div style={{ height: 3, background: "#f0f1f3", marginTop: 8, overflow: "hidden" }}>
        <span style={{ display: "block", width: `${t.progress}%`, height: 3, background: "#5b8ff9" }} />
      </div>
    </div>
  );

  return (
    <div style={{ width: 416, display: "flex", flexDirection: "column", maxHeight: "80vh" }}>
      {/* header：icon + 标题组 + segmented */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", height: 64 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "#eef4ff",
              color: "#4388ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
            }}
          >
            <DatabaseOutlined />
          </div>
          <div>
            <strong style={{ fontSize: 14, fontWeight: 700, color: "#1f2329", display: "block", lineHeight: "17px" }}>演示任务流</strong>
            <span style={{ fontSize: 11, color: "#8f959e", letterSpacing: 0.5, lineHeight: "11px", display: "block" }}>REAL-TIME STREAM</span>
          </div>
        </div>
        <Segmented
          size="small"
          value={tab}
          onChange={(v) => setTab(v as typeof tab)}
          options={[
            { value: "all", label: "全部" },
            { value: "running", label: "运行中" },
            { value: "done", label: "已完成" },
          ]}
        />
      </div>
      <div style={{ overflowY: "auto", paddingBottom: 16 }}>
        {/* 负载卡 */}
        <div style={{ background: "#fff", border: "1px solid #e9ebef", borderRadius: 12, padding: "12px 16px", margin: "0 4px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 14, color: "rgba(0,0,0,0.88)" }}>系统资源负载</span>
            <span style={{ fontSize: 11, color: "#d46b08", background: "#fdf1e3", borderRadius: 10, padding: "2px 8px" }}>{CLUSTER_LOAD.level}</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 1, marginTop: 2 }}>
            <strong style={{ fontSize: 24, fontWeight: 700, color: "#1f2329", lineHeight: "29px" }}>{CLUSTER_LOAD.percent}</strong>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1f2329" }}>%</span>
          </div>
          <div style={{ height: 6, background: "#f0f1f3", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
            <span style={{ display: "block", width: `${CLUSTER_LOAD.percent}%`, height: 6, background: "#fa8c16", borderRadius: 3 }} />
          </div>
          <div style={{ fontSize: 11, color: "#8f959e", marginTop: 8 }}>{CLUSTER_LOAD.desc}</div>
        </div>
        {/* 我的项目（无标题） */}
        {mine.map((t) => (
          <TaskCard key={t.id} t={t} />
        ))}
        {/* 其他项目（可折叠） */}
        {others.length > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 12px 6px" }}>
              <span style={{ fontSize: 12, color: "#8f959e" }}>其他项目（{others.length}）</span>
              <a style={{ fontSize: 12 }} onClick={() => setOthersExpanded(!othersExpanded)}>
                {othersExpanded ? "收起" : "展开全部"}
              </a>
            </div>
            {shownOthers.map((t) => (
              <TaskCard key={t.id} t={t} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function HawkShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname().replace(/\/$/, '') || '/';

  const menuItems = useMemo(() => [
    { path: "/hawk/project", name: "项目管理", icon: <UserOutlined /> },
    { path: "/hawk/stage-map", name: "算子地图", icon: <AppstoreOutlined /> },
    { path: "/hawk/pipeline", name: "工作流编排", icon: <LineChartOutlined /> },
  ], []);

  // editor 页全屏画布，不带壳（保持在所有 Hooks 之后）
  if (pathname.startsWith("/hawk/pipeline/editor")) {
    return <>{children}</>;
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1890ff",
          colorInfo: "#1890ff",
          borderRadius: 6,
          fontSize: 14,
          fontFamily:
            '-apple-system, "system-ui", "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif, "Apple Color Emoji", "Segoe UI Emoji"',
        },
        algorithm: antdTheme.defaultAlgorithm,
      }}
    >
      {pathname === '/hawk/pipeline/executor' ? children : <ProLayout
        layout="mix"
        bgLayoutImgList={[
          { src: publicAsset("/sites/hawk/layout-glow-left.svg"), left: 85, bottom: 100, height: "303px" },
          { src: publicAsset("/sites/hawk/layout-glow-right.svg"), right: -45, bottom: -68, height: "303px" },
          { src: publicAsset("/sites/hawk/layout-grid.svg"), left: 0, bottom: 0, width: "331px" },
        ]}
        fixSiderbar
        siderWidth={256}
        title="机器标注平台"
        // eslint-disable-next-line @next/next/no-img-element -- ProLayout logo 槽位用原生 img
        logo={<img src={publicAsset("/sites/hawk/logo.svg")} alt="logo" style={{ width: 28, height: 28, borderRadius: 0 }} />}
        route={{ path: "/hawk", routes: menuItems }}
        menuItemRender={(item, dom) => {
          const path = item.path ?? "#";
          if (path.startsWith("http")) {
            return (
              <a href={path} target="_blank" rel="noreferrer">
                {dom}
              </a>
            );
          }
          if (!path.startsWith("http") && !path.startsWith("/")) return <span>{dom}</span>;
          return <Link href={path}>{dom}</Link>;
        }}
        defaultOpenKeys={[]}
        selectedKeys={[pathname]}
        location={{ pathname }}
        token={{
          header: { colorBgHeader: "rgba(255,255,255,0.6)", colorHeaderTitle: "rgba(0,0,0,0.88)", heightLayoutHeader: 56 },
          sider: { colorMenuBackground: "transparent", colorTextMenu: "rgba(0,0,0,0.65)" },
          pageContainer: { paddingBlockPageContainerContent: 0, paddingInlinePageContainerContent: 0 },
        }}
        headerTitleRender={(logo, title) => (
          <a style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {logo}
            <span style={{ fontSize: 18, fontWeight: 600, color: "rgba(0,0,0,0.88)" }}>{title}</span>
          </a>
        )}
        actionsRender={() => [
          <Popover key="tasks" content={<TaskPanel />} trigger="click" placement="bottomRight">
            <a style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(0,0,0,0.65)", background: "#f5f5f5", borderRadius: 16, padding: "4px 12px", height: 32, lineHeight: "24px" }}>
              <LineChartOutlined style={{ color: "#ff4d4f" }} />
              <strong style={{ color: "rgba(0,0,0,0.88)", fontWeight: 600 }}>{TASKS.length} 个任务运行中</strong>
              <DownOutlined style={{ fontSize: 10 }} />
            </a>
          </Popover>,
          <Typography.Text key="user" style={{ color: "rgba(0,0,0,0.88)" }}>
            {CURRENT_USER.account}
          </Typography.Text>,
        ]}
        contentStyle={{ minHeight: "calc(100vh - 56px)" }}
        style={{ minHeight: "100vh" }}
      >
        {children}
      </ProLayout>}
    </ConfigProvider>
  );
}
