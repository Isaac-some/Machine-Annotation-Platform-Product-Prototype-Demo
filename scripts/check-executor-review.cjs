/* eslint-disable @typescript-eslint/no-require-imports */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('node:fs'), assert=require('node:assert/strict');
const dir='docs/executor-review-20261110';fs.mkdirSync(dir,{recursive:true});
(async()=>{
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.DEMO_URL || 'http://127.0.0.1:3057/hawk/pipeline/executor/?id=phase2-reservoir&example=phase2');
 await page.getByRole('button',{name:'演示与验收',exact:true}).waitFor({timeout:60000});
 await page.screenshot({path:dir+'/01-entry.png'});
 await page.getByRole('button',{name:'演示与验收',exact:true}).click();
 await page.waitForTimeout(350); await page.screenshot({path:dir+'/02-drawer.png'});
 await page.getByRole('button',{name:'费用触顶与收尾',exact:true}).click();
 await page.waitForURL(/executor-demo-showcase/,{timeout:60000});
 await page.getByRole('button',{name:'累计费用与运行详情',exact:true}).click();
 await page.waitForTimeout(9000);
 await page.screenshot({path:dir+'/03-cost.png'});
 const dialog=page.getByRole('dialog');
 assert.match(await dialog.innerText(),/达到成本上限|停止新增|收尾/);
 await dialog.getByRole('button',{name:/^关\s*闭$/}).click();
 await page.getByRole('button',{name:'输入及执行器配置',exact:true}).click();
 await page.waitForTimeout(350); await page.setViewportSize({width:1440,height:2400}); await page.waitForTimeout(200); await page.screenshot({path:dir+'/04-configuration.png'}); await page.setViewportSize({width:1440,height:1000});
 assert.equal(await page.getByText(/首次更新后的步长/).count(),0);
 assert(await page.getByText('原始数据取入上限（选填，条）',{exact:true}).isVisible());
 await page.getByRole('dialog').getByRole('button',{name:/^关\s*闭$/}).click();
 assert.equal(await page.locator('.hawk-executor-main > .hawk-stream-source').count(),0);
 assert(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth));
 assert.deepEqual(errors,[]);
 fs.writeFileSync(dir+'/browser-report.json',JSON.stringify({passed:true,errors,checks:['一键场景','费用触顶与收尾','主界面对齐','移除步长输入','语义区分','无横向溢出']},null,2));
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
