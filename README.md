# 机器标注平台产品原型

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
