/** Read-only browser QA of the actual PSE Pse_00 ESC Table hero carousel. */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const config = Object.fromEntries(String(process.env.ENV_FILE || '')
  .split(/\r?\n/).map(s => s.trim()).filter(s => s.startsWith('WC_URL_CLIENT='))
  .map(s => ['WC_URL_CLIENT', s.slice('WC_URL_CLIENT='.length).replace(/^['"]|['"]$/g, '')]));
const base = new URL(config.WC_URL_CLIENT || '');
if (base.protocol !== 'https:' || !base.hostname || base.username || base.password ||
    !['', '/'].includes(base.pathname) || base.search || base.hash || base.port) {
  throw new Error('Invalid configured public PSE origin');
}
const target = new URL('/trang-chu', base.origin).href;
mkdirSync('artifacts/pse-home00', {recursive:true});
const browser = await chromium.launch({headless:true, args:['--no-sandbox', '--disable-dev-shm-usage']});
const output = [];
try {
  for (const scenario of [
    {name:'desktop',width:1440,height:900},
    {name:'mobile',width:390,height:844},
  ]) {
    const page = await browser.newPage({viewport:{width:scenario.width,height:scenario.height}, deviceScaleFactor:1});
    try {
      const response = await page.goto(target, {waitUntil:'domcontentloaded',timeout:45000});
      if (!response?.ok()) throw new Error(scenario.name + ' HTTP ' + response?.status());
      const slider = page.locator('[data-pse-slider]').first();
      await slider.waitFor({state:'visible',timeout:20000});
      const items = slider.locator('[data-pse-slide]');
      const count = await items.count();
      if (count < 2) throw new Error(scenario.name + ' expected 2+ ESC Table slides: '+count);
      const first = await items.first().evaluate(el => ({
        active:el.classList.contains('is-active'),
        alt:el.querySelector('img')?.alt || '',
      }));
      if (!first.active) throw new Error(scenario.name + ' first slide was not active');
      const deferred = await slider.locator('source[data-deferred-media]').count();
      if (deferred < 1) throw new Error(scenario.name + ' published inactive desktop source missing');

      await page.waitForFunction(() => {
        const img = document.querySelector('[data-pse-slider] [data-pse-slide].is-active img');
        return Boolean(img?.complete && img.naturalWidth > 1 && !img.currentSrc.startsWith('data:'));
      }, null, {timeout:20000});

      await slider.locator('[data-pse-dot="1"]').click();
      await page.waitForFunction(() => {
        const slider = document.querySelector('[data-pse-slider]');
        const second = slider?.querySelectorAll('[data-pse-slide]')[1];
        const img = second?.querySelector('img');
        return Boolean(second?.classList.contains('is-active') &&
          img?.complete && img.naturalWidth > 1 && !img.currentSrc.startsWith('data:'));
      }, null, {timeout:20000});

      const second = await items.nth(1).locator('img').evaluate(img => ({
        naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,
        srcPath:(()=>{try{return new URL(img.currentSrc).pathname}catch{return ''}})(),
      }));
      await slider.locator('[data-pse-dot="0"]').click();
      await page.waitForFunction(() => Boolean(
        document.querySelector('[data-pse-slider] [data-pse-slide]')?.classList.contains('is-active')
      ),null,{timeout:10000});
      const check={scenario:scenario.name,count,first,deferred,second,prevWorks:true,origin:base.origin};
      output.push(check);
      console.log('PSE_REAL_HERO_LIVE_QA='+JSON.stringify(check));
    } finally {
      await page.close();
    }
  }
  writeFileSync('artifacts/pse-home00/qa.json',JSON.stringify(output,null,2)+'\n');
  console.log('PSE_REAL_HERO_DESKTOP_MOBILE_INTERACTION=PASS');
} finally {await browser.close();}
