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
page.on('pageerror',error=>console.log('PSE_SWAP_BROWSER_SCRIPT_ERROR='+String(error.name||'Error')));
page.on('console',message=>{
  const value=message.text();
  if(value.startsWith('PSE_SECTION_SOURCE_NO_WRITE_DIAGNOSTIC='))
    console.log(value);
});
page.on('response',res=>{
  if(res.status()>=400&&/\/(_astro|assets)\//.test(new URL(res.url()).pathname))
    console.log('PSE_SWAP_ASSET_HTTP_ERROR='+res.status());
});

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

// A Page section clone must be previewed with a real WordPress occurrence
// identity and must be fully rolled back without any REST write to the CMS.
const previewSection=async(type,key,requestId)=>{
  return await page.evaluate(({type,key,requestId})=>{
    const iframe=document.querySelector('#esc-vb-frame');
    if(!(iframe instanceof HTMLIFrameElement)||!iframe.contentWindow)
      throw Error('No authenticated section preview iframe');
    const target=new URL(iframe.src,location.href).origin;
    if(type==='esc-vb-section-duplicate-cancel'){
      iframe.contentWindow.postMessage({type},target);
      return Promise.resolve({matched:true});
    }
    return new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>{
        window.removeEventListener('message',handle);
        reject(Error('Missing section clone Preview acknowledgement'));
      },6500);
      const handle=event=>{
        if(event.origin!==target||event.source!==iframe.contentWindow||
          event.data?.type!=='esc-vb-section-duplicate-preview-ack'||
          event.data?.requestId!==requestId)return;
        clearTimeout(timeout);window.removeEventListener('message',handle);
        resolve({matched:event.data.matched===true});
      };
      window.addEventListener('message',handle);
      iframe.contentWindow.postMessage({type,key,requestId},target);
    });
  },{type,key,requestId});
};

