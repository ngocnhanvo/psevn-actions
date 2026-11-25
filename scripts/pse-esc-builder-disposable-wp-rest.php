<?php
/**
 * Real WordPress REST Save/readback/inverse rollback on a disposable DB ONLY.
 * This file refuses any non-loopback WP installation.
 */
if (!defined('WP_CLI') || !WP_CLI || getenv('PSE_DISPOSABLE_WP')!=='1' ||
    !preg_match('~^https://127\.0\.0\.1:8099/?$~D',(string)get_option('home'))) {
    throw new RuntimeException('Refusing non-disposable WordPress execution');
}
function qa_assert($condition,$message) {
    if (!$condition) throw new RuntimeException('PSE_QA_FAIL '.$message);
}
qa_assert(class_exists('TablePress') && function_exists('esc_vb_item_read'),
    'real ESC Table/Visual Builder runtime');
$admins=get_users(['role'=>'administrator','number'=>2,'fields'=>'ID']);
qa_assert(count($admins)===1,'single disposable administrator');
wp_set_current_user((int)$admins[0]);
$model=TablePress::load_model('table');
function qa_new_table($model,$rows,$name) {
    $table=$model->get_table_template();
    $table['name']=$name;
    $table['description']='Disposable local test';
    $table['data']=$rows;
    $table['visibility']=[
        'rows'=>array_fill(0,count($rows),1),
        'columns'=>array_fill(0,count($rows[0]),1)
    ];
    $id=$model->add($table);
    qa_assert(!is_wp_error($id),'native TablePress insert '.$name);
    return (string)$id;
}
function qa_table_rows($model,$id) {
    $table=$model->load($id);
    qa_assert(!is_wp_error($table),'native TablePress readback');
    return $table['data'];
}
function qa_request($action,$params,$expect_error=false) {
    $req=new WP_REST_Request('POST','/esc-builder/v1/'.$action);
    $req->set_header('X-WP-Nonce',wp_create_nonce('wp_rest'));
    $req->set_body_params(array_merge([
        'ticket'=>$GLOBALS['qa_ticket'],'page_id'=>$GLOBALS['qa_page']
    ],$params));
    $response=rest_do_request($req);
    $data=$response->get_data();
    if ($expect_error) {
        qa_assert($response->is_error(),'unsafe '.$action.' rejected');
    } else {
        qa_assert(!$response->is_error(),
            'real REST '.$action.' error='.($data['code']??'none'));
    }
    return $data;
}
function qa_ref_swap_roundtrip($model,$id) {
    $before=qa_table_rows($model,$id);
    $schema=qa_request('item-schema',['table_id'=>$id]);
    echo 'PSE_QA_REF_DIAG source='.json_encode(get_option('tablepress_meta_'.$id,[])['api']??'').
      ' count='.intval($schema['count']??-1).
      ' can_swap='.json_encode($schema['can_swap']??null).
      ' row_hashes='.count($schema['row_hashes']??[]).
      ' collection='.json_encode($schema['collection_mode']??'')."\n";
    qa_assert(($schema['can_swap']??false)===true &&
        count($schema['row_hashes']??[])===2,
        'native reference source ready for guarded swap');
    $res=qa_request('swap-items',[
        'table_id'=>$id,'from_row'=>0,'to_row'=>1,
        'expected_version'=>$schema['version'],
        'expected_row_hashes'=>$schema['row_hashes']
    ]);
    $swapped=qa_table_rows($model,$id);
    qa_assert(($res['saved']??false)===true &&
        $swapped[2]===$before[3] && $swapped[3]===$before[2],
        'S2/S3/S4 physical reference Save/readback');
    $now=qa_request('item-schema',['table_id'=>$id]);
    qa_request('swap-items',[
        'table_id'=>$id,'from_row'=>0,'to_row'=>1,
        'expected_version'=>$now['version'],
        'expected_row_hashes'=>$now['row_hashes']
    ]);
    qa_assert(qa_table_rows($model,$id)===$before,
        'S2/S3/S4 exact original reference row rollback');
}
$child=qa_new_table($model,[
    ['label','visible'],['Label','Visibility'],
    ['Nested A','1'],['Nested B','1']
],'Nested child');
$parent=qa_new_table($model,[
    ['label','nested'],['Label','Child'],
    ['Parent A','<div>[table id='.$child.' /]</div>'],
    ['Parent B','<!-- [table id=ghost_fixture /] -->']
],'Page parent');
$query=qa_new_table($model,[
    ['label','categorySlug','limit','order','orderby'],
    ['','','','',''],
    ['Latest news','tin-tuc','5','desc','date']
],'Query config');
// S2/S3/S4 native manual references use published local WordPress owners.
$ref_pages=[];
foreach (['Published QA Page A','Published QA Page B'] as $name) {
    $id=wp_insert_post(['post_type'=>'page','post_status'=>'publish',
        'post_title'=>$name,'post_content'=>'Local reference'],true);
    qa_assert(!is_wp_error($id),'local published Page');
    $ref_pages[]=(int)$id;
}
$ref_posts=[];
foreach (['Published QA Post A','Published QA Post B'] as $name) {
    $id=wp_insert_post(['post_type'=>'post','post_status'=>'publish',
        'post_title'=>$name,'post_content'=>'Local post'],true);
    qa_assert(!is_wp_error($id),'local published Post');
    $ref_posts[]=(int)$id;
}
if (!taxonomy_exists('product_cat')) register_taxonomy('product_cat','post');
$ref_cats=[];
foreach (['QA Product Category A','QA Product Category B'] as $name) {
    $term=wp_insert_term($name,'product_cat');
    qa_assert(!is_wp_error($term),'local product_cat term');
    $ref_cats[]=(int)$term['term_id'];
}
$ref_ids=[];
foreach ([
    'S2 Pages'=>['api'=>'Page','ids'=>$ref_pages],
    'S3 Categories'=>['api'=>'ProductCategory','ids'=>$ref_cats],
    'S4 Posts'=>['api'=>'/wp-json/wp/v2/posts','ids'=>$ref_posts]
] as $name=>$ref) {
    $ids=$ref['ids'];
    $tid=qa_new_table($model,[
        ['api-key','api-title','label'],['','',''],
        [(string)$ids[0],'title','Local A'],[(string)$ids[1],'title','Local B']
    ],$name);
    update_option('tablepress_meta_'.$tid,['api'=>$ref['api']]);
    $ref_ids[]=$tid;
}
$qa_page_body='<div>[table id='.$parent.' /]</div>'
    .'<div>[table id='.$query.' /]</div>';
