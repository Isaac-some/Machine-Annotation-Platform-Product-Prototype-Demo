# 2026-11-03 执行器需求整合验证记录

## 交付入口

- [需求总览](https://fyze31atzb.feishu.cn/docx/BzMZd9CVLoNxtPxx4b2czeronse)
- [执行器二期：流式运行、成本与复用](https://fyze31atzb.feishu.cn/wiki/VTzeweL4IiJ5WDkkV77cs5G2nNd)
- [批次共用能力：重试、告警与交付导出](https://fyze31atzb.feishu.cn/docx/VZwGd6aUioGjAjxYhupcVW3hnPh)

## 当前已验证

| 验证 | 结果与边界 |
|---|---|
| 模型测试 | 51项通过；含原整批三模式／导出用例及新增流式、预算、人工补救、克隆、批次重试、告警窗口用例 |
| TypeScript | npm run typecheck 通过 |
| ESLint | npm run lint 通过，无警告 |
| 生产构建 | npm run build 通过；仅已有编辑器打包体积提醒，不代表部署 |
| 浏览器 | 真实点击样本启动／暂停／刷新继续／确认预算、预算重算、人工补救准备、克隆预览、告警窗口、失败输入准备与成本反馈；合成状态用同一模型生成 |
| 窄屏 | 390px页面无横向溢出，预算确认和关键克隆弹窗、滚动到创建按钮可达；高清图片见 assets/15-mobile-clone.png |
| 图片 | 21张真实2倍PNG；弹窗布局稳定后截图，替换动画帧。原导出稿13张有效图保留 |
| zxhPRD | 两份Markdown及原生XML六列表通过校验；说明分区为原生段落／列表，用户故事独立一列 |
| 飞书 | 按原文档章节修改；回读确认二期14项功能／17处图片、共用16项功能／20处图片，原13张导出图片完整保留；结果见本次落盘目录cloud-validation.json |

## 演示与待联调

合成数据、合成算子价格、模拟文件任务与浏览器localStorage保存。没有接真实模型／费用结算／飞书消息／短信电话／稳定CID／完整输入扫描或字段依赖推导。费用延迟、真实容量、网关超时、跨服务幂等与反馈邀请编排需生产联调；不以本地通过替代生产验收。

克隆支持整组实际配置继承与输入可选，来源发布版本不可用时明确阻断回退；逐项配置回退和新输入字段推导仍待评审。失败明细为明确标注的合成记录。告警窗口用人工合成失败率演示，过滤／重试统计分母等未定口径未伪造。

## 本机复验

当前3017端口由静态服务提供构建后的out，不要重复启动占用端口。需要自行重建或服务未启动时：

```bash
cd 
npm test
npm run typecheck
npm run lint
npm run build
python3 -m http.server 3017 --bind 127.0.0.1 --directory out
```

场景：

- 流式正常：https://isaac-some.github.io/Machine-Annotation-Platform-Product-Prototype-Demo/hawk/pipeline/executor/?id=phase2-demo&example=phase2
- 提醒与收尾：https://isaac-some.github.io/Machine-Annotation-Platform-Product-Prototype-Demo/hawk/pipeline/executor/?id=phase2-cost&example=phase2
- 零成品：https://isaac-some.github.io/Machine-Annotation-Platform-Product-Prototype-Demo/hawk/pipeline/executor/?id=phase2-zero&example=phase2
- 普通批次：https://isaac-some.github.io/Machine-Annotation-Platform-Product-Prototype-Demo/hawk/project/batch/?id=234&batchId=5889&example=delivery
- 整批三环节：https://isaac-some.github.io/Machine-Annotation-Platform-Product-Prototype-Demo/hawk/pipeline/executor/?id=delivery-demo&example=delivery

示例只补充不覆盖旧记录。重复从头验证请使用独立浏览器上下文或克隆实例，不清除用户现有数据。运行中的浏览器页面驱动模拟，关闭页面不补跑。
