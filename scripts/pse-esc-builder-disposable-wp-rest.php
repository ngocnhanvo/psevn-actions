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
$pseTableExporter=WP_CONTENT_DIR.'/themes/vibe-code-theme/inc/tablepress/endpoint.php';
qa_assert(is_file($pseTableExporter),'PSE theme real TablePress exporter exists');
require_once $pseTableExporter; // Exact production API functions, without unrelated theme hooks.

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
// Validate literal Page source, and one verified inert HTML sibling wrapper.
// Both must clone/remove one Page occurrence without any incidental whitespace
// change; never allow a QA-only wp_update_post repair to hide a source defect.
$cloneCases=[
    'bare'=>'[table id='.$parent.' /]',
    'wrapped'=>'<div class="page"><section>[table id='.$parent.' /]</section>'
        .'<section>[table id='.$query.' /]</section></div>'
];
foreach ($cloneCases as $kind=>$original) {
    $clonePage=wp_insert_post([
        'post_type'=>'page','post_status'=>'publish',
        'post_title'=>'Disposable shared-source clone '.$kind,
        'post_content'=>$original
    ],true);
    qa_assert(!is_wp_error($clonePage),'isolated Page for shared-source clone '.$kind);
    $GLOBALS['qa_page']=(int)$clonePage;
    $GLOBALS['qa_ticket']=bin2hex(random_bytes(32));
    set_transient('esc_vb_'.hash('sha256',$GLOBALS['qa_ticket']),[
        'page_id'=>(int)$clonePage,'user_id'=>get_current_user_id()
    ],120);
    $sourceRead=qa_request('section-order',[]);
    $sourceKey=(string)$sourceRead['items'][0]['id'];
    $bytesBefore=(string)get_post($clonePage)->post_content;
    qa_assert($bytesBefore===$original,'local source bytes unchanged before clone '.$kind);
    $tableBefore=qa_table_rows($model,$parent);
    $preflight=qa_request('duplicate-section-shared',[
        'section_key'=>$sourceKey,
        'expected_version'=>$sourceRead['version'],
        'share_source'=>true,'dry_run'=>true
    ]);
    qa_assert(($preflight['checked']??false)===true &&
        ($preflight['no_write']??false)===true &&
        (string)get_post($clonePage)->post_content===$bytesBefore,
        'native Page clone preflight must not write '.$kind);
    $cloned=qa_request('duplicate-section-shared',[
        'section_key'=>$sourceKey,
        'expected_version'=>$sourceRead['version'],
        'share_source'=>true
    ]);
    qa_assert(($cloned['saved']??false)===true &&
        count($cloned['occurrences']??[])===2 &&
        qa_table_rows($model,$parent)===$tableBefore,
        'one shared-source clone without ESC data mutation '.$kind);
    $newKey=$sourceKey.'@1';
    qa_assert(in_array($newKey,$cloned['occurrences'],true),
        'post-duplicate occurrence key is unambiguous '.$kind);
    $removed=qa_request('remove-section',[
        'section_key'=>$newKey,
        'expected_version'=>$cloned['version']
    ]);
    qa_assert(($removed['saved']??false)===true &&
        qa_table_rows($model,$parent)===$tableBefore,
        'native Page-only section Remove preserves ESC Table '.$kind);
    qa_assert((string)get_post($clonePage)->post_content===$bytesBefore,
        'native Clone -> Remove exactly restores initial Page bytes, without repair '.$kind);
    $afterRemove=qa_request('section-order',[]);
    qa_assert(array_column($afterRemove['items'],'table_id')===
        array_column($sourceRead['items'],'table_id'),
        'native Clone -> Remove recovers original section sequence '.$kind);
}
echo "PSE_DISPOSABLE_SHARED_SOURCE_SECTION_CLONE_REMOVE=PASS NATIVE_EXACT_BYTES=PASS\n";

$GLOBALS['qa_page']=(int)$page;
$GLOBALS['qa_ticket']=bin2hex(random_bytes(32));
set_transient('esc_vb_'.hash('sha256',$GLOBALS['qa_ticket']),[
    'page_id'=>(int)$page,'user_id'=>get_current_user_id()
],120);

// S6: real WordPress Page HTML token writer, independent of ESC Table data.
// The Builder must preserve all markup and the adjacent native shortcode.
$s6Source='<section class="editor-copy"><h2>Tiêu đề gốc</h2>'
    .'<p>Thông tin sản phẩm &amp; dịch vụ</p>'
    .'<img src="https://127.0.0.1:8099/wp-content/uploads/qa-media.jpg" alt="Ảnh gốc" width="48"></section>'
    .'<div>[table id='.$parent.' /]</div>';
$s6Page=wp_insert_post([
    'post_type'=>'page','post_status'=>'publish',
    'post_title'=>'Disposable Page HTML S6',
    'post_content'=>$s6Source
],true);
qa_assert(!is_wp_error($s6Page),'local real WordPress S6 Page');
$GLOBALS['qa_page']=(int)$s6Page;
$GLOBALS['qa_ticket']=bin2hex(random_bytes(32));
set_transient('esc_vb_'.hash('sha256',$GLOBALS['qa_ticket']),[
    'page_id'=>(int)$s6Page,'user_id'=>get_current_user_id()
],120);
$nativeBefore=qa_table_rows($model,$parent);
$s6Read=qa_request('editable-page-text',[]);
qa_assert(($s6Read['source']??'')==='page_html' &&
    ($s6Read['version']??'')===hash('sha256',$s6Source),
    'S6 real REST Page HTML source/version');
$targetRow=null;
foreach ($s6Read['rows']??[] as $candidate) {
    if (($candidate['title']??'')==='Tiêu đề gốc') {$targetRow=$candidate;break;}
}
qa_assert(is_array($targetRow),'S6 native Page HTML H2 physical text token');
$s6Save=qa_request('save-page-text',[
    'part'=>$targetRow['part'],'offset'=>$targetRow['offset'],
    'expected_version'=>$s6Read['version'],
    'original_hash'=>$targetRow['hash'],
    'title'=>'Tiêu đề mới'
]);
$changedBody=(string)get_post($s6Page)->post_content;
qa_assert(($s6Save['saved']??false)===true &&
    $changedBody===str_replace('Tiêu đề gốc','Tiêu đề mới',$s6Source) &&
    ($s6Save['version']??'')===hash('sha256',$changedBody) &&
    qa_table_rows($model,$parent)===$nativeBefore,
    'S6 real Save independent WordPress DB readback, ESC child unchanged');
