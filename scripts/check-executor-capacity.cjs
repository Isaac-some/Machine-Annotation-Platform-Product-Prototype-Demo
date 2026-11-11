/* eslint-disable @typescript-eslint/no-require-imports */
const{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('assert/strict'),fs=require('fs');
(async()=>{const b=await chromium.launch({channel:'chrome'});try{
 const p=await b.newPage({viewport:{width:1440,height:1000}}),base=process.env.DEMO_ORIGIN||'http://localhost:3058',errors=[],checks=[];p.on('pageerror',e=>errors.push(e.message));
 const state=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('annotation-demo.local-workspace.v2')).executors.find(e=>e.id==='executor-demo-showcase'));
 const open=async()=>{await p.getByRole('button',{name:'累计费用与运行详情',exact:true}).click();await p.getByRole('button',{name:'投入与产量试算',exact:true}).click()};
 await p.goto(base+'/hawk/pipeline/executor/?id=executor-demo-showcase&demo=estimate');await p.getByRole('button',{name:'开始演示',exact:true}).waitFor();await p.getByRole('button',{name:'开始演示',exact:true}).click();await open();const modal=p.locator('.hawk-cost-calculator'),result=modal.locator('.hawk-calculator-result');
 await p.getByRole('spinbutton',{name:'计划追加投入',exact:true}).fill('1577.54');await p.getByRole('spinbutton',{name:'计划追加投入',exact:true}).press('Tab');
 let prior=0,available=false;const began=Date.now();
 while((await state()).stream.settledInputs<85){
  const e=await state(),count=e.stream.estimateRootIds?.length||0;
  if(count!==prior){prior=count;const text=await result.innerText();if(count>=12){assert(!text.includes('暂无法估算'),`disappeared at ${count}: ${text}`);assert.match(text,/份/);available=true;checks.push({samples:count,outputs:e.stream.estimateRootIds.reduce((n,id)=>n+e.stream.estimateMetrics[id].finalOutputs,0),result:text});console.log('visible at '+count+' samples: '+text.replace(/\n/g,' | '));}
   assert.equal(await p.getByRole('spinbutton',{name:'计划追加投入',exact:true}).inputValue(),'1577.54');
  }
  assert(Date.now()-began<120000,'runtime failed to reach later refreshes');await p.waitForTimeout(200);
 }
 assert(available);assert(checks.some(c=>c.samples===38),'exact 38-input screenshot cohort must be exercised');
 // Freeze the existing run through the UI, then verify persistence without configuration edits.
 await modal.getByRole('button',{name:/关\s*闭/}).click();await modal.waitFor({state:'hidden'});await p.getByRole('dialog').getByRole('button',{name:/关\s*闭/}).click();await p.getByRole('button',{name:'暂停运行',exact:true}).click();
 await open();const before=await result.innerText();await p.waitForTimeout(2800);assert.equal(await result.innerText(),before);await p.reload();await open();assert(! (await result.innerText()).includes('暂无法估算'));
 // Replay a complete zero-output subgroup, retaining all observed costs.
 await p.evaluate(()=>{const k='annotation-demo.local-workspace.v2',w=JSON.parse(localStorage.getItem(k)),e=w.executors.find(e=>e.id==='executor-demo-showcase'),ids=e.stream.estimateRootIds,size=Math.ceil(ids.length/10);ids.slice(0,size).forEach(id=>e.stream.estimateMetrics[id].finalOutputs=0);localStorage.setItem(k,JSON.stringify(w));});
 await p.reload();await open();assert.match(await result.innerText(),/份（基准）/);assert.match(await modal.getByLabel('成本观测依据').innerText(),/基准可用.*范围未确定/);
 await p.getByText('目标产量 → 成本 / 时间',{exact:true}).click();assert.match(await result.innerText(),/¥.*（基准）/);await p.getByRole('button',{name:'再多做多少份',exact:true}).click();await p.getByRole('spinbutton',{name:'额外追加成品',exact:true}).fill('200');assert.match(await modal.innerText(),/追加后累计预计新增投入：¥.*（基准）/);assert(!/NaN|Infinity|undefined/.test(await modal.innerText()));
 console.log('PASS: complete zero-output group keeps a baseline for budget, target and extra plans; range explicitly unavailable');
 await p.evaluate(()=>{const k='annotation-demo.local-workspace.v2',w=JSON.parse(localStorage.getItem(k)),e=w.executors.find(e=>e.id==='executor-demo-showcase');Object.values(e.stream.estimateMetrics).forEach(row=>row.finalOutputs=0);localStorage.setItem(k,JSON.stringify(w));});
 await p.reload();await open();assert.match(await result.innerText(),/数据不足，暂无法估算/);console.log('PASS: wholly zero-output sample remains unavailable');
 assert.deepEqual(errors,[]);console.log('PASS: unchanged configuration retains forecasts through 38-input tail and later checkpoints; pause + reload preserve valid evidence');
 fs.writeFileSync(process.env.REPORT_PATH||'/tmp/capacity-browser-report.json',JSON.stringify({passed:true,origin:base,checks,errors},null,2));
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
