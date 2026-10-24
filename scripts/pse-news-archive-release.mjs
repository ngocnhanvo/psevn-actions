/** Prepare the WordPress-authored PSE news/search archive as a private Page draft. Do not publish/cut over or build Astro. Idempotent REST read-after-write. */
import { chromium } from 'playwright';
const origin=(()=>{
  const rows=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,'')).filter(x=>x.startsWith('WC_URL='));
  if(rows.length!==1)throw Error('Missing or ambiguous WC_URL');
  const url=new URL(rows[0].slice(7).trim().replace(/^['"]|['"]$/g,''));
  if(url.protocol!=='https:'||!url.hostname||url.username||url.password||(url.port&&url.port!=='443')||!['','/'].includes(url.pathname)||url.search||url.hash)
    throw Error('Invalid PSE HTTPS CMS origin');
  return url.origin;
})();
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:950}});
const page=await context.newPage();
page.on('dialog',async d=>{try{if(d.type()==='confirm')await d.accept();else await d.dismiss()}catch(e){if(!String(e).includes('already handled'))throw e}});
try {
  const username=process.env.WP_ADMIN_USERNAME,password=process.env.WP_ADMIN_PASSWORD;
  if(!username||!password)throw Error('Missing WordPress admin credentials');
  await page.goto(origin+'/wp-admin/',{waitUntil:'domcontentloaded',timeout:60000});
  if(await page.locator('#user_login').count()){
    await page.locator('#user_login').fill(username);
    await page.locator('#user_pass').fill(password);
    const txt=await page.locator('body').innerText();
    const match=txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)\s*(?:=|\?)/i)||txt.match(/(\d+)\s*([+\-x×*])\s*(\d+)/i);
    if(match){
      const a=Number(match[1]),b=Number(match[3]);
      const ans=({'+':a+b,'-':a-b,x:a*b,'×':a*b,'*':a*b})[match[2]];
      const f=page.locator('#loginform input[name*="captcha" i],#loginform input[name*="math" i],#loginform input[name*="arith" i],#loginform input[type="number"]').first();
      if(!await f.count())throw Error('Missing arithmetic challenge field');
      await f.fill(String(ans));
    }
    await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#wp-submit').click()]);
  }
  if(page.url().includes('wp-login'))throw Error('WordPress admin login failed');
  const restNonce=await page.evaluate(async()=>{
    const cached=window.wpApiSettings?.nonce;
    if(cached)return cached;
    // Core WordPress AJAX handler: returns wp_create_nonce('wp_rest') for
    // authenticated admin sessions. Never write this value to logs.
    const r=await fetch('/wp-admin/admin-ajax.php?action=rest-nonce',
      {credentials:'same-origin',headers:{Accept:'text/plain'}});
    if(!r.ok)throw Error('Cannot obtain WordPress REST nonce (HTTP '+r.status+')');
    const token=(await r.text()).trim();
    if(!/^[a-zA-Z0-9]{8,24}$/.test(token)||token==='0')throw Error('Invalid WordPress REST nonce response');
    return token;
  });
  const api=async(path,method='GET',body)=>{
    const out=await page.evaluate(async({path,method,body,restNonce})=>{
      const nonce=restNonce;
      const res=await fetch(path,{method,credentials:'same-origin',
        headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(nonce?{'X-WP-Nonce':nonce}:{})},
        ...(body?{body:JSON.stringify(body)}:{})});
      const payload=await res.json().catch(()=>({}));
      return {status:res.status,payload};
    },{path,method,body,restNonce});
    return out;
  };


  const event=JSON.parse(await (await import('node:fs/promises')).readFile(process.env.GITHUB_EVENT_PATH,'utf8'));
  const apply=event.head_commit?.message==='cms(pse): publish verified news archive and native URL rewrites';

  const bindMenu=event.head_commit?.message==='cms(pse): bind verified news archive to WordPress Header menu';
  const seoRedirects=event.head_commit?.message==='cms(pse): preserve verified Joomla news category URLs';
  const introWrite=event.head_commit?.message==='cms(pse): add genuine WordPress news archive introduction';
  if(introWrite){
    const url='/wp-json/wp/v2/pages/77030';
    const current=await api(url+'?context=edit&_fields=id,status,slug,content,acf');
    if(current.status!==200||current.payload?.id!==77030||
      current.payload.status!=='publish'||
      current.payload.slug!=='tin-tuc-su-kien'||
      current.payload.acf?.action!=='PostsPage'||
      current.payload.acf?.key!=='ssr-posts')
      throw Error('WordPress archive identity changed');
    const text='Tổng hợp tin tức, sự kiện và hoạt động của Công ty Cổ phần Phân bón và Hóa chất Dầu khí Đông Nam Bộ (PVFCCo-PSE).';
    const html='<p>'+text+'</p>';
    const previous=String(current.payload?.content?.raw||'').trim();
    if(previous!==''&&previous!==html)throw Error('Existing WP news intro is not empty; refuse overwrite');
    if(previous==='') {
      const changed=await api(url,'POST',{content:html});
      if(changed.status!==200||changed.payload?.id!==77030)
        throw Error('Could not save PSE WordPress archive intro');
    }
    const check=await api(url+'?context=edit&_fields=id,status,slug,content,acf,modified');
    if(check.status!==200||check.payload?.status!=='publish'||
       String(check.payload?.content?.raw||'').trim()!==html)
      throw Error('News intro REST read-after-write mismatch');
    console.log('PSE_NEWS_ARCHIVE_INTRO=PASS; page=77030; source=WordPressEditor; section=article-intro; no_articles_changed=true; no_build=true');
  }else if(seoRedirects){
    const specs=[
      ['tin-cong-ty','tin-tong-hop'],
      ['tin-cong-ty','hoat-dong-chi-bo-hdqt-bks'],
      ['tin-cong-ty','hoat-dong-cong-doan-doan-tn-nu-cong'],
      ['tin-cong-ty','dang-uy'],
      ['thu-vien','anh'],
      ['thu-vien','video']
    ];
    const endpoint='/wp-json/wp/v2/chuyen-huong-link';
    const [categories,existing,archive]=await Promise.all([
      api('/wp-json/wp/v2/categories?context=edit&per_page=100&hide_empty=false&_fields=id,slug,parent'),
      api(endpoint+'?context=edit&status=any&per_page=100&_fields=id,status,acf'),
      api('/wp-json/wp/v2/pages/77030?context=edit&_fields=id,slug,status,acf')
    ]);
    if(categories.status!==200||!Array.isArray(categories.payload)||
       existing.status!==200||!Array.isArray(existing.payload)||
       archive.status!==200||archive.payload?.status!=='publish'||
       archive.payload?.acf?.key!=='ssr-posts')throw Error('PSE legacy news redirect preflight failed');
    const cat=slug=>{
      const found=categories.payload.filter(x=>x.slug===slug);
      if(found.length!==1)throw Error('Unknown or ambiguous news category: '+slug);
      return found[0];
    };
    const planned=specs.map(([parent,child])=>{
      if(Number(cat(child).parent)!==Number(cat(parent).id))
        throw Error('WordPress news taxonomy ancestry mismatch');
      const source='/tin-tuc-su-kien/'+parent+'/'+child+'.html';
      const dest='/tin-tuc-su-kien/?cat='+encodeURIComponent(child);
      const matching=existing.payload.filter(x=>x.acf?.from_link===source);
      if(matching.length>1)throw Error('Duplicate WordPress redirect source');
      if(matching.length===1){
        const obj=matching[0];
        if(obj.status!=='publish'||Number(obj.acf?.type)!==301||
          obj.acf?.to_link!==dest||obj.acf?.match_type!=='Exact'||!obj.acf?.enable)
          throw Error('Pre-existing redirect differs; refuse overwrite');
      }
      return {source,dest,already:matching.length===1};
    });
    console.log('PSE_NEWS_LEGACY_REDIRECT_PREFLIGHT='+JSON.stringify({
      checked:planned.length,already:planned.filter(x=>x.already).length,
      pending:planned.filter(x=>!x.already).length,noPostWrites:true,noAstroBuild:true
    }));
    const created=[];
    try{
      for(const rule of planned){
        if(rule.already)continue;
        const saved=await api(endpoint,'POST',{
          title:'PSE preserved Joomla news category',status:'draft',
          acf:{from_link:rule.source,to_link:rule.dest,
            type:301,match_type:'Exact',enable:true}
        });
        if(saved.status!==201||!Number.isSafeInteger(Number(saved.payload?.id)))
          throw Error('Cannot stage legacy category redirect: '+rule.source+' HTTP '+saved.status);
        const id=Number(saved.payload.id);
        created.push(id);
        const check=await api(endpoint+'/'+id+'?context=edit&_fields=id,status,acf');
        if(check.status!==200||check.payload?.status!=='draft'||
          check.payload?.acf?.from_link!==rule.source||
          check.payload?.acf?.to_link!==rule.dest)
          throw Error('Legacy category redirect readback mismatch: '+id);
      }
      for(const id of created){
        const pub=await api(endpoint+'/'+id,'POST',{status:'publish'});
        if(pub.status!==200||pub.payload?.status!=='publish')
          throw Error('Cannot publish verified legacy category redirect: '+id);
      }
      console.log('PSE_NEWS_LEGACY_REDIRECTS=PASS; published='+created.length+
        '; originals_preserved=true; no_articles_mutated=true; no_build=true');
    }catch(err){
      for(const id of created){
        try{await api(endpoint+'/'+id,'POST',{status:'draft',acf:{enable:false}})}catch{}
      }
      throw err;
    }
  }else if(bindMenu){
    const rows=String(process.env.ENV_FILE||'').split(/\r?\n/).map(s=>s.trim().replace(/^export\s+/,''));
    const client=rows.filter(x=>x.startsWith('WC_URL_CLIENT='));
    if(client.length!==1)throw Error('Missing frontend origin');
    const frontend=new URL(client[0].slice('WC_URL_CLIENT='.length).replace(/^['"]|['"]$/g,''));
    if(frontend.protocol!=='https:'||!frontend.hostname||frontend.search||frontend.hash||
      !['','/'].includes(frontend.pathname))throw Error('Unsafe frontend origin');
    const [menus,cats,archive,routes]=await Promise.all([
      api('/wp-json/wp/v2/menu-items?context=edit&per_page=100'),
      api('/wp-json/wp/v2/categories?context=edit&per_page=100&hide_empty=false&_fields=id,slug,parent'),
      api('/wp-json/wp/v2/pages/77030?context=edit&_fields=id,status,slug,acf'),
      api('/wp-json/wp/v2/chuyen-huong-link?context=edit&status=publish&per_page=100&_fields=id,status,acf')
    ]);
    if(menus.status!==200||!Array.isArray(menus.payload)||cats.status!==200||
       !Array.isArray(cats.payload)||archive.status!==200||archive.payload?.status!=='publish'||
       archive.payload?.acf?.key!=='ssr-posts'||routes.status!==200||
       !Array.isArray(routes.payload))throw Error('PSE news menu preflight failed');
    const rules=routes.payload.filter(x=>String(x.acf?.type).toLowerCase()==='rewrite'&&x.acf?.enable);
    if(!rules.some(x=>x.acf?.from_link==='/tin-tuc-su-kien')||
       !rules.some(x=>x.acf?.match_type==='Regex'&&String(x.acf?.from_link).startsWith('^/tin-tuc-su-kien/')))
      throw Error('PSE news archive rewrites missing');
    const items=menus.payload.map(x=>({...x,label:String(x.title?.raw||x.title?.rendered||'').trim()}));
    const pick=(list,label)=>{
      const a=list.filter(x=>x.label===label);
      if(a.length!==1)throw Error('PSE news menu not unique: '+label);
      return a[0];
    };
    const children=id=>items.filter(x=>Number(x.parent)===Number(id));
    const top=pick(items.filter(x=>Number(x.parent)===0),'TIN TỨC - SỰ KIỆN');
    const company=pick(children(top.id),'Tin Công ty');
    const library=pick(children(top.id),'Thư viện');
    if(children(top.id).length!==2||children(company.id).length!==4||
       children(library.id).length!==2)throw Error('PSE news menu tree changed');
    const category=slug=>{
      const found=cats.payload.filter(x=>x.slug===slug);
      if(found.length!==1)throw Error('PSE category not found: '+slug);
      return found[0];
    };
    const parents={};
    for(const slug of ['tin-cong-ty','thu-vien']){
      const c=category(slug);
      if(Number(c.parent)!==0)throw Error('News parent category moved');
      parents[slug]=c.id;
    }
    const to=slug=>frontend.origin+'/tin-tuc-su-kien/'+(slug?'?cat='+encodeURIComponent(slug):'');
    const planned=[];
    const add=(item,slug,parentId)=>{
      if(item.type!=='custom')throw Error('Cannot rewrite noncustom menu item');
      if(parentId!==undefined&&Number(category(slug).parent)!==Number(parentId))
        throw Error('PSE category parent mismatch: '+slug);
      const dest=to(slug),source=String(item.url||'');
      if(source!==dest){
        if([top.id,company.id,library.id].includes(item.id)){
          if(source!=='#')throw Error('Original menu parent not a button');
        }else{
          const old=new URL(source);
          if(old.hostname!=='www.pse.vn'||old.protocol!=='https:'||
             !old.pathname.startsWith('/tin-tuc-su-kien/')||
             old.pathname.split('/').at(-1)!==slug+'.html')
            throw Error('Source Joomla menu path changed: '+slug);
        }
      }
      planned.push({id:item.id,slug,source,dest});
    };
    add(top,'');add(company,'tin-cong-ty');add(library,'thu-vien');
    for(const [parent,slug] of [[company,'tin-cong-ty'],[library,'thu-vien']]){
      for(const item of children(parent.id)){
        const legacy=new URL(item.url);
        const sub=legacy.pathname.split('/').at(-1).replace(/\.html$/,'');
        if(!/^[a-z0-9-]+$/.test(sub))throw Error('Invalid Joomla category slug');
        add(item,sub,parents[slug]);
      }
    }
    if(planned.length!==9||new Set(planned.map(x=>x.id)).size!==9)
      throw Error('News menu plan mismatch');
    console.log('PSE_NEWS_MENU_PREFLIGHT='+JSON.stringify({count:planned.length,
       toChange:planned.filter(x=>x.source!==x.dest).length}));
    const changed=[];
    try{
      for(const p of planned){
        if(p.source===p.dest)continue;
        const saved=await api('/wp-json/wp/v2/menu-items/'+p.id,'POST',{type:'custom',url:p.dest});
        if(saved.status!==200||saved.payload?.id!==p.id)throw Error('Menu save HTTP '+saved.status);
        changed.push(p);
        const confirm=await api('/wp-json/wp/v2/menu-items/'+p.id+'?context=edit');
        if(confirm.status!==200||confirm.payload?.url!==p.dest)
          throw Error('Menu read-after-write failed: '+p.id);
        console.log('PSE_NEWS_MENU_LINK='+JSON.stringify({id:p.id,slug:p.slug,verified:true}));
      }
      console.log('PSE_NEWS_MENU_CUTOVER=PASS; updated='+changed.length+'; no_articles_mutated=true; no_build=true');
    }catch(err){
      for(const p of changed.reverse()){
        try{
          const r=await api('/wp-json/wp/v2/menu-items/'+p.id,'POST',{type:'custom',url:p.source});
          console.log('PSE_NEWS_MENU_ROLLBACK='+JSON.stringify({id:p.id,http:r.status}));
        }catch{}
      }
      throw err;
    }
  }else{
  const target=await api('/wp-json/wp/v2/pages/77030?context=edit&_fields=id,slug,status,acf,content');
  const p=target.payload||{};
  if(target.status!==200||p.id!==77030||!['draft','publish'].includes(p.status)||
     p.slug!=='tin-tuc-su-kien'||p.acf?.key!=='ssr-posts'||
     p.acf?.action!=='PostsPage'||String(p.content?.raw||'').trim())
    throw Error('WordPress Page 77030 does not match validated checkpoint');
  const endpoint='/wp-json/wp/v2/chuyen-huong-link';
  const existing=await api(endpoint+'?context=edit&status=any&per_page=100&_fields=id,acf,status');
  if(existing.status!==200||!Array.isArray(existing.payload))throw Error('Cannot read native redirects');
  const specs=[
    {name:'PSE news SSR archive root',source:'/tin-tuc-su-kien',dest:'/ssr/posts/tin-tuc-su-kien/1',match:'Exact'},
    {name:'PSE news SSR archive pagination',source:'^/tin-tuc-su-kien/([1-9][0-9]*)$',dest:'/ssr/posts/tin-tuc-su-kien/$1',match:'Regex'}
  ];
  if(existing.payload.some(x=>String(x.acf?.from_link||'').includes('tin-tuc-su-kien')||
     String(x.acf?.to_link||'').includes('tin-tuc-su-kien')))
    throw Error('Archive rewrite exists or collides; refuse overwrite');
  const option=await api(endpoint,'OPTIONS');
  const fields=option.payload?.schema?.properties||{};
  console.log('PSE_NEWS_REDIRECT_REST_SCHEMA='+JSON.stringify({
    http:option.status,properties:Object.keys(fields).sort(),
    acfProperties:Object.keys(fields.acf?.properties||{}).sort(),
    acfRules:Object.fromEntries(Object.entries(fields.acf?.properties||{}).map(([k,v])=>[k,{type:v.type,enum:v.enum,default:v.default,items:v.items,required:v.required}])),
    required:option.payload?.schema?.required||[],
    endpoints:(option.payload?.endpoints||[]).map(x=>({methods:x.methods,
      acceptedKeys:Object.keys(x.args||{}).slice(0,30)}))
  }));
  console.log('PSE_NEWS_ARCHIVE_PREFLIGHT='+JSON.stringify({
    mode:apply?'apply':'audit',page:77030,status:p.status,existingRedirects:existing.payload.length,
    proposals:specs.map(x=>({source:x.source,dest:x.dest,match:x.match})),menuMutation:false,build:false}));
  if(!apply){
    await page.goto(origin+'/wp-admin/edit.php?post_type=acf-field-group',
      {waitUntil:'domcontentloaded',timeout:60000});
    const fields=await page.locator('#the-list tr').evaluateAll(rows=>rows.map(tr=>({
      id:tr.id,label:(tr.querySelector('.row-title')?.textContent||'').trim(),
      href:tr.querySelector('.row-title')?.getAttribute('href')||''
    })).filter(x=>/điều hướng|chuyển hướng|redirect|link/i.test(x.label)).slice(0,15));
    console.log('PSE_NEWS_ACF_ROUTE_FIELD_GROUPS='+JSON.stringify(fields));
    const target=fields.find(x=>x.label==='Điều hướng 301/302/307');
    if(!target||target.id!=='post-53507')throw Error('Unexpected ACF route field group');
    await page.goto(origin+'/wp-admin/post.php?post=53507&action=edit',
      {waitUntil:'domcontentloaded',timeout:60000});
    const fieldAudit=await page.evaluate(()=>{
      const inputs=[...document.querySelectorAll('input,textarea,select')]
        .filter(e=>/choices|field.*name|field.*label/i.test(e.name||''))
        .map(e=>({tag:e.tagName,name:e.name,value:String(e.value||'').slice(0,280),
          hidden:!!e.closest('[hidden],.acf-hidden')}))
        .slice(0,55);
      return {title:document.title,
        rows:[...document.querySelectorAll('.acf-field-object')].map(e=>({
          id:e.id,key:e.dataset.key,name:e.querySelector('.acf-field-name')?.textContent?.trim(),
          label:e.querySelector('.acf-field-label')?.textContent?.trim(),
          summary:e.textContent?.trim().slice(0,140)
        })).slice(0,25),
        inputs};
    });
    console.log('PSE_NEWS_ACF_ROUTE_FIELD_EDITOR='+JSON.stringify(fieldAudit));

    const actionAudit=await page.evaluate(()=>({
      forms:[...document.querySelectorAll('form')].map(x=>({
        id:x.id,action:(()=>{try{return new URL(x.action).pathname}catch{return ''}})(),
        method:x.method,buttons:[...x.querySelectorAll('input[type=submit],button[type=submit],button.button-primary')]
        .slice(0,12).map(b=>({tag:b.tagName,id:b.id,name:b.name||'',
          type:b.type,value:String(b.value||b.textContent||'').trim().slice(0,75),hidden:!b.getClientRects().length}))
      })).filter(x=>/post|acf|field/i.test(x.id||'')||x.buttons.length),
      actionButtons:[...document.querySelectorAll('button,input[type=submit]')]
       .filter(b=>/update|save|cập nhật|lưu|đăng/i.test(String(b.textContent||b.value||'')))
       .slice(0,25).map(b=>({id:b.id,name:b.name||'',text:String(b.textContent||b.value||'').trim().slice(0,75),
         visible:!!b.getClientRects().length}))
    }));
    console.log('PSE_NEWS_ACF_NATIVE_SAVE_CONTROLS='+JSON.stringify(actionAudit));

    const saveChoice=event.head_commit?.message==='cms(pse): allow Rewrite in WordPress URL routing ACF';
    if(saveChoice){
      const selector='textarea[name="acf_fields[53510][choices]"]';
      const input=page.locator(selector);
      if(await input.count()!==1)throw Error('ACF routing type field missing');
      const original=await input.inputValue();
      // Normalize CRLF and trailing whitespace for ACF's textarea.
      const normalized=original.replace(/\r\n?/g,'\n').trim();
      if(normalized!=='301\n302\n307' && normalized!=='301\n302\n307\nRewrite')
        throw Error('ACF field choices changed; will not overwrite');
      if(normalized==='301\n302\n307'){
        const parentRow=page.locator('.acf-field-object[data-key="field_6ab80bab2af52"]');
        if(await parentRow.count()!==1)throw Error('ACF type row key mismatch');
        if(!await input.isVisible()){
          await parentRow.getByText('Chỉnh sửa',{exact:true}).first().click();
        }
        await input.fill('301\n302\n307\nRewrite');
        await input.dispatchEvent('change');
        // This ACF editor uses native name=save ("Lưu thay đổi"), not #publish.
        const save=page.locator('button[name="save"]');
        if(await save.count()!==1 || !await save.isVisible())
          throw Error('ACF native Save Changes control missing');
        await save.click();
        await page.goto(origin+'/wp-admin/post.php?post=53507&action=edit',
          {waitUntil:'domcontentloaded',timeout:60000});
      }
      const verified=await page.locator(selector).inputValue();
      if(verified.replace(/\r\n?/g,'\n').trim()!=='301\n302\n307\nRewrite')
        throw Error('ACF Type choices did not persist');
      const option=await api(endpoint,'OPTIONS');
      const enums=option.payload?.schema?.properties?.acf?.properties?.type?.items?.enum||[];
      if(option.status!==200||!enums.includes('Rewrite'))
        throw Error('ACF REST schema does not yet permit Rewrite');
      console.log('PSE_NEWS_ACF_REWRITE_CHOICE=PASS; group=53507; field=53510; choices=301,302,307,Rewrite; noRedirectChange=true; noBuild=true');
    }


  }
  if(apply){
    const saved=[];let published=false;
    try{
      for(const rule of specs){
        const result=await api(endpoint,'POST',{title:rule.name,status:'draft',
          acf:{from_link:rule.source,to_link:rule.dest,type:'Rewrite',match_type:rule.match,enable:true}});
        if(result.status!==201||!Number.isSafeInteger(Number(result.payload?.id)))
          throw Error('Cannot stage WordPress rewrite '+rule.source+' status='+result.status+' code='+String(result.payload?.code||'unknown')+' detail='+String(result.payload?.message||'').slice(0,300)+' invalidKeys='+Object.keys(result.payload?.data?.params||{}).join(',')+' acfValidation='+String(result.payload?.data?.details?.acf?.message||'').slice(0,300));
        const id=Number(result.payload.id);saved.push(id);
        const check=await api(endpoint+'/'+id+'?context=edit&_fields=id,status,acf');
        if(check.status!==200||check.payload.status!=='draft'||
           check.payload.acf?.from_link!==rule.source||check.payload.acf?.to_link!==rule.dest||
           String(check.payload.acf?.type).toLowerCase()!=='rewrite'||
           check.payload.acf?.match_type!==rule.match||
           ![true,1,'1'].includes(check.payload.acf?.enable))throw Error('Native redirect readback mismatch');
      }
      if(p.status==='draft'){
        const pub=await api('/wp-json/wp/v2/pages/77030','POST',{status:'publish'});
        if(pub.status!==200||pub.payload?.status!=='publish')throw Error('Archive Page publish failed');
        published=true;
      }
      for(const id of saved){
        const res=await api(endpoint+'/'+id,'POST',{status:'publish'});
        if(res.status!==200||res.payload?.status!=='publish')throw Error('Redirect publish failed');
      }
      console.log('PSE_NEWS_ARCHIVE_RELEASE=PASS; archive=77030; nativeRewrites='+saved.join(',')+'; noMenuWrites=true; noAstroBuild=true');
    }catch(err){
      for(const id of saved){
        try{await api(endpoint+'/'+id,'POST',{status:'draft',acf:{enable:false}})}catch{}
      }
      if(published)try{await api('/wp-json/wp/v2/pages/77030','POST',{status:'draft'})}catch{}
      throw err;
    }
  }
  }
}finally{await browser.close()}
