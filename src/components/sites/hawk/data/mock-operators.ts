/**
 * 算子地图页 · mock 数据（算子名称与 ID 全部虚构，不透露真实业务）
 */

export type OperatorCategory =
  | "IO / 读写交付"
  | "Enrich / 补充字段"
  | "Transform / 数据转换"
  | "Filter / 校验过滤"
  | "Fanout / 拆分分发";

export interface OperatorRow {
  id: number;
  name: string; // 显示名
  code: string; // 等宽 ID
  category: OperatorCategory;
  calls30d: number; // 虚构的演示调用量
  description: string;
  tags: string[];
  online: boolean; // 已上线 / 待下线
}

export const OPERATORS: OperatorRow[] = [
  { id: 304, name: "对象存储间传输", code: "storage.copy_between", category: "IO / 读写交付", calls30d: 1793, description: "用于对象存储间传输。将处理后的资源保存、上传或传递到指定位置。处理后会输出文件、链接或传输结果。", tags: ["存储与取数"], online: true },
  { id: 303, name: "调用军师模型", code: "advisor.invoke_qilv", category: "Transform / 数据转换", calls30d: 3493, description: "调用对应的模型分析或生成内容，返回文本、图片、视频或识别结果。最终会得到文本、媒体文件、评分或整理后的结果。", tags: ["模型调用", "内容生成"], online: true },
  { id: 302, name: "字段补充标注", code: "field.annotate_extra", category: "Enrich / 补充字段", calls30d: 5193, description: "为每条记录补充额外的标注字段，输出评分、标签或元数据。", tags: ["字段处理"], online: true },
  { id: 301, name: "六路视图信息读取", code: "asset.get_six_views", category: "Enrich / 补充字段", calls30d: 6893, description: "读取资源的基本信息或所需结果。结果中会补充评分、标签、元数据或识别信息。", tags: ["存储与取数", "元数据"], online: true },
  { id: 300, name: "基础属性提取", code: "asset.extract_base_attrs", category: "Transform / 数据转换", calls30d: 8593, description: "提取资源基础属性并重新编码上传，输出新的文件供后续使用。", tags: ["字段处理"], online: true },
  { id: 299, name: "完整性与几何校验", code: "check.geometry_integrity", category: "Filter / 校验过滤", calls30d: 10293, description: "检查资源完整性与结构信息。不符合要求的内容会被标记或过滤。", tags: ["校验与过滤"], online: true },
  { id: 298, name: "格式转换并拆分上传", code: "convert.split_and_upload", category: "Fanout / 拆分分发", calls30d: 11993, description: "将资源转换为通用格式，同时拆分并保存到指定存储位置。一个输入可能得到多个文件或结果。", tags: ["格式转换", "存储与取数"], online: true },
  { id: 297, name: "纹理层提取上传", code: "texture.extract_layers", category: "Fanout / 拆分分发", calls30d: 13693, description: "提取资源的纹理层并整理归属信息。一个输入可能得到多个文件或结果。", tags: ["存储与取数"], online: true },
  { id: 276, name: "分域并行汇总", code: "aggregate.by_domain", category: "Transform / 数据转换", calls30d: 49393, description: "按领域并行汇总统计结果。", tags: ["字段处理"], online: true },
  { id: 275, name: "旁路抽样预览", code: "sample.sidecar_preview", category: "Fanout / 拆分分发", calls30d: 51093, description: "按比例抽样生成旁路预览。", tags: ["预览与交付"], online: false },
];

// 分类 → 圆形图标底色（与源站“分类色”对应）
export const CATEGORY_COLOR: Record<OperatorCategory, string> = {
  "IO / 读写交付": "#1890ff",
  "Enrich / 补充字段": "#52c41a",
  "Transform / 数据转换": "#722ed1",
  "Filter / 校验过滤": "#fa8c16",
  "Fanout / 拆分分发": "#13c2c2",
};

export const OPERATOR_FILTERS = ["全部算子", "IO / 读写交付", "Enrich / 补充字段", "Transform / 数据转换", "Filter / 校验过滤", "Fanout / 拆分分发"];
export const TIME_FILTERS = ["近 30 天", "近 7 天", "全部"];

// 详情面板的输入/配置 schema（虚构）
export const OPERATOR_DETAIL = {
  entryFields: ["row_key", "src_path", "title", "keywords"],
  outputFields: ["src_path", "dst_path", "row_key", "title", "keywords"],
  inputs: [
    { field: "src_path", type: "text", desc: "-" },
    { field: "dst_path", type: "text", desc: "-" },
  ],
  config: {
    src: [
      { key: "region", placeholder: "请选择或输入region" },
      { key: "endpoint", placeholder: "请选择或输入endpoint" },
      { key: "ak", placeholder: "" },
      { key: "sk", placeholder: "" },
    ],
    dst: [
      { key: "region", placeholder: "请选择或输入region" },
      { key: "endpoint", placeholder: "请选择或输入endpoint" },
      { key: "ak", placeholder: "" },
      { key: "sk", placeholder: "" },
    ],
  },
};
