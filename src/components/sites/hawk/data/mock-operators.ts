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
  { id: 296, name: "调用军师模型·续", code: "advisor.invoke_qilv_2", category: "Transform / 数据转换", calls30d: 15393, description: "调用对应的模型分析或生成内容（平滑限速版本）。", tags: ["模型调用"], online: true },
  { id: 295, name: "图片重编码命名", code: "image.recode_rename", category: "Transform / 数据转换", calls30d: 17093, description: "转换图片格式并按新标识命名。", tags: ["图片处理"], online: true },
  { id: 294, name: "视频信息获取", code: "media.video_probe", category: "Enrich / 补充字段", calls30d: 18793, description: "读取存储中的文件或资源信息，提取基本信息或所需结果。", tags: ["视频处理", "存储与取数"], online: true },
  { id: 293, name: "景别质量评分", code: "score.scene_quality", category: "Enrich / 补充字段", calls30d: 20493, description: "根据画面或内容计算质量与景别指标。", tags: ["模型调用"], online: true },
  { id: 292, name: "音频信息获取", code: "media.audio_probe", category: "Enrich / 补充字段", calls30d: 22193, description: "读取音频文件或语音文本，提取基本信息或所需结果。", tags: ["音频处理", "存储与取数"], online: true },
  { id: 291, name: "色彩标准归一", code: "image.srgb_standardize", category: "Transform / 数据转换", calls30d: 23893, description: "色彩空间统一归一（保留原始资源）。", tags: ["图片处理"], online: true },
  { id: 290, name: "按时间与区域裁剪", code: "media.crop_by_region", category: "Fanout / 拆分分发", calls30d: 25593, description: "对媒体资源进行转换、整理或加工，生成新的内容。", tags: ["校验与过滤"], online: true },
  { id: 289, name: "成片与音轨生成", code: "media.finalize_tracks", category: "Transform / 数据转换", calls30d: 27293, description: "整理音频与视频中的信息，生成后续处理需要的内容。", tags: ["音频处理"], online: true },
  { id: 288, name: "通用视频按时裁切", code: "media.clip_by_time", category: "Transform / 数据转换", calls30d: 28993, description: "对视频资源进行转换、整理或加工，生成新的内容。", tags: ["视频处理"], online: true },
  { id: 287, name: "路径生成标识", code: "field.path_to_key", category: "Transform / 数据转换", calls30d: 30693, description: "根据存储路径生成资源标识。整理结构化数据中的信息。", tags: ["字段处理"], online: true },
  { id: 286, name: "六视图相似去重", code: "dedup.by_six_views", category: "Filter / 校验过滤", calls30d: 32393, description: "根据固定视角计算资源特征，并完成相似召回、判断和去重。", tags: ["校验与过滤", "预览与交付"], online: true },
  { id: 285, name: "军师对话补全", code: "advisor.chat_completions", category: "Transform / 数据转换", calls30d: 34093, description: "调用对话模型分析或生成内容，返回整理后的结果。", tags: ["模型调用"], online: true },
  { id: 284, name: "文生图·丹青", code: "draw.text_to_image", category: "Fanout / 拆分分发", calls30d: 35793, description: "根据输入图片或文字生成新的图片。", tags: ["模型调用", "图片处理"], online: true },
  { id: 283, name: "文书格式转换", code: "document.convert_format", category: "Transform / 数据转换", calls30d: 37493, description: "处理文书文件并完成相应的业务判断或数据整理。", tags: ["文档处理"], online: true },
  { id: 282, name: "代理预览生成", code: "preview.make_proxy", category: "Transform / 数据转换", calls30d: 39193, description: "生成低成本的预览版本供审阅使用。", tags: ["视频处理", "预览与交付"], online: true },
  { id: 281, name: "文生图·泼墨", code: "draw.text_to_image_pro", category: "Fanout / 拆分分发", calls30d: 40893, description: "根据输入图片或文字生成新的图片（高清版）。", tags: ["模型调用", "图片处理"], online: true },
  { id: 280, name: "动态分值评估", code: "score.motion_energy", category: "Transform / 数据转换", calls30d: 42593, description: "根据画面或内容计算质量、审美、亮度、颜色或运动表现等指标。", tags: ["评分"], online: true },
  { id: 279, name: "材质贴图补全", code: "asset.generate_pbr", category: "Enrich / 补充字段", calls30d: 44293, description: "逐材质估计金属度和粗糙度贴图并写回资源。", tags: ["存储与取数"], online: true },
  { id: 278, name: "校验指纹计算", code: "check.compute_md5", category: "IO / 读写交付", calls30d: 45993, description: "计算资源指纹用于一致性校验。", tags: ["校验与过滤"], online: true },
  { id: 277, name: "条目字段拼接", code: "field.join_title_tags", category: "Transform / 数据转换", calls30d: 47693, description: "拼接标题与标签为后续处理所需的输入。", tags: ["字段处理"], online: false },
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
