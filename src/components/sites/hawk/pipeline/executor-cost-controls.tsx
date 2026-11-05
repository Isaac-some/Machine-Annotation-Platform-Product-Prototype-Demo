'use client';
import { useState } from 'react';
import { Alert, Button, Input, Modal, Select, Space, Typography, message } from 'antd';
import { readWorkspace, writeWorkspace, type LocalExecutor } from '../data/local-workspace';
const LEVELS=['不通知','飞书消息','飞书加急','短信','电话'];
export function ExecutorCostControls({ executor: e }: { executor: LocalExecutor }) {
 const [open,setOpen]=useState(false),[kind,setKind]=useState<'accuracy'|'missed'>('accuracy'),[text,setText]=useState(''),[batch,setBatch]=useState<number>(),[msg,holder]=message.useMessage();
 const [notice,setNotice]=useState(e.notification??{baseline:1,reminder:1,stop:2,recipients:''});
 const prompt=e.stream?.costPrompts?.filter(p=>p.sampled&&!e.costFeedback?.some(f=>f.eventId===p.id)).at(-1);
 const update=(patch:Partial<LocalExecutor>)=>{const w=readWorkspace();writeWorkspace({...w,executors:w.executors.map(x=>x.id===e.id?{...x,...patch}:x)});};
 return <>{holder}<Button onClick={()=>setOpen(true)}>通知与成本反馈</Button><Modal title="通知与成本反馈" open={open} width={650} cancelText="关闭" onCancel={()=>setOpen(false)} footer={<Button onClick={()=>setOpen(false)}>关闭</Button>}>
  <Typography.Title level={5}>全局通知基准与成本升级</Typography.Title>
  <Space direction="vertical" style={{width:'100%'}}>{(['baseline','reminder','stop'] as const).map((key,i)=><label key={key}>{['通知基准','成本提前提醒','成本上限触发'][i]} <Select aria-label={['通知基准','成本提前提醒','成本上限触发'][i]} value={notice[key]} style={{width:180}} options={LEVELS.map((label,value)=>({label,value}))} onChange={value=>setNotice({...notice,[key]:value})}/></label>)}<Input aria-label="共同接收人" placeholder="共同接收人（演示标识，逗号分隔）" value={notice.recipients} onChange={x=>setNotice({...notice,recipients:x.target.value})}/><Button onClick={()=>{if(Math.max(notice.baseline,notice.reminder,notice.stop)>0&&!notice.recipients.trim()){msg.error('有效通知须填写接收人');return;}update({notification:notice});msg.success('模拟通知配置已保存');}}>保存通知配置</Button></Space>
  <p>实际提前提醒：{LEVELS[Math.max(notice.baseline,notice.reminder)]}；成本上限触发：{LEVELS[Math.max(notice.baseline,notice.stop)]}。不能低于全局基准。</p>
  <Alert type="info" message="仅本地保存和强度预览；真实通道、权限、送达与重试待生产联调。通知失败不改变已选择的运行动作。"/>
  <Typography.Title level={5}>成本提示准确性 / 主动报告漏报</Typography.Title>
  <p>每个新成本提示固定约50%抽样；刷新不重抽。{prompt?`当前抽中提示：${prompt.id} · ${prompt.text} · 提醒强度：${LEVELS[prompt.notificationLevel ?? 0]}`:'当前没有待评价的抽中提示。'}</p>
  <Space direction="vertical" style={{width:'100%'}}><Select aria-label="反馈类型" value={kind} onChange={setKind} options={[{value:'accuracy',label:'成本提示准确性评价'},{value:'missed',label:'有问题但未提醒（主动报告）'}]}/>{kind==='missed'&&<Select aria-label="受影响批次" placeholder="选择受影响批次" value={batch} onChange={setBatch} options={(e.runtime?.batchIds??[]).map((id,i)=>({value:id,label:`第${i+1}环节 · Batch ${id}`}))}/>}<Input.TextArea aria-label="反馈说明" value={text} onChange={x=>setText(x.target.value)} placeholder="说明本次成本提示是否准确，或未提醒的问题"/><Button disabled={kind==='accuracy'&&!prompt} onClick={()=>{if(!text.trim()||kind==='missed'&&!batch){msg.error('请填写说明及受影响批次');return;}update({costFeedback:[...(e.costFeedback??[]),{kind,eventId:kind==='accuracy'?prompt?.id:undefined,batchId:batch,text:text.trim(),at:Date.now()}]});setText('');msg.success('业务反馈已保存在本机；运行状态与预算不变');}}>保存业务反馈</Button></Space>
  <Typography.Paragraph type="secondary">反馈不代替人工接管，不调整预算、不自动启动；主动报告不要求有历史成本提示。已保存 {e.costFeedback?.length??0} 条。</Typography.Paragraph>
 </Modal></>;
}
