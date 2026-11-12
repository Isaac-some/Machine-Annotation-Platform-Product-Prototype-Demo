'use client';

import { useState } from 'react';
import { Alert, Form, Input, InputNumber, Modal, Radio, Select, Typography } from 'antd';
import { BellOutlined, CheckCircleOutlined, SafetyOutlined, AimOutlined, ClockCircleOutlined, DatabaseOutlined, DollarCircleOutlined } from '@ant-design/icons';
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

export function ExecutorConfiguration({ executor, summary, onCancel, onSave }: { executor: LocalExecutor; summary?: string; onCancel: () => void; onSave: (values: ExecutorConfigurationValues) => void | Promise<void> }) {
  const [form] = Form.useForm<ExecutorConfigurationValues>();
  const [error, setError] = useState('');
  const mode = Form.useWatch(['settings', 'mode'], form) ?? executorSettings(executor.settings).mode;
  const rule = Form.useWatch(['settings', 'filterRule'], form) ?? executorSettings(executor.settings).filterRule;
  const after = Form.useWatch(['settings', 'afterRetries'], form) ?? executorSettings(executor.settings).afterRetries;
  const runMode = Form.useWatch('runMode', form) ?? executor.runMode ?? 'batch';
  const locked = Boolean(executor.runtime?.started);
  const limitsEditable = locked && executor.runMode === 'stream' && executor.stream?.phase !== 'completed' && !executor.stream?.endedIntake;
  return <Modal title={<div className="hawk-settings-heading"><span>输入及执行器配置</span><p>{limitsEditable ? '执行已开始，仅可修改运行限制；保存后不会自动继续。' : locked ? '执行已开始，当前配置仅供查看。' : '配置本次输入、执行方式与交付文件。'}</p></div>} open centered width={840} className="hawk-settings-modal hawk-executor-configuration" okText="保存配置" okButtonProps={{ disabled: locked && !limitsEditable }} cancelText={locked ? '关闭' : '取消'} onCancel={onCancel} onOk={async () => {
    try { if (locked && !limitsEditable) return; const values = await form.validateFields(); await onSave({ ...values, count: (values.runMode ?? executor.runMode ?? 'batch') === 'batch' ? executor.inputCount ?? 1 : values.count, streamPolicy: { maxRetries: 0, ...executor.streamPolicy, ...values.streamPolicy, targetOutputMode: 'count', targetOutputPercent: undefined, legacyTargetUnresolved: undefined, costLimitAction: 'drain' }, settings: executorSettings(values.settings) }); }
    catch (issue) { if (issue instanceof Error) setError(issue.message); }
  }}>
    <Form form={form} disabled={locked && !limitsEditable} layout="vertical" initialValues={{ deliveryMode: executor.deliveryMode ?? 'sorted', resource: executor.input ?? '', count: executor.inputCount ?? 1, resourceType: executor.resourceType ?? 'video', settings: executorSettings(executor.settings), runMode: executor.runMode ?? 'batch', streamPolicy: { idleTimeoutMs: 600000, costLimitAction: 'drain', maxRetries: 0, observationSize: 1000, ...executor.streamPolicy } }}>
      {summary && <Alert type="info" showIcon message="刚才的试算（仅供参考）" description={summary} />}
      {executor.streamPolicy?.legacyTargetUnresolved && <Alert type="warning" showIcon message="旧目标缺少输入基准，请重新确认成品数量后保存" />}
      {error && <Alert type="error" role="alert" showIcon message={error} />}
      <section className="hawk-settings-section">
        <details open={locked ? undefined : true}><summary className="hawk-config-locked-summary">{locked ? '输入资源已锁定 · 展开查看' : '本次输入资源'}</summary>
        <div className="hawk-executor-settings-fields">
          <Form.Item name="resource" label="资源路径 / 圈选 ID" rules={[{ required: true, whitespace: true, message: '请填写输入资源' }, { pattern: /^(tos|cid|local|https?):\/\/.+/i, message: '请填写 tos://、CID:// 或有效的资源路径' }]}><Input disabled={locked} placeholder="tos://目录/input.csv 或 CID://资源ID" /></Form.Item>
          <div className="hawk-executor-config-grid">
            <Form.Item name="resourceType" label="输入资源类型" rules={[{ required: true }]}><Select disabled={locked} options={[{ value: 'video', label: '视频' }, { value: 'image', label: '图片' }, { value: 'audio', label: '音频' }, { value: 'other', label: '其他' }]} /></Form.Item>
            {runMode === 'stream' && <Form.Item name="count" label="原始输入资源总量（条，原型模拟）" rules={[{ required: true, type: 'integer', min: 1, max: 10000, message: '原型支持 1–10,000 条模拟输入' }]}><InputNumber disabled={locked} min={1} max={10000} precision={0} style={{ width: '100%' }} /></Form.Item>}
          </div>
          {locked && <Typography.Paragraph className="hawk-executor-config-note">执行已开始，输入资源已锁定；后续批次使用前一步产出。</Typography.Paragraph>}
        </div>
      </details></section>
      <section className="hawk-settings-section">
        <div className="hawk-settings-section-heading"><h3>执行设置</h3><p>决定每个环节的结束与接续方式。</p></div>
        <Form.Item name="runMode" label="运行方式" hidden={locked}><Radio.Group disabled={locked} options={[{ value: 'batch', label: '整批运行' }, { value: 'stream', label: '流式运行' }]} /></Form.Item>
        {runMode === 'stream' ? <div className="hawk-executor-target-settings hawk-stream-settings">
          <Alert type="info" showIcon message="达到任一运行限制后停止新增，在途继续收尾；保存配置不会自动继续。" />
          <section className="hawk-stream-config-group">
            <div className="hawk-stream-config-heading"><DatabaseOutlined aria-hidden="true" /><div><strong>输入与目标成品</strong><p>目标与取入上限可择一或同时填写；预计所需输入仅供参考。</p></div></div>
            <div className="hawk-executor-config-grid">
              <Form.Item name={['streamPolicy', 'targetOutputCount']} label="最终可交付成品目标（选填，份）" getValueFromEvent={value => value ?? undefined}><InputNumber disabled={locked && !limitsEditable} min={1} precision={0} placeholder="留空表示不设成品目标" style={{ width: '100%' }} /></Form.Item>
              <Form.Item name={['streamPolicy', 'inputLimit']} label="原始数据取入上限（选填，条）" getValueFromEvent={value => value ?? undefined}><InputNumber disabled={locked && !limitsEditable} min={1} precision={0} placeholder="留空持续处理来源可用数据" style={{ width: '100%' }} /></Form.Item>
            </div>
          </section>
          <section className="hawk-stream-config-group">
            <div className="hawk-stream-config-heading"><DollarCircleOutlined aria-hidden="true" /><div><strong>成本控制</strong><p>费用预测只作参考；只有真实费用触顶时才按此设置处理。</p></div></div>
            <div className="hawk-executor-config-grid">
              <Form.Item name={['streamPolicy', 'costLimitCents']} label="总成本上限（选填，元）" getValueProps={value => ({ value: value === undefined ? undefined : value / 100 })} getValueFromEvent={value => value === null || value === undefined ? undefined : Math.round(value * 100)}><InputNumber disabled={locked && !limitsEditable} min={0.01} precision={2} placeholder="留空表示不设上限" style={{ width: '100%' }} /></Form.Item>
              <Form.Item name={['streamPolicy', 'reminderRatio']} label="费用达到上限的多少时提前提醒（选填）" extra="按累计实际费用触发；提醒强度可在“通知与成本反馈”中配置。预估费用不触发停机。"><InputNumber disabled={locked} min={0.01} max={99.99} suffix="%" placeholder="例如 80；留空关闭" style={{ width: '100%' }} /></Form.Item>
            </div>
            <Typography.Paragraph className="hawk-executor-config-note">触顶后停止新增输入；在途任务继续收尾，最终费用可能超过上限。</Typography.Paragraph>
          </section>
          <section className="hawk-stream-config-group">
            <div className="hawk-stream-config-heading"><ClockCircleOutlined aria-hidden="true" /><div><strong>累计运行时长</strong><p>按执行器累计的实际处理时间计算，并行环节同时处理只计一次。</p></div></div>
            <Form.Item name={['streamPolicy', 'runtimeLimitMs']} label="运行时长上限（选填）" extra="暂停、排队及无数据等待时间不计入；达到上限后停止新增输入，在途任务继续收尾。"><ExecutorDurationInput disabled={locked && !limitsEditable} /></Form.Item>
          </section>
          <section className="hawk-stream-config-group">
            <div className="hawk-stream-config-heading"><ClockCircleOutlined aria-hidden="true" /><div><strong>输入源等待</strong><p>当前没有数据时等待；收到数据、消息、心跳或传输进度都会重新计时。</p></div></div>
            <Form.Item name={['streamPolicy', 'idleTimeoutMs']} label="无输入源活动等待时长（分钟）" rules={[{ required: true, message: '请设置无活动等待时长' }]} getValueProps={value => ({ value: value === undefined ? 10 : value / 60000 })} getValueFromEvent={value => value == null ? undefined : value * 60000} extra="默认10分钟。连续无活动超时后停止取数，在途收尾；源活动恢复后仍须手动继续。检查失败也暂停并标明原因。"><InputNumber disabled={locked && !limitsEditable} min={1} precision={0} style={{ width: '100%' }} /></Form.Item>
          </section>


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
      <details className="hawk-config-existing-settings"><summary>交付文件与提醒设置{locked ? '（已锁定）' : ''}</summary><section className="hawk-settings-section">
        <div className="hawk-settings-section-heading"><h3>交付文件</h3><p>只影响输出文件的行顺序，不改变批次或处理顺序。</p></div>
        <Form.Item name="deliveryMode" label="交付文件排序"><Radio.Group disabled={locked} aria-label="执行器交付文件排序" optionType="button" options={[{ value: 'sorted', label: '按输入顺序排序' }, { value: 'unsorted', label: '不排序，更快生成' }]} /></Form.Item>
      </section>
      <section className="hawk-settings-section">
        <div className="hawk-settings-section-heading"><h3><BellOutlined aria-hidden="true" /> 待处理提醒</h3></div>
        <div className="hawk-settings-row hawk-executor-reminder-row">
          <div className="hawk-settings-row-label"><strong>加急提醒</strong><p>停止且需人工处理时，是否加急提醒？</p></div>
          <div>
            <Form.Item name={['settings', 'urgentReminder']}><Radio.Group disabled={locked} aria-label="停止且需人工处理时加急提醒" optionType="button" className="hawk-executor-reminder" options={[{ value: true, label: '是，开启提醒' }, { value: false, label: '否，不加急' }]} /></Form.Item>
            <p className="hawk-executor-config-note">开启后突出显示待处理提醒。当前为本地演示，不发送真实消息。</p>
          </div>
        </div>
      </section>
      </details><p className="hawk-executor-config-footnote">配置仅对本次执行器生效；资源数量及重试结果为本地模拟。</p>
    </Form>
  </Modal>;
}
