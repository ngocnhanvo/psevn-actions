/**
 * Real PSE Visual Builder client-only swap rehearsal.
 * No WordPress REST writes, Save, destructive editor button or new records.
 * Uses only the authenticated iframe's existing source-row DOM and parent
 * postMessage bridge, then reverts every preview mutation.
 */
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';

// Short, no-write structural diagnostics do not need to re-run the six
// already verified item swaps. Full acceptance runs them all again.
const qaRequest=readFileSync('.pse-esc-builder-direct-swap-live-qa-request','utf8');
const cloneDiagnosticOnly=qaRequest.includes('PSE_CLONE_DIAG_ONLY=1');
const inspectorEscapeE2E=qaRequest.includes('PSE_INSPECTOR_ESCAPE_E2E=1');

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

// Keyboard destinations use the same authenticated cross-origin postMessage
// bridge as mouse picking, and never trigger a WordPress Save. A read-only
// probe must assert the target source identity and restore original tabindex.
const previewPickMessage=async(payload,ackType=null)=>{
  return page.evaluate(async({payload,ackType})=>{
    const iframe=document.querySelector('#esc-vb-frame');
    if(!(iframe instanceof HTMLIFrameElement)||!iframe.contentWindow)
      throw Error('Missing real PSE Preview iframe');
    const origin=new URL(iframe.src,location.href).origin;
    if(!ackType){iframe.contentWindow.postMessage(payload,origin);return null;}
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{
        window.removeEventListener('message',handler);
        reject(Error('Keyboard Preview readiness missing: '+ackType));
      },7000);
      const handler=event=>{
        if(event.source!==iframe.contentWindow||event.origin!==origin||
          event.data?.type!==ackType||
          event.data?.requestId!==payload.requestId)return;
        clearTimeout(timer);window.removeEventListener('message',handler);
        resolve(event.data);
      };
      window.addEventListener('message',handler);
      iframe.contentWindow.postMessage(payload,origin);
    });
  },{payload,ackType});
};
const awaitPreviewPicked=(ackType,requestId)=>page.evaluate(({ackType,requestId})=>
  new Promise((resolve,reject)=>{
    const iframe=document.querySelector('#esc-vb-frame');
    if(!(iframe instanceof HTMLIFrameElement)||!iframe.contentWindow)
      throw Error('Missing Preview iframe during keyboard picking');
    const origin=new URL(iframe.src,location.href).origin;
    const timer=setTimeout(()=>{
      window.removeEventListener('message',handler);
      reject(Error('Keyboard Preview destination was not acknowledged: '+ackType));
    },7000);
    const handler=event=>{
      if(event.source!==iframe.contentWindow||event.origin!==origin||
        event.data?.type!==ackType||event.data?.requestId!==requestId)return;
      clearTimeout(timer);window.removeEventListener('message',handler);
      resolve(event.data);
    };
    window.addEventListener('message',handler);
  }),{ackType,requestId});

