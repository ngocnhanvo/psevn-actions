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

qa_assert(get_post($page)->post_content===$qa_page_body,
    'Page content unchanged after S1/S2/S3/S4/S5 table-only writes');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_S1_S2_S3_S4_S5_SAVE_READBACK_ROLLBACK=PASS\n";
echo "NO_PRODUCTION_CMS_WRITE=true NO_FTP=true NO_ASTRO_BUILD=true\n";
