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
  link_mode: 'page', parent_id: 0,
  parent_options: [{ id: 0, label: '— Cấp cao nhất —' }, { id: 104, label: 'Tin công ty' }],
  allowed_fields: ['label','description','target','reference_id','parent_id'],
  reference_id: 301, reference_label: 'Giới thiệu PSE',
  reference_href: '/gioi-thieu', mega_position: 0, version: 'a'.repeat(64)
};
const updated = {
  ...read, parent_id: 104, reference_id: 303, reference_label: 'Giới thiệu doanh nghiệp',
  reference_href: '/gioi-thieu-doanh-nghiep', version: 'b'.repeat(64),
  saved: true
};
function setup(canEdit = true, responseRead = read, responseSaved = updated) {
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
    if (url === config.readUrl) return { ok: true, json: async () => responseRead };
    if (url === config.referenceUrl) return {
      ok: true, json: async () => ({ mode: 'page', items: [
        { id: 301, label: 'Giới thiệu PSE', href: '/gioi-thieu' },
        { id: 303, label: 'Giới thiệu doanh nghiệp', href: '/gioi-thieu-doanh-nghiep' }
      ] })
    };
    if (url === config.saveUrl) return { ok: true, json: async () => responseSaved };
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
  const parent = doc.getElementById('esc-vb-menu-parent');
  assert.equal(parent.value, '0', 'initial native parent is root');
  assert.ok([...parent.options].some(o=>o.value==='104'),'scoped parent choices are visible');
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
  parent.value = '104';
  parent.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  save.click(); await tick(); await tick();
  const write = calls.find(c => c.url === config.saveUrl);
  assert.equal(write?.body.reference_id, 303, 'save submits validated numeric Page ID');
  assert.equal(write?.body.parent_id, 104, 'save submits canonical native parent ID');
  assert.equal(write?.body.expected_version, read.version, 'save includes optimistic version');
  assert.equal(reference.value, '303', 'readback becomes selected source');
  assert.equal(parent.value, '104', 'parent readback becomes selected source');
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
// Invalid Page selection must not lock the Save button forever. Validation
// must run before entering the asynchronous saving state.
{
  const { dom, doc, calls, select } = setup();
  select(); await tick(); await tick();
  const panel=doc.getElementById('esc-vb-menu-editor');
  const reference=doc.querySelector('select[aria-label="Chọn Trang/Bài viết"]');
  const save=[...panel.querySelectorAll('button')].find(b=>b.textContent==='Lưu WordPress');
  const label=doc.getElementById('esc-vb-menu-label');
  label.value='Giới thiệu mới';
  label.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  const invalid=doc.createElement('option');
  invalid.value='0';invalid.textContent='— Chọn nguồn —';reference.append(invalid);
  reference.value='0';reference.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  save.click();await tick();
  assert.equal(calls.filter(c=>c.url===config.saveUrl).length,0,'invalid Page cannot be saved');
  assert.equal(save.disabled,false,'validation failure must not lock Save button');
  assert.match(panel.querySelector('[role="status"]').textContent,/hợp lệ/i);
  reference.value='301';reference.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.equal(save.disabled,false,'draft remains editable after validation error');
  dom.window.close();
}
// Existing top-level Mega owner: edit text only, cancel restores draft,
// and preview correctly requests refresh without rewriting native media.
{
  const mega = {
    ...read, menu_type:'mega', mega_position:0,
    mega_header_texts:['Cột đầu','Cột sau'],
    allowed_fields:[...read.allowed_fields,'mega_header_texts']
  };
  const savedMega = {
    ...mega, mega_header_texts:['Cột mới','Cột sau'],
    version:'c'.repeat(64), saved:true
  };
  const { dom, doc, calls, sent, select }=setup(true,mega,savedMega);
  select();await tick();await tick();
  const panel=doc.getElementById('esc-vb-menu-editor');
  const fields=panel.querySelectorAll('#esc-vb-menu-mega-headers input');
  assert.equal(fields.length,2,'two native Mega title inputs');
  assert.equal(fields[0].value,'Cột đầu');
  const save=[...panel.querySelectorAll('button')].find(b=>b.textContent==='Lưu WordPress');
  const cancel=[...panel.querySelectorAll('button')].find(b=>b.textContent==='Hủy thay đổi');
  fields[0].value='Bản nháp';
  fields[0].dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  assert.equal(save.disabled,false,'title edit is dirty');
  cancel.click();
  assert.equal(panel.querySelector('#esc-vb-menu-mega-headers input').value,'Cột đầu',
    'cancel restores native title');
  const changed=panel.querySelector('#esc-vb-menu-mega-headers input');
  changed.value='Cột mới';
  changed.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  save.click();await tick();await tick();
  const write=calls.find(c=>c.url===config.saveUrl);
  assert.deepEqual(write?.body.mega_header_texts,['Cột mới','Cột sau'],
    'save sends text only, not native media');
  assert.equal(save.disabled,true,'saved title clears draft');
  assert.ok(sent.some(m=>m.type==='esc-vb-menu-label-saved'&&m.descriptionChanged===true),
    'Mega header title change marks iframe refresh needed');
  dom.window.close();
}
console.log('PSE_ESC_BUILDER_MENU_INSPECTOR_DOM=PASS mega_headers=PASS page_search=PASS parent=PASS invalid_draft=PASS cancel=PASS save=PASS readonly=PASS NO_CMS_WRITE=true');
