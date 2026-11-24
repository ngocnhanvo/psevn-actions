/**
 * Real PSE Visual Builder client-only swap rehearsal.
 * No WordPress REST writes, Save, destructive editor button or new records.
 * Uses only the authenticated iframe's existing source-row DOM and parent
 * postMessage bridge, then reverts every preview mutation.
 */
import {chromium} from 'playwright';

const env=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
const values=env.filter(s=>s.startsWith('WC_URL='));
if(values.length!==1)throw Error('Expected one WordPress origin');
const wp=new URL(values[0].slice(7).replace(/^['"]|['"]$/g,''));
if(wp.protocol!=='https:'||!wp.hostname||wp.username||wp.password||wp.search||wp.hash||!['','/'].includes(wp.pathname))
  throw Error('Invalid WP origin');
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:920}});

const send=async(type,tableId,from,to,count,requestId,providedItems=null)=>{
  return await page.evaluate(async payload=>{
    const iframe=document.querySelector('#esc-vb-frame');
    if(!(iframe instanceof HTMLIFrameElement)||!iframe.contentWindow)
      throw Error('Missing authenticated Visual Builder frame');
    const target=new URL(iframe.src,location.href).origin;
    if(typeof payload.type!=='string')throw Error('Bad message type');
    const waitForAck=payload.type==='esc-vb-item-sort-preview';
    if(!waitForAck){
      iframe.contentWindow.postMessage(payload,target);
      return {matched:true};
    }
    return await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{
        window.removeEventListener('message',handle);
        reject(Error('Timed out waiting for Preview swap acknowledgement'));
      },6000);
      const handle=event=>{
        if(event.origin!==target||event.source!==iframe.contentWindow||
          event.data?.type!=='esc-vb-item-sort-preview-ack'||
          event.data?.requestId!==payload.requestId||
          event.data?.tableId!==payload.tableId)return;
        clearTimeout(timeout);window.removeEventListener('message',handle);
        resolve({matched:event.data.matched===true});
      };
      window.addEventListener('message',handle);
      iframe.contentWindow.postMessage(payload,target);
    });
  },{type,tableId,from,to,requestId,
    items:providedItems||Array.from({length:count},()=>({}))});
};