qa_request('save-page-text',[
    'part'=>$targetRow['part'],'offset'=>$targetRow['offset'],
    'expected_version'=>$s6Read['version'],
    'original_hash'=>$targetRow['hash'],
    'title'=>'Lệnh lỗi thời'
],true);
qa_assert((string)get_post($s6Page)->post_content===$changedBody,
    'S6 stale Page version refuses second write');
$s6Fresh=qa_request('editable-page-text',[]);
$reverseRow=null;
foreach ($s6Fresh['rows']??[] as $candidate) {
    if (($candidate['title']??'')==='Tiêu đề mới') {$reverseRow=$candidate;break;}
}
qa_assert(is_array($reverseRow),'fresh S6 Page token readback');
$s6Rollback=qa_request('save-page-text',[
    'part'=>$reverseRow['part'],'offset'=>$reverseRow['offset'],
    'expected_version'=>$s6Fresh['version'],
    'original_hash'=>$reverseRow['hash'],
    'title'=>'Tiêu đề gốc'
]);
qa_assert(($s6Rollback['saved']??false)===true &&
    (string)get_post($s6Page)->post_content===$s6Source &&
    qa_table_rows($model,$parent)===$nativeBefore,
    'S6 native Page HTML exact rollback no shortcode/ESC table mutation');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_S6_PAGE_TEXT_SAVE_READBACK_ROLLBACK=PASS\n";
// S6 Page-owned media ALT is a separate source/cell, not an ESC Table image.
// Changing ALT must leave src, width, sibling HTML and TablePress untouched.
$s6Images=qa_request('editable-page-images',[]);
qa_assert(($s6Images['source']??'')==='page_html' &&
    count($s6Images['images']??[])===1 &&
    ($s6Images['images'][0]['field']??'')==='image' &&
    $s6Images['version']===hash('sha256',$s6Source),
    'S6 Page image physical source and version');
$img=$s6Images['images'][0];
$altSave=qa_request('save-page-image',[
    'part'=>$img['part'],'index'=>$img['row'],
    'expected_version'=>$s6Images['version'],
    'original_hash'=>$img['hash'],'alt'=>'Ảnh mới'
]);
$altSavedBody=(string)get_post($s6Page)->post_content;
qa_assert(($altSave['saved']??false)===true &&
    $altSavedBody===str_replace('alt="Ảnh gốc"','alt="Ảnh mới"',$s6Source) &&
    $altSave['version']===hash('sha256',$altSavedBody) &&
    qa_table_rows($model,$parent)===$nativeBefore,
    'S6 native image ALT Save canonical readback without changing source URL');
qa_request('save-page-image',[
    'part'=>$img['part'],'index'=>$img['row'],
    'expected_version'=>$s6Images['version'],
    'original_hash'=>$img['hash'],'alt'=>'Giá trị cũ'
],true);
qa_assert((string)get_post($s6Page)->post_content===$altSavedBody,
    'S6 image ALT stale version rejects mutation');
$refreshed=qa_request('editable-page-images',[]);
$newImage=$refreshed['images'][0]??[];
qa_assert(($newImage['hash']??'')!==$img['hash'] &&
    $refreshed['version']===$altSave['version'],
    'S6 Page image ALT new REST version and physical hash');
$altRevert=qa_request('save-page-image',[
    'part'=>$newImage['part'],'index'=>$newImage['row'],
    'expected_version'=>$refreshed['version'],
    'original_hash'=>$newImage['hash'],'alt'=>'Ảnh gốc'
]);
qa_assert(($altRevert['saved']??false)===true &&
    (string)get_post($s6Page)->post_content===$s6Source &&
    qa_table_rows($model,$parent)===$nativeBefore,
    'S6 native Page image ALT rollback exact Page source bytes');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_S6_PAGE_IMAGE_ALT_SAVE_READBACK_ROLLBACK=PASS\n";
// Verify actual WordPress Media attachment replacement, not arbitrary URLs.
// Two disposable 1x1 PNG records are created only in the isolated runner.
$png=base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7TQAAAABJRU5ErkJggg==',true);
qa_assert(is_string($png) && strlen($png)>40,'bundled disposable PNG bytes');
$mediaIds=[];
foreach (['source','target'] as $name) {
    $uploaded=wp_upload_bits('pse-s6-disposable-'.$name.'.png',null,$png);
    qa_assert(empty($uploaded['error']) && is_file($uploaded['file']),
        'local disposable WordPress Media file '.$name);
    $id=wp_insert_attachment([
        'post_mime_type'=>'image/png',
        'post_title'=>'Disposable S6 '.$name,
        'post_status'=>'inherit'
    ],$uploaded['file'],0,true);
    qa_assert(!is_wp_error($id) && (int)$id>0 &&
        wp_attachment_is_image((int)$id),
        'real native WP Media attachment '.$name);
    $mediaIds[$name]=(int)$id;
}
$originalMediaUrl=wp_get_attachment_url($mediaIds['source']);
$targetMediaUrl=wp_get_attachment_url($mediaIds['target']);
qa_assert(is_string($originalMediaUrl) && is_string($targetMediaUrl) &&
    $originalMediaUrl!==$targetMediaUrl &&
    str_starts_with($originalMediaUrl,'https://127.0.0.1:8099/') &&
    str_starts_with($targetMediaUrl,'https://127.0.0.1:8099/'),
    'both Media URLs belong only to disposable WordPress HTTPS loopback');
$mediaBefore='<section><img src="'.esc_attr($originalMediaUrl).
    '" alt="Media A" width="48"><p>Giữ nguyên</p></section>'.
    '<div>[table id='.$parent.' /]</div>';
$mediaPage=wp_insert_post([
    'post_type'=>'page','post_status'=>'publish',
    'post_title'=>'Disposable Page Media replacement',
    'post_content'=>$mediaBefore
],true);
qa_assert(!is_wp_error($mediaPage),'disposable Media owner Page');
$GLOBALS['qa_page']=(int)$mediaPage;
$GLOBALS['qa_ticket']=bin2hex(random_bytes(32));
set_transient('esc_vb_'.hash('sha256',$GLOBALS['qa_ticket']),[
    'page_id'=>(int)$mediaPage,'user_id'=>get_current_user_id()
],120);
$mediaRead=qa_request('editable-page-images',[]);
$mediaImage=$mediaRead['images'][0]??[];
qa_assert(count($mediaRead['images']??[])===1 &&
    $mediaImage['url']===$originalMediaUrl,
    'original media link read from real WordPress Page');
