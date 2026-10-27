/** Read-only browser QA for PSE desktop deferred carousel and mobile unchanged. */
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
    {name:'desktop',width:1440,height:900,media:'(min-width: 640px)'},
    {name:'mobile',width:390,height:844,media:'(max-width: 639px)'},
  ]) {
    const page = await browser.newPage({viewport:{width:scenario.width,height:scenario.height}, deviceScaleFactor:1});
    try {
      const response = await page.goto(target, {waitUntil:'domcontentloaded',timeout:45000});
      if (!response?.ok()) throw new Error(scenario.name + ' HTTP ' + response?.status());
      const slider = page.locator('[data-home-slider]').filter({has:page.locator('[data-slider-dot]')})
        .and(page.locator('[data-home-slider][data-slider-media="' + scenario.media + '"]'));
      await slider.waitFor({state:'visible',timeout:20000});
      const items = slider.locator('[data-home-slide]');
      const count = await items.count();
      if (count < 2) throw new Error(scenario.name + ' expected 2+ published slides: '+count);
      const first = await items.first().evaluate(el => ({
        active:el.classList.contains('is-active'),
        alt:el.querySelector('img')?.alt || '',
      }));
      if (!first.active) throw new Error(scenario.name + ' first slide was not active');
      const deferred = await slider.locator('source[data-deferred-media]').count();
      if (scenario.name === 'desktop' && deferred < 1) throw new Error('Desktop initial image deferral absent');
      if (scenario.name === 'mobile' && deferred !== 0) throw new Error('Mobile regression: deferred source unexpectedly present');

      await page.waitForFunction((media) => {
        const slider = [...document.querySelectorAll('[data-home-slider]')].find(s => s.dataset.sliderMedia === media);
        const img = slider?.querySelector('[data-home-slide].is-active picture img');
        return Boolean(img?.complete && img.naturalWidth > 1 && !img.currentSrc.startsWith('data:'));
      }, scenario.media, {timeout:20000});

      await slider.locator('[data-slider-next]').click();
      await page.waitForFunction((media) => {
        const slider = [...document.querySelectorAll('[data-home-slider]')].find(s => s.dataset.sliderMedia === media);
        const active = slider?.querySelector('[data-home-slide].is-active');
        const img = active?.querySelector('picture img');
        return active?.getAttribute('data-esc-builder-image-row') !==
          slider?.querySelector('[data-home-slide]')?.getAttribute('data-esc-builder-image-row')
          && Boolean(img?.complete && img.naturalWidth > 1 && !img.currentSrc.startsWith('data:'));
      }, scenario.media, {timeout:20000});

      const second = await slider.locator('[data-home-slide].is-active img').evaluate(img => ({
        naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight,
        srcPath:(()=>{try{return new URL(img.currentSrc).pathname}catch{return ''}})(),
      }));
      await slider.locator('[data-slider-prev]').click();
      await page.waitForFunction((media)=>{
        const slider=[...document.querySelectorAll('[data-home-slider]')].find(s=>s.dataset.sliderMedia===media);
        return Boolean(slider?.querySelector('[data-home-slide]')?.classList.contains('is-active'));
      },scenario.media,{timeout:10000});
      const check={scenario:scenario.name,count,first,deferred,second,prevWorks:true,origin:base.origin};
      output.push(check);
      console.log('PSE_HOME00_LIVE_QA='+JSON.stringify(check));
    } finally {
      await page.close();
    }
  }
  writeFileSync('artifacts/pse-home00/qa.json',JSON.stringify(output,null,2)+'\n');
  console.log('PSE_HOME00_DESKTOP_MOBILE_INTERACTION=PASS');
} finally {await browser.close();}
