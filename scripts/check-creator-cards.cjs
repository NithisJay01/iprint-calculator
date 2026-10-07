const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:"msedge"});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/cards/');
 await page.locator('#gallery article').last().waitFor();
 await page.locator('[data-filter="collectible"]').click();
 assert.equal(await page.locator('#gallery article:visible').count(),2);
 await page.locator('#gallery article:visible button').first().click();
 assert.equal(await page.locator('#artDialog').evaluate(d=>d.open),true);
 await page.keyboard.press('Escape');
 await page.locator('[data-filter="all"]').click();
 await page.locator('[name="designs"]').fill('3');await page.locator('[name="quantity"]').fill('50');
 assert.match(await page.locator('#total').innerText(),/150/);
 await page.locator('#briefForm button[type="submit"]').click();
 const brief=await page.locator('#briefText').inputValue();assert.match(brief,/3 แบบ × 50 ใบ = 150 ใบ/);
 assert.ok(decodeURIComponent(await page.locator('#lineLink').getAttribute('href')).includes(brief));
 await page.keyboard.press('Escape');
 await page.evaluate(()=>scrollTo(0,0));
 await page.screenshot({path:'deploy/cards-desktop.png',fullPage:true});
 for(const width of [390,768,1440]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow at ${width}`);
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'deploy/cards-mobile.png',fullPage:true});
 await page.evaluate(async()=>{for(const image of document.images){image.loading='eager';await image.decode().catch(()=>{});}});
 assert.deepEqual(await page.locator('img').evaluateAll(images=>images.filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src)),[]);
 assert.deepEqual(errors,[]);
 await page.goto('http://127.0.0.1:8765/catalog/');assert.equal(await page.locator('[data-product-id="postcard"] a').getAttribute('href'),'../cards/');
 console.log('PASS: filters, image dialog, quantities, LINE payload, responsive widths, images, catalog link; no page errors.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

