/* eslint-disable @typescript-eslint/no-require-imports */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
const S=require('../src/components/sites/hawk/data/executor-streaming.ts');
const {withPhase2Examples}=require('../src/components/sites/hawk/data/phase2-examples.ts');
const dir='docs/executor-phase2-20261103.assets',key='annotation-demo.local-workspace.v1';
const fixture=()=>withPhase2Examples({groups:[],projects:[{id:234,name:'合成演示项目'}],executors:[],batches:[]});
const tick=(w,n,id)=>{for(let i=0;i<n;i++)w=S.tickStream(w,id);return w};
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROME_EXECUTABLE,headless:true});const report={checks:[],errors:[]};try{
const c=await b.newContext({viewport:{width:1600,height:1200},deviceScaleFactor:2,timezoneId:'Asia/Shanghai'}),p=await c.newPage();p.on('pageerror',e=>report.errors.push(e.message));
const url=id=>`http://localhost:3017/hawk/pipeline/executor/?id=${id}&example=phase2`;
const snap=async(loc,name)=>{await loc.waitFor();await p.waitForTimeout(500);await loc.screenshot({path:`${dir}/${name}.png`,animations:'disabled'});report.checks.push(name)};
await p.goto(url('phase2-demo'));await p.getByRole('button',{name:'一键运行',exact:true}).waitFor();
await p.getByRole('button',{name:'输入及执行器配置',exact:true}).click();await snap(p.locator('.hawk-executor-configuration'),'01-stream-configuration');await p.getByRole('button',{name:/取\s*消|Cancel/}).click();
await p.getByRole('button',{name:'一键运行',exact:true}).click();await p.waitForTimeout(4200);await p.getByRole('button',{name:'暂停运行',exact:true}).click();await snap(p.locator('.hawk-stream-panel'),'02-sample');
const before=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).executors.find(e=>e.id==='phase2-demo').stream.costCents,key);await p.reload();await p.getByRole('button',{name:'继续运行',exact:true}).waitFor();const after=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).executors.find(e=>e.id==='phase2-demo').stream.costCents,key);if(before!==after)throw Error('Paused state changed on reload');report.checks.push('刷新保留样本暂停与费用');
await p.getByRole('button',{name:'继续运行',exact:true}).click();await p.getByRole('button',{name:'确认公式预算',exact:true}).waitFor({timeout:40000});await snap(p.locator('.hawk-stream-panel'),'03-budget-wait');await p.getByRole('button',{name:'确认公式预算',exact:true}).click();await snap(p.locator('.ant-modal-content:visible'),'04-budget-confirm');await p.getByRole('button',{name:'确认并继续生产',exact:true}).click();await p.waitForTimeout(4200);await p.getByRole('button',{name:'暂停运行',exact:true}).click();await snap(p.locator('.hawk-stream-panel'),'05-production');
await p.getByRole('button',{name:'重算并确认预算',exact:true}).click();await p.getByRole('spinbutton',{name:'预计最终成品数',exact:true}).fill('40');await snap(p.locator('.ant-modal-content:visible'),'06-recalculate');await p.getByRole('button',{name:/取\s*消|Cancel/}).click();
await p.getByRole('button',{name:/克隆执行器/}).click();await snap(p.locator('.ant-modal-content:visible'),'10-clone');await p.getByRole('button',{name:/取\s*消|Cancel/}).click();
async function seed(w,id){await p.evaluate(({w,key})=>{localStorage.setItem(key,JSON.stringify(w));window.dispatchEvent(new Event('hawk-workspace-change'))},{w,key});await p.goto(url(id));await p.locator('.hawk-stream-panel').waitFor();}
let w=tick(S.startStream(fixture(),'phase2-cost'),30,'phase2-cost');w=S.confirmStreamBudget(w,'phase2-cost',36,0.12);
while(!w.executors.find(e=>e.id==='phase2-cost').stream.triggerCostCents)w=tick(w,1,'phase2-cost');await seed(w,'phase2-cost');await snap(p.locator('.hawk-stream-panel'),'07-draining');
w=tick(w,80,'phase2-cost');w=S.takeOverStream(w,'phase2-cost');w=tick(w,10,'phase2-cost');await seed(w,'phase2-cost');await snap(p.locator('.hawk-stream-panel'),'08-manual-review');
await p.getByRole('button',{name:/准备失败数据补救/}).click();await p.getByRole('button',{name:'确认准备补救',exact:true}).click();await p.waitForTimeout(1400);await snap(p.locator('.hawk-stream-panel'),'09-recovery-scan');await p.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).executors.find(e=>e.id==='phase2-cost').stream.recoveryRuns===1,key);report.checks.push('浏览器操作完成原位补救准备');
w=tick(S.startStream(fixture(),'phase2-zero'),40,'phase2-zero');await seed(w,'phase2-zero');await snap(p.locator('.hawk-stream-panel'),'11-zero-output');
await p.goto('http://localhost:3017/hawk/project/batch/?id=234&batchId=5889&example=delivery');await p.getByRole('button',{name:'梯度告警',exact:true}).click();await p.getByRole('button',{name:'命中档位',exact:true}).click();await p.getByRole('spinbutton',{name:'演示失败率',exact:true}).fill('80');await p.getByRole('button',{name:'命中档位',exact:true}).click();await p.getByRole('button',{name:'推进 1 分钟',exact:true}).click();await snap(p.locator('.ant-modal-content:visible'),'12-alarm');await p.getByRole('button',{name:/关\s*闭/}).click();
await p.evaluate(k=>{const w=JSON.parse(localStorage.getItem(k)),b=w.batches.find(b=>b.id===5889);b.failed=3;localStorage.setItem(k,JSON.stringify(w));window.dispatchEvent(new Event('hawk-workspace-change'));},key);
await p.getByRole('button',{name:'暂停后优先重试失败数据',exact:true}).click();await snap(p.locator('.ant-modal-content:visible'),'13-batch-retry');await p.getByRole('button',{name:'准备失败输入',exact:true}).click();await p.waitForTimeout(1500);await snap(p.getByRole('region',{name:'批次重试与告警'}),'14-batch-scan');

