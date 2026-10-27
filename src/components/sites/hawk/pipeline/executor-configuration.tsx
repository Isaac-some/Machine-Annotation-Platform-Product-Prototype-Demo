'use client';

import { useState } from 'react';
import { Alert, Form, Input, InputNumber, Modal, Radio, Select, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { executorSettings, type ExecutorSettings } from '../data/executor-settings';
import type { LocalExecutor } from '../data/local-workspace';

export type ExecutorConfigurationValues = { resource: string; count: number; resourceType: NonNullable<LocalExecutor['resourceType']>; settings: ExecutorSettings };
const modeHelp = {
  default: '无失败数据时自动结束并继续；有失败时等待人工处理。',
  rigorous: '每个工作流计算完毕后都等待人工确认结束，即使全部成功。',
  target: '达到目标成功率即放行；未达标只重试失败数据。',
};

export function ExecutorConfiguration({ executor, onCancel, onSave }: { executor: LocalExecutor; onCancel: () => void; onSave: (values: ExecutorConfigurationValues) => void }) {
  const [form] = Form.useForm<ExecutorConfigurationValues>();
  const [error, setError] = useState('');
  const mode = Form.useWatch(['settings', 'mode'], form) ?? executorSettings(executor.settings).mode;
  const rule = Form.useWatch(['settings', 'filterRule'], form) ?? executorSettings(executor.settings).filterRule;
  const after = Form.useWatch(['settings', 'afterRetries'], form) ?? executorSettings(executor.settings).afterRetries;
  const locked = Boolean(executor.runtime?.started);
  return <Modal title="输入及执行器配置" open centered width={680} className="hawk-executor-configuration" okText="保存配置" cancelText="取消" onCancel={onCancel} onOk={async () => {
    try { const values = await form.validateFields(); onSave({ ...values, settings: executorSettings(values.settings) }); }
    catch (issue) { if (issue instanceof Error) setError(issue.message); }
  }}>
    <Form form={form} layout="vertical" initialValues={{ resource: executor.input ?? '', count: executor.inputCount ?? 1, resourceType: executor.resourceType ?? 'video', settings: executorSettings(executor.settings) }}>
      {error && <Alert type="error" role="alert" showIcon message={error} />}
      <section><h3>本次输入资源</h3>
        <Form.Item name="resource" label="资源路径 / 圈选 ID" rules={[{ required: true, whitespace: true, message: '请填写输入资源' }, { pattern: /^(tos|cid|local|https?):\/\/.+/i, message: '请填写 tos://、CID:// 或有效的资源路径' }]}><Input disabled={locked} placeholder="tos://目录/input.csv 或 CID://资源ID" /></Form.Item>
        <div className="hawk-executor-config-grid"><Form.Item name="resourceType" label="输入资源类型" rules={[{ required: true }]}><Select disabled={locked} options={[{ value: 'video', label: '视频' }, { value: 'image', label: '图片' }, { value: 'audio', label: '音频' }, { value: 'other', label: '其他' }]} /></Form.Item><Form.Item name="count" label="演示资源数量" rules={[{ required: true, type: 'integer', min: 1, message: '请填写正整数资源数量' }]}><InputNumber disabled={locked} min={1} precision={0} style={{ width: '100%' }} /></Form.Item></div>
        {locked && <Typography.Paragraph type="secondary">执行已开始，输入资源已锁定；后续批次使用前一步产出。</Typography.Paragraph>}
      </section>
      <section><h3>执行设置</h3><Form.Item name={['settings', 'mode']} label="执行模式"><Radio.Group optionType="button" buttonStyle="solid" className="hawk-executor-mode" options={[{ value: 'default', label: '默认' }, { value: 'rigorous', label: '严谨' }, { value: 'target', label: '目标模式' }]} /></Form.Item>
        <p className="hawk-executor-mode-help">{modeHelp[mode as ExecutorSettings['mode']]}</p>
        {mode === 'target' && <>
          <div className="hawk-executor-config-grid"><Form.Item name={['settings', 'targetRate']} label="成功率达到多少即可放行" rules={[{ required: true, type: 'number', min: 0, max: 100, message: '请输入 0–100 之间的成功率' }]}><InputNumber min={0} max={100} precision={1} suffix="%" style={{ width: '100%' }} /></Form.Item><Form.Item name={['settings', 'filterRule']} label="成功率计算规则"><Select options={[{ value: 'exclude', label: '排除过滤数据' }, { value: 'include', label: '包含过滤数据（计为失败）' }]} /></Form.Item></div>
          <p className="hawk-executor-rate-formula">{rule === 'exclude' ? '成功率 = 成功 ÷（总量 − 过滤）' : '成功率 = 成功 ÷ 总量；过滤计为失败'}</p>
          <div className="hawk-executor-config-grid"><Form.Item name={['settings', 'maxRetries']} label="未达标，最多重试" rules={[{ required: true, type: 'integer', min: 0, max: 100, message: '请输入 0–100 之间的整数' }]}><InputNumber min={0} max={100} precision={0} suffix="次" style={{ width: '100%' }} /></Form.Item><Form.Item name={['settings', 'afterRetries']} label="重试次数用完后"><Select options={[{ value: 'wait', label: '仍未达标则停止，等待人工处理' }, { value: 'continue', label: '无论是否达标均放行' }]} /></Form.Item></div>
          <Typography.Paragraph type="secondary">只重试失败数据，保留成功与正常过滤的数据；次数不含首次运行，0 表示不自动重试。</Typography.Paragraph>
          {after === 'continue' && <Alert type="warning" showIcon message="未达标也会放行，仅成功结果进入下一步，数据损失可能累积。" />}
        </>}
        <div className="hawk-executor-urgent"><BellOutlined /><div><strong>停止且需人工处理时，是否加急提醒？</strong><Form.Item name={['settings', 'urgentReminder']}><Radio.Group aria-label="停止且需人工处理时加急提醒" optionType="button" buttonStyle="solid" size="large" options={[{ value: true, label: '是，开启提醒' }, { value: false, label: '否，不加急' }]} /></Form.Item><small>开启后突出显示待处理提醒。当前为本地演示，不发送真实消息。</small></div></div>
      </section>
      <Typography.Text type="secondary">配置仅对本次执行器生效；资源数量及重试结果为本地模拟。</Typography.Text>
    </Form>
  </Modal>;
}
