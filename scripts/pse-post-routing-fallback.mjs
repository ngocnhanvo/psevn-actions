/**
 * Publish one missing CMS-owned general post detail Rewrite.
 * Reuse WordPress native redirect CPT + native route-conditions metabox.
 * Called by existing PSE news archive CMS authoring workflow, never by Astro build.
 */
export async function ensurePsePostDetailFallback({page,api,origin}) {
 const source='^/([^/.]+)$';
 const target='/ssr/posts/$1/detail';
 const endpoint='/wp-json/wp/v2/chuyen-huong-link';
 const list=await api(endpoint+'?context=edit&status=any&per_page=100&_fields=id,status,acf,route_priority,route_conditions');
 if(list.status!==200||!Array.isArray(list.payload))throw Error('Cannot preflight WordPress redirect registry');
 const matches=list.payload.filter(x=>x.acf?.from_link===source);
 if(matches.length>1)throw Error('Duplicate post routing fallback rules: refuse writes');
 let record=matches[0];
 if(record && (
    record.acf?.to_link!==target||
    String(record.acf?.type).toLowerCase()!=='rewrite'||
    record.acf?.match_type!=='Regex'||!record.acf?.enable
 ))throw Error('Existing post detail fallback differs, refuse overwrite');
 let id=Number(record?.id||0);
 const correctConditions=(x)=>x?.route_priority===900&&
   Array.isArray(x.route_conditions)&&x.route_conditions.length===1&&
   x.route_conditions[0].type==='page_not_exists'&&
   Number(x.route_conditions[0].capture)===1;
 if(record?.status==='publish'){
  if(!correctConditions(record))throw Error('Published fallback has unsafe conditions, refuse overwrite');
  console.log('PSE_POST_FALLBACK=ALREADY_PUBLISHED_VALIDATED; id='+id);
  return;
 }
 if(!record){
  const created=await api(endpoint,'POST',{
   title:'WordPress post detail fallback (one-level URL)',
   status:'draft',
   acf:{from_link:source,to_link:target,type:'Rewrite',match_type:'Regex',enable:true}
  });
  id=Number(created.payload?.id);
  if(created.status!==201||!Number.isSafeInteger(id)||id<=0)
   throw Error('Cannot create native draft redirect: HTTP '+created.status);
  console.log('PSE_POST_FALLBACK_DRAFT_ID='+id);
 }
 const editor=await page.goto(origin+'/wp-admin/post.php?post='+id+'&action=edit',{
  waitUntil:'domcontentloaded',timeout:60000
 });
 if(editor?.status()!==200||!await page.locator('#post').count())
  throw Error('WordPress native redirect editor unavailable');
 const priority=page.locator('#esc-route-priority');
 const add=page.locator('#esc-route-add-condition');
 const rows=page.locator('#esc-route-condition-rows tr');
 if(!await priority.count()||!await add.count()||!await page.locator('#save-post').count())
  throw Error('Native WordPress route conditions or Save Draft button unavailable');
 await priority.fill('900');
 const existing=await rows.count();
 if(existing>1)throw Error('Unexpected extra routing conditions');
 if(existing===0)await add.click();
 await page.locator('#esc-route-condition-rows select[name="esc_route_condition_type[]"]').first().selectOption('page_not_exists');
 await page.locator('#esc-route-condition-rows input[name="esc_route_condition_capture[]"]').first().fill('1');
 await page.locator('#esc-route-condition-rows input[name="esc_route_condition_value[]"]').first().fill('');
 await Promise.all([page.waitForLoadState('domcontentloaded'),page.locator('#save-post').click()]);
 const checked=await api(endpoint+'/'+id+'?context=edit&_fields=id,status,acf,route_priority,route_conditions');
 if(checked.status!==200||!correctConditions(checked.payload)||
   checked.payload?.acf?.from_link!==source||checked.payload?.acf?.to_link!==target)
  throw Error('Native WP routing conditions did not persist; draft remains unpublished');
 const published=await api(endpoint+'/'+id,'POST',{status:'publish'});
 if(published.status!==200||published.payload?.status!=='publish')throw Error('Cannot publish validated post fallback');
 const verified=await api(endpoint+'/'+id+'?context=edit&_fields=id,status,acf,route_priority,route_conditions');
 if(verified.status!==200||verified.payload?.status!=='publish'||!correctConditions(verified.payload))
  throw Error('Published WordPress post fallback failed readback');
 console.log('PSE_POST_FALLBACK_PUBLISHED=PASS; id='+id+'; priority=900; condition=page_not_exists; WP writes=1');
}
