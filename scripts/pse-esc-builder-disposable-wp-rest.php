<?php
/**
 * Real WordPress REST Save/readback/inverse rollback on a disposable DB ONLY.
 * This file refuses any non-loopback WP installation.
 */
if (!defined('WP_CLI') || !WP_CLI || getenv('PSE_DISPOSABLE_WP')!=='1' ||
    !preg_match('~^http://127\.0\.0\.1:8099/?$~D',(string)get_option('home'))) {
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
$page=wp_insert_post([
    'post_type'=>'page','post_status'=>'publish',
    'post_title'=>'Local disposable Visual Builder',
    'post_content'=>'<div>[table id='.$parent.' /]</div><div>[table id='.$query.' /]</div>'
],true);
qa_assert(!is_wp_error($page),'disposable Page insert');
$GLOBALS['qa_page']=(int)$page;
$owned=esc_vb_page_owned_table_ids($page);
$literal=esc_vb_source_literal_table_ids((string)get_post($page)->post_content);
$stored=qa_table_rows($model,$parent);
$cell_ids=esc_vb_source_literal_table_ids((string)$stored[2][1]);
echo 'PSE_DISPOSABLE_SCOPE_DIAG direct='.json_encode($literal)
    .' nested='.json_encode($cell_ids).' resolved='.json_encode($owned)
    .' parent_api='.json_encode(get_option('tablepress_meta_'.$parent,[]))."\n";
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
qa_assert(get_post($page)->post_content==='<'.
    'div>[table id='.$parent.' /]</div><div>[table id='.$query.' /]</div>',
    'Page content untouched during table-only writes');
echo "PSE_DISPOSABLE_REAL_WORDPRESS_NESTED_S1_S5_SAVE_READBACK_ROLLBACK=PASS\n";
echo "NO_PRODUCTION_CMS_WRITE=true NO_FTP=true NO_ASTRO_BUILD=true\n";
