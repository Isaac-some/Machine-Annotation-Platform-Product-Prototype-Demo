/**
 * 工作流编排页 · mock 数据（Pipeline 名取自三国回目，输出字段为虚构）
 */

export interface PipelineDraft {
  id: string;
  name: string;
  status: "published" | "draft";
  catalogueOnline?: boolean;
  internalGroup?: boolean;
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
];