$mediaSaved=qa_request('save-page-image',[
    'part'=>$mediaImage['part'],'index'=>$mediaImage['row'],
    'expected_version'=>$mediaRead['version'],
    'original_hash'=>$mediaImage['hash'],
    'attachment_id'=>$mediaIds['target']
]);
$mediaAfter=(string)get_post($mediaPage)->post_content;
qa_assert(($mediaSaved['saved']??false)===true &&
    $mediaAfter===str_replace($originalMediaUrl,$targetMediaUrl,$mediaBefore) &&
    qa_table_rows($model,$parent)===$nativeBefore &&
    $mediaSaved['url']===$targetMediaUrl,
    'S6 Page Media Save/readback changed exactly source IMG URL');
qa_request('save-page-image',[
    'part'=>$mediaImage['part'],'index'=>$mediaImage['row'],
    'expected_version'=>$mediaRead['version'],
    'original_hash'=>$mediaImage['hash'],
    'attachment_id'=>$mediaIds['source']
],true);
$mediaFresh=qa_request('editable-page-images',[]);
$mediaCurrent=$mediaFresh['images'][0]??[];
qa_assert($mediaCurrent['url']===$targetMediaUrl &&
    $mediaCurrent['hash']!==$mediaImage['hash'],
    'S6 Media source stale rejection and fresh REST hash');
$mediaRestored=qa_request('save-page-image',[
    'part'=>$mediaCurrent['part'],'index'=>$mediaCurrent['row'],
    'expected_version'=>$mediaFresh['version'],
    'original_hash'=>$mediaCurrent['hash'],
    'attachment_id'=>$mediaIds['source']
]);
qa_assert(($mediaRestored['saved']??false)===true &&
    (string)get_post($mediaPage)->post_content===$mediaBefore &&
    qa_table_rows($model,$parent)===$nativeBefore,
    'S6 Page WordPress Media source exact rollback, no ESC mutation');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_S6_PAGE_MEDIA_SAVE_READBACK_ROLLBACK=PASS\n";
$GLOBALS['qa_page']=(int)$page;
$GLOBALS['qa_ticket']=bin2hex(random_bytes(32));
set_transient('esc_vb_'.hash('sha256',$GLOBALS['qa_ticket']),[
    'page_id'=>(int)$page,'user_id'=>get_current_user_id()
],120);

// S8 genuine WordPress Menu and ACF Info owner, not a mock of WordPress
// records. Load the exact PSE theme menu module without its unrelated theme
// group creation hooks, which require migrated site data absent in the runner.
if (!function_exists('esc_pse_page_lang')) {
    $pseMenuFile=WP_CONTENT_DIR.'/themes/vibe-code-theme/inc/tools/menu.php';
    qa_assert(is_file($pseMenuFile),'real PSE Menu helper module is present');
    require_once $pseMenuFile;
}
qa_assert(function_exists('esc_pse_page_lang') &&
    function_exists('esc_pse_find_menu_object') &&
    function_exists('esc_pse_get_menu_meta') &&
    function_exists('esc_pse_get_menu_item_link_mode') &&
    function_exists('acf_add_local_field_group') &&
    function_exists('update_field'),
    'bundled PSE Menu resolver and real ACF active for S8 native tests');
update_post_meta((int)$page,'product_lang','vi');
qa_assert(esc_pse_page_lang((int)$page)==='vi',
    'S8 source Page language uses real PSE theme resolver');
$menuId=wp_create_nav_menu('Disposable PSE Header VI');
qa_assert(!is_wp_error($menuId) && (int)$menuId>0,
    'create genuine disposable WordPress Header');
update_term_meta($menuId,'_esc_menu_code','Header');
update_term_meta($menuId,'_esc_menu_lang','vi');
update_term_meta($menuId,'_esc_menu_type','dropdown');
$menuEntries=[];
foreach (['QA Native A','QA Native B'] as $position=>$label) {
    $item=wp_update_nav_menu_item($menuId,0,[
        'menu-item-title'=>$label,
        'menu-item-url'=>'https://example.org/'.$position,
        'menu-item-type'=>'custom',
        'menu-item-status'=>'publish',
        'menu-item-position'=>$position+1,
    ]);
    qa_assert(!is_wp_error($item) && (int)$item>0,
        'insert native WordPress Menu item '.$position);
    update_post_meta((int)$item,'_esc_menu_label',$label);
    update_post_meta((int)$item,'_esc_menu_link_type','custom');
    $menuEntries[]=(int)$item;
}
$menuBefore=wp_get_nav_menu_items($menuId,['post_status'=>'publish']);
qa_assert(is_array($menuBefore) && count($menuBefore)===2,
    'native Header menu has two published owned items');
$menuItem=$menuEntries[0];
$menuRead=qa_request('menu-item',['item_id'=>$menuItem]);
qa_assert(($menuRead['label']??'')==='QA Native A' &&
    ($menuRead['version']??'')!=='' &&
    ($menuRead['source_kind']??'')!== 'api-auto',
    'PSE native Menu item authenticated REST reader');
$menuUpdated=qa_request('save-menu-item',[
    'item_id'=>$menuItem,'expected_version'=>$menuRead['version'],
    'label'=>'QA Native A Updated',
]);
qa_assert(($menuUpdated['saved']??false)===true &&
    get_post_field('post_title',$menuItem)==='QA Native A Updated' &&
    get_post_meta($menuItem,'_esc_menu_label',true)==='QA Native A Updated',
    'real PSE native Menu item REST Save with independent source readback');
qa_request('save-menu-item',[
    'item_id'=>$menuItem,'expected_version'=>$menuRead['version'],
    'label'=>'Stale Unsafe',
],true);
$menuRefresh=qa_request('menu-item',['item_id'=>$menuItem]);
qa_assert(($menuRefresh['label']??'')==='QA Native A Updated',
    'fresh PSE menu read rejects stale version');
$menuRestore=qa_request('save-menu-item',[
    'item_id'=>$menuItem,'expected_version'=>$menuRefresh['version'],
    'label'=>'QA Native A',
]);
qa_assert(($menuRestore['saved']??false)===true &&
    get_post_field('post_title',$menuItem)==='QA Native A' &&
    get_post_meta($menuItem,'_esc_menu_label',true)==='QA Native A',
    'S8 real native Header Menu label inverse source rollback');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_S8_MENU_LABEL_SAVE_READBACK_ROLLBACK=PASS\n";

$orderReader=qa_request('menu-item',['item_id'=>$menuEntries[1]]);
qa_assert(($orderReader['can_move_up']??false)===true,
    'native second Menu item exposes upward direct sibling swap');
