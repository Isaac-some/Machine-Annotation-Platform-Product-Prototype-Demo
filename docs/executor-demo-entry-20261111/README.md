# 演示入口与固定CID验收 · 2026-11-11

[公开原型](https://isaac-some.github.io/Machine-Annotation-Platform-Product-Prototype-Demo/) · [E1 PRD](https://fyze31atzb.feishu.cn/docx/GijVd2PMmoqERgx9nGPc5Cpsnkb) · [云端验收](https://fyze31atzb.feishu.cn/docx/WxdVdbmIeoNurGxUuvkcPHn0nOg)

首页恢复项目管理平台原界面。所有平台页面左下提供52px圆球，打开左侧演示抽屉；选择后准备合成数据并跳转。正式PRD已在36项功能说明旁补充直达链接，映射见 [链接清单](prd-demo-links.json)。

| 场景 | 固定输入CID | 预置条件 |
|---|---|---|
|实际成本上限|CID://demo-cost-limit|从550步模拟进度准备，当前费用加0.60元为上限|
|实际处理时长上限|CID://demo-time-limit|已累计处理时间加2.4秒为上限，等待与暂停不计入|
|最终成品目标|CID://demo-output-limit|已有最终产物加3份为目标|
|原始输入条数上限|CID://demo-input-limit|已取入原始数据加3条为上限|

每个场景只开启对应边界，点击自动运行，10秒内可见达限信号；停止新增、在途收尾。最终成品目标保留既定重试规则。提高限制并保存不会自动继续，仍需人工继续。场景复用专属批次并暂停其他模拟任务，重复演示不会增加历史批次。

`demo=场景`负责准备，完成后从地址移除以便刷新保留；`panel`打开配置、累计详情、计算器、克隆、交付、批次只读配置、告警或失败详情。批次失败直达根据演示执行器当前批次选择第二环节，避免写死动态编号。合成失败同步到失败明细，重试所选环节会清除该环节记录；没有真实算子追踪时明确无法定位。

## 验证

127项主应用测试、lint、类型检查、生产静态构建通过。生产静态文件的自动化验证包括首页圆球位置、三种CID边界、4个执行器窗口、3个批次窗口、全新浏览器存储直达计算器和失败详情。结果见 [静态浏览器记录](static-browser-check.txt)。真实可见Chrome窗口另通过系统辅助功能点击并截图，画面只裁切浏览器外框，未修改界面内容。

[平台首页](screens/platform.png) · [演示抽屉](screens/drawer.png) · [成本](screens/cost.png) · [时长](screens/time.png) · [成品](screens/target.png) · [计算器](screens/calculator.png) · [失败详情](screens/failure-details.png)

之前完整功能操作和下载实读证据见 [GUI验收](../executor-gui-20261111/README.md)。本目录截图来自本地最终静态构建及本轮开发界面；公开网页本轮复验结果以云端验收文档的最新入口章节为准。

原型最多模拟10,000条输入，大数值在计算前拒绝。GitHub仅静态托管，模拟在浏览器执行；没有持续运行的远端生产进程。真实资源读取、账单、预测回测、通知／反馈卡片、字段依赖推导与生产容量仍需联调，相关PRD链接已注明覆盖边界。