foreach ($ref_ids as $id) $qa_page_body.='<div>[table id='.$id.' /]</div>';
$page=wp_insert_post([
    'post_type'=>'page','post_status'=>'publish',
    'post_title'=>'Local disposable Visual Builder',
    'post_content'=>$qa_page_body
],true);
qa_assert(!is_wp_error($page),'disposable Page insert');
$GLOBALS['qa_page']=(int)$page;
qa_assert(esc_vb_text_page_owns_table($page,$child),
    'physical nested table recognized by actual WordPress');
qa_assert(!esc_vb_text_page_owns_table($page,'ghost_fixture'),
    'HTML-comment shortcode cannot authorize writes');
$GLOBALS['qa_ticket']=bin2hex(random_bytes(32));
set_transient('esc_vb_'.hash('sha256',$GLOBALS['qa_ticket']),[
    'page_id'=>(int)$page,'user_id'=>get_current_user_id()
],120);
$first=qa_table_rows($model,$child);
$schema=qa_request('item-schema',['table_id'=>$child]);
qa_assert(($schema['can_swap']??false)===true &&
    count($schema['row_hashes']??[])===2,'nested item schema and auth');
$swap=qa_request('swap-items',[
    'table_id'=>$child,'from_row'=>0,'to_row'=>1,
    'expected_version'=>$schema['version'],
    'expected_row_hashes'=>$schema['row_hashes']
]);
$after=qa_table_rows($model,$child);
qa_assert(($swap['saved']??false)===true &&
    $after[2]===$first[3] && $after[3]===$first[2],
    'real nested two-row Save/readback');
