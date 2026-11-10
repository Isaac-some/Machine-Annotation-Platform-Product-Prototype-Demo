/* eslint-disable @typescript-eslint/no-require-imports */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const dir='docs/executor-review-20261110';
(async()=>{const b=await chromium.launch({headless:true,channel:'chrome'});try{const p=await b.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
await p.goto('http://127.0.0.1:3057/hawk/pipeline/executor/?id=phase2-reservoir&example=phase2');
await p.getByRole('button',{name:'输入及执行器配置',exact:true}).click();await p.setViewportSize({width:1440,height:2400});await p.waitForTimeout(400);await p.screenshot({path:dir+'/05-configuration-ready.png'});
await p.getByRole('dialog').getByRole('button',{name:/^取\s*消$/}).click();await p.setViewportSize({width:1440,height:1000});
await p.goto('http://127.0.0.1:3057/hawk/pipeline/executor/?id=phase2-time-basic&example=phase2');
await p.getByRole('button',{name:'累计费用与运行详情',exact:true}).click();await p.getByRole('button',{name:'投入与产量试算',exact:true}).click();await p.waitForTimeout(400);await p.screenshot({path:dir+'/06-calculator-budget.png'});
await p.getByText('按时长',{exact:true}).click();await p.waitForTimeout(200);await p.screenshot({path:dir+'/07-calculator-time.png'});
await p.getByText('目标产量 → 成本 / 时间',{exact:true}).click();await p.waitForTimeout(200);await p.screenshot({path:dir+'/08-calculator-target.png'});
await p.getByRole('button',{name:'再多做多少份',exact:true}).click();await p.waitForTimeout(200);await p.screenshot({path:dir+'/09-calculator-extra.png'});
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
