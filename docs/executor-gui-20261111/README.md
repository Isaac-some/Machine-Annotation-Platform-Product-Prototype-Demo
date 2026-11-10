# 执行器二期：公开网页真实 GUI 复验

时间：2026-11-11。运行代码：`be0c56b9c07a20c9fd105827650ebf01cf6cfa77`。本目录后续提交只补充证据，不改变运行代码。

[公开演示首页](https://isaac-some.github.io/Machine-Annotation-Platform-Product-Prototype-Demo/) · [正式 E1 PRD](https://fyze31atzb.feishu.cn/docx/GijVd2PMmoqERgx9nGPc5Cpsnkb) · [云端效果验收清单](https://fyze31atzb.feishu.cn/docx/WxdVdbmIeoNurGxUuvkcPHn0nOg)

## 验证方法与范围

在 macOS 的真实可见 Chrome 窗口操作公开 GitHub Pages：原生辅助功能按压与聚焦、系统键盘事件、鼠标点击，并截取实际桌面画面。不是把 Playwright 结果当作 GUI 验收。窗口 1440×870，内容视口约 1440×783；截图移除了桌面菜单和右侧其他软件浮层。

此前自动化检查漏掉了明显的界面和状态错误，不能作为充分验收。此次修复刻度重叠、错误观测依据、静态站点场景切换白屏、演示批次编号碰撞、恢复场景缺少第二环节失败、日期选择器裁切、暂停标签不一致，以及启动后仍可修改批次配置的问题。

14 个演示按钮均真实点击，在点击后 10 秒内的检查点看到预期效果。`gui-report.json` 的 checkpointSeconds 含人为等待和截图，不是场景准备耗时。成本/目标/时间触顶的预期是停止新增并继续收尾，不要求立刻中断在途数据。前 14 张场景图拍于 a75c4fc，随后两次修复只涉及恢复示例暂停同步和启动后配置锁定，对应另附新版截图。

## 场景与画面

|场景|核对结果|证据|
|---|---|---|
|费用触顶|停止新增和新自动重试，在途收尾|[画面](screens/final-01-cost.png)|
|原始输入上限|新增3条后停止，输入和成品分开计数|[画面](screens/final-02-input.png)|
|成品目标|达到新增目标后停止取入，保留在途|[画面](screens/final-03-target.png)|
|运行时长|有效处理时长触顶并收尾|[画面](screens/final-04-time.png)|
|小批次估算|240条采用12/5采样，已有自动估算|[画面](screens/final-05-estimate.png)|
|CID|合成CID进入持续生产|[画面](screens/final-06-cid.png)|
|CSV|读取并校验后显示240条并开始处理|[画面](screens/final-07-csv.png)|
|缺RowKey|阻止处理，费用与产物为零|[画面](screens/final-08-csv-invalid.png)|
|等待新增|6条处理完仍等待供数|[画面](screens/final-09-insufficient.png)|
|供数结束|明确结束后本次完成|[画面](screens/final-10-end.png)|
|无活动超时|暂停并要求人工继续|[画面](screens/final-11-idle.png)|
|检查失败|显示原因并暂停|[画面](screens/final-12-error.png)|
|原位恢复|12条准备失败数据并暂停|[新版暂停状态](screens/final-retry-paused-fixed.png)|
|零成品|有费用，最终无成品|[画面](screens/final-14-zero.png)|

## 补充操作链

- 计算器：818分钟的0/720/1440刻度没有重叠；43,200分钟切成720小时、30天，产能保持1,620,000份。10万预算/目标完整显示，预算与时间依据分别展示。[818分钟](screens/final-calculator-818.png) · [30天](screens/final-calculator-days.png) · [预算及时间](screens/final-calculator-both.png) · [目标](screens/final-calculator-target.png)。当前无新输入时明确提示需补充输入，不把条件产能当作交付承诺。
- 明确供数结束且失败全部恢复后：当前输入新增0份，正数目标提示补充资源。[0份](screens/final-end-exhausted.png) · [正数目标](screens/final-end-exhausted-target.png)。
- 成本触顶后的人工继续：提高上限并保存仍停在人工确认，点击继续后才恢复生产。[保存后](screens/final-cost-unblocked-config.png) · [继续后](screens/final-cost-resumed.png)。
- 手动刷新估算：展开更多估算操作并点击刷新，暂停状态和实际费用保持不变。[画面](screens/final-manual-refreshed.png)。
- 恢复：第二环节的2条失败数据实际恢复并接续下游；第一环节12条及其失败保持不变，费用从3.01增加到3.35，最终成品从13增加到15，完成后仍暂停。[画面](screens/final-retry-details.png)。重试有准备和下游处理过程，需等待本轮完成后再发起下一轮。
- 输入源：检查恢复成功后仍暂停，点击继续才运行；暂停、刷新后状态保留。[恢复后](screens/final-source-recovered-paused.png) · [人工继续](screens/final-source-resumed.png) · [暂停刷新](screens/final-pause-clock-refresh.png)。
- 大输入：真实输入2,000,000,000，出现1–10,000条限制提示，6条原数据保留；接着正常追加10条，界面显示16条并继续处理。[拦截](screens/final-large-input-rejected.png) · [追加](screens/final-append-ten.png)。
- 克隆：继承配置及本次输入创建新实例，独立批次、费用零、时长零、待执行；刷新保留，返回源实例保留原费用和结果。[选项](screens/final-clone-options.png) · [新实例](screens/final-clone-created.png) · [刷新](screens/final-clone-reloaded.png) · [返回源实例](screens/final-clone-source-preserved.png)。
- B1交付：实际点击生成并下载三个CSV，全量12条；2026-11-03 09:00–10:00为6条，顺序1–6；10:00–10:30不排序为6条，顺序9/7/8/12/10/11。合计覆盖1–12且两段没有交集。刷新后3条记录保留。[记录](screens/final-b1-third-history.png) · [刷新](screens/final-b1-history-after-refresh.png)。文件行数是下载后的CSV实读结果，见gui-report.json。
- 整批串联：首页进入三环节示例，点击继续，三个批次依次完成各自导出后接续，最终3/3完成；刷新保留，末环节可实际下载交付文件。[第一批导出中](screens/final-batch-chain-first-finished.png) · [全部完成](screens/final-batch-chain-next.png) · [刷新](screens/final-batch-chain-reloaded.png)。返回项目入口可用，同源数据保留。
- 日期选择器：在真实窗口点击11月3日、09:00/10:00并确认，月份导航与底部按钮均完整可见。[画面](screens/final-b1-date3.png)。
- 接续边界：取全部成功任务中最晚截止，非最近点击任务；先全量导出再补历史区间，接续后0条是正确阻断。演示非空接续时应先导出09:00–10:00，再点击接续，最后演示全量下载。
- B2梯度告警：命中20%，同一窗口升到80%，推进1分钟，仅产生80%模拟通知记录；不发送真实通知。[画面](screens/final-b2-alarm-after-window.png)。
- B3配置：已启动批次系统配置只读，字段和开关禁用，底部仅关闭；编辑输入也禁用，刷新不解锁。[画面](screens/final-b3-config-readonly.png)。

## 数据、性能与研发边界

同一浏览器同源共享localStorage与IndexedDB，配置、进度、成功结果和导出文件保存于本机，换设备不会同步。演示复用3个专属批次，全站模拟驱动避免多个任务积累；后台标签和关闭页面不会补算离线进度。GitHub只提供静态网页，不存在远端一直跑着的任务进程。拆成不同域名repo会隔离本地数据，不能降低同一浏览器的计算量，因此保留一个站点。

此次GUI未观察到崩溃或白屏，20亿输入被前置拦截。原型模拟上限10,000条；200万条的1000/400采样阈值只做数学边界验证，不能作为生产容量或所有设备网络的流畅承诺。

自动化补充：126项主应用测试、类型检查、lint与静态构建通过；静态站点同页跳转、返回/前进/刷新，以及日期选择器在1440×783、1280×720、1024×768的边界与确认操作通过。公开远端导航测试另通过，不能替代上述GUI证据。

正式PRD已区分合成原型和生产联调：真实CID/CSV读取、账单、预测精度、通知送达/反馈卡片、真实字段依赖检查和生产容量不在原型通过结论中；不得在研发交接时称这些服务已经验收。详见[需求与实现地图](architecture.md)。