$firstOrder=(int)get_post($menuEntries[0])->menu_order;
$secondOrder=(int)get_post($menuEntries[1])->menu_order;
$menuMoved=qa_request('move-menu-item',[
    'item_id'=>$menuEntries[1],
    'expected_version'=>$orderReader['version'],'direction'=>'up',
]);
qa_assert(($menuMoved['saved']??false)===true &&
    (int)get_post($menuEntries[0])->menu_order===$secondOrder &&
    (int)get_post($menuEntries[1])->menu_order===$firstOrder,
    'S8 two native WordPress Menu item physical positions swapped');
qa_request('move-menu-item',[
    'item_id'=>$menuEntries[1],
    'expected_version'=>$orderReader['version'],'direction'=>'down',
],true);
$orderFresh=qa_request('menu-item',['item_id'=>$menuEntries[1]]);
$menuMoveBack=qa_request('move-menu-item',[
    'item_id'=>$menuEntries[1],
    'expected_version'=>$orderFresh['version'],'direction'=>'down',
]);
qa_assert(($menuMoveBack['saved']??false)===true &&
    (int)get_post($menuEntries[0])->menu_order===$firstOrder &&
    (int)get_post($menuEntries[1])->menu_order===$secondOrder,
    'S8 direct Menu order inverse restores both WordPress source orders');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_S8_MENU_ORDER_SAVE_READBACK_ROLLBACK=PASS\n";

// WordPress Info belongs to a distinct published CPT with real ACF field
// persistence. No production/real-business Info record may be written.
if (!post_type_exists('thong-tin-chung')) {
    register_post_type('thong-tin-chung',[
        'public'=>true,'show_ui'=>false,'capability_type'=>'post',
    ]);
}
acf_add_local_field_group([
    'key'=>'group_disposable_pse_s8',
    'title'=>'Disposable PSE S8 native Info',
    'fields'=>[[
        'key'=>'field_disposable_pse_s8_hotline','label'=>'Hotline',
        'name'=>'hotline','type'=>'text',
    ],[
        'key'=>'field_disposable_pse_s8_bct','label'=>'BCT',
        'name'=>'bocongthuong','type'=>'image','return_format'=>'id',
    ]],
    'location'=>[[[
        'param'=>'post_type','operator'=>'==','value'=>'thong-tin-chung',
    ]]],
]);
$infoId=wp_insert_post([
    'post_type'=>'thong-tin-chung','post_status'=>'publish',
    'post_title'=>'Disposable Vietnamese Info',
],true);
qa_assert(!is_wp_error($infoId) && (int)$infoId>0,
    'real disposable WordPress Info owner');
update_post_meta((int)$infoId,'product_lang','vi');
update_field('field_disposable_pse_s8_hotline','0123456789',(int)$infoId);
qa_assert(get_field('hotline',(int)$infoId,false)==='0123456789',
    'real ACF native hotline seed readback');
$footerRead=qa_request('footer-info',['field'=>'hotline']);
qa_assert(($footerRead['source_kind']??'')==='footer.info' &&
    ($footerRead['info_id']??0)===(int)$infoId &&
    ($footerRead['lang']??'')==='vi' &&
    ($footerRead['value']??'')==='0123456789',
    'S8 WordPress Info ACF source and locale ownership');
$footerSaved=qa_request('save-footer-info',[
    'field'=>'hotline','expected_version'=>$footerRead['version'],
    'value'=>'0901234567',
]);
qa_assert(($footerSaved['saved']??false)===true &&
    get_field('hotline',(int)$infoId,false)==='0901234567' &&
    get_post_meta((int)$infoId,'hotline',true)==='0901234567',
    'S8 native ACF footer Save with independent WordPress readback');
qa_request('save-footer-info',[
    'field'=>'hotline','expected_version'=>$footerRead['version'],
    'value'=>'0000000000',
],true);
$footerFresh=qa_request('footer-info',['field'=>'hotline']);
$footerRestore=qa_request('save-footer-info',[
    'field'=>'hotline','expected_version'=>$footerFresh['version'],
    'value'=>'0123456789',
]);
qa_assert(($footerRestore['saved']??false)===true &&
    get_field('hotline',(int)$infoId,false)==='0123456789' &&
    get_post_meta((int)$infoId,'hotline',true)==='0123456789',
    'S8 native ACF Info exact source value rollback');
qa_request('footer-info',['field'=>'not_allowed_field'],true);
echo "PSE_DISPOSABLE_REAL_WORDPRESS_S8_FOOTER_ACF_SAVE_READBACK_ROLLBACK=PASS\n";

$uploads=wp_get_upload_dir();
foreach ($mediaIds as $mediaId) {
    $file=get_attached_file((int)$mediaId);
    qa_assert(is_string($file) && is_file($file) &&
        str_starts_with($file,trailingslashit($uploads['basedir'])),
        'disposable WordPress attachment file only');
    wp_update_attachment_metadata((int)$mediaId,[
        'width'=>1,'height'=>1,
        'file'=>substr($file,strlen(trailingslashit($uploads['basedir']))),
        'sizes'=>[]
    ]);
    qa_assert(is_array(wp_get_attachment_image_src((int)$mediaId,'full')),
        'real WP attachment image URL');
}
$initialMedia=(int)$mediaIds['source'];
$nextMedia=(int)$mediaIds['target'];
update_field('field_disposable_pse_s8_bct',$initialMedia,(int)$infoId);
$originalBct=qa_request('footer-bct-image',[]);
qa_assert($originalBct['media_id']===$initialMedia &&
    $originalBct['info_id']===(int)$infoId,
    'genuine ACF Footer image ID source');
$changedBct=qa_request('save-footer-bct-image',[
    'expected_version'=>$originalBct['version'],
    'media_id'=>$nextMedia
]);
qa_assert(($changedBct['saved']??false)===true &&
    (int)get_field('bocongthuong',(int)$infoId,false)===$nextMedia,
    'S8 ACF Footer image native Save/readback');
qa_request('save-footer-bct-image',[
    'expected_version'=>$originalBct['version'],
    'media_id'=>$initialMedia
],true);
qa_request('save-footer-bct-image',[
    'expected_version'=>$changedBct['version'],
    'media_id'=>(int)$page
],true);
$freshBct=qa_request('footer-bct-image',[]);
qa_assert($freshBct['media_id']===$nextMedia,
    'S8 Footer image refresh after stale and invalid Media ID rejected');
