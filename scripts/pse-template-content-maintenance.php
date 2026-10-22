<?php
/**
 * One-time PSE-only imported-content sanitation. Installs temporarily as
 * authenticated MU plugin and must be removed immediately after use.
 * No public endpoints, cron jobs or persistent hooks.
 */
if (!defined('ABSPATH')) { exit; }
add_action('admin_menu', static function () {
    add_management_page(
        'PSE content template sanitation', 'PSE content sanitation',
        'manage_options', 'pse-template-content-maintenance',
        'pse_template_content_admin_page'
    );
});

function pse_template_brand_pattern(): string {
    return '/nghiencuukhoahoc|xuongmunonbaohiem|eduresearch\s*hub|blue\s*sea/i';
}
function pse_template_contact_pattern(): string {
    return '/(?:[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})|(?:\+?84|0)[35789]\d{8}\b/i';
}
function pse_template_safe_placeholder(): string {
    return '<p>Nội dung sẽ được cập nhật khi cấu hình website mới.</p>';
}
function pse_template_existing_acf_meta($id, string $name): string {
    $value=get_post_meta($id,$name,true);
    if (!is_string($value)) { throw new RuntimeException('Unexpected ACF metadata storage'); }
    return $value;
}
function pse_template_change_acf(int $id, string $name, string $value): void {
    if (!function_exists('update_field')) {
        throw new RuntimeException('ACF is not active');
    }
    $field=function_exists('get_field_object') ? get_field_object($name,$id,false,false) : null;
    $key=is_array($field) && !empty($field['key']) ? (string)$field['key'] : $name;
    update_field($key,$value,$id);
    if (pse_template_existing_acf_meta($id,$name)!==$value) {
        // Existing postmeta field is known from the read-only WordPress audit.
        update_post_meta($id,$name,$value);
    }
    if (pse_template_existing_acf_meta($id,$name)!==$value) {
        throw new RuntimeException('ACF value failed readback');
    }
}
function pse_template_content_plan(): array {
    $common=get_posts([
        'post_type'=>'thong-tin-chung', 'post_status'=>'any',
        'posts_per_page'=>2, 'fields'=>'ids', 'suppress_filters'=>true
    ]);
    if (count($common)!==1) { throw new RuntimeException('Expected one general information record'); }
    $general=(int)$common[0];
    $company=pse_template_existing_acf_meta($general,'tencongty');
    $company_state=$company==='Website mẫu' ? 'already' :
        (preg_match(pse_template_brand_pattern(),$company) ? 'ready' : 'unexpected');
    $pages=[];
    foreach ([53390,47222] as $id) {
        $post=get_post($id);
        if (!$post || $post->post_type!=='page' || $post->post_status!=='publish') {
            throw new RuntimeException('Unexpected target page metadata');
        }
        $content=(string)$post->post_content;
        $already=$content===pse_template_safe_placeholder();
        $ready=(bool)preg_match(pse_template_brand_pattern(),$content)
            && (bool)preg_match(pse_template_contact_pattern(),$content)
            && strlen($content)<=65000
            && !preg_match('/<script\b|<style\b|<iframe\b|<form\b|\[(?:tablepress|esc_table|shortcode)\b|<!--\s*wp:shortcode/i',$content);
        $state=$already?'already':($ready?'ready':'unexpected');
        $pages[$id]=$state;
    }
    $acf=pse_template_existing_acf_meta(47222,'content');
    $acf_state=$acf===pse_template_safe_placeholder() ? 'already' :
        ((bool)preg_match(pse_template_contact_pattern(),$acf)
          && strlen($acf)<=65000
          && !preg_match('/<script\b|<style\b|<iframe\b|\[(?:tablepress|esc_table|shortcode)\b/i',$acf)
            ? 'ready':'unexpected');
    return [
        'general_id'=>$general,
        'company'=>$company_state,
        'pages'=>$pages,
        'acf_contact'=>$acf_state,
        'ready'=>$company_state!=='unexpected' && $acf_state!=='unexpected'
            && !in_array('unexpected',$pages,true),
    ];
}
function pse_template_content_admin_page(): void {
    if (!current_user_can('manage_options')) { wp_die('Forbidden'); }
    $ran=false;
    $result=[];
    try {
        $plan=pse_template_content_plan();
        if ($_SERVER['REQUEST_METHOD']==='POST' && isset($_POST['pse_template_content_action'])) {
            check_admin_referer('pse_template_content_maintenance');
            if ((string)$_POST['pse_template_content_action']!=='sanitize') {
                throw new RuntimeException('Invalid PSE template action');
            }
            if (!$plan['ready']) { throw new RuntimeException('Imported content changed; refuse write'); }
            $general=$plan['general_id'];
            if ($plan['company']==='ready') {
                pse_template_change_acf($general,'tencongty','Website mẫu');
            }
            foreach ([53390,47222] as $id) {
                if ($plan['pages'][$id]==='ready') {
                    $changed=wp_update_post([
                        'ID'=>$id, 'post_content'=>pse_template_safe_placeholder()
                    ],true);
                    if (is_wp_error($changed) || (int)$changed!==$id ||
                        (string)get_post($id)->post_content!==pse_template_safe_placeholder()) {
                        throw new RuntimeException('WP page update verification failed');
                    }
                }
            }
            if ($plan['acf_contact']==='ready') {
                pse_template_change_acf(47222,'content',pse_template_safe_placeholder());
            }
            $ran=true;
            $plan=pse_template_content_plan();
            if (!$plan['ready'] || $plan['company']!=='already' ||
                $plan['acf_contact']!=='already' ||
                $plan['pages'][53390]!=='already' || $plan['pages'][47222]!=='already') {
                throw new RuntimeException('Post-cleanup verification failed');
            }
        }
        $result=[
            'executed'=>$ran, 'preflight_ready'=>$plan['ready'],
            'company_state'=>$plan['company'],
            'page_53390_state'=>$plan['pages'][53390],
            'page_47222_state'=>$plan['pages'][47222],
            'acf_content_state'=>$plan['acf_contact'],
        ];
    } catch (Throwable $e) {
        $result=['executed'=>false,'preflight_ready'=>false,'error_class'=>get_class($e)];
    }
    echo '<div class="wrap"><h1>Temporary PSE content sanitation</h1>';
    echo '<pre id="pse-template-content-result">'.esc_html(wp_json_encode($result)).'</pre>';
    if (!$ran && !empty($result['preflight_ready'])) {
        echo '<form method="post">';
        wp_nonce_field('pse_template_content_maintenance');
        echo '<input type="hidden" name="pse_template_content_action" value="sanitize">';
        submit_button('Sanitize precisely scoped imported page content');
        echo '</form>';
    }
    echo '</div>';
}
