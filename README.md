# 机器标注平台产品原型

评审时打开 [在线演示首页](https://isaac-some.github.io/Machine-Annotation-Platform-Product-Prototype-Demo/)；保持平台原界面，点击左下圆球打开「演示与验收」，选择功能后自动准备数据并跳转；正式PRD的功能说明旁也提供直达链接。GitHub 仓库页面是代码入口，GitHub Pages 才是可操作网页。

正式需求见飞书：[需求总览及 E4](https://fyze31atzb.feishu.cn/docx/BzMZd9CVLoNxtPxx4b2czeronse)、[E1](https://fyze31atzb.feishu.cn/docx/GijVd2PMmoqERgx9nGPc5Cpsnkb)、[E2](https://fyze31atzb.feishu.cn/docx/HNQldQdiJoRswBxFPvRcmOxXn3c)、[E3](https://fyze31atzb.feishu.cn/docx/HD6Zdm3cCoBAvCxVWtdcwsqNnje)、[演示验收清单](https://fyze31atzb.feishu.cn/docx/WxdVdbmIeoNurGxUuvkcPHn0nOg)。

## 2026-11-03 · 批次与串联执行器导出

结束按钮支持三档配置；运行中可按北京时间范围导出、查看进度与历史并重试。执行器支持统一排序配置、逐批次调整和下游文件依赖校验。详见 [体验入口、规则与运行方式](docs/delivery-export.md)。


使用虚构、脱敏演示数据的前端交互原型。导航仅保留项目管理、算子地图和工作流编排。

在线网页：<https://Isaac-some.github.io/Machine-Annotation-Platform-Product-Prototype-Demo/>

## 自动发布

推送到 `main` 后，GitHub Actions 自动检查、构建并部署到 GitHub Pages。也可在仓库的 **Actions → Deploy prototype to GitHub Pages → Run workflow** 手动发布。

成功后点击运行详情中 **deploy → github-pages** 的在线地址，或查看该运行的 Summary「打开机器标注平台演示网页」。构建产物 `prototype-static-website` 可下载留存。

## 本地运行

```sh
cd Machine-Annotation-Platform-Product-Prototype-Demo
npm ci
npm ci --prefix openhandle
npm run build:editor
npm run dev
```

访问 `http://localhost:3000/hawk/project/`。

## 数据边界

- 人员和项目以《三国演义》人物、回目及虚构名称作为演示；调用量、任务、资源 ID、成功率、成本和进度均为演示值。
- 编辑器使用 `demo.*` 算子标识，合成描述和空配置默认值；字段契约仅用于表现产品交互，不连接实际服务。
- 公开仓库从源码白名单重新建立，不包含原工作区的 Git 历史、录屏、截图、内部调研、转写、环境配置、账号凭证或浏览器数据。图标和背景为自制 SVG。
- 不保留其他平台导航、通用模板或内部系统地址。没有真实上传、模型调用、生产执行、费用结算或消息发送。
- 试跑、项目、批次与执行器存于访问者自己的浏览器；采用独立的演示存储命名空间，不共享原型旧站数据。上传文件仅用于当前浏览器本地预览与模拟，不会上传服务器。请使用演示文件。
- `npm run audit:public` 检查源码；`npm run audit:public -- --output` 检查生成网页。发布工作流会执行两项检查，检测到内部地址、凭证或私有材料即停止发布。

## 构建与验证

```sh
cd Machine-Annotation-Platform-Product-Prototype-Demo
npm run audit:public
npm run lint
npm run typecheck
npm test
npm test --prefix openhandle
npm run lint --prefix openhandle
npx --prefix openhandle tsc --noEmit --project openhandle/tsconfig.json
NEXT_PUBLIC_BASE_PATH=/Machine-Annotation-Platform-Product-Prototype-Demo npm run build
npm run audit:public -- --output
```

输出目录为 `out/`。详情页采用查询参数承载项目/批次 ID，用户新建的本地记录也可在 GitHub Pages 刷新打开，不依赖后端动态路由。

### 执行器二期整合原型（2026-11-03）

需求与验证见 [需求总览](docs/executor-requirements-overview-20261103.md)、[执行器二期](docs/executor-phase2-20261103.md)、[批次共用能力](docs/export-feedback-20261103.md) 和 [验证记录](docs/executor-phase2-verification-20261103.md)。流式演示入口为 `/hawk/pipeline/executor/?id=phase2-demo&example=phase2`；成本收尾为 `id=phase2-cost`，零成品为 `id=phase2-zero`。示例只补充，不重置已有浏览器数据。

浏览器复验脚本读取 `PLAYWRIGHT_MODULE`（默认 `playwright`）与可选 `CHROME_EXECUTABLE`，用于当前本机环境；截图采用合成数据和模型生成的场景状态。