$reloaded=qa_request('item-schema',['table_id'=>$child]);
qa_assert($reloaded['version']!==$schema['version'],
    'WordPress optimistic revision changed');
qa_request('swap-items',[
    'table_id'=>$child,'from_row'=>0,'to_row'=>1,
    'expected_version'=>$reloaded['version'],
    'expected_row_hashes'=>$reloaded['row_hashes']
]);
qa_assert(qa_table_rows($model,$child)===$first,
    'exact independent nested source rollback');

$queryBefore=qa_table_rows($model,$query);
$qver=esc_vb_text_current_version($page,$query);
$save=qa_request('save-text',[
    'table_id'=>$query,'field'=>'limit','row'=>0,'title'=>'3',
    'expected_version'=>$qver,'original_hash'=>hash('sha256','5')
]);
qa_assert(($save['saved']??false)===true &&
    qa_table_rows($model,$query)[2][2]==='3',
    'real S5 query config Save/readback');
qa_request('save-text',[
    'table_id'=>$query,'field'=>'limit','row'=>0,'title'=>'999',
    'expected_version'=>esc_vb_text_current_version($page,$query),
    'original_hash'=>hash('sha256','3')
],true);
qa_request('save-text',[
    'table_id'=>$query,'field'=>'limit','row'=>0,'title'=>'5',
    'expected_version'=>esc_vb_text_current_version($page,$query),
    'original_hash'=>hash('sha256','3')
]);
qa_assert(qa_table_rows($model,$query)===$queryBefore,
    'exact S5 query restoration after REST roundtrip');
foreach ($ref_ids as $id) qa_ref_swap_roundtrip($model,$id);
// Real Page section two-point swap: separate Page writer and WordPress
// revision, independent from the TablePress row mutations accepted above.
// Only two physical sibling sections may exchange their source positions.
$section=qa_request('section-order',[]);
$pair=null;
foreach (($section['swappable']??[]) as $from=>$targets) {
    if (!is_array($targets)) continue;
    foreach ($targets as $to) {
        if ($from!==$to) {$pair=[(string)$from,(string)$to];break 2;}
    }
}
qa_assert(is_array($pair) && count($pair)===2,
    'two independent Page section source occurrences have a safe swap');
$pageBefore=(string)get_post($page)->post_content;
$dry=qa_request('save-section-order',[
    'swap'=>$pair,'expected_version'=>$section['version'],'dry_run'=>true
]);
qa_assert(($dry['checked']??false)===true &&
    ($dry['no_write']??false)===true &&
    (string)get_post($page)->post_content===$pageBefore,
    'Page section swap dry-run never writes WordPress');
$swappedSection=qa_request('save-section-order',[
    'swap'=>$pair,'expected_version'=>$section['version']
]);
$pageAfter=(string)get_post($page)->post_content;
qa_assert(($swappedSection['saved']??false)===true &&
    $pageAfter!==$pageBefore &&
    hash('sha256',$pageAfter)===$swappedSection['version'],
    'real Page section swap Save/readback and revision');
$restPage=qa_request('section-order',[]);
qa_assert($restPage['version']===$swappedSection['version'],
    'new Page REST state verifies same version after refresh');
qa_request('save-section-order',[
    'swap'=>$pair,'expected_version'=>$restPage['version']
]);
qa_assert((string)get_post($page)->post_content===$pageBefore,
    'inverse Page section two-point swap restores exact original HTML bytes');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_PAGE_SECTION_SWAP_ROLLBACK=PASS\n";
