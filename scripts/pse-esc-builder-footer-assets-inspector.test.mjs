/** Global Footer ESC Table inspector DOM contract (NO BUILD / NO CMS writes). */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../astro/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const php=readFileSync(new URL('../php/wp-content/plugins/esc-visual-builder/includes/shared-footer-assets-ui.php',import.meta.url),'utf8');
const scripts=[...php.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,1,'one native Footer ESC Table inspector script');
const origin='https://preview.example.test';
const config={
  origin,page_id:10,nonce:'test-rest',
  read:'/wp-json/esc-builder/v1/footer-asset',
  save:'/wp-json/esc-builder/v1/save-footer-asset',
  editor:'/wp-admin/admin.php?page=tablepress&action=edit&table_id='
};
const js=scripts[0][1].replace(/<\?php[\s\S]*?\?>/g,JSON.stringify(config));
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const read={
  source_kind:'footer.asset',table_id:'pub_footer_assets_vi',lang:'vi',
  row_index:1,group:'certification',label:'Chứng nhận',
  value:'',href:'https://example.org/verify',visible:'1',has_image:true,
  allowed_fields:['label','value','href','visible'],version:'a'.repeat(64)
};
function setup(readonly=false){
  const dom=new JSDOM('<div id="esc-vb-layout"><div class="esc-vb-sidebar"></div></div><iframe id="esc-vb-frame"></iframe>',{
    url:'https://admin.example.test/wp-admin/admin.php',runScripts:'outside-only'
  });
  const {window}=dom,doc=window.document;
  const frame=doc.getElementById('esc-vb-frame');
  const sent=[],calls=[];
  frame.contentWindow.postMessage=msg=>sent.push(msg);
  window.escVBGetTicket=async()=> 'test-ticket';
  window.escVBSelectionBegin=()=>1;
  window.escVBSelectionFinish=()=>{};
  window.confirm=()=>true;
  window.fetch=async(url,init)=>{
    const body=JSON.parse(init.body);
    calls.push({url,body});
    if(url===config.read)return readonly
      ?{ok:false,status:403,json:async()=>({message:'Không có quyền'})}
      :{ok:true,json:async()=>read};
    if(url===config.save)return {ok:true,json:async()=>({
      ...read,label:'Chứng nhận mới',version:'b'.repeat(64),saved:true
    })};
    throw Error('Unexpected endpoint '+url);
  };
  window.eval(js);
  const select=()=>window.dispatchEvent(new window.MessageEvent('message',{
    origin,source:frame.contentWindow,data:{type:'esc-vb-footer-asset-select',rowIndex:1}
  }));
  return {dom,doc,sent,calls,select};
}
{
  const {dom,doc,sent,calls,select}=setup();
  select();await tick();await tick();
  const panel=doc.getElementById('esc-vb-footer-assets-editor');
  assert.equal(panel.hidden,false,'Footer row inspector opens');
  assert.match(panel.textContent,/Insert Image/,'image remains in native ESC editor');
  assert.match(panel.querySelector('a').href,/pub_footer_assets_vi/,'native table source linked');
  const value=doc.getElementById('esc-vb-footer-asset-value');
  const save=[...panel.querySelectorAll('button')].find(b=>b.textContent==='Lưu ESC Table');
  const cancel=[...panel.querySelectorAll('button')].find(b=>b.textContent==='Hủy thay đổi');
  assert.equal(value.value,'Chứng nhận');
  assert.equal(save.disabled,true,'clean draft cannot save');
  value.value='Bản nháp';
  value.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  assert.equal(save.disabled,false,'dirty label enables save');
  cancel.click();
  assert.equal(value.value,'Chứng nhận','Cancel restores source value');
  value.value='Chứng nhận mới';
  value.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  save.click();await tick();await tick();
  const write=calls.find(c=>c.url===config.save);
  assert.equal(write.body.row_index,1,'canonical source row');
  assert.equal(write.body.field,'label','single cell update');
  assert.equal(write.body.value,'Chứng nhận mới');
  assert.equal(write.body.expected_version,read.version,'optimistic concurrency');
  assert.equal(save.disabled,true,'successful save clears draft');
  assert.ok(sent.some(m=>m.type==='esc-vb-footer-asset-saved'&&
    m.rowIndex===1&&m.field==='label'&&m.value==='Chứng nhận mới'),
    'iframe receives verified saved cell');
  dom.window.close();
}
{
  const {dom,doc,calls,select}=setup(true);
  select();await tick();await tick();
  const panel=doc.getElementById('esc-vb-footer-assets-editor');
  assert.match(panel.querySelector('[role="status"]').textContent,/không có quyền/i);
  assert.equal(calls.filter(c=>c.url===config.save).length,0,'403 must not write');
  dom.window.close();
}
console.log('PSE_ESC_BUILDER_FOOTER_ASSETS_DOM=PASS select=PASS cancel=PASS save=PASS readonly=PASS NO_CMS_WRITE=true');
