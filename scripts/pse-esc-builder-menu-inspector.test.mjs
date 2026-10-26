/**
 * PSE Visual Builder Menu inspector browser-DOM contract (NO BUILD / NO CMS).
 * Executes the actual inline PHP inspector JavaScript with a mocked WP REST
 * session. WordPress data is never written; the test only checks UI behavior.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../astro/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const source = readFileSync(new URL('../php/wp-content/plugins/esc-visual-builder/includes/shared-menu-ui.php', import.meta.url), 'utf8');
const script = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(script.length, 1, 'one native Menu inspector script');
const origin = 'https://preview.example.test';
const config = {
  origin, pageId: 10, readUrl: '/wp-json/esc-builder/v1/menu-item',
  saveUrl: '/wp-json/esc-builder/v1/save-menu-item',
  referenceUrl: '/wp-json/esc-builder/v1/menu-reference-options',
  nonce: 'test-rest', canEdit: true, managerUrl: '/wp-admin/nav-menus.php'
};
const js = script[0][1].replace(/<\?php[\s\S]*?\?>/g, JSON.stringify(config));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const read = {
  item_id: 103, menu_name: 'Header VI', lang: 'vi', label: 'Giới thiệu',
  description: '', custom_url: '', target: '', menu_type: 'dropdown',
  link_mode: 'page', reference_id: 301, reference_label: 'Giới thiệu PSE',
  reference_href: '/gioi-thieu', mega_position: 0, version: 'a'.repeat(64)
};
const updated = {
  ...read, reference_id: 303, reference_label: 'Giới thiệu doanh nghiệp',
  reference_href: '/gioi-thieu-doanh-nghiep', version: 'b'.repeat(64),
  saved: true
};
function setup(canEdit = true) {
  const dom = new JSDOM(
    '<div id="esc-vb-layout"><div class="esc-vb-sidebar"></div></div><iframe id="esc-vb-frame"></iframe>',
    { url: 'https://admin.example.test/wp-admin/admin.php', runScripts: 'outside-only' }
  );
  const { window } = dom;
  const frame = window.document.getElementById('esc-vb-frame');
  const sent = [], calls = [];
  frame.contentWindow.postMessage = message => sent.push(message);
  window.confirm = () => true;
  window.escVBGetTicket = async () => 'test-ticket';
  window.escVBSelectionBegin = () => 1;
  window.escVBSelectionFinish = () => {};
  window.escVBSelectionReset = () => {};
  window.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
    if (url === config.readUrl) return { ok: true, json: async () => read };
    if (url === config.referenceUrl) return {
      ok: true, json: async () => ({ mode: 'page', items: [
        { id: 301, label: 'Giới thiệu PSE', href: '/gioi-thieu' },
        { id: 303, label: 'Giới thiệu doanh nghiệp', href: '/gioi-thieu-doanh-nghiep' }
      ] })
    };
    if (url === config.saveUrl) return { ok: true, json: async () => updated };
    throw Error('Unexpected WordPress route: ' + url);
  };
  window.eval(js.replace(JSON.stringify(config), JSON.stringify({ ...config, canEdit })));
  const doc = window.document;
  const select = () => window.dispatchEvent(new window.MessageEvent('message', {
    origin, source: frame.contentWindow,
    data: { type: 'esc-vb-menu-item-select', itemId: 103, label: 'Giới thiệu' }
  }));
  return { dom, doc, sent, calls, select };
}
{
  const { dom, doc, calls, sent, select } = setup();
  select(); await tick(); await tick();
  const panel = doc.getElementById('esc-vb-menu-editor');
  assert.equal(panel.hidden, false, 'inspector opens');
  const reference = doc.querySelector('select[aria-label="Chọn Trang/Bài viết"]');
  const search = doc.querySelector('input[type="search"]');
  const find = [...panel.querySelectorAll('button')].find(b => b.textContent === 'Tìm Trang/Bài viết');
  const save = [...panel.querySelectorAll('button')].find(b => b.textContent === 'Lưu WordPress');
  const cancel = [...panel.querySelectorAll('button')].find(b => b.textContent === 'Hủy thay đổi');
  assert.equal(reference.value, '301', 'current canonical Page selected');
  assert.equal(save.disabled, true, 'clean draft cannot save');
  search.value = 'Giới';
  find.click(); await tick(); await tick();
  assert.ok([...reference.options].some(o => o.value === '303'), 'searchable published Page');
  reference.value = '303';
  reference.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(save.disabled, false, 'changing reference marks draft dirty');
  cancel.click();
  assert.equal(reference.value, '301', 'cancel restores original Page');
  assert.equal(save.disabled, true, 'cancel clears draft');
  reference.value = '303';
  reference.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  save.click(); await tick(); await tick();
  const write = calls.find(c => c.url === config.saveUrl);
  assert.equal(write?.body.reference_id, 303, 'save submits validated numeric Page ID');
  assert.equal(write?.body.expected_version, read.version, 'save includes optimistic version');
  assert.equal(reference.value, '303', 'readback becomes selected source');
  assert.equal(save.disabled, true, 'successful save clears dirty state');
  assert.ok(sent.some(m => m.type === 'esc-vb-menu-label-saved' &&
    m.newHref === '/gioi-thieu-doanh-nghiep' && m.descriptionChanged === true),
    'preview receives root-relative Page link and refresh flag');
  dom.window.close();
}
{
  const { dom, doc, calls, select } = setup(false);
  select(); await tick();
  assert.equal(calls.length, 0, 'readonly Menu never requests a form');
  assert.match(doc.querySelector('#esc-vb-menu-editor [role="status"]').textContent,
    /không có quyền/i, 'readonly feedback immediate');
  dom.window.close();
}
console.log('PSE_ESC_BUILDER_MENU_INSPECTOR_DOM=PASS page_search=PASS cancel=PASS save=PASS readonly=PASS NO_CMS_WRITE=true');