// This invokes the production writer's dry-run branch only, then verifies
// that the versioned Page remains byte-equivalent from the CMS perspective.
const verifyCloneDryRun=async(tableId)=>{
  return await page.evaluate(async tableId=>{
    const script=[...document.scripts].map(node=>node.textContent||'')
      .find(src=>src.includes('duplicateSection:')&&src.includes('const nonce='));
    const token=script?.match(/\bconst nonce=("(?:[^"\\]|\\.)*")/);
    if(!token)throw Error('WordPress REST nonce not found in authenticated Builder UI');
    const nonce=JSON.parse(token[1]);
    const getTicket=window.escVBGetTicket;
    if(typeof getTicket!=='function')throw Error('Missing renewable Builder ticket');
    const pageId=Number(document.querySelector('#esc-vb-page')?.value);
    if(!Number.isSafeInteger(pageId)||pageId<1)throw Error('Invalid scoped Page');
    const request=async(route,params={})=>{
      const ticket=await getTicket();
      const response=await fetch('/wp-json/esc-builder/v1/'+route,{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json','X-WP-Nonce':nonce},
        body:JSON.stringify({page_id:pageId,ticket,...params})
      });
      const result=await response.json();
      if(!response.ok||result.code){
        if(route==='duplicate-section-shared'){
          // Inspect source structure only; NEVER log raw Page HTML, rendered
          // prose, WordPress credentials, ticket, nonce or page response.
          const record=await fetch('/wp-json/wp/v2/pages/'+pageId+
            '?context=edit&_fields=content',{
              credentials:'same-origin',cache:'no-store',
              headers:{'X-WP-Nonce':nonce}
            }).catch(()=>null);
          const pageData=record?.ok?await record.json():{};
          const raw=typeof pageData?.content?.raw==='string'?
            pageData.content.raw:'';
          const target=String(params.section_key||'').replace(/@[0-9]+$/,'');
          const regex=/\[table\s+id\s*=\s*["']?([a-zA-Z0-9_-]{1,80})(?:["'])?\s*\/\]/gi;
          const found=[...raw.matchAll(regex)].map(m=>({id:m[1],start:m.index,end:m.index+m[0].length}));
          const selected=found.find(x=>x.id===target);
          const tags=[...raw.matchAll(/<[^>]+>/gs)];
          const stack=[],frames=[];
          for(const token of tags){
            const markup=token[0],start=token.index;
            if(/^<!--|^<!|^<\?/.test(markup))continue;
            const part=/^<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b/i.exec(markup);
            if(!part)continue;
            const name=part[2].toLowerCase();
            if(part[1]){
              const frame=stack.pop();
              if(frame&&frames[frame].tag===name){
                frames[frame].closeStart=start;
                frames[frame].end=start+markup.length;
              }
            }else if(!['img','br','hr','input','meta','link','source','area',
              'base','col','embed','param','track','wbr'].includes(name)&&
              !/\/\s*>$/.test(markup)){
              frames.push({tag:name,start,openEnd:start+markup.length,
                parent:stack.length?stack[stack.length-1]:-1});
              stack.push(frames.length-1);
            }
          }
          const candidates=selected?frames.filter(f=>
            f.openEnd<=selected.start&&f.closeStart>=selected.end&&
            ['div','section','article','li'].includes(f.tag) &&
            found.filter(x=>x.start>=f.openEnd&&x.end<=f.closeStart).length===1
          ).sort((a,b)=>(a.end-a.start)-(b.end-b.start)):[];
          const chosen=candidates[0];
          const snippet=chosen?raw.slice(chosen.start,chosen.end):'';
          const shape={
            code:String(result.code||response.status),
            wpSourceReadable:raw.length>0,
            shortcodeCount:found.length,
            targetCount:found.filter(x=>x.id===target).length,
            chosenTag:chosen?.tag||'raw_shortcode',
            chosenParentIndex:chosen?.parent??null,
            topLevel:chosen?.parent===-1,
            wrapperBytes:snippet.length,
            wrapperHasId:/<[^>]+\sid\s*=/i.test(snippet),
            wrapperHasName:/<[^>]+\sname\s*=/i.test(snippet),
            wrapperHasControl:/<(?:script|style|form|input|button|iframe|video|audio|canvas|template)\b/i.test(snippet),
            wrapperHasEventHandler:/\bon[a-z]+\s*=/i.test(snippet),
            rawHtmlTags:tags.length
          };
          console.log('PSE_SECTION_SOURCE_NO_WRITE_DIAGNOSTIC='+JSON.stringify(shape));
        }
        throw Error('Page clone preflight refused: '+String(result.code||response.status));
      }
      return result;
    };
    const before=await request('section-order');
    const match=(before.items||[]).filter(item=>item.id===tableId);
    if(match.length!==1)throw Error('Cannot identify unique Page section occurrence');
    const dry=await request('duplicate-section-shared',{
      section_key:tableId,expected_version:before.version,
      share_source:true,dry_run:true
    });
    const after=await request('section-order');
    return {
      checked:dry.checked===true,
      noWrite:dry.no_write===true&&dry.saved===false,
      sourceShared:dry.source_shared===true,
      sourceExact:dry.table_id===tableId&&dry.duplicated===tableId,
      versionUnchanged:before.version===after.version&&dry.version===before.version,
      countUnchanged:before.items?.length===after.items?.length,
    };
  },tableId);
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
  // The Page body can be visible before Astro's deferred module registers
  // installBuilderSectionDrafts(). Wait for the exact protected Page ticket
  // and the module-owned style sentinel, not just visible public HTML.
  const waitForSource=async(pageId)=>{
    await page.waitForFunction(pageId=>{
      const element=document.querySelector('#esc-vb-frame');
      if(!(element instanceof HTMLIFrameElement))return false;
      const path=new URL(element.src,location.href).pathname;
      return path.endsWith('/esc-builder/preview/'+pageId);
    },pageId,{timeout:55000});
    await frame.locator('#esc-vb-nav-context').waitFor({state:'attached',timeout:55000});
    await frame.locator('style[data-esc-vb-item-pick-style]')
      .waitFor({state:'attached',timeout:55000});
  };
  const results=[];
  await waitForSource(home);
  // Direct section swap is a separate Page-level operation: get only
  // WordPress's own versioned swappable instances, not a guessed DOM pair.
  const sectionCapability=await page.evaluate(async()=>{
    const script=[...document.scripts].map(el=>el.textContent||'')
      .find(src=>src.includes('duplicateSection:')&&src.includes('const nonce='));
    const quoted=script?.match(/\bconst nonce=("(?:[^"\\]|\\.)*")/);
    if(!quoted||typeof window.escVBGetTicket!=='function')
      throw Error('Authenticated Builder Page section reader not installed');
    const nonce=JSON.parse(quoted[1]),pageId=Number(document.querySelector('#esc-vb-page')?.value);
    const ticket=await window.escVBGetTicket();
    const response=await fetch('/wp-json/esc-builder/v1/section-order',{
      method:'POST',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json','X-WP-Nonce':nonce},
      body:JSON.stringify({page_id:pageId,ticket})
    });
    const data=await response.json();
    if(!response.ok||data?.code)throw Error('Section-order preflight refused '+String(data?.code||response.status));
    return {items:data.items||[],swappable:data.swappable||{},canReorder:data.can_reorder===true};
  });
  const homeSections=await frame.locator('[data-tablepress-preview]').evaluateAll(nodes=>
    nodes.filter(n=>!n.parentElement?.closest('[data-tablepress-preview]'))
      .map(n=>n.getAttribute('data-tablepress-preview')));
  const sectionPair=sectionCapability.items.flatMap(item=>
    (sectionCapability.swappable[item.id]||[])
      .filter(to=>homeSections.includes(item.table_id||item.id) &&
        sectionCapability.items.some(other=>other.id===to && homeSections.includes(other.table_id||other.id)))
      .map(to=>({from:item.id,to}))
  ).find(pair=>pair.from!==pair.to);
  const sectionSwapResults={source:'WordPress Page',mode:'read_only_preview'};
  if(!sectionPair){
    sectionSwapResults.result='NOT_TESTED_NO_WORDPRESS_APPROVED_PAIR';
  }else{
    const requestId=99501;
    const bridge=async(payload,ackType)=>{
      return await page.evaluate(async({payload,ackType})=>{
        const frame=document.querySelector('#esc-vb-frame');
        if(!(frame instanceof HTMLIFrameElement)||!frame.contentWindow)
          throw Error('Section Preview iframe is absent');
        const origin=new URL(frame.src,location.href).origin;
        if(!ackType){frame.contentWindow.postMessage(payload,origin);return {matched:true};}
        return await new Promise((resolve,reject)=>{
          const handler=event=>{
            if(event.source!==frame.contentWindow||event.origin!==origin||
              event.data?.type!==ackType||event.data?.requestId!==payload.requestId)return;
            clearTimeout(timer);window.removeEventListener('message',handler);
            resolve(event.data);
          };
          const timer=setTimeout(()=>{
            window.removeEventListener('message',handler);
            reject(Error('Section Preview acknowledgement missing: '+ackType));
          },8000);
          window.addEventListener('message',handler);
          frame.contentWindow.postMessage(payload,origin);
        });
      },{payload,ackType});
    };
    const original=await frame.locator('[data-tablepress-preview]').evaluateAll(nodes=>
      nodes.filter(n=>!n.parentElement?.closest('[data-tablepress-preview]'))
        .map(n=>n.getAttribute('data-tablepress-preview')));
    let pending=false;
    try{
      const pick=await bridge({
        type:'esc-vb-section-pick-start',source:sectionPair.from,
        allowed:[sectionPair.to],requestId
      },'esc-vb-section-pick-ready');
      if(pick.matched!==true)throw Error('Section red/green Preview picking refused source');
      pending=true;
      const targetId=sectionCapability.items.find(item=>item.id===sectionPair.to)?.table_id||
        sectionPair.to;
      const target=frame.locator('[data-tablepress-preview="'+targetId+'"]').first();
      const ackPromise=page.evaluate(({requestId})=>new Promise((resolve,reject)=>{
        const frame=document.querySelector('#esc-vb-frame');
        const origin=new URL(frame.src,location.href).origin;
        const listener=event=>{
          if(event.source!==frame.contentWindow||event.origin!==origin||
            event.data?.type!=='esc-vb-section-target-picked'||
            event.data?.requestId!==requestId)return;
          clearTimeout(timer);window.removeEventListener('message',listener);
          resolve({allowed:event.data.allowed,tableId:event.data.tableId});
        };
        const timer=setTimeout(()=>{
          window.removeEventListener('message',listener);
          reject(Error('Section target click was not received'));
        },8000);
        window.addEventListener('message',listener);
      }),{requestId});
      await target.click({force:true,position:{x:16,y:12}});
      const selected=await ackPromise;
      if(selected.allowed!==true||selected.tableId!==sectionPair.to)
        throw Error('Section green target selection chose wrong instance');
      if(await frame.locator('[data-esc-vb-swap-source]').count()<1||
        await frame.locator('[data-esc-vb-swap-target]').count()<1)
        throw Error('Section source red/target green Preview markers missing');
      const swapped=await bridge({
        type:'esc-vb-sections-swap-preview',
        first:sectionPair.from,second:sectionPair.to,requestId:requestId+1
      },'esc-vb-section-order-applied');
      if(swapped.matched!==true)throw Error('Section Preview refused WordPress-approved pair');
      const newOrder=await frame.locator('[data-tablepress-preview]').evaluateAll(nodes=>
        nodes.filter(n=>!n.parentElement?.closest('[data-tablepress-preview]'))
          .map(n=>n.getAttribute('data-tablepress-preview')));
      const sourceId=sectionCapability.items.find(item=>item.id===sectionPair.from)?.table_id||
        sectionPair.from;
      const fromIndex=original.indexOf(sourceId),toIndex=original.indexOf(targetId);
      const expected=[...original];
      [expected[fromIndex],expected[toIndex]]=[expected[toIndex],expected[fromIndex]];
      if(JSON.stringify(expected)!==JSON.stringify(newOrder))
        throw Error('Section swap moved unrelated Page section or wrong source');
      sectionSwapResults.result='PASS';
      sectionSwapResults.source=sectionPair.from;
      sectionSwapResults.target=sectionPair.to;
      sectionSwapResults.swappedTwoOnly=true;
    }finally{
      await bridge({type:'esc-vb-sections-cancel'},null);
      await bridge({type:'esc-vb-section-pick-clear'},null);
      if(pending){
        const restored=await frame.locator('[data-tablepress-preview]').evaluateAll(nodes=>
          nodes.filter(n=>!n.parentElement?.closest('[data-tablepress-preview]'))
            .map(n=>n.getAttribute('data-tablepress-preview')));
        if(JSON.stringify(restored)!==JSON.stringify(original))
          throw Error('Section swap Preview cancel left Page order modified');
      }
    }
  }
  console.log('PSE_BUILDER_SECTION_SWAP_LIVE='+JSON.stringify(sectionSwapResults));
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
      await waitForSource(config.pageId);
    }
    const root=frame.locator(config.component).first();
    if(!(await root.count())){results.push(config.name+':NOT_TESTED_NO_SECTION');continue}
    const tableId=await root.evaluate(el=>el.closest('[data-tablepress-preview]')
      ?.getAttribute('data-tablepress-preview')||'');
    const cards=root.locator(config.item);
    const count=await cards.count();
    const runtime=await root.evaluate(el=>({
      installed:!!document.querySelector('style[data-esc-vb-item-pick-style]'),
      previewClass:document.documentElement.classList.contains('esc-builder-preview'),
      trustedParentConfigured:!!document.querySelector('#esc-vb-nav-context')?.getAttribute('data-parent-origin'),
      sourceRows:[...el.querySelectorAll('[data-esc-builder-row]')].slice(0,20)
        .map(x=>x.getAttribute('data-esc-builder-row')),
      scriptCount:document.scripts.length
    }));
    console.log('PSE_SWAP_PAGE_DIAGNOSTIC='+JSON.stringify({
      name:config.name,pageId:config.pageId||home,tableId,count,...runtime
    }));
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
      if(!runtime.installed)throw Error(config.name+' Preview swap listener missing in actual iframe');
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
  // Three real WordPress Pages with static ESC Table source ownership.
  // Do not click Save in the PHP inspector, and do not modify business data.
  const sectionClones=[];
  for(const [pageId,tableId] of [
    ['80930','pse_faq_vi'],['79303','pse_vision_vi'],['80932','pse_hotline_vi']
  ]){
    await page.locator('#esc-vb-page').selectOption(pageId);
    await Promise.all([page.waitForLoadState('domcontentloaded',{timeout:45000}),
      page.getByRole('button',{name:'Mở trang'}).click()]);
    await waitForSource(pageId);
    const root=frame.locator('[data-tablepress-preview="'+tableId+'"]').first();
    if(await root.count()!==1){
      sectionClones.push({tableId,result:'NOT_TESTED_NO_SECTION'});
      continue;
    }
    const original=await frame.locator('[data-tablepress-preview="'+tableId+'"]').count();
    const shape=await root.evaluate(node=>{
      const chain=[];
      for(let el=node,depth=0;el&&depth<7;depth++,el=el.parentElement){
        const siblings=el.parentElement?[...el.parentElement.children]
          .filter(child=>child!==el).map(child=>child.tagName):[];
        chain.push({
          depth,tag:el.tagName,
          idPresent:el.hasAttribute('id'),
          className:String(el.className||'').split(/\\s+/).slice(0,3).join(' '),
          siblings,
          siblingSources:el.parentElement?[...el.parentElement.children]
            .filter(child=>child!==el).map(child=>({
              tag:child.tagName,
              htmlPart:child.hasAttribute('data-esc-builder-html-part'),
              childElements:child.querySelectorAll('*').length,
              textChars:(child.textContent||'').trim().length,
              htmlBytes:child.innerHTML.length
            })):[],
          hasNonWhitespaceTextSiblings:el.parentElement?
            [...el.parentElement.childNodes].some(child=>child!==el&&
              child.nodeType===3&&Boolean(child.textContent?.trim())):false,
          innerIds:el.querySelectorAll('[id]').length,
          innerControls:el.querySelectorAll('button,input,select,textarea,form,iframe,[aria-controls],[aria-owns]').length,
          sourceSections:el.querySelectorAll('[data-tablepress-preview]').length,
        });
      }
      return chain;
    });
    console.log('PSE_BUILDER_SECTION_CLONE_SHAPE='+JSON.stringify({tableId,chain:shape}));
    const requestId=99000+sectionClones.length;
    let matched=false;
    try{
      const response=await previewSection('esc-vb-section-duplicate-preview',tableId,requestId);
      matched=response.matched;
      if(matched){
        const count=await frame.locator('[data-tablepress-preview="'+tableId+'"]').count();
        if(count!==original+1)throw Error('Preview cloned unexpected section count '+tableId);
        const rows=await frame.locator('[data-tablepress-preview="'+tableId+'"]').evaluateAll(
          nodes=>nodes.map(node=>[...node.querySelectorAll('[data-esc-builder-row]')]
            .map(item=>item.getAttribute('data-esc-builder-row'))));
        if(JSON.stringify(rows[0])!==JSON.stringify(rows[1]))
          throw Error('Shared clone changed physical ESC Table rows '+tableId);
        const server=await verifyCloneDryRun(tableId);
        if(!Object.values(server).every(value=>value===true))
          throw Error('Server refused exact source-preserving no-write preflight '+tableId);
        sectionClones.push({
          tableId,result:'PASS',sharedSource:true,serverDryRun:true,sourceVersionUnchanged:true
        });
      }else{
        sectionClones.push({tableId,result:'REJECTED_UNSAFE_WRAPPER'});
      }
    }finally{
      await previewSection('esc-vb-section-duplicate-cancel',tableId,requestId);
      await frame.locator('[data-tablepress-preview="'+tableId+'"]')
        .first().waitFor({state:'attached',timeout:10000});
      const count=await frame.locator('[data-tablepress-preview="'+tableId+'"]').count();
      if(count!==original)throw Error('Preview clone cancel left duplicate '+tableId);
    }
  }
  console.log('PSE_BUILDER_SECTION_CLONE_LIVE='+JSON.stringify(sectionClones));
  if(!sectionClones.some(item=>item.result==='PASS'))
    throw Error('No real PSE Page section can be safely preview-cloned');

  console.log('PSE_BUILDER_SWAP_LIVE='+JSON.stringify(results));
  if(!results.some(s=>s.includes(':PASS')))
    throw Error('No populated live PSE item collection could be rehearsed');
  console.log('PSE_BUILDER_SWAP_READ_ONLY=PASS NO_CMS_WRITE=true NO_SAVE=true PREVIEW_CANCELLED=true');
}finally{await browser.close()}