await p.goto('http://localhost:3017/hawk/pipeline/executor/?id=delivery-demo&example=delivery');await p.getByRole('button',{name:'输入及执行器配置',exact:true}).click();await snap(p.locator('.hawk-executor-configuration'),'16-batch-configuration');await p.getByRole('button',{name:/取\s*消|Cancel/}).click();
w=tick(S.startStream(fixture(),'phase2-demo'),30,'phase2-demo');w=S.confirmStreamBudget(w,'phase2-demo',36,0.8);w=tick(w,180,'phase2-demo');await seed(w,'phase2-demo');await p.locator('.hawk-stream-panel summary').click();await snap(p.locator('.hawk-stream-panel'),'17-retry-record');
await p.goto('http://localhost:3017/hawk/project/batch/?id=234&batchId=5889&example=delivery');await snap(p.locator('.hawk-batch-page'),'18-paused-nodes');
await snap(p.locator('.hawk-batch-header-bottom'),'19-finish-options');
await p.setViewportSize({width:390,height:844});await p.goto(url('phase2-demo'));await p.getByRole('button',{name:'输入及执行器配置',exact:true}).waitFor();await p.getByRole('button',{name:/克隆执行器/}).click();await snap(p.locator('.ant-modal-content:visible'),'15-mobile-clone');const box=await p.locator('.ant-modal-content:visible').boundingBox();if(box.x<0||box.x+box.width>391)throw Error('Mobile clone overflow');report.checks.push('390px 克隆主按钮可达');
fs.writeFileSync('docs/executor-phase2-browser-report.json',JSON.stringify(report,null,2));await c.close();}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
