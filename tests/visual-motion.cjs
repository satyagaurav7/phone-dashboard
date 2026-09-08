// Run against the synthetic preview server; no production account is used.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdirSync } = require('node:fs');
(async () => {
  const browser = await chromium.launch({headless:true,channel:'msedge'});
  mkdirSync('tests/visual-output', {recursive:true});
  try {
    for (const width of [320,375,430,1280]) {
      const page = await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto('http://127.0.0.1:8765/preview.html');
      await page.locator('#executionBoard').waitFor();
      await page.evaluate(()=>document.fonts.ready);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);
      const next=await page.locator('.executionNext').boundingBox();
      assert.ok(next.y+next.height<800,`Next visible ${width}`);
      await page.screenshot({path:`tests/visual-output/today-${width}.png`});
      const block=page.locator('[data-disclosure="block-morning"]');
      await block.evaluate(el=>el.open=false);
      await block.locator(':scope > summary').click();
      const animations=await block.evaluate(el=>el.getAnimations({subtree:true}).length);
      assert.ok(animations>0,'opening a checklist animates');
      await page.waitForTimeout(220);
      assert.ok(await block.locator('.routineInstruction').count()>0,'inline routine instructions');
      await block.locator('[data-water-add="250"]').click();
      await block.locator('[data-water-undo]').click();
      const steps=page.locator('[data-disclosure="steps-getready"]');
      assert.equal(await steps.evaluate(el=>el.open),true,'get-ready steps visible');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`expanded overflow ${width}`);
      await block.screenshot({path:`tests/visual-output/morning-${width}.png`});
      const item=block.locator('.boardItem').first();
      await item.click();
      await page.waitForTimeout(100);
      assert.ok(await block.getAttribute('open')!==null,'logging preserves expansion');
      await page.emulateMedia({reducedMotion:'reduce'});
      await block.locator(':scope > summary').click();
      await block.locator(':scope > summary').click();
      assert.equal(await block.evaluate(el=>el.getAnimations({subtree:true}).length),0,'reduced motion stays still');
      assert.deepEqual(errors,[],`runtime errors ${width}`);
      console.log(`${width}px: fits, Next visible, disclosure motion, logging, reduced motion passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
