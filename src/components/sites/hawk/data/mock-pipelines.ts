/**
 * 工作流编排页 · mock 数据（Pipeline 名取自三国回目，输出字段为虚构）
 */

export interface PipelineDraft {
  id: string;
  name: string;
  status: "published" | "draft";
  description: string | null;
  outputs: string[];
  version?: number;
  publishedId?: string;
  graphKey?: string;
}

/** A publication is identified by its full Flow ID, including its @ revision. */
export function publishedFlowId(flow: PipelineDraft): string {
  return flow.publishedId ?? `${flow.id.startsWith('flow.') ? flow.id.replace(/@\d+$/, '') : 'flow.' + flow.id}@${flow.version ?? 1}`;
}

export interface PipelineGroup {
  project: string;
  projectId?: number;
  drafts: PipelineDraft[];
}

export const PIPELINE_GROUPS: PipelineGroup[] = [
  {
    project: "宴桃园豪杰三结义",
    drafts: [
      { id: "p-101", name: "义气值核验", status: "draft", description: null, outputs: [] },
      { id: "p-102", name: "结义名册归档", status: "published", description: "整理结义名册并归档。", outputs: ["row_key", "member_name", "oath_rank"] },
      { id: "p-103", name: "桃园来客统计", status: "published", description: "统计桃园聚会来客。", outputs: ["row_key", "guest_count", "wine_jars"] },
    ],
  },
  {
    project: "战官渡本初败绩",
    drafts: [
      { id: "p-201", name: "粮草清点复核", status: "draft", description: null, outputs: [] },
      { id: "p-202", name: "乌巢转运编排", status: "published", description: "自乌巢至大营的粮草转运编排。", outputs: ["row_key", "grain_tons", "convoy_id", "eta"] },
    ],
  },
  {
    project: "诸葛亮舌战群儒",
    drafts: [
      { id: "p-301", name: "辩词整理", status: "published", description: "整理辩论要点与来言去语。", outputs: ["row_key", "speaker", "point", "rebuttal"] },
      { id: "p-302", name: "风力观测汇总", status: "published", description: "汇总各营风力观测记录。", outputs: ["row_key", "wind_level", "direction"] },
      { id: "p-303", name: "沙场推演", status: "draft", description: null, outputs: [] },
    ],
  },
  {
    project: "赵子龙单骑救主",
    drafts: [
      { id: "p-401", name: "突围路径规划", status: "published", description: null, outputs: ["row_key", "gate_id", "guard_count"] },
      { id: "p-402", name: "幼主护送校验", status: "published", description: "护送全程校验，缺一不可。", outputs: ["row_key", "checkpoint", "passed"] },
    ],
  },
  {
    project: "关云长放水淹七军",
    drafts: [
      { id: "p-501", name: "水位测算", status: "published", description: "测算上游水位与放流时机。", outputs: ["row_key", "water_level", "flow_rate", "open_gates"] },
    ],
  },
  {
    project: "诸葛亮七擒孟获",
    drafts: [
      { id: "p-601", name: "擒纵轮次登记", status: "published", description: "登记七擒七纵轮次与结果。", outputs: ["row_key", "round", "captured", "released"] },
      { id: "p-602", name: "归降名册生成", status: "draft", description: null, outputs: [] },
    ],
  },
];