// A Page section clone must be previewed with a real WordPress occurrence
// identity and must be fully rolled back without any REST write to the CMS.
const previewSection=async(type,key,requestId,afterKey=key)=>{
  return await page.evaluate(({type,key,requestId,afterKey})=>{
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
      iframe.contentWindow.postMessage({type,key,afterKey,requestId},target);
    });
  },{type,key,afterKey,requestId});
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
            rejectionReason:String(result.data?.reason_code||'not-provided'),
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
      sourceModeVerified:['shortcode_only','wrapper'].includes(dry.clone_mode),
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
  if(qaRequest.includes('PSE_HOME_VIEWPORT_PARITY_ONLY=1')){
    // Same CSS viewport on the real authenticated iframe and public page.
    // Do not click a field, Save, or edit the CMS. Dynamic carousel pixels
    // are intentionally excluded; compare real public section geometry.
    const origin=await frame.locator('body').evaluate(()=>location.origin);
    if(origin!=='https://pse.webnvn.com')throw Error('Unexpected public origin');
    await frame.locator('[data-esc-builder-refresh-status][data-source-ready="true"]')
      .waitFor({state:'attached',timeout:40000});
    const frameEl=await page.locator('#esc-vb-frame').elementHandle();
    const live=await frameEl?.contentFrame();
    if(!live)throw Error('Missing authenticated iframe');
    const selectors=['#main-header','[data-pse-section="hero"]',
      '[data-pse-section="news"]','[data-pse-section="promise"]',
      '[data-pse-section="utilities"]'];
    const snapshot=async(scope)=>{
      await scope.locator(selectors[4]).waitFor({state:'visible',timeout:35000});
      return scope.evaluate(async selectors=>{
        await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,8000))]);
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const rows=selectors.map(selector=>{
          const matches=document.querySelectorAll(selector);
          if(matches.length!==1)throw Error('Missing or ambiguous section '+selector);
          const e=matches[0],b=e.getBoundingClientRect();
          return {selector,x:b.x,y:b.y+scrollY,width:b.width,height:b.height};
        });
        const textList=s=>[...document.querySelectorAll(s)].map(e=>e.textContent.trim().replace(/\s+/g,' '));
        return {viewport:{width:innerWidth,height:innerHeight,clientWidth:document.documentElement.clientWidth},
          overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
          rows,news:textList('.pse-news__tab'),promise:textList('.pse-promise__highlight'),
          links:[...document.querySelectorAll('.pse-tools__links a')].map(e=>({text:e.textContent.trim(),href:e.getAttribute('href')})),
          overlays:document.querySelectorAll('.pse-hero__builder-fields,.pse-tools__url,.pse-news__builder-query').length,
          statusVisible:[...document.querySelectorAll('[data-esc-builder-refresh-status]')].some(e=>getComputedStyle(e).display!=='none')};
      },selectors);
    };
    const results=[];
    for(const width of [1440,390]){
      const height=900;
      await page.setViewportSize({width:Math.max(1800,width+400),height:1100});
      await page.locator('#esc-vb-frame').evaluate((el,{width,height})=>{
        // Pin the QA iframe's *content* viewport, not its CSS border box.
        // The real Inspector can apply borders, flex and sizing constraints.
        for(const [k,v] of Object.entries({position:'fixed',top:'0',left:'0',display:'block',
          flex:'none','box-sizing':'content-box',border:'0',padding:'0',margin:'0',
          width:width+'px','min-width':width+'px','max-width':width+'px',
          height:height+'px','min-height':height+'px','max-height':height+'px'}))
          el.style.setProperty(k,v,'important');
      },{width,height});
      try{
        await live.waitForFunction(({width,height})=>innerWidth===width&&innerHeight===height,{width,height},{timeout:10000});
      }catch(error){
        const actual=await live.evaluate(()=>({width:innerWidth,height:innerHeight}));
        const box=await page.locator('#esc-vb-frame').evaluate(el=>{
          const b=el.getBoundingClientRect(),s=getComputedStyle(el);
          return {width:b.width,height:b.height,clientWidth:el.clientWidth,clientHeight:el.clientHeight,
            cssWidth:s.width,cssHeight:s.height,boxSizing:s.boxSizing,border:s.borderWidth,padding:s.padding,position:s.position};
        });
        console.log('PSE_BUILDER_VIEWPORT_SETUP_DIAG='+JSON.stringify({expected:{width,height},actual,box}));
        throw error;
      }
      const publicPage=await browser.newPage({viewport:{width,height}});
      try{
        const response=await publicPage.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:60000});
        if(!response?.ok())throw Error('Public homepage returned '+response?.status());
        const [actual,expected]=await Promise.all([snapshot(live),snapshot(publicPage)]);
        const differences=[];
        for(let i=0;i<selectors.length;i++){
          for(const field of ['x','y','width','height']){
            const delta=Math.abs(actual.rows[i][field]-expected.rows[i][field]);
            if(delta>2)differences.push({selector:selectors[i],field,preview:actual.rows[i][field],public:expected.rows[i][field],delta});
          }
        }
        const equalContent=['news','promise','links'].every(k=>JSON.stringify(actual[k])===JSON.stringify(expected[k]));
        const report={width,height,actualViewport:actual.viewport,expectedViewport:expected.viewport,
          differences,equalContent,previewOverflow:actual.overflow,publicOverflow:expected.overflow,
          overlays:actual.overlays,statusVisible:actual.statusVisible,noCmsWrite:true};
        console.log('PSE_BUILDER_HOME_VIEWPORT_PARITY='+JSON.stringify(report));
        if(differences.length||!equalContent||actual.overflow>2||expected.overflow>2||
            actual.overlays||actual.statusVisible||actual.viewport.clientWidth!==expected.viewport.clientWidth)
          throw Error('Preview/public homepage parity mismatch at '+width+'px');
        results.push(width);
      }finally{await publicPage.close();}
    }
    console.log('PSE_BUILDER_HOME_VIEWPORT_PARITY_PASS='+JSON.stringify({widths:results,sections:selectors.length,geometryTolerancePx:2,noCmsWrite:true,noSave:true}));
  }else if(qaRequest.includes('PSE_SUBPAGE_VIEWPORT_PARITY_ONLY=1')){
    // Independent canonical WordPress permalinks, exact iframe content
    // viewport, no Inspector clicks or CMS writes.
    const targets=[
      {id:'80930',root:'.pse-faq',item:'.pse-faq__item'},
      {id:'80932',root:'.pse-hotline',item:'.pse-hotline__card'},
      {id:'79301',root:'.pse-history',item:'.pse-history__milestone'},
      {id:'79303',root:'.pse-vision',item:'.pse-vision__card'}
    ];
    const origin=await frame.locator('body').evaluate(()=>location.origin);
    if(origin!=='https://pse.webnvn.com')throw Error('Unexpected public origin');
    const summaries=[];
    for(const target of targets){
      const record=await page.evaluate(async id=>{
        const res=await fetch('/wp-json/wp/v2/pages/'+id+'?_fields=id,link,status',
          {credentials:'same-origin',cache:'no-store'});
        if(!res.ok)throw Error('Cannot read published Page '+id);
        return res.json();
      },target.id);
      const permalink=new URL(record.link);
      if(record.id!==Number(target.id)||record.status!=='publish'||permalink.origin!==wp.origin||
         permalink.pathname==='/'||permalink.search||permalink.hash)
        throw Error('Invalid canonical Page source '+target.id);
      await page.locator('#esc-vb-page').selectOption(target.id);
      await page.getByRole('button',{name:'Mở trang'}).click();
      await waitForSource(target.id);
      await frame.locator(target.item).first().waitFor({state:'visible',timeout:40000});
      const live=await (await page.locator('#esc-vb-frame').elementHandle())?.contentFrame();
      if(!live)throw Error('Missing authenticated iframe');
      const snapshot=async scope=>{
        await scope.locator(target.item).first().waitFor({state:'visible',timeout:35000});
        return scope.evaluate(async({root,item})=>{
          await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,8000))]);
          await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
          const roots=document.querySelectorAll(root);
          if(roots.length!==1)throw Error('Ambiguous section '+root);
          const nodes=[roots[0],...roots[0].querySelectorAll(item)];
          if(nodes.length<2)throw Error('No published items '+item);
          return {viewport:[innerWidth,innerHeight,document.documentElement.clientWidth],
            overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
            rows:nodes.map(e=>{
              const b=e.getBoundingClientRect(),style=getComputedStyle(e);
              return {rect:[b.x,b.y+scrollY,b.width,b.height],font:style.fontSize,
                text:e.innerText.trim().replace(/\s+/g,' ')};
            })};
        },target);
      };
      // On a geometry failure collect the preceding block and media state.
      // No raw content, credentials, tickets or URLs in diagnostics.
      const diagnostic=scope=>scope.evaluate(({root})=>{
        const e=document.querySelector(root);
        const rect=n=>{const r=n.getBoundingClientRect(),c=getComputedStyle(n);
          return {tag:n.tagName,classes:String(n.className||'').slice(0,120),y:r.y+scrollY,
            width:r.width,height:r.height,display:c.display,margin:c.margin,padding:c.padding};};
        const ancestors=[];
        for(let n=e;n&&ancestors.length<8;n=n.parentElement){
          const preceding=[];
          for(let p=n.previousElementSibling;p&&preceding.length<8;p=p.previousElementSibling)
            preceding.push(rect(p));
          ancestors.push({node:rect(n),preceding});
        }
        const cover=[...document.querySelectorAll('.pse-history-cover,.pse-history-cover img')]
          .map(n=>{
            const css=getComputedStyle(n);
            // Only expose public media pathnames (never query, fragment, auth or tickets).
            const mediaPath=value=>{
              if(!value)return null;
              try{
                const u=new URL(value,location.href);
                return /^\/(?:wp-content\/uploads\/|api\/images\/|images\/pages\/)/.test(u.pathname)
                  ? {origin:u.origin,path:u.pathname}:null;
              }catch{return null;}
            };
            return {...rect(n),complete:n.complete,naturalWidth:n.naturalWidth,naturalHeight:n.naturalHeight,
              src:mediaPath(n.getAttribute('src')),currentSrc:mediaPath(n.currentSrc),
              srcset:(n.getAttribute('srcset')||'').split(',').map(x=>{
                const [url,descriptor]=x.trim().split(/\s+/);
                return {media:mediaPath(url),descriptor:descriptor||null};
              }).filter(x=>x.media),
              sizes:n.getAttribute('sizes'),widthAttr:n.getAttribute('width'),heightAttr:n.getAttribute('height'),
              cssWidth:css.width,cssMaxWidth:css.maxWidth,cssAspectRatio:css.aspectRatio,
              inlineWidth:n.style.width,inlineMaxWidth:n.style.maxWidth};
          });
        return {ancestors,cover,fonts:document.fonts.status,
          sourceReady:!!document.querySelector('[data-source-ready="true"]')};
      },target);
      for(const width of [1440,390]){
        const height=900;
        await page.setViewportSize({width:1800,height:1100});
        await page.locator('#esc-vb-frame').evaluate((el,{width,height})=>{
          for(const [k,v] of Object.entries({position:'fixed',top:'0',left:'0',display:'block',
            flex:'none','box-sizing':'content-box',border:'0',padding:'0',margin:'0',
            width:width+'px','min-width':width+'px','max-width':width+'px',
            height:height+'px','min-height':height+'px','max-height':height+'px'}))
            el.style.setProperty(k,v,'important');
        },{width,height});
        await live.waitForFunction(({width,height})=>innerWidth===width&&innerHeight===height,{width,height},{timeout:10000});
        const publicPage=await browser.newPage({viewport:{width,height}});
        try{
          const res=await publicPage.goto(new URL(permalink.pathname,origin).href,
            {waitUntil:'domcontentloaded',timeout:60000});
          if(!res?.ok())throw Error('Public Page unavailable '+target.id);
          // Geometry must describe the settled page, not a transient image
          // reflow. Wait for the actual preceding History cover to decode,
          // and retain a before/after diagnostic to distinguish a real defect.
          if(target.id==='79301'){
            const before=await Promise.all([diagnostic(live),diagnostic(publicPage)]);
            const settle=scope=>scope.evaluate(async()=>{
              const imgs=[...document.querySelectorAll('.pse-history-cover img')];
              if(!imgs.length)throw Error('Missing History editorial cover');
              for(const img of imgs){
                if(img.loading==='lazy')img.scrollIntoView({block:'center'});
                await Promise.race([img.decode(),new Promise((_,reject)=>setTimeout(()=>reject(Error('History image decode timeout')),15000))]);
              }
              scrollTo(0,0);
              await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
            });
            await Promise.all([settle(live),settle(publicPage)]);
            const after=await Promise.all([diagnostic(live),diagnostic(publicPage)]);
            console.log('PSE_HISTORY_COVER_GEOMETRY='+JSON.stringify({width,before,after}));
          }
          const [a,b]=await Promise.all([snapshot(live),snapshot(publicPage)]);
          const differences=[];
          if(a.rows.length!==b.rows.length)differences.push({kind:'count',preview:a.rows.length,public:b.rows.length});
          for(let i=0;i<Math.min(a.rows.length,b.rows.length);i++){
            if(a.rows[i].text!==b.rows[i].text)differences.push({kind:'text',row:i});
            if(a.rows[i].font!==b.rows[i].font)differences.push({kind:'font',row:i});
            for(let k=0;k<4;k++){
              const delta=Math.abs(a.rows[i].rect[k]-b.rows[i].rect[k]);
              if(delta>2)differences.push({kind:'geometry',row:i,axis:['x','y','width','height'][k],delta,
                preview:a.rows[i].rect[k],public:b.rows[i].rect[k]});
            }
          }
          const pass=differences.length===0&&JSON.stringify(a.viewport)===JSON.stringify(b.viewport)&&
            a.overflow<=2&&b.overflow<=2;
          const report={pageId:target.id,width,items:b.rows.length-1,viewportPreview:a.viewport,
            viewportPublic:b.viewport,previewOverflow:a.overflow,publicOverflow:b.overflow,
            differences,pass,noCmsWrite:true};
          console.log('PSE_BUILDER_SUBPAGE_VIEWPORT_PARITY='+JSON.stringify(report));
          summaries.push({pageId:target.id,width,pass});
        }finally{await publicPage.close();}
      }
    }
    console.log('PSE_BUILDER_SUBPAGE_VIEWPORT_SUMMARY='+JSON.stringify(summaries));
    if(summaries.length!==8||summaries.some(x=>!x.pass))throw Error('Subpage viewport parity mismatch');
  }else{
  // Source-mode audit is observational only. The homepage might not contain
  // any S2-S5 collection, so absence is NOT a passing manual-reference test.
  await frame.locator('#esc-vb-editability-hint').waitFor({state:'attached',timeout:15000});
  const sourceModes=await frame.locator('[data-tablepress-preview][data-esc-builder-dynamic="true"]')
    .evaluateAll(nodes=>nodes.map(node=>({
      table:node.getAttribute('data-tablepress-preview'),
      mode:node.getAttribute('data-esc-builder-collection-mode')||'unclassified',
      state:node.getAttribute('data-esc-vb-region-state')||'unclassified',
      physicalRows:node.querySelectorAll('[data-esc-builder-row]').length
    })));
  if(sourceModes.some(row=>row.mode==='auto_query'&&row.state!=='readonly'))
    throw Error('API automatic collection incorrectly advertises direct editing');
   console.log('PSE_BUILDER_API_SOURCE_MODES_READONLY='+JSON.stringify({
    discovered:sourceModes.length,
    automatic:sourceModes.filter(row=>row.mode==='auto_query').length,
    manual:sourceModes.filter(row=>row.mode==='manual_reference').length,
    noCmsWrite:true
  }));
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
    if(!data.insertable_after||typeof data.insertable_after!=='object')
      throw Error('Production WordPress Page section insert source registry is missing');
    return {items:data.items||[],swappable:data.swappable||{},
      insertableAfter:data.insertable_after,
      canReorder:data.can_reorder===true};
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
  // Structural read-only diagnosis: classify existing Page wrappers only.
  // Do not log WordPress Editor HTML/text, nonce, ticket, or untrusted attrs.
  const physicalSourceShapes=await page.evaluate(async()=>{
    const scripts=[...document.scripts].map(el=>el.textContent||'');
    const source=scripts.find(src=>src.includes('duplicateSection:')&&src.includes('const nonce='));
    const quoted=source?.match(/\bconst nonce=("(?:[^"\\]|\\.)*")/);
    if(!quoted)throw Error('Cannot inspect source wrapper shape');
    const nonce=JSON.parse(quoted[1]);
    const pageId=Number(document.querySelector('#esc-vb-page')?.value);
    const response=await fetch('/wp-json/wp/v2/pages/'+pageId+
      '?context=edit&_fields=content',{
      credentials:'same-origin',cache:'no-store',headers:{'X-WP-Nonce':nonce}
    });
    if(!response.ok)throw Error('WordPress Page source read refused');
    const record=await response.json();
    const raw=record?.content?.raw;
    if(typeof raw!=='string')throw Error('No raw Page source in authenticated readback');
    const ids=['pse_00_vi','pse_01_vi','pse_02_vi','pse_03_vi'];
    const regex=/\[table\s+id\s*=\s*["']?([a-zA-Z0-9_-]{1,80})(?:["'])?\s*\/\]/gi;
    const withMarkers=raw.replace(regex,(full,id)=>ids.includes(id)
      ?'<mark data-pse-read-only-source="'+id+'"></mark>':full);
    const parsed=new DOMParser().parseFromString(withMarkers,'text/html');
    return ids.map(id=>{
      const mark=parsed.querySelector('mark[data-pse-read-only-source="'+id+'"]');
      const nearest=mark?.closest('div,section,article,li');
      const outer=nearest?.parentElement;
      const isolated=Boolean(nearest&&
        nearest.textContent?.trim()===''&&
        nearest.querySelectorAll('[data-pse-read-only-source]').length===1);
      return {id,found:Boolean(mark),wrapperTag:nearest?.tagName||null,
        wrapperHasId:Boolean(nearest?.hasAttribute('id')),
        wrapperHasClass:Boolean(nearest?.hasAttribute('class')),
        wrapperHasControls:Boolean(nearest?.querySelector('button,input,script,style,form,iframe')),
        wrapperHasOtherElements:(nearest?.querySelectorAll('*').length||0)>1,
        descendantTags:nearest?[...new Set([...nearest.querySelectorAll('*')]
          .map(node=>node.tagName.toLowerCase()))].slice(0,16):[],
        descendantCount:nearest?.querySelectorAll('*').length||0,
        descendantAttributes:nearest?[...nearest.querySelectorAll('*')]
          .slice(0,10).map(node=>({
            tag:node.tagName.toLowerCase(),
            attributes:[...node.attributes].map(attr=>attr.name).slice(0,14),
            containsEventAttribute:[...node.attributes].some(attr=>/^on[a-z]+$/i.test(attr.name)),
            hasGlobalId:node.hasAttribute('id'),
            hasName:node.hasAttribute('name'),
            hasFor:node.hasAttribute('for'),
            hasAriaControls:node.hasAttribute('aria-controls')||node.hasAttribute('aria-owns')
          })):[],
        htmlCommentCount:nearest?(()=>{
          const walker=parsed.createTreeWalker(nearest,NodeFilter.SHOW_COMMENT);
          let count=0;while(walker.nextNode()&&count<100)count++;return count;
        })():0,
        wrapperAttributeNames:nearest?[...nearest.attributes].map(a=>a.name).slice(0,12):[],
        wrapperOnlyNativeShortcode:isolated,
        parentTag:outer?.tagName||null,
        parentHasId:Boolean(outer?.hasAttribute('id'))
      };
    });
  });
  console.log('PSE_SECTION_INSERT_PHYSICAL_SOURCE_SHAPES_READ_ONLY='+
    JSON.stringify(physicalSourceShapes));
  // Diagnose exact byte-range PHP section wrapper tokenization without
  // revealing editor text, HTML, nonce, or arbitrary source attributes.
  const wrapperSourceResidual=await page.evaluate(async()=>{
    const script=[...document.scripts].map(node=>node.textContent||'')
      .find(text=>text.includes('duplicateSection:')&&text.includes('const nonce='));
    const quoted=script?.match(/\bconst nonce=("(?:[^"\\]|\\.)*")/);
    if(!quoted)throw Error('No authenticated Page read nonce');
    const nonce=JSON.parse(quoted[1]);
    const pageId=Number(document.querySelector('#esc-vb-page')?.value);
    const response=await fetch('/wp-json/wp/v2/pages/'+pageId+'?context=edit&_fields=content',{
      credentials:'same-origin',cache:'no-store',headers:{'X-WP-Nonce':nonce}
    });
    if(!response.ok)throw Error('No authenticated Page editor structure');
    const raw=(await response.json())?.content?.raw;
    if(typeof raw!=='string'||raw.length>1000000)throw Error('Invalid Page content');
    const shortcodes=[...raw.matchAll(/\[table\s+id\s*=\s*["']?([a-zA-Z0-9_-]{1,80})(?:["'])?\s*\/\]/gi)]
      .map(m=>({id:m[1],start:m.index,end:m.index+m[0].length}));
    const tags=[...raw.matchAll(/<[^>]+>/gs)];
    const frames=[],stack=[];
    const voids=['img','br','hr','input','meta','link','source','area',
      'base','col','embed','param','track','wbr'];
    for(const item of tags){
      const token=item[0],at=item.index;
      if(/^<!--|^<!|^<\?/.test(token))continue;
      const match=/^<\s*(\/?)\s*([a-z][a-z0-9:-]*)\b/i.exec(token);
      if(!match)continue;
      const tag=match[2].toLowerCase();
      if(match[1]){
        const last=stack.pop();
        if(last===undefined||frames[last].tag!==tag)
          throw Error('Page wrapper parse mismatch');
        frames[last].end=at+token.length;
        frames[last].closeStart=at;
      }else if(!voids.includes(tag)&&!/\/\s*>$/.test(token)){
        frames.push({tag,start:at,openEnd:at+token.length,parent:stack.at(-1)??-1});
        stack.push(frames.length-1);
      }
    }
    const names=['pse_00_vi','pse_01_vi','pse_02_vi','pse_03_vi'];
    return names.map(name=>{
      const item=shortcodes.find(shortcode=>shortcode.id===name);
      if(!item)return {name,located:false};
      const candidates=frames.filter(frame=>
        ['div','section','article','li'].includes(frame.tag)&&
        frame.openEnd<=item.start&&frame.closeStart>=item.end&&
        shortcodes.filter(s=>s.start>=frame.openEnd&&s.end<=frame.closeStart).length===1
      ).sort((a,b)=>(a.end-a.start)-(b.end-b.start));
      const slot=candidates[0];
      if(!slot)return {name,located:true,isolated:false};
      const fragment=raw.slice(slot.start,slot.end);
      const without=fragment.slice(0,item.start-slot.start)+
        fragment.slice(item.end-slot.start);
      const remainder=without.replace(/<[^>]*>/gs,'');
      const clean=remainder.replace(/(?:&nbsp;|&#0*160;|&#x0*a0;|&ensp;|&emsp;|\u00a0)/gi,'');
      const tokens=[...without.matchAll(/<\s*\/?\s*([a-z][a-z0-9:-]*)\b[^>]*>/gi)]
        .map(m=>m[1].toLowerCase());
      return {name,located:true,isolated:true,
        parentRoot:slot.parent===-1,tag:slot.tag,
        tokenTags:[...new Set(tokens)].slice(0,15),
        markupComments:/<!--/.test(without),
        nonRenderedDeclaration:/<!/.test(without),
        hasUnexpectedTag:tokens.some(t=>!['div','section','article','li','span','p','br'].includes(t)),
        rawTrimBytes:remainder.trim().length,
        remainingAfterKnownWhitespace:clean.trim().length,
        containsEncodedSpace:/&nbsp;|&#0*160;|&#x0*a0;|&ensp;|&emsp;|\u00a0/i.test(remainder),
        containsHtmlEntities:/&[#a-z0-9]+;/i.test(remainder),
        strippedBytes:remainder.length,withoutBytes:without.length,
      };
    });
  });
  console.log('PSE_SECTION_INSERT_PHP_RESIDUAL_CLASS_READ_ONLY='+
    JSON.stringify(wrapperSourceResidual));
  // Source-owned add-section contract: only exact Page occurrences in one
  // sibling group, with explicit shared ESC Table. This is a READ-ONLY
  // rehearsal: WordPress only receives dry_run:true and Page version is
  // checked before/after. No fake Page or TablePress record is created.
  const insertionCandidates=sectionCapability.items.flatMap(source=>
    (sectionCapability.insertableAfter[source.id]||[])
      .filter(after=>after!==source.id&&
        sectionCapability.items.some(item=>item.id===after))
      .map(after=>({source:source.id,after,tableId:source.table_id||source.id}))
  );
  const insertionCheck=await page.evaluate(async candidates=>{
    const script=[...document.scripts].map(el=>el.textContent||'')
      .find(src=>src.includes('duplicateSection:')&&src.includes('const nonce='));
    const quoted=script?.match(/\bconst nonce=("(?:[^"\\]|\\.)*")/);
    if(!quoted||typeof window.escVBGetTicket!=='function')
      throw Error('Authenticated Page section insert preflight is unavailable');
    const nonce=JSON.parse(quoted[1]),pageId=Number(document.querySelector('#esc-vb-page')?.value);
    const request=async(route,params={})=>{
      const ticket=await window.escVBGetTicket();
      const response=await fetch('/wp-json/esc-builder/v1/'+route,{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json','X-WP-Nonce':nonce},
        body:JSON.stringify({page_id:pageId,ticket,...params})
      });
      const data=await response.json();
      return {ok:response.ok&&!data?.code,data};
    };
    const before=await request('section-order');
    if(!before.ok)throw Error('Cannot read Page before section insert test');
    const approved=[];
    const rejected=[];
    for(const candidate of candidates.slice(0,20)){
      const attempt=await request('duplicate-section-shared',{
        section_key:candidate.source,insert_after_key:candidate.after,
        expected_version:before.data.version,share_source:true,dry_run:true
      });
      if(!attempt.ok){
        rejected.push({
          source:candidate.source,
          after:candidate.after,
          code:String(attempt.data?.code||'UNKNOWN').slice(0,60),
          reason:String(attempt.data?.data?.reason_code||'unspecified').slice(0,60)
        });
        continue; // A structurally unsafe source stays readonly.
      }
      const data=attempt.data;
      if(data.checked!==true||data.no_write!==true||data.saved!==false||
        data.source_shared!==true||data.duplicated!==candidate.source||
        data.insert_after_key!==candidate.after||data.version!==before.data.version||
        data.would_add_instances!==1||
        !Array.isArray(data.next_order)||
        data.next_order.length!==(before.data.items||[]).length+1||
        !/^[a-f0-9]{64}$/.test(data.next_version||''))
        throw Error('Unsafe or inconsistent section insert preflight contract');
      approved.push(candidate);
    }
    const after=await request('section-order');
    if(!after.ok||after.data.version!==before.data.version||
      JSON.stringify(after.data.items)!==JSON.stringify(before.data.items))
      throw Error('Read-only section insert altered live Page state');
    return {approved,eligibleCandidates:candidates.length,readOnly:true,
      rejected};
  },insertionCandidates);
  const denied=insertionCheck.rejected||[];
  if(denied.length)console.log('PSE_BUILDER_SECTION_INSERT_DENIALS_READ_ONLY='+
    JSON.stringify(denied));
  const sectionInsertResult={
    source:'WordPress Page',mode:'dry_run',eligibleCandidates:insertionCheck.eligibleCandidates,
    result:'NOT_TESTED_NO_SAFE_SOURCE',noCmsWrite:true
  };
  if(insertionCheck.approved.length){
    // A server-approved source can still be ineligible in the real Preview
    // (e.g. a slider with global DOM IDs). Probe all safe sibling candidates,
    // rather than accidentally treating the first ineligible source as a
    // missing feature. Never bypass either the source or Preview guard.
    let refusedPreview=0;
    const livePreviewFrame=await (await page.locator('#esc-vb-frame').elementHandle())?.contentFrame();
    if(!livePreviewFrame)throw Error('Missing real Preview Frame for insert/cancel QA');
    for(const [index,candidate] of insertionCheck.approved.entries()){
      const sourceTable=candidate.tableId;
      const targetTable=sectionCapability.items.find(item=>item.id===candidate.after)?.table_id;
      const countBefore=await frame.locator('[data-tablepress-preview="'+sourceTable+'"]').count();
      // Take physical DOM node identities rather than raw homepage HTML:
      // the public slider may legitimately autoplay while the Preview is
      // open. Cancel must retain every original section node, child and
      // sibling slot, and leave no extra physical section occurrence.
      await livePreviewFrame.evaluate(()=>{
        const nodes=[...document.querySelectorAll('[data-tablepress-preview]')]
          .filter(node=>!node.parentElement?.closest('[data-tablepress-preview]'));
        window.__pseInsertQaBaseline=nodes.map(node=>({
          node,parent:node.parentNode,next:node.nextSibling,
          children:[...node.childNodes]
        }));
      });
      const requestId=99227+index;
      const preview=await previewSection('esc-vb-section-duplicate-preview',
        candidate.source,requestId,candidate.after);
      if(!preview.matched){
        refusedPreview++;
        continue;
      }
      try{
        const countAfter=await frame.locator('[data-tablepress-preview="'+sourceTable+'"]').count();
        if(countAfter!==countBefore+1)
          throw Error('Preview inserted shared source into wrong TablePress collection');
        // The new source occurrence must sit immediately AFTER the original
        // destination on the actual page, not merely exist somewhere in DOM.
        const actualOrder=await frame.locator('body').evaluate(()=>
          [...document.querySelectorAll('[data-tablepress-preview]')]
            .filter(node=>!node.parentElement?.closest('[data-tablepress-preview]'))
            .map(node=>node.getAttribute('data-tablepress-preview')));
        if(typeof targetTable!=='string'||
          actualOrder.filter(id=>id===targetTable).length!==1||
          actualOrder[actualOrder.indexOf(targetTable)+1]!==sourceTable)
          throw Error('Preview inserted section at a different physical destination');
        sectionInsertResult.result='PASS';
        sectionInsertResult.source=candidate.source;
        sectionInsertResult.target=candidate.after;
      }finally{
        await previewSection('esc-vb-section-duplicate-cancel',
          candidate.source,requestId,candidate.after);
        // postMessage is async. Assert strict identity and source ordering
        // of the REAL section DOM, without falsely rejecting a separately
        // rotating hero slider's transient class/aria state.
        try{
          await livePreviewFrame.waitForFunction(()=>{
            const baseline=window.__pseInsertQaBaseline;
            const current=[...document.querySelectorAll('[data-tablepress-preview]')]
              .filter(node=>!node.parentElement?.closest('[data-tablepress-preview]'));
            return Array.isArray(baseline)&&current.length===baseline.length&&
              current.every((node,index)=>{
                const prior=baseline[index];
                return node===prior.node&&node.parentNode===prior.parent&&
                  node.nextSibling===prior.next&&
                  node.childNodes.length===prior.children.length&&
                  [...node.childNodes].every((child,i)=>child===prior.children[i]);
              });
          },null,{timeout:10000});
        }catch{
          const diag=await livePreviewFrame.evaluate(()=>{
            const baseline=window.__pseInsertQaBaseline||[];
            const current=[...document.querySelectorAll('[data-tablepress-preview]')]
              .filter(node=>!node.parentElement?.closest('[data-tablepress-preview]'));
            return {
              expectedSections:baseline.length,actualSections:current.length,
              reordered:current.some((node,i)=>node!==baseline[i]?.node),
              movedParent:current.some((node,i)=>node.parentNode!==baseline[i]?.parent),
              movedSibling:current.some((node,i)=>node.nextSibling!==baseline[i]?.next),
              changedChildren:current.some((node,i)=>
                node.childNodes.length!==baseline[i]?.children.length||
                [...node.childNodes].some((child,j)=>child!==baseline[i]?.children[j]))
            };
          });
          console.log('PSE_SECTION_INSERT_CANCEL_READBACK_DIAG='+JSON.stringify({
            ...diag,previewOccurrences:
              await frame.locator('[data-tablepress-preview="'+sourceTable+'"]').count(),
            noCmsWrite:true
          }));
          throw Error('Section insertion Cancel failed to restore exact physical section DOM');
        }finally{
          await livePreviewFrame.evaluate(()=>{delete window.__pseInsertQaBaseline;});
        }
      }
      if(sectionInsertResult.result==='PASS')break;
    }
    if(sectionInsertResult.result!=='PASS'){
      sectionInsertResult.result='NOT_TESTED_UNSAFE_PREVIEW_SOURCE';
      sectionInsertResult.previewRefused=refusedPreview;
      sectionInsertResult.serverApproved=insertionCheck.approved.length;
    }
  }
  console.log('PSE_BUILDER_SECTION_INSERT_SHARED_DRY_RUN_LIVE='+JSON.stringify(sectionInsertResult));
  // Exercise the REAL Inspector's new control end-to-end, not only raw
  // postMessage/REST. Source click reveals safe capability, button chooses
  // INSERT mode, actual Preview target click shows a green marker; cancel
  // returns without ever triggering the Save button.
  const inspectorInsert={result:'NOT_TESTED_NO_SAFE_SOURCE',noCmsWrite:true};
  if(sectionInsertResult.result==='PASS'){
    const source=sectionInsertResult.source,targetKey=sectionInsertResult.target;
    const srcTable=sectionCapability.items.find(x=>x.id===source)?.table_id||source;
    const dstTable=sectionCapability.items.find(x=>x.id===targetKey)?.table_id||targetKey;
    const originalOrder=await frame.locator('[data-tablepress-preview]').evaluateAll(nodes=>
      nodes.filter(n=>!n.parentElement?.closest('[data-tablepress-preview]'))
        .map(n=>n.getAttribute('data-tablepress-preview')));
    await frame.locator('[data-tablepress-preview="'+srcTable+'"]').first()
      .click({force:true,position:{x:12,y:12}});
    const insertButton=page.locator('#esc-vb-section-insert-shared');
    // The live Editor grants this capability only after both server
    // source and Preview source checks finish; hidden means no promise.
    await page.waitForFunction(()=>{
      const el=document.querySelector('#esc-vb-section-order-panel');
      return el instanceof HTMLElement&&
        ['ready','unsupported','unavailable'].includes(el.dataset.sectionCaps||'');
    },null,{timeout:25000});
    if(await insertButton.isVisible() && await insertButton.isEnabled()){
      const approve=dialog=>dialog.accept();
      page.once('dialog',approve);
      await insertButton.click();
      const orderBody=page.locator('#esc-vb-section-order-body');
      await orderBody.waitFor({state:'visible',timeout:25000});
      await frame.locator('[data-esc-vb-swap-source]').first()
        .waitFor({state:'attached',timeout:10000});
      const target=frame.locator('[data-tablepress-preview="'+dstTable+'"]').first();
      await target.click({force:true,position:{x:12,y:12}});
      await page.waitForFunction(()=>{
        const save=document.querySelector('#esc-vb-section-order-save');
        return save instanceof HTMLButtonElement&&
          !save.disabled&&save.textContent?.includes('thêm section');
      },null,{timeout:15000});
      if(await frame.locator('[data-esc-vb-swap-target]').count()<1)
        throw Error('Inspector insert lacks selected green target marker on Preview');
      // The Save button is deliberately NEVER clicked by this QA.
      await page.locator('#esc-vb-section-order-cancel').click();
      await orderBody.waitFor({state:'hidden',timeout:10000});
      await frame.locator('[data-esc-vb-swap-source],[data-esc-vb-swap-target]')
        .first().waitFor({state:'detached',timeout:10000});
      const restored=await frame.locator('[data-tablepress-preview]').evaluateAll(nodes=>
        nodes.filter(n=>!n.parentElement?.closest('[data-tablepress-preview]'))
          .map(n=>n.getAttribute('data-tablepress-preview')));
      if(JSON.stringify(restored)!==JSON.stringify(originalOrder))
        throw Error('Inspector insertion cancel changed original Page section order');
      inspectorInsert.result='PASS';
      inspectorInsert.source=source;
      inspectorInsert.target=targetKey;
      inspectorInsert.selectedViaPreview=true;
      inspectorInsert.cancelled=true;
    }else{
      inspectorInsert.result='NOT_TESTED_SOURCE_CAPABILITY_HIDDEN';
      inspectorInsert.source=source;
    }
  }
  console.log('PSE_BUILDER_SECTION_INSERT_INSPECTOR_LIVE='+JSON.stringify(inspectorInsert));
  const sectionSwapResults={source:'WordPress Page',mode:'read_only_preview'};
  if(sectionPair){
    // Same authenticated REST endpoint used by the Inspector: verify the
    // exact Page transform without invoking its real Save or mutating CMS.
    const sourceCheck=await page.evaluate(async pair=>{
      const script=[...document.scripts].map(el=>el.textContent||'')
        .find(src=>src.includes('duplicateSection:')&&src.includes('const nonce='));
      const quoted=script?.match(/\bconst nonce=("(?:[^"\\]|\\.)*")/);
      if(!quoted||typeof window.escVBGetTicket!=='function')
        throw Error('Authenticated Page source preflight is unavailable');
      const nonce=JSON.parse(quoted[1]);
      const pageId=Number(document.querySelector('#esc-vb-page')?.value);
      const read=async(route,more={})=>{
        const ticket=await window.escVBGetTicket();
        const response=await fetch('/wp-json/esc-builder/v1/'+route,{
          method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{'Content-Type':'application/json','X-WP-Nonce':nonce},
          body:JSON.stringify({page_id:pageId,ticket,...more})
        });
        const result=await response.json();
        if(!response.ok||result?.code)
          throw Error('Page section preflight rejected '+String(result?.code||response.status));
        return result;
      };
      const before=await read('section-order');
      const ids=(before.items||[]).map(item=>item.id);
      const from=ids.indexOf(pair.from),to=ids.indexOf(pair.to);
      if(from<0||to<0||from===to)throw Error('Section source occurrence mismatch');
      const order=[...ids];[order[from],order[to]]=[order[to],order[from]];
      const prepared=await read('save-section-order',{
        expected_version:before.version,swap:[pair.from,pair.to],dry_run:true
      });
      const after=await read('section-order');
      return {
        checked:prepared.checked===true,
        noWrite:prepared.no_write===true&&prepared.saved===false,
        wouldSave:prepared.would_save===true,
        exactOrder:Array.isArray(prepared.order)&&
          prepared.order.length===order.length&&
          prepared.order.every((v,i)=>v===order[i]),
        exactPair:Array.isArray(prepared.swapped)&&
          prepared.swapped[0]===pair.from&&prepared.swapped[1]===pair.to,
        sourceUnchanged:prepared.version===before.version&&
          after.version===before.version&&
          (after.items||[]).map(item=>item.id).join('|')===ids.join('|'),
        predictedVersion:/^[a-f0-9]{64}$/.test(prepared.next_version||'')&&
          prepared.next_version!==before.version,
        sourcePreserved:prepared.source_preserved===true
      };
    },sectionPair);
    if(!Object.values(sourceCheck).every(Boolean))
      throw Error('Page section two-position preflight failed: '+JSON.stringify(sourceCheck));
    console.log('PSE_BUILDER_SECTION_SOURCE_SWAP_DRY_RUN_LIVE=PASS NO_CMS_WRITE=true exact_two_positions=true');
  }
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
  if(sectionPair){
    const requestId=99671;
    const targetId=sectionCapability.items.find(item=>item.id===sectionPair.to)?.table_id||
      sectionPair.to;
    const target=frame.locator('[data-tablepress-preview="'+targetId+'"]').first();
    const priorTabindex=await target.getAttribute('tabindex');
    try{
      const ready=await previewPickMessage({
        type:'esc-vb-section-pick-start',source:sectionPair.from,
        allowed:[sectionPair.to],requestId
      },'esc-vb-section-pick-ready');
      if(ready?.matched!==true)throw Error('Keyboard section source rejected');
      if(!(await target.evaluate(node=>node.tabIndex>=0)))
        throw Error('Section Preview target is not keyboard focusable in pick mode');
      const resultPromise=awaitPreviewPicked('esc-vb-section-target-picked',requestId);
      await target.focus();
      await target.press('Enter');
      const picked=await resultPromise;
      if(picked?.allowed!==true||picked.tableId!==sectionPair.to)
        throw Error('Keyboard section target did not select exact Page occurrence');
      if(!await target.evaluate(node=>node.hasAttribute('data-esc-vb-swap-target')))
        throw Error('Keyboard section target missing green selection');
       const escapeRequest=awaitPreviewPicked('esc-vb-section-pick-cancel-request',requestId);
       await target.press('Escape');
       const cancel=await escapeRequest;
       if(cancel?.source!==sectionPair.from)
         throw Error('Keyboard section Escape requested cancellation of wrong Page source');
    }finally{
      await previewPickMessage({type:'esc-vb-section-pick-clear'},null);
      if(await target.getAttribute('tabindex')!==priorTabindex)
        throw Error('Keyboard section Cancel did not restore source tabindex');
    }
    console.log('PSE_BUILDER_SECTION_KEYBOARD_PICK_LIVE=PASS Enter=true Escape_request=true restored_tabindex=true NO_CMS_WRITE=true');
    if(inspectorEscapeE2E){
      // Exercise the REAL WordPress inspector, not a synthetic parent pick
      // state. Open only the readonly picker, then Escape. Never click Save.
      const sourceId=sectionCapability.items.find(item=>item.id===sectionPair.from)?.table_id||
        sectionPair.from;
      await frame.locator('[data-tablepress-preview="'+sourceId+'"]').first()
        .click({force:true,position:{x:12,y:12}});
      const open=page.locator('#esc-vb-section-order-open');
      await open.waitFor({state:'visible',timeout:15000});
      await page.waitForFunction(()=>{
        const button=document.querySelector('#esc-vb-section-order-open');
        return button instanceof HTMLButtonElement&&!button.disabled;
      },null,{timeout:15000});
      await open.click();
      await frame.locator('[data-esc-vb-swap-source]').first()
        .waitFor({state:'attached',timeout:25000});
      const target=frame.locator('[data-tablepress-preview="'+targetId+'"]').first();
      await target.focus();
      await target.press('Escape');
      await page.waitForFunction(()=>{
        const panel=document.querySelector('#esc-vb-section-order-body');
        return panel instanceof HTMLElement&&panel.hidden===true;
      },null,{timeout:12000});
      // The parent sends pick-clear across an iframe boundary after hiding
      // the Inspector; wait for the asynchronous DOM acknowledgment.
      await frame.locator('[data-esc-vb-swap-source],[data-esc-vb-swap-target]').first()
        .waitFor({state:'detached',timeout:10000});
      if(await frame.locator('[data-esc-vb-swap-source],[data-esc-vb-swap-target]').count())
        throw Error('Inspector section Escape left stale red/green Preview markers');
      console.log('PSE_BUILDER_INSPECTOR_ESCAPE_SECTION_LIVE=PASS no_save=true parent_cancel=true');
    }
  }
  for(const config of (cloneDiagnosticOnly?[]:[
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
  ])){
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
    const visibleCount=await cards.count();
    const rowIdentity=await root.evaluate((el,selector)=>({
      visible:[...el.querySelectorAll(selector)].map(node=>Number(node.getAttribute('data-esc-builder-row'))),
      all:[...el.querySelectorAll('[data-esc-builder-row],[data-esc-builder-cell-row],[data-esc-builder-image-row]')]
        .map(node=>Number(node.getAttribute('data-esc-builder-row')||
          node.getAttribute('data-esc-builder-cell-row')||
          node.getAttribute('data-esc-builder-image-row'))).filter(Number.isSafeInteger)
    }),config.item);
    // Public Promise renders physical rows [1,2,3]; row 0 is section
    // metadata. Never pretend visible index 0 is physical row 0.
    const from=config.name==='PSE_PROMISE'?rowIdentity.visible[0]:0;
    const to=config.name==='PSE_PROMISE'?rowIdentity.visible[1]:1;
    const count=config.name==='PSE_PROMISE'?Math.max(...rowIdentity.all)+1:visibleCount;
    const runtime=await root.evaluate(el=>({
      installed:!!document.querySelector('style[data-esc-vb-item-pick-style]'),
      previewClass:document.documentElement.classList.contains('esc-builder-preview'),
      trustedParentConfigured:!!document.querySelector('#esc-vb-nav-context')?.getAttribute('data-parent-origin'),
      sourceRows:[...el.querySelectorAll('[data-esc-builder-row]')].slice(0,20)
        .map(x=>x.getAttribute('data-esc-builder-row')),
      scriptCount:document.scripts.length
    }));
    console.log('PSE_SWAP_PAGE_DIAGNOSTIC='+JSON.stringify({
      name:config.name,pageId:config.pageId||home,tableId,count,visibleCount,from,to,...runtime
    }));
    if(!tableId||visibleCount<2||!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||
      !Number.isSafeInteger(count)||count<2||from===to){
      results.push(config.name+':NOT_TESTED_ROWS_'+visibleCount);continue
    }
    if(config.ready){
      const ready=await root.locator('[data-pse-slider]').first().getAttribute('data-ready');
      if(ready!=='true'){results.push(config.name+':NOT_TESTED_CONTROLLER_NOT_READY');continue}
    }
    if(config.name==='PSE_PROMISE'){
      const target=root.locator(config.item+'[data-esc-builder-row="'+to+'"]').first();
      const priorTabindex=await target.getAttribute('tabindex'),requestId=99672;
      try{
        const ready=await previewPickMessage({
          type:'esc-vb-item-pick-start',tableId,sourceRow:from,count,requestId
        },'esc-vb-item-pick-ready');
        if(ready?.matched!==true)throw Error('Keyboard item physical source rejected');
        if(!(await target.evaluate(node=>node.tabIndex>=0)))
          throw Error('Physical item card is not keyboard focusable in pick mode');
        const resultPromise=awaitPreviewPicked('esc-vb-item-target-picked',requestId);
        await target.focus();
        await target.press('Space');
        const picked=await resultPromise;
        if(picked?.tableId!==tableId||picked.row!==to)
          throw Error('Keyboard item selection lost physical TablePress source row');
        if(!await target.evaluate(node=>node.hasAttribute('data-esc-vb-item-target')))
          throw Error('Keyboard item target missing green source-row selection');
         const escapeRequest=awaitPreviewPicked('esc-vb-item-pick-cancel-request',requestId);
         await target.press('Escape');
         const cancel=await escapeRequest;
         if(cancel?.tableId!==tableId)
           throw Error('Keyboard item Escape requested cancellation of wrong ESC source');
      }finally{
        await previewPickMessage({type:'esc-vb-item-pick-clear'},null);
        if(await target.getAttribute('tabindex')!==priorTabindex)
          throw Error('Keyboard item Cancel did not restore original tabindex');
      }
      console.log('PSE_BUILDER_ITEM_KEYBOARD_PICK_LIVE=PASS Space=true Escape_request=true physical_row=true restored_tabindex=true NO_CMS_WRITE=true');
      if(inspectorEscapeE2E){
        // Read-only S1 item inspector flow: select the physical row, open
        // Preview destination mode and Escape without accepting a swap.
        await root.locator(config.item+'[data-esc-builder-row="'+from+'"]').first()
          .click({force:true});
        const open=page.locator('#esc-vb-item-sort-open');
        await open.waitFor({state:'visible',timeout:15000});
        await page.waitForFunction(()=>{
          const button=document.querySelector('#esc-vb-item-sort-open');
          return button instanceof HTMLButtonElement&&!button.disabled;
        },null,{timeout:15000});
        await open.click();
        await frame.locator('[data-esc-vb-item-source]').first()
          .waitFor({state:'attached',timeout:25000});
        await target.focus();
        await target.press('Escape');
        await page.waitForFunction(()=>{
          const panel=document.querySelector('#esc-vb-item-sort-body');
          return panel instanceof HTMLElement&&panel.hidden===true;
        },null,{timeout:12000});
        // Inspector hidden is a parent-window state; the iframe processes
        // esc-vb-item-pick-clear on the next event-loop turn. Do not mistake
        // that normal message latency for a persistent Preview defect.
        await frame.locator('[data-esc-vb-item-source],[data-esc-vb-item-target]').first()
          .waitFor({state:'detached',timeout:10000});
        if(await frame.locator('[data-esc-vb-item-source],[data-esc-vb-item-target]').count())
          throw Error('Inspector item Escape left stale Preview row markers');
        console.log('PSE_BUILDER_INSPECTOR_ESCAPE_ITEM_LIVE=PASS no_save=true parent_cancel=true physical_row=true');
      }
    }
    await root.evaluate((el,{selector,from,to})=>{
      const cards=[...el.querySelectorAll(selector)];
      const first=cards.find(card=>card.getAttribute('data-esc-builder-row')===String(from));
      const second=cards.find(card=>card.getAttribute('data-esc-builder-row')===String(to));
      if(!first||!second)throw Error('Two distinct visible physical source rows not found');
      first.setAttribute('data-pse-qa-swap','first');
      second.setAttribute('data-pse-qa-swap','second');
    },{selector:config.item,from,to});
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
    [reordered[from],reordered[to]]=[reordered[to],reordered[from]];
    let previewMatched=false;
    const requestId=88001+results.length;
    try{
      if(!runtime.installed)throw Error(config.name+' Preview swap listener missing in actual iframe');
      const ack=await send('esc-vb-item-sort-preview',tableId,from,to,count,requestId,reordered);
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
      if(first?.row!==String(to)||second?.row!==String(from)||!first.nested||!second.nested||
        (config.name!=='PSE_HOTLINE'&&
          (actual.firstTwo[0]!=='second'||actual.firstTwo[1]!=='first')))
        throw Error(config.name+' client Preview reordered wrong source cells');
      results.push(config.name+':PASS direct_swap=true physical_rows=true');
    }finally{
      if(previewMatched){
        await send('esc-vb-item-sort-cancel',tableId,from,to,count,requestId,original);
        const restored=await root.evaluate((el,{selector,from,to})=>new Promise(resolve=>{
          const deadline=Date.now()+4000;
          const poll=()=>{
            const rows=[...el.querySelectorAll(selector)];
            const first=rows.find(node=>node.getAttribute('data-pse-qa-swap')==='first');
            const second=rows.find(node=>node.getAttribute('data-pse-qa-swap')==='second');
            const ordered=rows.slice(0,2);
            if(first?.getAttribute('data-esc-builder-row')===String(from)&&
               second?.getAttribute('data-esc-builder-row')===String(to)&&
               (rows.some(node=>node.closest('.pse-hotline__grid'))||
                (ordered[0]===first&&ordered[1]===second)))resolve(true);
            else if(Date.now()>deadline)resolve(false);
            else setTimeout(poll,35);
          };
          poll();
        }),{selector:config.item,from,to});
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
  // A real WordPress Page owns this shortcode. Verify the same backend
  // remove transaction with dry_run and cancel the iframe Preview every time.
  const deletion=await page.evaluate(async()=>{
    const ui=[...document.scripts].map(el=>el.textContent||'')
      .find(src=>src.includes('duplicateSection:')&&src.includes('const nonce='));
    const token=ui?.match(/const nonce="([A-Za-z0-9_-]+)"/);
    if(!token||typeof window.escVBGetTicket!=='function')
      throw Error('Authenticated Builder source was not installed');
    const nonce=token[1],pageId=Number(document.querySelector('#esc-vb-page')?.value);
    if(pageId!==80932)throw Error('Not on the expected Hotline WordPress Page');
    const read=async(route,more={})=>{
      const ticket=await window.escVBGetTicket();
      const res=await fetch('/wp-json/esc-builder/v1/'+route,{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json','X-WP-Nonce':nonce},
        body:JSON.stringify({ticket,page_id:pageId,...more})
      });
      const json=await res.json();
      if(!res.ok||json?.code)
        throw Error('No-write section removal rejected: '+String(json?.code||res.status));
      return json;
    };
    const before=await read('section-order');
    const source=(before.items||[]).filter(x=>x.table_id==='pse_hotline_vi');
    if(source.length!==1)throw Error('Hotline Page has ambiguous shortcode ownership');
    const prepared=await read('remove-section',{
      section_key:source[0].id,expected_version:before.version,dry_run:true
    });
    const after=await read('section-order');
    return {key:source[0].id,mode:prepared.remove_mode,
      ok:prepared.checked===true&&prepared.no_write===true&&
        prepared.saved===false&&prepared.source_preserved===true&&
        prepared.removed===source[0].id&&prepared.table_id==='pse_hotline_vi'&&
        before.version===after.version&&prepared.version===before.version&&
        before.items.length===after.items.length};
  });
  if(!deletion.ok||deletion.mode!=='shortcode_only')
    throw Error('Source-checked Hotline Page removal preflight failed');
  const beforeCount=await frame.locator('[data-tablepress-preview="pse_hotline_vi"]').count();
  const htmlParts=await frame.locator('[data-esc-builder-html-part]').count();
  let removalPreviewAck=false;
  try{
    removalPreviewAck=await page.evaluate(async({key,mode})=>{
      const iframe=document.querySelector('#esc-vb-frame');
      if(!(iframe instanceof HTMLIFrameElement)||!iframe.contentWindow)
        throw Error('Live Preview iframe missing');
      const target=new URL(iframe.src,location.href).origin,requestId=99044;
      return await new Promise((resolve,reject)=>{
        const handle=event=>{
          if(event.source!==iframe.contentWindow||event.origin!==target||
            event.data?.type!=='esc-vb-section-remove-preview-ack'||
            event.data?.requestId!==requestId)return;
          clearTimeout(timer);window.removeEventListener('message',handle);
          resolve(event.data.matched===true);
        };
        const timer=setTimeout(()=>{
          window.removeEventListener('message',handle);
          reject(Error('No Preview removal acknowledgement'));
        },7500);
        window.addEventListener('message',handle);
        iframe.contentWindow.postMessage({
          type:'esc-vb-section-remove-preview',key,mode,requestId
        },target);
      });
    },{key:deletion.key,mode:deletion.mode});
    if(!removalPreviewAck||
      await frame.locator('[data-tablepress-preview="pse_hotline_vi"]').count()!==beforeCount-1||
      await frame.locator('[data-esc-builder-html-part]').count()!==htmlParts)
      throw Error('Preview removal changed an unrelated Page HTML part');
  }finally{
    await page.evaluate(()=>{
      const iframe=document.querySelector('#esc-vb-frame');
      if(!(iframe instanceof HTMLIFrameElement)||!iframe.contentWindow)
        throw Error('Missing Page iframe when canceling remove');
      iframe.contentWindow.postMessage({type:'esc-vb-section-remove-cancel'},
        new URL(iframe.src,location.href).origin);
    });
    await frame.locator('[data-tablepress-preview="pse_hotline_vi"]')
      .first().waitFor({state:'attached',timeout:10000});
    if(await frame.locator('[data-tablepress-preview="pse_hotline_vi"]').count()!==beforeCount||
      await frame.locator('[data-esc-builder-html-part]').count()!==htmlParts)
      throw Error('Preview Cancel failed to restore exact section and original Page HTML');
  }
  // The Page visibility writer is a new privileged capability. Exercise
  // its EXACT no-write branch on a real published Page, never a business Save.
  // Read the source again afterwards to prove no change to Page revision.
  const sectionVisibilityReadOnly=await page.evaluate(async()=>{
    const ui=[...document.scripts].map(s=>s.textContent||'')
      .find(s=>s.includes('sectionVisibility:')&&s.includes('const nonce='));
    const nonceLiteral=ui?.match(/const nonce=("(?:[^"\\]|\\.)*")/);
    if(!nonceLiteral||typeof window.escVBGetTicket!=='function')
      throw Error('Section visibility Inspector is not installed on WordPress');
    const nonce=JSON.parse(nonceLiteral[1]);
    const pageId=Number(document.querySelector('#esc-vb-page')?.value);
    if(!Number.isSafeInteger(pageId)||pageId<1)
      throw Error('Unverified Page ownership for visibility preflight');
    const call=async(route,params={})=>{
      const ticket=await window.escVBGetTicket();
      const res=await fetch('/wp-json/esc-builder/v1/'+route,{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Content-Type':'application/json','X-WP-Nonce':nonce},
        body:JSON.stringify({page_id:pageId,ticket,...params})
      });
      const result=await res.json();
      if(!res.ok||result?.code)
        throw Error('Visibility no-write preflight refused: '+
          String(result?.code||res.status));
      return result;
    };
    const before=await call('section-order');
    const candidates=Array.isArray(before.items)?before.items.filter(x=>
      x.can_toggle===true && typeof x.hidden==='boolean'):[];
    if(!candidates.length)
      throw Error('No source-owned published Page section supports visibility');
    const choice=candidates.find(x=>x.table_id==='pse_hotline_vi')||candidates[0];
    const nextVisible=choice.hidden===true;
    const prepared=await call('save-section-visibility',{
      section_key:choice.id,expected_version:before.version,
      visible:nextVisible,dry_run:true
    });
    const after=await call('section-order');
    return {
      checked:prepared?.checked===true,saved:prepared?.saved===false,
      noWrite:prepared?.no_write===true,
      sourcePreserved:prepared?.source_preserved===true,
      exactSection:prepared?.section_key===choice.id&&
        prepared?.table_id===choice.table_id,
      nextHidden:prepared?.hidden===!nextVisible,
      versionUnchanged:before.version===after.version&&
        prepared.version===before.version,
      orderUnchanged:JSON.stringify(before.items)===JSON.stringify(after.items),
      eligible:candidates.length
    };
  });
  if(!Object.entries(sectionVisibilityReadOnly).filter(([key])=>key!=='eligible')
    .every(([,value])=>value===true))
    throw Error('Live WordPress section visibility dry-run/source readback mismatch');
  console.log('PSE_PAGE_SECTION_VISIBILITY_LIVE='+JSON.stringify({
    result:'PASS',eligible:sectionVisibilityReadOnly.eligible,
    dryRun:true,noCmsWrite:true,sourceVersionUnchanged:true
  }));
  console.log('PSE_BUILDER_SECTION_REMOVAL_LIVE='+JSON.stringify({
    tableId:'pse_hotline_vi',result:'PASS',mode:deletion.mode,
    pageVersionUnchanged:true,serverDryRun:true,previewCancelled:true,noCmsWrite:true
  }));
  console.log('PSE_BUILDER_SECTION_CLONE_LIVE='+JSON.stringify(sectionClones));
  if(!sectionClones.some(item=>item.result==='PASS'))
    throw Error('No real PSE Page section can be safely preview-cloned');

  console.log('PSE_BUILDER_SWAP_LIVE='+JSON.stringify(results));
  if(!cloneDiagnosticOnly&&!results.some(s=>s.includes(':PASS')))
    throw Error('No populated live PSE item collection could be rehearsed');
  console.log('PSE_BUILDER_SWAP_READ_ONLY='+
    (cloneDiagnosticOnly?'NOT_TESTED_DIAGNOSTIC_ONLY':'PASS')+
    ' NO_CMS_WRITE=true NO_SAVE=true PREVIEW_CANCELLED=true');
  }
}finally{await browser.close()}