$restoredBct=qa_request('save-footer-bct-image',[
    'expected_version'=>$freshBct['version'],
    'media_id'=>$initialMedia
]);
qa_assert(($restoredBct['saved']??false)===true &&
    (int)get_field('bocongthuong',(int)$infoId,false)===$initialMedia &&
    get_post_meta((int)$infoId,'hotline',true)==='0123456789',
    'S8 native Info Media ID inverse; Hotline unchanged');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_S8_FOOTER_MEDIA_SAVE_READBACK_ROLLBACK=PASS\n";

$assetRows=[
    ['group','label','image','value','href','visible'],['','','','','',''],
    ['certification','Chứng nhận QA','<img src="/wp-content/uploads/qa.png" alt="QA">','Đã đăng ký','/chung-nhan','1'],
    ['credit','Thiết kế QA','','Vibe Code','https://example.org/','1']
];
$assetNewId=qa_new_table($model,$assetRows,'Disposable Footer assets');
qa_assert($model->change_table_id($assetNewId,'pub_footer_assets_vi')===true,
    'native TablePress table ID changed for Footer source');
$assetRead=qa_request('footer-asset',['row_index'=>0]);
qa_assert(($assetRead['source_kind']??'')==='footer.asset' &&
    ($assetRead['table_id']??'')==='pub_footer_assets_vi',
    'S8 Footer exact locale-bound ESC Table ownership');
$assetSaved=qa_request('save-footer-asset',[
    'row_index'=>0,'field'=>'label','value'=>'Chứng nhận mới',
    'expected_version'=>$assetRead['version']
]);
$afterAssets=qa_table_rows($model,'pub_footer_assets_vi');
qa_assert(($assetSaved['saved']??false)===true &&
    $afterAssets[2][1]==='Chứng nhận mới' &&
    $afterAssets[2][2]===$assetRows[2][2] &&
    $afterAssets[3]===$assetRows[3],
    'S8 native Footer TablePress label Save/readback isolates image and sibling');
qa_request('save-footer-asset',[
    'row_index'=>0,'field'=>'label','value'=>'Stale',
    'expected_version'=>$assetRead['version']
],true);
$assetFresh=qa_request('footer-asset',['row_index'=>0]);
qa_request('save-footer-asset',[
    'row_index'=>0,'field'=>'image','value'=>'blocked',
    'expected_version'=>$assetFresh['version']
],true);
qa_request('save-footer-asset',[
    'row_index'=>0,'field'=>'href','value'=>'javascript:alert(1)',
    'expected_version'=>$assetFresh['version']
],true);
qa_assert(qa_table_rows($model,'pub_footer_assets_vi')===$afterAssets,
    'S8 Footer stale/image/executable href invalid writes rejected');
$assetRestored=qa_request('save-footer-asset',[
    'row_index'=>0,'field'=>'label','value'=>'Chứng nhận QA',
    'expected_version'=>$assetFresh['version']
]);
qa_assert(($assetRestored['saved']??false)===true &&
    qa_table_rows($model,'pub_footer_assets_vi')===$assetRows,
    'S8 Footer native exact 6-column TablePress rollback');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_S8_FOOTER_ASSETS_SAVE_READBACK_ROLLBACK=PASS\n";


// All source and locale protections use the actual production Menu/Info
// adapters, not a client-provided guessed capability.
$fakeTicket=qa_request('save-footer-info',[
    'ticket'=>'forged-session-token','field'=>'hotline',
    'expected_version'=>$footerRestore['version'],'value'=>'S8 spoof'
],true);
qa_assert(get_field('hotline',(int)$infoId,false)==='0123456789',
    'forged S8 Footer ticket cannot mutate real ACF Info');
$wrongLocalePage=wp_insert_post([
    'post_type'=>'page','post_status'=>'publish',
    'post_title'=>'Disposable EN Page'
],true);
qa_assert(!is_wp_error($wrongLocalePage),'local English Page');
update_post_meta((int)$wrongLocalePage,'product_lang','en');
$GLOBALS['qa_page']=(int)$wrongLocalePage;
$GLOBALS['qa_ticket']=bin2hex(random_bytes(32));
set_transient('esc_vb_'.hash('sha256',$GLOBALS['qa_ticket']),[
    'page_id'=>(int)$wrongLocalePage,'user_id'=>get_current_user_id()
],120);
$enFooter=qa_request('footer-info',['field'=>'hotline'],true);
qa_assert(($enFooter['code']??'')==='footer_info_source_ambiguous',
    'English Page may not silently fall back to Vietnamese WordPress Info');
$enMenu=qa_request('menu-item',['item_id'=>$menuItem],true);
qa_assert(($enMenu['code']??'')==='menu_preview_source_missing',
    'English Page cannot access the Vietnamese-only Header');
$GLOBALS['qa_page']=(int)$page;
$GLOBALS['qa_ticket']=bin2hex(random_bytes(32));
set_transient('esc_vb_'.hash('sha256',$GLOBALS['qa_ticket']),[
    'page_id'=>(int)$page,'user_id'=>get_current_user_id()
],120);
// A valid WordPress Menu item outside this Page's Header remains readonly.
$outsideMenu=wp_create_nav_menu('Disposable unrelated source Menu');
qa_assert(!is_wp_error($outsideMenu),'independent unrelated native Menu');
update_term_meta($outsideMenu,'_esc_menu_code','Footer');
update_term_meta($outsideMenu,'_esc_menu_lang','vi');
$outsideItem=wp_update_nav_menu_item($outsideMenu,0,[
    'menu-item-title'=>'Foreign Menu',
    'menu-item-url'=>'https://example.org/foreign',
    'menu-item-type'=>'custom','menu-item-status'=>'publish'
]);
qa_assert(!is_wp_error($outsideItem),'foreign native item');
$foreignMenu=qa_request('menu-item',['item_id'=>(int)$outsideItem],true);
qa_assert(($foreignMenu['code']??'')==='menu_item_outside_preview',
    'foreign menu item rejected despite valid WordPress admin auth');
$badMenuUrl=qa_request('save-menu-item',[
    'item_id'=>$menuItem,
    'label'=>'QA Native A',
    'expected_version'=>qa_request('menu-item',['item_id'=>$menuItem])['version'],
    'custom_url'=>'javascript:alert(1)'
],true);
qa_assert(($badMenuUrl['code']??'')==='menu_url_invalid' &&
    get_post_field('post_title',$menuItem)==='QA Native A',
    'executable Header URL rejected without changing native Menu');
