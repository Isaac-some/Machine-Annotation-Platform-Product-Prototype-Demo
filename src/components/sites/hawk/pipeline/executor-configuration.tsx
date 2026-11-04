'use client';

import { useState } from 'react';
import { Alert, Form, Input, InputNumber, Modal, Radio, Select, Slider, Typography } from 'antd';
import { BellOutlined, CheckCircleOutlined, SafetyOutlined, AimOutlined } from '@ant-design/icons';
import { executorSettings, type ExecutorSettings } from '../data/executor-settings';
import type { StreamPolicy } from '../data/executor-streaming';
import type { LocalExecutor } from '../data/local-workspace';
import { ExecutorDurationInput } from './executor-duration-input';
import '../project/settings-dialog.css';
import './executor-configuration.css';

export type ExecutorConfigurationValues = { resource: string; count: number; resourceType: NonNullable<LocalExecutor['resourceType']>; settings: ExecutorSettings; runMode?: 'batch' | 'stream'; streamPolicy?: StreamPolicy; deliveryMode: 'sorted' | 'unsorted' };
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
  const runMode = Form.useWatch('runMode', form) ?? executor.runMode ?? 'batch';
  const locked = Boolean(executor.runtime?.started);
  return <Modal title={<div className="hawk-settings-heading"><span>输入及执行器配置</span><p>{locked ? '执行已开始，当前配置仅供查看。' : '配置本次输入、执行方式与交付文件。'}</p></div>} open centered width={740} className="hawk-settings-modal hawk-executor-configuration" okText="保存配置" okButtonProps={{ disabled: locked }} cancelText={locked ? '关闭' : '取消'} onCancel={onCancel} onOk={async () => {
    try { if (locked) return; const values = await form.validateFields(); onSave({ ...values, settings: executorSettings(values.settings) }); }
    catch (issue) { if (issue instanceof Error) setError(issue.message); }
  }}>
    <Form form={form} disabled={locked} layout="vertical" initialValues={{ deliveryMode: executor.deliveryMode ?? 'sorted', resource: executor.input ?? '', count: executor.inputCount ?? 1, resourceType: executor.resourceType ?? 'video', settings: executorSettings(executor.settings), runMode: executor.runMode ?? 'batch', streamPolicy: executor.streamPolicy ?? { maxRetries: 0, observationSize: 100 } }}>
      {error && <Alert type="error" role="alert" showIcon message={error} />}
      <section className="hawk-settings-section">
        <div className="hawk-settings-section-heading"><h3>本次输入资源</h3><p>后续批次使用前一步的处理产出。</p></div>
        <div className="hawk-executor-settings-fields">
          <Form.Item name="resource" label="资源路径 / 圈选 ID" rules={[{ required: true, whitespace: true, message: '请填写输入资源' }, { pattern: /^(tos|cid|local|https?):\/\/.+/i, message: '请填写 tos://、CID:// 或有效的资源路径' }]}><Input disabled={locked} placeholder="tos://目录/input.csv 或 CID://资源ID" /></Form.Item>
          <div className="hawk-executor-config-grid">
            <Form.Item name="resourceType" label="输入资源类型" rules={[{ required: true }]}><Select disabled={locked} options={[{ value: 'video', label: '视频' }, { value: 'image', label: '图片' }, { value: 'audio', label: '音频' }, { value: 'other', label: '其他' }]} /></Form.Item>
            <Form.Item name="count" label="演示资源数量" rules={[{ required: true, type: 'integer', min: 1, message: '请填写正整数资源数量' }]}><InputNumber disabled={locked} min={1} precision={0} style={{ width: '100%' }} /></Form.Item>
          </div>
          {locked && <Typography.Paragraph className="hawk-executor-config-note">执行已开始，输入资源已锁定；后续批次使用前一步产出。</Typography.Paragraph>}
        </div>
      </section>
      <section className="hawk-settings-section">
        <div className="hawk-settings-section-heading"><h3>执行设置</h3><p>决定每个环节的结束与接续方式。</p></div>
        <Form.Item name="runMode" label="运行方式"><Radio.Group disabled={locked} options={[{ value: 'batch', label: '整批运行' }, { value: 'stream', label: '流式运行' }]} /></Form.Item>
        {runMode === 'stream' ? <div className="hawk-executor-target-settings">
          <Alert type="info" showIcon message="启动时取得本轮已有输入，按流式连续处理。成本、输入条数、实际运行时长任一达到上限，停止新输入及自动重试；在途任务继续收尾。" />
          <div className="hawk-executor-config-grid">
            <Form.Item name={['streamPolicy', 'costLimitCents']} label="总成本上限（选填，元）" getValueProps={value => ({ value: value === undefined ? undefined : value / 100 })} getValueFromEvent={value => value === null || value === undefined ? undefined : Math.round(value * 100)}><InputNumber disabled={locked} min={0.01} precision={2} placeholder="留空表示不设上限" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name={['streamPolicy', 'inputLimit']} label="最多取入原始数据（选填，条）" getValueFromEvent={value => value ?? undefined}><InputNumber disabled={locked} min={1} precision={0} placeholder="留空处理本轮全部已有输入" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name={['streamPolicy', 'runtimeLimitMs']} label="累计运行时长上限（选填）" extra="按执行器整体累计实际处理时间；多个环节同时处理只计一次，不含暂停、排队和无数据等待。"><ExecutorDurationInput disabled={locked} /></Form.Item>
            <Form.Item name={['streamPolicy', 'targetOutputCount']} label="目标成品量（选填，份）" getValueFromEvent={value => value ?? undefined} extra="达到后停止新输入，在途任务继续收尾，最终产量可能超出目标。失败数据仍按已配置的重试规则处理，人工重试由你决定。"><InputNumber disabled={locked} min={1} precision={0} placeholder="例如 1,000" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name={['streamPolicy', 'unitCostMin']} label="单条成品成本预估下限（选填）"><InputNumber disabled={locked} min={0.0001} precision={4} placeholder="元 / 可交付成品" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name={['streamPolicy', 'unitCostMax']} label="单条成品成本预估上限（选填）"><InputNumber disabled={locked} min={0.0001} precision={4} placeholder="元 / 可交付成品" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name={['streamPolicy', 'maxRetries']} label="首轮处理后，失败数据自动重试" extra="仅重试失败数据，成功后继续下游；0 表示不自动重试，次数不含首次执行。"><InputNumber disabled={locked} min={0} precision={0} suffix="轮" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name={['streamPolicy', 'reminderRatio']} label="费用达到上限的多少时提醒（选填）" extra="例如上限 ¥100、填写 80%，累计费用达到 ¥80 时提醒，仍继续运行。留空关闭提醒；需先设置成本上限。"><InputNumber disabled={locked} min={0.01} max={99.99} suffix="%" placeholder="例如 80；留空关闭提醒" style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name={['streamPolicy', 'observationSize']} label="观察批量" className="hawk-observation-slider"><Slider disabled={locked} min={100} max={1000} step={100} marks={{ 100: { style: { transform: 'none' }, label: '100 条' }, 500: '500 条', 1000: { style: { transform: 'translateX(-100%)' }, label: '1,000 条' } }} /></Form.Item>
          <Typography.Paragraph type="secondary">按已收尾输入的最终成品计算单位成本，包含失败与重试投入。观察批量仅用于更新估算，不影响直接生产；扩大样本不保证缩小预测波动。</Typography.Paragraph>
        </div> : <><div className="hawk-settings-row">
          <div className="hawk-settings-row-label"><strong>执行模式</strong><p>应用于本次执行器的所有环节。</p></div>
          <div>
            <Form.Item name={['settings', 'mode']}><Radio.Group aria-label="执行模式" optionType="button" className="hawk-executor-mode" options={[{ value: 'default', label: <><CheckCircleOutlined aria-hidden="true" />默认</> }, { value: 'rigorous', label: <><SafetyOutlined aria-hidden="true" />严谨</> }, { value: 'target', label: <><AimOutlined aria-hidden="true" />目标模式</> }]} /></Form.Item>
            <p className="hawk-executor-mode-help">{modeHelp[mode as ExecutorSettings['mode']]}</p>
          </div>
        </div>
        {mode === 'target' && <div className="hawk-executor-target-settings">
          <div className="hawk-executor-config-grid">
            <Form.Item name={['settings', 'targetRate']} label="成功率达到多少即可放行" rules={[{ required: true, type: 'number', min: 0, max: 100, message: '请输入 0–100 之间的成功率' }]}><InputNumber min={0} max={100} precision={1} suffix="%" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name={['settings', 'filterRule']} label="成功率计算规则"><Select options={[{ value: 'exclude', label: '排除过滤数据' }, { value: 'include', label: '包含过滤数据（计为失败）' }]} /></Form.Item>
          </div>
          <p className="hawk-executor-rate-formula">{rule === 'exclude' ? '成功率 = 成功 ÷（总量 − 过滤）' : '成功率 = 成功 ÷ 总量；过滤计为失败'}</p>
          <div className="hawk-executor-config-grid">
            <Form.Item name={['settings', 'maxRetries']} label="未达标，最多重试" rules={[{ required: true, type: 'integer', min: 0, max: 100, message: '请输入 0–100 之间的整数' }]}><InputNumber min={0} max={100} precision={0} suffix="次" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name={['settings', 'afterRetries']} label="重试次数用完后"><Select options={[{ value: 'wait', label: '仍未达标则停止，等待人工处理' }, { value: 'continue', label: '无论是否达标均放行' }]} /></Form.Item>
          </div>
          <Typography.Paragraph className="hawk-executor-config-note">只重试失败数据，保留成功与正常过滤的数据；次数不含首次运行，0 表示不自动重试。</Typography.Paragraph>
          {after === 'continue' && <Alert type="warning" showIcon message="未达标也会放行，仅成功结果进入下一步，数据损失可能累积。" />}
        </div>}
        </>}
      </section>
      <section className="hawk-settings-section">
        <div className="hawk-settings-section-heading"><h3>交付文件</h3><p>只影响输出文件的行顺序，不改变批次或处理顺序。</p></div>
        <Form.Item name="deliveryMode" label="交付文件排序"><Radio.Group aria-label="执行器交付文件排序" optionType="button" options={[{ value: 'sorted', label: '按输入顺序排序' }, { value: 'unsorted', label: '不排序，更快生成' }]} /></Form.Item>
      </section>
      <section className="hawk-settings-section">
        <div className="hawk-settings-section-heading"><h3><BellOutlined aria-hidden="true" /> 待处理提醒</h3></div>
        <div className="hawk-settings-row hawk-executor-reminder-row">
          <div className="hawk-settings-row-label"><strong>加急提醒</strong><p>停止且需人工处理时，是否加急提醒？</p></div>
          <div>
            <Form.Item name={['settings', 'urgentReminder']}><Radio.Group aria-label="停止且需人工处理时加急提醒" optionType="button" className="hawk-executor-reminder" options={[{ value: true, label: '是，开启提醒' }, { value: false, label: '否，不加急' }]} /></Form.Item>
            <p className="hawk-executor-config-note">开启后突出显示待处理提醒。当前为本地演示，不发送真实消息。</p>
          </div>
        </div>
      </section>
      <p className="hawk-executor-config-footnote">配置仅对本次执行器生效；资源数量及重试结果为本地模拟。</p>
    </Form>
  </Modal>;
}
