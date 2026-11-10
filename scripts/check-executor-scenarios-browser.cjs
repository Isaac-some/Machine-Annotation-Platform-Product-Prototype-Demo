/* eslint-disable @typescript-eslint/no-require-imports */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),assert=require('node:assert/strict');
const scenarios=[['input','原始数据取入上限'],['target','达到目标成品量'],['time','实际运行时长上限'],['estimate','小批次自动预估'],['cid','CID 输入与持续生产'],['csv','CSV 读取与 RowKey 校验'],['csv-invalid','CSV 缺少 RowKey'],['insufficient','数据不足与等待新增'],['end','供数结束'],['idle','无活动超时'],['error','输入源检查失败'],['retry','失败数据原位恢复'],['zero','零成品估算边界'],['cost','费用触顶与收尾']];
(async()=>{const b=await chromium.launch({headless:true,channel:'chrome'});try{
 const p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[],report=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.goto(process.env.DEMO_URL||'http://127.0.0.1:3058/hawk/pipeline/executor/?id=phase2-reservoir&example=phase2');
 await p.getByRole('button',{name:'演示与验收',exact:true}).waitFor();
 await p.evaluate(()=>{window.demoLongTasks=[];new PerformanceObserver(list=>window.demoLongTasks.push(...list.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:false});});
 let initialCount;
 for(const [id,title] of scenarios){
  await p.getByRole('button',{name:'演示与验收',exact:true}).click();
  const start=Date.now();await p.getByRole('button',{name:title,exact:true}).click();
  await p.waitForFunction(()=>!document.querySelector('.ant-drawer-open'));
  await p.waitForFunction(()=>{const w=JSON.parse(localStorage.getItem('annotation-demo.local-workspace.v2'));return w.executors.some(e=>e.id==='executor-demo-showcase');});
  const loaded=Date.now()-start;
  await p.waitForTimeout(7800);
  const state=await p.evaluate(()=>{const w=JSON.parse(localStorage.getItem('annotation-demo.local-workspace.v2'));return {executor:w.executors.find(e=>e.id==='executor-demo-showcase'),batches:w.batches.length,running:w.executors.filter(e=>e.runtime?.state==='running').length,bytes:localStorage.getItem('annotation-demo.local-workspace.v2').length};});
  const s=state.executor.stream;
  if(['cost','input','time','target','idle'].includes(id))assert.equal(s.stopReason,id);
  if(id==='estimate')assert(s.estimateRootIds?.length>0);
  if(id==='csv')assert.equal(s.source.totalKnown,true);
  if(id==='csv-invalid')assert.match(s.source.error,/RowKey/);
  if(id==='insufficient')assert.equal(s.source.waiting,true);
  if(id==='end')assert.equal(s.phase,'completed');
  if(id==='error')assert.equal(s.stopReason,'source-error');
  if(id==='retry')assert.equal(state.executor.runtime.state,'paused');
  if(id==='zero')assert.equal(s.stages.at(-1).outputs,0);
  initialCount??=state.batches;assert.equal(state.batches,initialCount);assert(state.running<=1);
  assert(loaded<10000);report.push({id,loadedMs:loaded,stopReason:s.stopReason,phase:s.phase,storageBytes:state.bytes});console.log(id,'passed',loaded);
 }
 const longTasks=await p.evaluate(()=>window.demoLongTasks||[]);
 await p.reload();await p.getByRole('button',{name:'演示与验收',exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 fs.writeFileSync('docs/executor-review-20261110/scenarios-browser-report.json',JSON.stringify({passed:true,url:process.env.DEMO_URL||'local static build',scenarios:report,errors,longTasks},null,2));
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