$duplicateInfo=wp_insert_post([
    'post_type'=>'thong-tin-chung','post_status'=>'publish',
    'post_title'=>'Duplicate disposable VI Info'
],true);
qa_assert(!is_wp_error($duplicateInfo),'second disposable Info source');
update_post_meta((int)$duplicateInfo,'product_lang','vi');
$ambiguous=qa_request('footer-info',['field'=>'hotline'],true);
qa_assert(($ambiguous['code']??'')==='footer_info_source_ambiguous',
    'two published VI Info records fail closed rather than guess ownership');
$deleteDuplicate=wp_delete_post((int)$duplicateInfo,true);
qa_assert($deleteDuplicate!==false &&
    qa_request('footer-info',['field'=>'hotline'])['value']==='0123456789',
    'disposable Info duplicate cleanup restores original source selection');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_S8_AUTH_LOCALE_SOURCE_DENIAL=PASS\n";


function qa_fresh_table_rows($id) {
    // REST writers can create a new TablePress ID through a different model
    // instance; a test-scoped model allocated before the REST call may cache
    // the previous table mapping. Verify persistence with a fresh native
    // source loader rather than that stale in-memory lookup.
    $source=esc_vb_text_load_table((string)$id);
    qa_assert(!is_wp_error($source) && is_array($source[1]['data']??null),
        'fresh native TablePress source readback ID='.((string)$id).
        ' error='.(is_wp_error($source)?$source->get_error_code():'none'));
    return $source[1]['data'];
}

// Real source-independent S1 Page + native TablePress clone, on disposable
// WordPress only. The new copy must be editable WITHOUT rewriting the source.
$originalFaqRows=[
    ['question','answer','visible'],['Question','Answer','Visible'],
    ['QA FAQ Alpha','A native answer','1'],['QA FAQ Beta','Another answer','1']
];
$faqTempId=qa_new_table($model,$originalFaqRows,'Disposable S1 FAQ');
qa_assert($model->change_table_id($faqTempId,'pse_faq_vi')===true,
    'rename native S1 table to canonical PSE renderer source');
$faqSource='pse_faq_vi';
$faqOriginalMeta=['title'=>'Câu hỏi thường gặp (QA)','description'=>'Mô tả từ bảng gốc'];
update_option('tablepress_meta_'.$faqSource,$faqOriginalMeta,false);
$faqPageBody=$qa_page_body.'<section><div>[table id=pse_faq_vi /]</div></section>';
$updatedPage=wp_update_post(wp_slash([
    'ID'=>(int)$page,'post_content'=>$faqPageBody
]),true);
qa_assert(!is_wp_error($updatedPage) && get_post($page)->post_content===$faqPageBody,
    'temporary disposable Page owns canonical FAQ TablePress section');
$faqOrder=qa_request('section-order',[]);
$faqBlock=array_values(array_filter($faqOrder['items'],
    static fn($item)=>($item['table_id']??'')==='pse_faq_vi'));
qa_assert(count($faqBlock)===1,'exact physical FAQ Page section');
$faqKey=$faqBlock[0]['id'];
$readOnlyTables=count(esc_vb_get_table_mapping());
$independentParams=[
    'section_key'=>$faqKey,'expected_version'=>$faqOrder['version'],
    'share_source'=>false
];
// An API-managed ESC Table must never be cloned as independent S1.
$beforeBadDryTables=count(esc_vb_get_table_mapping());
update_option('tablepress_meta_'.$faqSource,array_merge($faqOriginalMeta,['api'=>'Product']),false);
$deniedDynamic=qa_request('duplicate-section-independent',
    $independentParams+['dry_run'=>true],true);
qa_assert(($deniedDynamic['code']??'')==='section_copy_dynamic' &&
    count(esc_vb_get_table_mapping())===$beforeBadDryTables &&
    get_post($page)->post_content===$faqPageBody,
    'API-backed source is denied with zero physical table/Page writes');
update_option('tablepress_meta_'.$faqSource,$faqOriginalMeta,false);

$independentDry=qa_request('duplicate-section-independent',
    $independentParams+['dry_run'=>true]);
qa_assert(($independentDry['checked']??false)===true &&
    ($independentDry['source_shared']??true)===false &&
    ($independentDry['renderer']??'')==='Pse_faq' &&
    ($independentDry['would_copy_tables']??0)===1 &&
    count(esc_vb_get_table_mapping())===$readOnlyTables &&
    get_post($page)->post_content===$faqPageBody,
    'S1 independent clone dry_run is genuinely read-only');
$nativeClone=qa_request('duplicate-section-independent',$independentParams);
$newFaqId=$nativeClone['new_table_id']??'';
qa_assert(($nativeClone['saved']??false)===true &&
    ($nativeClone['source_shared']??true)===false &&
    is_string($newFaqId) &&
    preg_match('/^escvb_[a-f0-9]{16}$/D',$newFaqId) &&
    ($nativeClone['renderer']??'')==='Pse_faq' &&
    $newFaqId!==$faqSource &&
    count(esc_vb_get_table_mapping())===$readOnlyTables+1,
    'S1 native copy has a new physical namespaced TablePress ID');
$cloneMeta=get_option('tablepress_meta_'.$newFaqId,[]);
qa_assert($cloneMeta===array_merge($faqOriginalMeta,[
    'escBuilderCloneVersion'=>'1',
    'escBuilderCloneOf'=>'pse_faq_vi',
    'builderComponent'=>'Pse_faq',
    'component'=>'esc_vb_s1:pse_faq_vi','api'=>''
]), 'S1 cloned table keeps visual metadata AND exact Astro renderer alias');
qa_assert(get_option('tablepress_meta_'.$faqSource,[])===$faqOriginalMeta,
    'native source metadata untouched by independent clone');
// Simulate the original PSE theme's ESC Table Admin Save, which writes
// only api/image/cols/rows. It must not erase the clone's identity marker.
$nativeAdminMeta=['api'=>'','image'=>'/wp-content/uploads/disposable.jpg',
    'cols'=>'{}','rows'=>'{}'];
update_option('tablepress_meta_'.$newFaqId,$nativeAdminMeta,false);
$afterNativeAdmin=get_option('tablepress_meta_'.$newFaqId,[]);
qa_assert(($afterNativeAdmin['component']??'')==='esc_vb_s1:pse_faq_vi' &&
    ($afterNativeAdmin['escBuilderCloneOf']??'')==='pse_faq_vi' &&
    ($afterNativeAdmin['builderComponent']??'')==='Pse_faq' &&
    ($afterNativeAdmin['escBuilderCloneVersion']??'')==='1' &&
    ($afterNativeAdmin['image']??'')===$nativeAdminMeta['image'] &&
    ($afterNativeAdmin['cols']??'')==='{}' &&
    get_option('tablepress_meta_'.$faqSource,[])===$faqOriginalMeta,
    'native Admin metadata Save retains immutable S1 clone alias and editable image');
