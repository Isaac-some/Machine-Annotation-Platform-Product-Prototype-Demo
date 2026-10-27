/**
 * 项目详情 · 批次列表与批次详情 mock 数据（全部虚构）
 */

export type BatchStatus =
  | "初始化"
  | "运行中"
  | "已暂停"
  | "已完成"
  | "已导出"
  | "已结束"
  | "部分失败";

/** 状态 pill 颜色（对齐源站：已导出=绿字浅绿底） */
export const STATUS_PILL: Record<BatchStatus, { color: string; bg: string }> = {
  初始化: { color: "#8a94a6", bg: "#f5f5f5" },
  运行中: { color: "#1890ff", bg: "#e6f7ff" },
  已暂停: { color: "#fa8c16", bg: "#fff7e6" },
  已完成: { color: "#45bb0c", bg: "#f2ffeb" },
  已导出: { color: "#45bb0c", bg: "#f2ffeb" },
  已结束: { color: "#531dab", bg: "#f9f0ff" },
  部分失败: { color: "#ff4d4f", bg: "#fff2f0" },
};

/** 节点状态色（对齐源站 flowNode：已完成=绿 #42B724/#F3F8EF） */
export const NODE_STATUS: Record<BatchNode["status"], { color: string; bg: string }> = {
  待处理: { color: "#8a94a6", bg: "#f5f5f5" },
  处理中: { color: "#1890ff", bg: "#e6f4ff" },
  已完成: { color: "#42b724", bg: "#f3f8ef" },
  失败: { color: "#ff4d4f", bg: "#fff2f0" },
};

export interface BatchNode {
  seq: number;
  name: string;
  status: "待处理" | "处理中" | "已完成" | "失败";
  cost: string; // ¥ - / ¥ 0.35
}

export interface BatchRow {
  id: number;
  projectId: number;
  name: string;
  workflow: string; // flow.xxx@N 风格
  status: BatchStatus;
  total: number; // -1 表示尚未开始
  success: number;
  failed: number;
  filtered: number;
  progress: number; // -1 = 未开始
  cost: string; // "¥ 0.00" | "-"
  createdAt: string;
  updatedAt: string;
  material: string; // 交付素材
  notice: string; // 通知强度
  inputResource: string; // CID://xxx
  nodes: BatchNode[];
  outputFields?: string[];
  systemConfig?: BatchSystemConfig;
  deliveryResource?: string;
  costResources?: BatchResourceUsage[];
  nodeCostResources?: Record<number, BatchResourceUsage[]>;
  executorId?: string;
  inputFromBatchId?: number;
  graphKey?: string;
}

export interface BatchResourceUsage {
  name: string;
  usage: string;
  price: string;
  cost: string;
}

export interface BatchSystemConfig {
  primaryKey: string;
  batchQps: number;
  reusePod: boolean;
  emptyOutput: boolean;
  redis: { addr: string; password: string; db: number };
  singleInstance: boolean;
  memoryBoost: boolean;
  memoryPercent: number;
  streaming: boolean;
  circleOutput: boolean;
  customCid: string;
  jsonl: boolean;
  jsonlFields: string[];
  jsonlFilename: string;
  json: boolean;
  jsonFields: string[];
  jsonFilenameField: string;
  collectionType: string;
}

/** DAG 节点模板（演示用中性名称） */
const nodeSet = (offset = 0): BatchNode[] =>
  [
    "资源通用入库",
    "生成签名链接",
    "生成轻量预览",
    "标签转换为预填",
  ].map((name, i) => ({
    seq: i + 1 + offset,
    name,
    status: "待处理" as const,
    cost: "¥ -",
  }));

