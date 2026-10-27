/** PSE live news thumbnail read-only contract, independent of WordPress menu QA. */
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const config = Object.fromEntries(String(process.env.ENV_FILE || '')
  .split(/\r?\n/).map(line => line.trim().replace(/^export\s+/, ''))
  .filter(line => /^(WC_URL|WC_URL_CLIENT)=/.test(line))
  .map(line => {
    const eq = line.indexOf('=');
    return [line.slice(0, eq), line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')];
  }));
function origin(value, name) {
  const url = new URL(value || '');
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password ||
      url.port || !['', '/'].includes(url.pathname) || url.search || url.hash)
    throw Error('Invalid ' + name);
  return url.origin;
}
const wp = origin(config.WC_URL, 'WordPress');
const frontend = origin(config.WC_URL_CLIENT, 'frontend');
if (wp === frontend) throw Error('WordPress and frontend must be isolated');
async function wpJson(path) {
  const response = await fetch(wp + path, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw Error('WP REST HTTP ' + response.status);
  return response.json();
}
const categories = ['thong-tin-co-dong', 'tin-cong-ty'];
const browser = await chromium.launch({ headless: true });
await mkdir('artifacts/pse-news-thumbnails', {recursive:true});
const results = [];
try {
  for (const slug of categories) {
    const cats = await wpJson('/wp-json/wp/v2/categories?slug=' + encodeURIComponent(slug) + '&_fields=id,slug');
    if (cats.length !== 1) throw Error('Category not uniquely resolved: ' + slug);
    const posts = await wpJson('/wp-json/wp/v2/posts?_embed=true&status=publish&orderby=date&order=desc&per_page=12&categories=' + cats[0].id);
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    try {
      const response = await page.goto(frontend + '/tin-tuc-su-kien/' + slug, {waitUntil:'domcontentloaded',timeout:60000});
      if (response?.status() !== 200) throw Error('News category HTTP '+response?.status());
      const images = await page.locator('#posts-grid .grid > div .post-card-img').evaluateAll(nodes =>
        nodes.map(el => ({src:el.getAttribute('src') || '',alt:el.getAttribute('alt') || ''})));
      if (!posts.length || !images.length) throw Error('News archive has no cards: '+slug);
      const backendImages = images.map((img, index) => ({index, src:img.src})).filter(img => img.src.includes(new URL(wp).hostname));
      if (backendImages.length) console.log('PSE_NEWS_THUMBNAIL_BACKEND_IMAGES='+JSON.stringify({slug, backendImages:backendImages.slice(0,5)}));
      if (backendImages.length) throw Error('Backend hostname exposed in image src');
      let eligible = 0;
      let recovered = 0;
      for (const [i, post] of posts.entries()) {
        if (!images[i]) break;
        const html = String(post.content?.rendered || '');
        const bodyHasImage = /<img\b[^>]*(?:wp-content\/uploads\/[^\s"'<>]+|https:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp|gif))[^>]*>/i.test(html);
        const alreadyFeatured = Boolean(post.yoast_head_json?.og_image?.[0]?.url ||
          post._embedded?.['wp:featuredmedia']?.[0]?.source_url);
        if (!bodyHasImage || alreadyFeatured) continue;
        eligible++;
        if (images[i].src !== '/images/posts/no-image.svg' && images[i].src !== '') recovered++;
      }
      const result = {slug,wpPosts:posts.length,cards:images.length,eligible,recovered,
        sameOriginImageApis:images.filter(x=>x.src.startsWith('/api/images/')||x.src.startsWith('/api/files/')).length,
        placeholders:images.filter(x=>x.src==='/images/posts/no-image.svg').length};
      results.push(result);
      if (eligible !== recovered) throw Error('Eligible body thumbnail mismatch: '+JSON.stringify(result));
      if (slug === 'thong-tin-co-dong') await page.screenshot({
        path:'artifacts/pse-news-thumbnails/shareholder-news.png',animations:'disabled'});
    } finally { await page.close(); }
  }
  console.log('PSE_NEWS_THUMBNAIL_LIVE='+JSON.stringify(results));
  console.log('PSE_NEWS_THUMBNAIL_LIVE_STATUS=PASS; READ_ONLY=PASS; NO_ASTRO_BUILD=PASS');
} finally {await browser.close();}
