import { DEMO_BOUNDARY_CIDS, DEMO_SCENARIOS } from './data/executor-demo-scenarios';
export const executorDemoPath = (scene: string, panel?: string) => `/hawk/pipeline/executor/?id=executor-demo-showcase&demo=${scene}${panel ? `&panel=${panel}` : ''}`;
export const DEMO_ENTRIES = [
  ...DEMO_SCENARIOS.map(s => ({ key: s.id, title: s.title, description: `${s.id in DEMO_BOUNDARY_CIDS ? DEMO_BOUNDARY_CIDS[s.id as keyof typeof DEMO_BOUNDARY_CIDS] + ' · ' : ''}${s.expected}`,  path: executorDemoPath(s.id) })),
  { key: 'configuration', title: '输入与运行限制配置', description: '输入、成品目标、成本上限和等待提醒', path: executorDemoPath('insufficient', 'configuration') },
  { key: 'details', title: '成本与环节运行详情', description: '各环节投入、产物、失败和费用', path: executorDemoPath('retry', 'details') },
  { key: 'calculator', title: '成本与时间计算器', description: '按预算、时长或目标成品试算', path: executorDemoPath('retry', 'calculator') },
  { key: 'clone', title: '克隆执行器', description: '独立选择继承配置与输入', path: executorDemoPath('retry', 'clone') },
  { key: 'export', title: '按时间导出与接续下载', description: '12条成功结果，选择时间范围并下载', path: '/hawk/project/batch/?id=234&batchId=5889&example=delivery&panel=export' },
  { key: 'batch-config', title: '批次只读配置', description: '查看已启动批次的生效配置', path: '/hawk/project/batch/?id=234&batchId=5889&example=delivery&panel=config' },
  { key: 'alarm', title: '失败率梯度告警', description: '演示窗口内保留最高档', path: '/hawk/project/batch/?id=234&batchId=5889&example=delivery&panel=alarm' },
  { key: 'failure-details', title: '批次失败位置与原因', description: '自动准备12条输入，查看第二环节的2条失败', path: '/hawk/project/batch/?id=234&executorId=executor-demo-showcase&stage=1&demo=retry&panel=failure' },
  { key: 'batch-chain', title: '整批三环节接续', description: '文件准备完成后继续下游', path: '/hawk/pipeline/executor/?id=delivery-demo&example=delivery' },
];