// Shared-source clone must use one demonstrably isolated native shortcode.
// The multi-<div> Page above intentionally exercises an independent swap;
// a separate bare shortcode Page provides the supported cloning fixture.
$clonePage=wp_insert_post([
    'post_type'=>'page','post_status'=>'publish',
    'post_title'=>'Disposable shared-source clone',
    'post_content'=>'[table id='.$parent.' /]'
],true);
qa_assert(!is_wp_error($clonePage),'isolated Page for shared source clone');
$GLOBALS['qa_page']=(int)$clonePage;
$GLOBALS['qa_ticket']=bin2hex(random_bytes(32));
set_transient('esc_vb_'.hash('sha256',$GLOBALS['qa_ticket']),[
    'page_id'=>(int)$clonePage,'user_id'=>get_current_user_id()
],120);
$cloneRead=qa_request('section-order',[]);
$sourceKey=(string)$cloneRead['items'][0]['id'];
$rootBefore=(string)get_post($clonePage)->post_content;
$rootTableBefore=qa_table_rows($model,$parent);
$preflight=qa_request('duplicate-section-shared',[
    'section_key'=>$sourceKey,'expected_version'=>$cloneRead['version'],
    'share_source'=>true,'dry_run'=>true
]);
qa_assert(($preflight['checked']??false)===true &&
    ($preflight['source_shared']??false)===true &&
    (string)get_post($clonePage)->post_content===$rootBefore,
    'shared-source Page clone preflight cannot write');
$cloned=qa_request('duplicate-section-shared',[
    'section_key'=>$sourceKey,'expected_version'=>$cloneRead['version'],
    'share_source'=>true
]);
qa_assert(($cloned['saved']??false)===true &&
    count($cloned['occurrences']??[])===2 &&
    (string)get_post($clonePage)->post_content!==$rootBefore &&
    qa_table_rows($model,$parent)===$rootTableBefore,
    'shared-source clone creates one Page occurrence and leaves ESC Table untouched');
$additional=array_values(array_diff($cloned['occurrences'],[$sourceKey]));
qa_assert(count($additional)===1,'one unambiguous newly cloned section key');
$removed=qa_request('remove-section',[
    'section_key'=>(string)$additional[0],
    'expected_version'=>$cloned['version']
]);
qa_assert(($removed['saved']??false)===true &&
    qa_table_rows($model,$parent)===$rootTableBefore,
    'native Page-only section remove never writes its source ESC Table');
$removedBody=(string)get_post($clonePage)->post_content;
$beforeKeys=array_column($cloneRead['items'],'table_id');
$afterRemoveKeys=array_column(qa_request('section-order',[])['items'],'table_id');
qa_assert($beforeKeys===$afterRemoveKeys,
    'clone+remove restores original section source sequence');
// Native shortcode removal deliberately preserves the Page's surrounding
// whitespace. The disposable harness restores any remaining single newline
// via an exact owner-controlled Page update, then checks all bytes.
if ($removedBody!==$rootBefore) {
    $manual=wp_update_post(['ID'=>$clonePage,'post_content'=>$rootBefore],true);
    qa_assert(!is_wp_error($manual),'disposable Page byte cleanup');
}
qa_assert((string)get_post($clonePage)->post_content===$rootBefore,
    'disposable Page restored to exact initial content after clone/remove');
echo "PSE_DISPOSABLE_SHARED_SOURCE_SECTION_CLONE_REMOVE=PASS CLEANUP_EXACT=PASS\n";


$GLOBALS['qa_page']=(int)$page;
$GLOBALS['qa_ticket']=bin2hex(random_bytes(32));
set_transient('esc_vb_'.hash('sha256',$GLOBALS['qa_ticket']),[
    'page_id'=>(int)$page,'user_id'=>get_current_user_id()
],120);

qa_assert(get_post($page)->post_content===$qa_page_body,
    'Page content unchanged after S1/S2/S3/S4/S5 table-only writes');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_S1_S2_S3_S4_S5_SAVE_READBACK_ROLLBACK=PASS\n";
echo "NO_PRODUCTION_CMS_WRITE=true NO_FTP=true NO_ASTRO_BUILD=true\n";
