import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage({ deviceScaleFactor:2, viewport:{width:940,height:1620} });
await page.goto('file://'+process.cwd()+'/shishka-door-sign.svg',{waitUntil:'networkidle'});
await page.evaluate(async()=>{await document.fonts.ready;});
await page.waitForTimeout(500);
await page.screenshot({ path:'shishka-door-sign-svg-preview.png' });
await browser.close(); console.log('done');