update_option('tablepress_meta_'.$newFaqId,$cloneMeta,false);
qa_assert(get_option('tablepress_meta_'.$newFaqId,[])===$cloneMeta,
    'restore disposable S1 metadata exact bytes after native Admin emulation');
echo "PSE_DISPOSABLE_NATIVE_S1_THEME_EDITOR_META_PRESERVED=PASS\n";

$tableRoutes=array_keys(rest_get_server()->get_routes());
$tableRoutes=array_values(array_filter($tableRoutes,
    static fn($route)=>stripos($route,'tablepress')!==false));
echo 'PSE_QA_TABLEPRESS_METADATA_ROUTES='.wp_json_encode($tableRoutes)."\n";
qa_assert(function_exists('vcs_get_tablepress_pure_data'),
    'actual PSE GitHub Trigger TablePress pure-data provider available');
$copyNativePost=(int)(esc_vb_get_table_mapping()[$newFaqId]??0);
qa_assert($copyNativePost>0 &&
    get_post_type($copyNativePost)==='tablepress_table',
    'new physical TablePress post resolved for GitHub Trigger source');
$rawTablepressOption=get_option('tablepress_tables',[]);
$mapTypes=is_string($rawTablepressOption)?json_decode($rawTablepressOption,true):$rawTablepressOption;
$rawMapped=$mapTypes['table_post'][$newFaqId]??null;
echo 'PSE_QA_S1_TABLE_MAPPING_KIND='.wp_json_encode([
    'copy_post_type'=>gettype($copyNativePost),
    'mapping_value_type'=>gettype($rawMapped),
    'mapping_equals_post'=>(string)$rawMapped===(string)$copyNativePost,
])."\n";
// Each public HTTP request constructs its own static TablePress model.
// This long-lived WP-CLI fixture keeps the model built at bootstrap (before
// the copy); refresh it here to simulate the next public REST request.
TablePress::$model_table=TablePress::load_model('table');
$copyPublic=vcs_get_tablepress_pure_data($newFaqId);


echo 'PSE_QA_S1_PUBLIC_SOURCE_DIAG='.wp_json_encode([
    'id'=>is_array($copyPublic)?($copyPublic['id']??null):'WP_ERROR',
    'expected_id'=>$newFaqId,
    'component'=>is_array($copyPublic)?($copyPublic['component']??null):null,
    'title'=>is_array($copyPublic)?($copyPublic['title']??null):null,
    'description'=>is_array($copyPublic)?($copyPublic['description']??null):null,
    'api'=>is_array($copyPublic)?($copyPublic['meta']['api']??null):null,
    'error'=>is_wp_error($copyPublic)?$copyPublic->get_error_code():null,
])."\n";

qa_assert(!is_wp_error($copyPublic) && is_array($copyPublic) &&
    (string)($copyPublic['id']??'')===$newFaqId &&
    ($copyPublic['component']??'')==='esc_vb_s1:pse_faq_vi' &&
    ($copyPublic['title']??'')==='Disposable S1 FAQ' &&
    ($copyPublic['description']??'')==='Disposable local test' &&
    ($copyPublic['meta']['api']??'x')==='',
    'PSE theme pure-data exports the clone marker and original native name');
// The legacy per-table callback calls wp_send_json()/wp_die(), which
// would terminate WP-CLI before the rollback checks. The paginated
// all-tables REST callback below returns a real WP_REST_Response instead.
$tableMapping=esc_vb_get_table_mapping();
$allKeys=array_keys($tableMapping);
$cloneIndex=array_search($newFaqId,array_map('strval',$allKeys),true);
qa_assert(is_int($cloneIndex),'clone appears in canonical native TablePress source mapping');
$allRequest=new WP_REST_Request('GET','/tablepress/v1/tables/prefix/all');
$allRequest->set_param('per_page',30);
$allRequest->set_param('page',intdiv($cloneIndex,30)+1);
$allRest=rest_do_request($allRequest);
$allRows=$allRest->get_data();
$fromAll=is_array($allRows)?array_values(array_filter($allRows,
    static fn($entry)=>is_array($entry) && (string)($entry['id']??'')===$newFaqId)):[];
qa_assert(!$allRest->is_error() && count($fromAll)===1 &&
    ($fromAll[0]['component']??'')==='esc_vb_s1:pse_faq_vi' &&
    $fromAll[0]['title']==='Disposable S1 FAQ',
    'Astro production paginated all-tables REST includes native cloned source');
echo "PSE_DISPOSABLE_NATIVE_S1_ASTRO_TABLEPRESS_SOURCE_ALIAS=PASS\n";
// Verify the EXISTING WordPress build-log endpoint also exports new
// standalone ESC Table records, not only the full paginated table feed.
$incremental=rest_do_request(new WP_REST_Request('GET',
    '/astro/v1/get-tablepress-logs'));
$incrementalRows=$incremental->get_data();
$copyEvents=is_array($incrementalRows)?array_values(array_filter($incrementalRows,
    static fn($entry)=>is_array($entry) &&
        ($entry['type']??'')==='tablepress' &&
        (int)($entry['id']??0)===$copyNativePost)):[];
qa_assert(!$incremental->is_error() && count($copyEvents)===1 &&
    ($copyEvents[0]['action']??'')==='modify' &&
    ($copyEvents[0]['table']['component']??'')==='esc_vb_s1:pse_faq_vi' &&
    (string)($copyEvents[0]['table']['id']??'')===$newFaqId,
    'original PSE incremental build-log REST exports cloned TablePress source');
echo "PSE_DISPOSABLE_NATIVE_S1_ASTRO_BUILD_LOG_ALIAS=PASS\n";



qa_assert(qa_fresh_table_rows($newFaqId)===$originalFaqRows &&
    qa_table_rows($model,$faqSource)===$originalFaqRows,
    'S1 independent source cloned with exact native TablePress rows');
$clonedBody=get_post($page)->post_content;
qa_assert(str_contains($clonedBody,'[table id='.$newFaqId.' /]') &&
    str_contains($clonedBody,'[table id='.$faqSource.' /]') &&
    substr_count($clonedBody,'[table id='.$faqSource.' /]')===1,
    'Page now owns one distinct cloned native shortcode');