function seedBatches(): BatchRow[] {
  const defs: Array<[
    number, // id
    number, // projectId
    string, // name
    string, // workflow
    BatchStatus,
    number, // total
    number, // success
    number, // failed
    number, // filtered
    number, // progress
    string, // createdAt
  ]> = [
    [5801, 234, "草船借箭·首批", "flow.qianlicaochuan@2", "运行中", 34000, 31240, 118, 642, 91, "2026-10-16 11:27:06"],
    [5799, 234, "草船借箭·复核", "flow.qianlicaochuan@1", "初始化", -1, -1, -1, -1, -1, "2026-10-16 11:24:56"],
    [5788, 233, "温酒斩华雄", "flow.wenjiuma@1", "已完成", 12000, 11982, 6, 12, 100, "2026-10-13 12:26:45"],
    [5776, 232, "三英战吕布·已导出批次", "resource_import.common.import", "已导出", 1, 1, 0, 0, 100, "2026-10-16 10:53:32"],
    [5765, 232, "连环计·铁索分段", "flow.lianhuanji@3", "运行中", 15600, 8830, 220, 310, 57, "2026-10-11 09:41:02"],
    [5750, 231, "辕门射戟·靶点核验", "flow.yuanmen@1", "已完成", 900, 898, 1, 1, 100, "2026-10-10 10:30:57"],
    [5742, 230, "青梅煮酒·对饮记录", "flow.zhulun@2", "部分失败", 5200, 4980, 190, 30, 96, "2026-09-30 12:18:31"],
    [5733, 229, "过五关·第一关", "flow.guowuguan@1", "已结束", 5000, 4870, 96, 34, 100, "2026-09-29 17:34:20"],
    [5721, 228, "水淹七军·水位采集", "flow.shuiyan@1", "初始化", -1, -1, -1, -1, -1, "2026-09-28 10:22:19"],
    [5710, 227, "借东风·风向观测", "flow.jiedongfeng@2", "运行中", 3100, 3066, 9, 25, 99, "2026-09-25 15:47:58"],
    [5704, 226, "空城计·城门巡检", "flow.kongchengji@1", "已完成", 7700, 7695, 3, 2, 100, "2026-09-19 08:31:44"],
    [5692, 225, "七擒七纵·第肆轮", "flow.qiqin@7", "部分失败", 14000, 13200, 640, 160, 94, "2026-09-12 14:09:26"],
  ];
  return defs.map(([id, projectId, name, workflow, status, total, success, failed, filtered, progress, createdAt]) => ({
    id,
    projectId,
    name,
    workflow,
    status,
    total,
    success,
    failed,
    filtered,
    progress,
    cost: progress >= 0 ? "¥ 0.00" : "-",
    createdAt,
    updatedAt: createdAt,
    material: ["图片", "视频", "音频", "3D模型"][id % 4],
    notice: "飞书加急",
    inputResource: `CID://${1300 + id % 90}`,
    nodes:
      status === "初始化"
        ? nodeSet()
        : status === "已导出"
          ? [{ seq: 1, name: "资源通用入库", status: "已完成" as const, cost: "¥ 0.00" }]
          : nodeSet().map((n, i) => ({
            ...n,
            status:
              status === "已完成" || status === "已结束"
                ? "已完成"
                : i === 0
                  ? "处理中"
                  : "待处理",
            cost: i === 0 ? "¥ 0.21" : "¥ -",
          })),
  }));
}

export const BATCHES = seedBatches();

export const WORKFLOW_OPTIONS = [
  "flow.qianlicaochuan@2",
  "flow.qianlicaochuan@1",
  "flow.wenjiuma@1",
  "flow.sanyingzhan@1",
  "flow.lianhuanji@3",
  "flow.yuanmen@1",
  "flow.zhulun@2",
  "flow.guowuguan@1",
  "flow.shuiyan@1",
  "flow.jiedongfeng@2",
  "flow.kongchengji@1",
  "flow.qiqin@7",
];

export const BATCH_STATUS_COLOR: Record<BatchStatus, string> = {
  初始化: "default",
  运行中: "processing",
  已暂停: "warning",
  已完成: "success",
  已导出: "success",
  已结束: "default",
  部分失败: "error",
};

export const MATERIAL_OPTIONS = ["图片", "视频", "音频", "3D模型", "其他"];
export const UPLOAD_MODES = ["上传 CSV", "导入圈选 ID", "继承批次结果"];