try{
  await page.goto(wp.origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(process.env.WP_ADMIN_USERNAME||'');
    await page.locator('#user_pass').fill(process.env.WP_ADMIN_PASSWORD||'');
    const body=await page.locator('body').innerText();
    const math=body.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||body.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(math){
      const a=+math[1],b=+math[3],value=({'+':a+b,'-':a-b,'x':a*b,'×':a*b,'*':a*b})[math[2]];
      const input=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await input.count())throw Error('WordPress admin captcha input not available');
      await input.fill(String(value));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
  }
  if(page.url().includes('wp-login'))throw Error('WordPress login rejected');
  await page.goto(wp.origin+'/wp-admin/edit.php?post_type=page&page=esc-visual-builder',
    {waitUntil:'domcontentloaded',timeout:60000});
  await page.locator('#esc-vb-page').waitFor({state:'visible',timeout:30000});
  const home=await page.locator('#esc-vb-page').inputValue();
  if(!home)throw Error('No WordPress homepage selected');
  await Promise.all([page.waitForLoadState('domcontentloaded'),
    page.getByRole('button',{name:'Mở trang'}).click()]);
  const frame=page.frameLocator('#esc-vb-frame');
  await frame.locator('body').waitFor({state:'visible',timeout:40000});
  const results=[];
  for(const config of [
    {name:'PSE_PROMISE',component:'.pse-promise',
      item:'.pse-promise__highlight[data-esc-builder-row]',ready:false},
    {name:'PSE_HERO',component:'.pse-hero',
      item:'[data-pse-slide][data-esc-builder-row]',ready:true},
    {name:'PSE_HOTLINE',pageId:'80932',component:'.pse-hotline',
      item:'.pse-hotline__card[data-esc-builder-row]',ready:false},
    {name:'PSE_FAQ',pageId:'80930',component:'.pse-faq',
      item:'.pse-faq__item[data-esc-builder-row]',ready:false},
    {name:'PSE_HISTORY',pageId:'79301',component:'.pse-history',
      item:'.pse-history__milestone[data-esc-builder-row]',ready:false},
    {name:'PSE_VISION',pageId:'79303',component:'.pse-vision',
      item:'.pse-vision__card[data-esc-builder-row]',ready:false},
  ]){
    if(config.pageId){
      // These Page IDs were collected from the real WordPress Page selector
      // by the complete read-only site inventory #45428213552.
      const exists=await page.locator('#esc-vb-page option[value="'+config.pageId+'"]').count();
      if(exists!==1)throw Error(config.name+' scoped source Page disappeared');
      await page.locator('#esc-vb-page').selectOption(config.pageId);
      await Promise.all([page.waitForLoadState('domcontentloaded',{timeout:45000}),
        page.getByRole('button',{name:'Mở trang'}).click()]);
      await frame.locator('body').waitFor({state:'visible',timeout:40000});
    }
    const root=frame.locator(config.component).first();
    if(!(await root.count())){results.push(config.name+':NOT_TESTED_NO_SECTION');continue}
    const tableId=await root.evaluate(el=>el.closest('[data-tablepress-preview]')
      ?.getAttribute('data-tablepress-preview')||'');
    const cards=root.locator(config.item);
    const count=await cards.count();
    if(!tableId||count<2){results.push(config.name+':NOT_TESTED_ROWS_'+count);continue}
    if(config.ready){
      const ready=await root.locator('[data-pse-slider]').first().getAttribute('data-ready');
      if(ready!=='true'){results.push(config.name+':NOT_TESTED_CONTROLLER_NOT_READY');continue}
    }
    await root.evaluate((el,selector)=>{
      const cards=[...el.querySelectorAll(selector)];
      const first=cards.find(card=>card.getAttribute('data-esc-builder-row')==='0');
      const second=cards.find(card=>card.getAttribute('data-esc-builder-row')==='1');
      if(!first||!second)throw Error('Physical source rows 0 and 1 not unique');
      first.setAttribute('data-pse-qa-swap','first');
      second.setAttribute('data-pse-qa-swap','second');
    },config.item);
    let original=Array.from({length:count},()=>({}));
    if(config.name==='PSE_HOTLINE'){
      // The group structure is the source-correct Preview representation.
      // Compose the canonical row group values so the grouped adapter can
      // validate every card without reading or writing WordPress REST.
      original=await root.evaluate(el=>{
        const rows=[];
        el.querySelectorAll('.pse-hotline__group').forEach(group=>{
          const label=(group.getAttribute('aria-label')||'').trim();
          group.querySelectorAll('.pse-hotline__card[data-esc-builder-row]').forEach(card=>{
            const row=Number(card.getAttribute('data-esc-builder-row'));
            rows[row]={group:label};
          });
        });
        return rows;
      });
      if(original.length!==count||original.some(item=>!item))
        throw Error('PSE hotline group references incomplete');
    }
    const reordered=[...original];
    [reordered[0],reordered[1]]=[reordered[1],reordered[0]];
    let previewMatched=false;
    const requestId=88001+results.length;
    try{
      const ack=await send('esc-vb-item-sort-preview',tableId,0,1,count,requestId,reordered);
      if(!ack.matched)throw Error(config.name+' Preview adapter refused an eligible source');
      previewMatched=true;
      const actual=await root.evaluate((el,selector)=>{
        const cards=[...el.querySelectorAll(selector)];
        const marked=cards.filter(node=>node.hasAttribute('data-pse-qa-swap'));
        return {
          byToken:marked.map(node=>({
            token:node.getAttribute('data-pse-qa-swap'),
            row:node.getAttribute('data-esc-builder-row'),
            nested:[...node.querySelectorAll('[data-esc-builder-cell-row],[data-esc-builder-image-row]')]
              .every(child=>(child.getAttribute('data-esc-builder-image-row')||
                child.getAttribute('data-esc-builder-cell-row'))===
                node.getAttribute('data-esc-builder-row'))
          })),
          firstTwo:cards.slice(0,2).map(node=>node.getAttribute('data-pse-qa-swap'))
        };
      },config.item);
      const first=actual.byToken.find(node=>node.token==='first');
      const second=actual.byToken.find(node=>node.token==='second');
      if(first?.row!=='1'||second?.row!=='0'||!first.nested||!second.nested||
        (config.name!=='PSE_HOTLINE'&&
          (actual.firstTwo[0]!=='second'||actual.firstTwo[1]!=='first')))
        throw Error(config.name+' client Preview reordered wrong source cells');
      results.push(config.name+':PASS direct_swap=true physical_rows=true');
    }finally{
      if(previewMatched){
        await send('esc-vb-item-sort-cancel',tableId,0,1,count,requestId,original);
        const restored=await root.evaluate((el,selector)=>new Promise(resolve=>{
          const deadline=Date.now()+4000;
          const poll=()=>{
            const rows=[...el.querySelectorAll(selector)];
            const first=rows.find(node=>node.getAttribute('data-pse-qa-swap')==='first');
            const second=rows.find(node=>node.getAttribute('data-pse-qa-swap')==='second');
            const ordered=rows.slice(0,2);
            if(first?.getAttribute('data-esc-builder-row')==='0'&&
               second?.getAttribute('data-esc-builder-row')==='1'&&
               (rows.some(node=>node.closest('.pse-hotline__grid'))||
                (ordered[0]===first&&ordered[1]===second)))resolve(true);
            else if(Date.now()>deadline)resolve(false);
            else setTimeout(poll,35);
          };
          poll();
        }),config.item);
        if(!restored)
          throw Error(config.name+' Preview cancel did not restore original DOM');
      }
      await root.evaluate(el=>el.querySelectorAll('[data-pse-qa-swap]')
        .forEach(node=>node.removeAttribute('data-pse-qa-swap')));
    }
  }
  console.log('PSE_BUILDER_SWAP_LIVE='+JSON.stringify(results));
  if(!results.some(s=>s.includes(':PASS')))
    throw Error('No populated live PSE item collection could be rehearsed');
  console.log('PSE_BUILDER_SWAP_READ_ONLY=PASS NO_CMS_WRITE=true NO_SAVE=true PREVIEW_CANCELLED=true');
}finally{await browser.close()}