qa_request('duplicate-section-independent',$independentParams,true);
$cloneVersion=esc_vb_text_current_version($page,$newFaqId);
$cloneCellSave=qa_request('save-text',[
    'table_id'=>$newFaqId,'row'=>0,'field'=>'question',
    'title'=>'QA FAQ Alpha independent','expected_version'=>$cloneVersion,
    'original_hash'=>hash('sha256','QA FAQ Alpha')
]);
qa_assert(($cloneCellSave['saved']??false)===true &&
    qa_fresh_table_rows($newFaqId)[2][0]==='QA FAQ Alpha independent' &&
    qa_table_rows($model,$faqSource)===$originalFaqRows,
    'editing independent S1 native clone NEVER modifies original source');
$cloneCellRestore=qa_request('save-text',[
    'table_id'=>$newFaqId,'row'=>0,'field'=>'question',
    'title'=>'QA FAQ Alpha',
    'expected_version'=>esc_vb_text_current_version($page,$newFaqId),
    'original_hash'=>hash('sha256','QA FAQ Alpha independent')
]);
qa_assert(($cloneCellRestore['saved']??false)===true &&
    qa_fresh_table_rows($newFaqId)===$originalFaqRows,
    'independent S1 field exact inverse native rows');
$clonedOrder=qa_request('section-order',[]);
qa_assert(($clonedOrder['version']??'')===$nativeClone['version'] &&
    count(array_filter($clonedOrder['items'],
        static fn($item)=>($item['table_id']??'')===$newFaqId))===1,
    'REST section readback lists the one new source owner');
// Never recursively copy numeric alias tables. One original component
// source is authoritative; a copy is a writable physical table, not a theme.
$copyOfClone=qa_request('duplicate-section-independent',[
    'section_key'=>$newFaqId,
    'expected_version'=>$clonedOrder['version'],
    'share_source'=>false,'dry_run'=>true
],true);
qa_assert(($copyOfClone['code']??'')==='section_independent_renderer_missing',
    'cloned numeric TablePress source cannot spoof original renderer');

$detach=qa_request('remove-section',[
    'section_key'=>$newFaqId,'expected_version'=>$clonedOrder['version']
]);
qa_assert(($detach['saved']??false)===true &&
    get_post($page)->post_content===$faqPageBody &&
    qa_table_rows($model,$faqSource)===$originalFaqRows,
    'section detach restores exact Page bytes without deleting original TablePress');
qa_assert(TablePress::load_model('table')->table_exists($newFaqId)===true,
    'detach intentionally retains newly copied table for manual reuse');
delete_option('tablepress_meta_'.$newFaqId);
qa_assert(TablePress::load_model('table')->delete($newFaqId)===true &&
    !TablePress::load_model('table')->table_exists($newFaqId),
    'clean up only disposable detached source with verified ID');

// Failure-injection: simulate a Page post_content filter suppressing the
// second write AFTER TablePress copy. The writer must compensate by deleting
// ONLY its fresh, unreferenced native table.
$copyCountBefore=count(esc_vb_get_table_mapping());
$restoreViaHook=static function($data) use ($faqPageBody) {
    if (($data['post_type']??'')==='page' &&
        str_contains((string)($data['post_content']??''),'[table id=pse_faq_vi /]') &&
        preg_match('/\[table id=[1-9][0-9]* \/\]/',
            (string)($data['post_content']??''))) {
        $data['post_content']=$faqPageBody;
    }
    return $data;
};
add_filter('wp_insert_post_data',$restoreViaHook,99,2);
$failedCopy=qa_request('duplicate-section-independent',[
    'section_key'=>$faqKey,'share_source'=>false,
    'expected_version'=>hash('sha256',$faqPageBody)
],true);
remove_filter('wp_insert_post_data',$restoreViaHook,99);
qa_assert(($failedCopy['code']??'')==='section_copy_page_write_failed' &&
    get_post($page)->post_content===$faqPageBody &&
    count(esc_vb_get_table_mapping())===$copyCountBefore &&
    qa_table_rows($model,$faqSource)===$originalFaqRows,
    'Page failure automatically compensates new TablePress; original untouched');
// Duplicated static DOM IDs must fail on the server, even if an attacker
// calls REST directly instead of relying on Preview's safety probe.
$idWrapperBody=$qa_page_body.'<section id="qa-global-id">[table id=pse_faq_vi /]</section>';
$setWrapper=wp_update_post(wp_slash([
    'ID'=>(int)$page,'post_content'=>$idWrapperBody
]),true);
qa_assert(!is_wp_error($setWrapper) &&
    get_post($page)->post_content===$idWrapperBody,
    'isolated Page wrapper with a global ID');
$idWrapperOrder=qa_request('section-order',[]);
$fakeIdSection=array_values(array_filter($idWrapperOrder['items'],
    static fn($entry)=>($entry['table_id']??'')===$faqSource));
qa_assert(count($fakeIdSection)===1,'unsafe wrapper physical source is unique');
$unsafeRejected=qa_request('duplicate-section-independent',[
    'section_key'=>$fakeIdSection[0]['id'],
    'expected_version'=>$idWrapperOrder['version'],
    'share_source'=>false,'dry_run'=>true
],true);
qa_assert(count(esc_vb_get_table_mapping())===$copyCountBefore &&
    get_post($page)->post_content===$idWrapperBody,
    'global-ID duplicate rejected without creating any TablePress data');
echo "PSE_DISPOSABLE_NATIVE_S1_INDEPENDENT_CLONE_UNSAFE_SOURCE_DENIAL=PASS\n";
$resetFaq=wp_update_post(wp_slash([
    'ID'=>(int)$page,'post_content'=>$qa_page_body
]),true);
qa_assert(!is_wp_error($resetFaq) &&
    get_post($page)->post_content===$qa_page_body &&
    $model->delete($faqSource)===true,
    'cleanup disposable original FAQ table and Page wrapper');
delete_option('tablepress_meta_'.$faqSource);
echo "PSE_DISPOSABLE_NATIVE_S1_INDEPENDENT_SECTION_COPY_SAVE_READBACK_ROLLBACK=PASS\n";
echo "PSE_DISPOSABLE_NATIVE_S1_INDEPENDENT_COPY_FAILURE_COMPENSATION=PASS\n";

qa_assert(get_post($page)->post_content===$qa_page_body,
    'Page content unchanged after S1/S2/S3/S4/S5 table-only writes');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_S1_S2_S3_S4_S5_SAVE_READBACK_ROLLBACK=PASS\n";
echo "NO_PRODUCTION_CMS_WRITE=true NO_FTP=true NO_ASTRO_BUILD=true\n";
