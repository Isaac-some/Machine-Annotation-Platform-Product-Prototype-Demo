/**
 * 项目管理页 · mock 数据（全部虚构，人物取自三国演义，项目名为回目）
 */
import { HEROES, CHAPTERS } from "./names";

export interface ProjectRow {
  id: number;
  name: string;
  owner: string; // 项目负责人
  researchOwner: string | null; // 项目研发负责人
  researchOwners?: string[];
  notice?: string;
  participants: string[]; // 项目参与者
  createdAt: string;
  favorite: boolean;
}

// 固定种子生成稳定的假数据（避免每次渲染随机变化）
function buildProjects(): ProjectRow[] {
  const rows: ProjectRow[] = [];
  const dates = [
    "2026-10-22 11:52:14",
    "2026-10-20 21:54:51",
    "2026-10-20 16:13:20",
    "2026-10-16 11:07:36",
    "2026-10-15 14:28:53",
    "2026-10-15 11:26:31",
    "2026-10-14 12:18:47",
    "2026-10-11 09:41:02",
    "2026-09-30 18:05:33",
    "2026-09-28 10:22:19",
    "2026-09-25 15:47:58",
    "2026-09-19 08:31:44",
    "2026-09-12 14:09:26",
    "2026-09-05 20:56:11",
    "2026-08-29 09:15:37",
    "2026-08-21 16:40:52",
    "2026-08-14 11:33:08",
    "2026-08-07 13:27:49",
    "2026-07-30 10:02:15",
    "2026-07-22 17:44:29",
    "2026-07-15 09:58:41",
    "2026-07-08 14:12:06",
    "2026-06-30 16:29:53",
    "2026-06-21 10:47:18",
    "2026-06-11 15:33:27",
    "2026-05-30 11:21:44",
    "2026-05-19 09:07:32",
    "2026-05-08 14:55:19",
  ];
  // “我的关注”命中 3 条（首页实测：关注视图显示 3 行）
  const favorites = new Set([1, 4, 9]);
  for (let i = 0; i < dates.length; i++) {
    const heroIdx = (i * 7) % HEROES.length;
    const hasResearch = i % 3 !== 1;
    const participantCount = [0, 0, 1, 2, 3][i % 5];
    rows.push({
      id: 234 - i,
      name: CHAPTERS[(i * 5) % CHAPTERS.length],
      owner: HEROES[heroIdx],
      researchOwner: hasResearch ? HEROES[(heroIdx + 11) % HEROES.length] : null,
      participants: Array.from({ length: participantCount }, (_, k) => HEROES[(heroIdx + 3 + k * 5) % HEROES.length]),
      createdAt: dates[i],
      favorite: favorites.has(i),
    });
  }
  return rows;
}

export const PROJECTS = buildProjects();

export const CREATED_AT_OPTIONS = ["所有时间", "今天", "近 7 天", "近 30 天", "本季度"];

// 实时任务流（顶栏 popover）——负载与任务全部虚构
export interface TaskItem {
  id: number;
  name: string;
  creator: string;
  mine: boolean;
  total: string;
  progress: number; // 0-100
  success: string;
  failed: string;
  aborted: string;
}

export const TASKS: TaskItem[] = [
  { id: 5448, name: "桃园结义_名册核对_副本", creator: "刘备", total: "1", progress: 0, success: "0", failed: "0", aborted: "0", mine: true },
  { id: 5447, name: "温酒斩华雄_战绩复核", creator: "关羽", total: "4", progress: 25, success: "1", failed: "0", aborted: "0", mine: true },
  { id: 5446, name: "草船借箭_箭矢清点", creator: "诸葛亮", total: "34", progress: 91, success: "31", failed: "1", aborted: "1", mine: true },
  { id: 5445, name: "连环计_铁索分段", creator: "庞统", total: "12", progress: 66, success: "8", failed: "0", aborted: "0", mine: false },
  { id: 5444, name: "空城计_城门巡检", creator: "司马懿", total: "8", progress: 48, success: "4", failed: "0", aborted: "0", mine: false },
  { id: 5443, name: "苦肉计_伤情核验", creator: "黄盖", total: "5", progress: 82, success: "4", failed: "1", aborted: "0", mine: false },
  { id: 5442, name: "反间计_书信比对", creator: "周瑜", total: "21", progress: 30, success: "6", failed: "1", aborted: "2", mine: false },
  { id: 5441, name: "借东风_风向采集", creator: "诸葛亮", total: "3", progress: 99, success: "3", failed: "0", aborted: "0", mine: false },
];

export const CLUSTER_LOAD = {
  percent: 42.0,
  level: "演示负载" as const,
  desc: "虚构的资源负载，仅用于交互演示。",
};
