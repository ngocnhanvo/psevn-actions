<?php
/**
 * PSE one-time residual-template classification. READ ONLY.
 * Authenticated admin screen only; no data writes, no disclosures of values,
 * credentials or addresses. Must be removed over verified FTPS after use.
 */
if (!defined('ABSPATH')) { exit; }
add_action('admin_menu', static function () {
    add_management_page('PSE template residue audit', 'PSE residue audit',
        'manage_options','pse-template-residue-audit','pse_template_residue_admin');
});
function pse_template_residue_table_exists(string $table): bool {
    global $wpdb;
    if (!preg_match('/^[a-zA-Z0-9_]+$/D',$table)) return false;
    $result=$wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s',$wpdb->esc_like($table)));
    return $result===$table;
}
function pse_template_residue_table_stats(string $name): array {
    global $wpdb;
    if (!pse_template_residue_table_exists($name)) return ['present'=>false];
    $columns=$wpdb->get_results("SHOW COLUMNS FROM \`{$name}\`",ARRAY_A);
    $strings=[];
    foreach ($columns as $row) {
        $col=(string)($row['Field']??'');
        $type=strtolower((string)($row['Type']??''));
        if (preg_match('/^[a-zA-Z0-9_]+$/D',$col) &&
            preg_match('/char|text|json|blob/i',$type)) $strings[]=$col;
    }
    $total=(int)$wpdb->get_var("SELECT COUNT(*) FROM \`{$name}\`");
    $legacy=0;
    if ($strings) {
        $patterns=['xuongmunonbaohiem','nghiencuukhoahoc','blue sea','eduresearch hub'];
        $predicates=[];
        $params=[];
        foreach ($strings as $col) {
            foreach ($patterns as $pattern) {
                $predicates[]="\`{$col}\` LIKE %s";
                $params[]='%'.$wpdb->esc_like($pattern).'%';
            }
        }
        $query=$wpdb->prepare("SELECT COUNT(*) FROM \`{$name}\` WHERE ".implode(' OR ',$predicates),$params);
        $legacy=(int)$wpdb->get_var($query);
    }
    return ['present'=>true,'total'=>$total,'legacy_rows'=>$legacy,'text_columns'=>count($strings)];
}
function pse_template_residue_old(string $value): int {
    preg_match_all('/xuongmunonbaohiem|nghiencuukhoahoc|blue\s*sea|eduresearch\s*hub/i',$value,$m);
    return count($m[0]);
}
function pse_template_residue_admin(): void {
    if (!current_user_can('manage_options')) wp_die('Forbidden');
    global $wpdb;
    $out=['readonly'=>true,'wp_admin_authenticated'=>true];
    try {
        $post=get_post(248);
        if (!$post || $post->post_type!=='page') throw new RuntimeException('Unexpected inherited page identity');
        $body=(string)$post->post_content;
        $css=(string)get_post_meta(248,'cssmore',true);
        $comments=[];
        preg_match_all('/\/\*[\s\S]*?\*\//',$css,$blocks);
        $commentMatches=0;
        foreach ($blocks[0] as $block) $commentMatches+=pse_template_residue_old($block);
        $out['page248']=[
            'status'=>$post->post_status,'title_legacy'=>pse_template_residue_old((string)$post->post_title),
            'body_legacy'=>pse_template_residue_old($body),
            'body_html_tags'=>preg_match_all('/<\s*[a-zA-Z][^>]*>/',$body),
            'body_structural_markers'=>preg_match_all('/<script|<style|<iframe|\[(?:tablepress|esc_table|shortcode)|<!-- wp:/i',$body),
            'css_legacy'=>pse_template_residue_old($css),
            'css_legacy_in_comment'=>$commentMatches,
            'css_legacy_in_url'=>preg_match_all('/url\s*\([^\)]*(?:xuongmunonbaohiem|nghiencuukhoahoc|blue[\s_-]*sea)[^\)]*\)/i',$css),
            'css_legacy_in_selectors'=>preg_match_all('/[^{}]*?(?:xuongmunonbaohiem|nghiencuukhoahoc|blue[\s_-]*sea)[^{}]*\{/i',$css),
            'css_length_band'=>strlen($css)<1000?'small':(strlen($css)<15000?'medium':'large')
        ];
        $oldMeta=[];
        $meta=get_post_meta(248);
        foreach ($meta as $key=>$values) {
            if (!preg_match('/^[a-zA-Z0-9_-]{1,80}$/D',(string)$key))continue;
            foreach ($values as $value) {
                if (is_string($value) && pse_template_residue_old($value)>0) {
                    $oldMeta[]=$key;
                    break;
                }
            }
        }
        $out['page248']['legacy_meta_keys']=array_values(array_unique($oldMeta));

        $out['knowledge']=pse_template_residue_table_stats('esc_agent_knowledge');
        $out['media_cleaner']=pse_template_residue_table_stats($wpdb->prefix.'mclean_refs');
        $out['yoast_indexable']=pse_template_residue_table_stats($wpdb->prefix.'yoast_indexable');
        $out['yoast_seo_links']=pse_template_residue_table_stats($wpdb->prefix.'yoast_seo_links');
        $out['agent_chat']=pse_template_residue_table_stats('esc_chat_histories');
        $out['nckh']=[];
        $names=$wpdb->get_col("SHOW TABLES");
        foreach ($names as $table) {
            if (preg_match('/^(?:'.preg_quote($wpdb->prefix,'/').')?nckh_[A-Za-z0-9_]+$/D',$table)) {
                $out['nckh'][]=['name'=>preg_replace('/^'.preg_quote($wpdb->prefix,'/').'/','',$table),
                                 'rows'=>(int)$wpdb->get_var("SELECT COUNT(*) FROM \`{$table}\`")];
            }
        }

        $out['options']=[];
        $keys=$wpdb->get_results($wpdb->prepare(
            "SELECT option_name, OCTET_LENGTH(option_value) AS size FROM {$wpdb->options}
            WHERE (option_value LIKE %s OR option_value LIKE %s OR option_value LIKE %s)
            AND option_name NOT LIKE %s AND option_name NOT LIKE %s LIMIT 100",
            '%'.$wpdb->esc_like('xuongmunonbaohiem').'%',
            '%'.$wpdb->esc_like('nghiencuukhoahoc').'%',
            '%'.$wpdb->esc_like('blue sea').'%',
            $wpdb->esc_like('_transient_').'%', $wpdb->esc_like('_site_transient_').'%'
        ),ARRAY_A);
        foreach ($keys as $item) {
            $name=(string)$item['option_name'];
            $group = (str_contains($name,'widget') || str_contains($name,'theme_mods'))?'THEME':
                (str_contains($name,'yoast') || str_contains($name,'seo'))?'SEO':
                (str_contains($name,'woocommerce'))?'WOOCOMMERCE':
                (str_contains($name,'agent')||str_contains($name,'esc_'))?'AGENT_OR_BUILDER':
                (str_contains($name,'nckh'))?'RESEARCH':'OTHER';
            $out['options'][]=['name'=>preg_match('/^[a-zA-Z0-9_-]{1,90}$/D',$name)?$name:'OTHER_KEY',
                'group'=>$group,'size_band'=>(int)$item['size']<1000?'small':'large'];
        }
        $out['revisions']=[
            'total'=>(int)$wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='revision'"),
            'old_brand'=>(int)$wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='revision'
                AND (post_content LIKE %s OR post_content LIKE %s OR post_content LIKE %s)",
                '%'.$wpdb->esc_like('xuongmunonbaohiem').'%',
                '%'.$wpdb->esc_like('nghiencuukhoahoc').'%',
                '%'.$wpdb->esc_like('blue sea').'%'
            ))
        ];
        $out['comments']=[
            'total'=>(int)$wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->comments}"),
            'old_source'=>(int)$wpdb->get_var($wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->comments} WHERE comment_content LIKE %s OR comment_author_url LIKE %s",
                '%'.$wpdb->esc_like('admin.esc.vn').'%',
                '%'.$wpdb->esc_like('admin.esc.vn').'%'
            ))
        ];
    } catch (Throwable $e) {
        $out=['readonly'=>true,'error_class'=>get_class($e),'completed'=>false];
    }
    echo '<div class="wrap"><h1>PSE residual DB classification (read-only)</h1>';
    echo '<pre id="pse-template-residue-json">'.esc_html(wp_json_encode($out)).'</pre></div>';
}
