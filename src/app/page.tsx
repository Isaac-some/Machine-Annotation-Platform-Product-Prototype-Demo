const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
const entries = [
  ['执行器二期 · 14 个演示场景', '/hawk/pipeline/executor/?id=phase2-reservoir&example=phase2', '进入后点击右下角「演示与验收」，自动准备数据、批次和运行限制。'],
  ['批次交付 · 时间范围与下载', '/hawk/project/batch/?id=234&batchId=5889&example=delivery', '预置 12 条成功结果，验证按时间导出、排序、接续导出和历史下载。'],
  ['整批执行器 · 三环节接续', '/hawk/pipeline/executor/?id=delivery-demo&example=delivery', '核对整批模式的放行、文件依赖和下游接续。'],
  ['项目与工作流', '/hawk/project/', '查看项目、工作流与执行器列表。'],
];

export default function Home() {
  return <main style={{ maxWidth: 960, margin: '64px auto', padding: '0 28px', color: '#172b4d' }}>
    <p style={{ color: '#1677ff', fontWeight: 600 }}>机器标注平台 · 交互原型</p>
    <h1 style={{ fontSize: 30, margin: '12px 0' }}>选择演示入口</h1>
    <p style={{ color: '#64748b', lineHeight: 1.8 }}>使用合成数据，不连接生产服务。配置、进度和导出文件保存在当前浏览器；同一浏览器中切换页面和刷新可保留，换设备不会同步。</p>
    <div style={{ display: 'grid', gap: 16, marginTop: 32 }}>
      {entries.map(([title, path, description]) => <a key={path} href={base + path} style={{ display: 'block', padding: '22px 24px', border: '1px solid #dbe4f0', borderRadius: 12, textDecoration: 'none', background: '#fff' }}>
        <strong style={{ fontSize: 18, color: '#155ab6' }}>{title} →</strong>
        <p style={{ color: '#64748b', margin: '8px 0 0', lineHeight: 1.7 }}>{description}</p>
      </a>)}
    </div>
    <p style={{ marginTop: 24, color: '#64748b' }}>演示场景复用同一组批次，并暂停其他本地模拟任务。原型最多模拟 10,000 条输入，大于上限会提示修正。</p>
  </main>;
}
