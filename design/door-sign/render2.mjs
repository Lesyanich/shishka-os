import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ deviceScaleFactor:2, viewport:{width:940,height:1560} });
await page.goto('file://'+process.cwd()+'/shishka-door-sign-v2.html',{waitUntil:'networkidle'});
await page.evaluate(async()=>{await document.fonts.ready;});
await page.waitForTimeout(400);
await (await page.$('#card')).screenshot({ path:'shishka-door-sign-v2.png' });
await browser.close(); console.log('done');
