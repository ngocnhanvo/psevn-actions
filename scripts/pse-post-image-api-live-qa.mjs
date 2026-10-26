/** Read-only public PSE article-image contract. No backend URLs in rendered img HTML. */
import { chromium } from 'playwright';

const variables = Object.fromEntries(String(process.env.ENV_FILE || '')
  .split(/\r?\n/).map(s => s.trim().replace(/^export\s+/, ''))
  .filter(s => /^(WC_URL|WC_URL_CLIENT)=/.test(s))
  .map(s => {
    const [key, ...parts] = s.split('=');
    return [key, parts.join('=').trim().replace(/^['"]|['"]$/g, '')];
  }));
function secureOrigin(name) {
  const address = new URL(variables[name]);
  if (address.protocol !== 'https:' || !address.hostname || address.username ||
      address.password || address.search || address.hash || !['', '/'].includes(address.pathname)) {
    throw new Error('Invalid configured media origin: ' + name);
  }
  return address.origin;
}

const frontend = secureOrigin('WC_URL_CLIENT');
const backend = secureOrigin('WC_URL');
if (frontend === backend) throw new Error('Frontend and WordPress origin must differ');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const url = frontend + '/tin-tuc-su-kien/tin-cong-ty/2';
  const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (res?.status() !== 200) throw new Error('PSE article archive HTTP ' + res?.status());
  const archive = await page.locator('#posts-grid img').evaluateAll(imgs => imgs.map(img => ({
    src: img.getAttribute('src') || '',
    srcset: img.getAttribute('srcset') || '',
  })));
  if (!archive.length) throw new Error('Article archive has no image cards to inspect');
  if (archive.some(x => x.src.includes(backend) || x.srcset.includes(backend))) {
    throw new Error('WordPress backend URL exposed in article listing images');
  }
  // This legacy original was verified against the WordPress media library;
  // the existing API must serve WebP or redirect only on known missing Imagick.
  const path = '/wp-content/uploads/2026/10/pse-legacy-002f8f414ad7015f.jpg';
  const apiUrl = frontend + '/api/images/2560/jpg' + path.replace(/\.jpg$/, '.webp');
  const request = await browser.newContext();
  const probe = await request.request.get(apiUrl, { maxRedirects: 0, timeout: 50000 });
  const status = probe.status();
  const headers = probe.headers();
  const webpOK = status === 200 && (headers['content-type'] || '').startsWith('image/webp');
  const missingFallbackOK = status === 307 &&
    headers['x-esc-image-fallback'] === 'imagick_missing' &&
    headers['cache-control']?.includes('no-store') &&
    headers['location'] === backend + path;
  if (!webpOK && !missingFallbackOK) {
    throw new Error('Image API must return WebP 200 or Imagick-only 307: got HTTP ' + status);
  }
  await request.close();
  const firstDetail = await page.locator('#posts-grid a[href]').first().getAttribute('href');
  if (!firstDetail) throw new Error('Missing article detail link');
  const detail = await page.goto(new URL(firstDetail, frontend).href,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (detail?.status() !== 200) throw new Error('Article detail HTTP ' + detail?.status());
  const bodyImages = await page.locator('#article-content img').evaluateAll(imgs => imgs.map(img => ({
    src: img.getAttribute('src') || '',
    srcset: img.getAttribute('srcset') || '',
  })));
  if (bodyImages.some(x => x.src.includes(backend) || x.srcset.includes(backend))) {
    throw new Error('WordPress backend URL exposed in article detail HTML');
  }
  console.log('PSE_POST_IMAGE_API=PASS archive_cards=' + archive.length +
    ' article_body_images=' + bodyImages.length +
    ' proxy=' + (webpOK ? 'image_webp' : 'imagick_missing_fallback') +
    ' backend_origin_in_img=NONE read_only=true');
} finally {
  await browser.close();
}
