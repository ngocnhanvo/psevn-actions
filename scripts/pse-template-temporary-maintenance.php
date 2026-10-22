<?php
/**
 * Temporary PSE template cleanup. Installed only for an approved one-time
 * authenticated WP Admin task and removed immediately afterwards.
 *
 * This file is NOT a plugin template or permanent production component.
 */
if (!defined('ABSPATH')) { exit; }
add_action('admin_menu', function () {
    add_management_page('Template DB maintenance', 'Template DB maintenance', 'manage_options', 'pse-template-db-maintenance', 'pse_template_maintenance_page');
});
function pse_template_maintenance_table($suffix) {
    global $wpdb;
    $name=$wpdb->prefix.$suffix;
    if (!preg_match('/^[a-zA-Z0-9_]+$/D', $name)) { throw new RuntimeException('Invalid DB table identifier'); }
    $found=$wpdb->get_var($wpdb->prepare('SHOW TABLES LIKE %s', $wpdb->esc_like($name)));
    return $found===$name ? $name : null;
}
function pse_template_maintenance_counts() {
    global $wpdb;
    $summary=['wp_options_transients'=>0,'wp_options_previous_domain_other'=>0];
    $like1=$wpdb->esc_like('_transient_').'%';
    $like2=$wpdb->esc_like('_site_transient_').'%';
    $summary['wp_options_transients']=(int)$wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s",$like1,$like2
    ));
    $summary['wp_options_previous_domain_other']=(int)$wpdb->get_var($wpdb->prepare(
        "SELECT COUNT(*) FROM {$wpdb->options} WHERE option_value LIKE %s AND option_name NOT LIKE %s AND option_name NOT LIKE %s",
        '%'.$wpdb->esc_like('xuongmunonbaohiem').'%', $like1,$like2
    ));
    foreach (['esc_chat_histories','esc_chat_summaries','esc_agent_knowledge','esc_agent_logs','nckh_projects','nckh_notebook_entries'] as $suffix) {
        $table=pse_template_maintenance_table($suffix);
        $summary['table_'.$suffix]=$table ? (int)$wpdb->get_var("SELECT COUNT(*) FROM `{$table}`") : -1;
    }
    $types=$wpdb->get_results("SELECT post_type, COUNT(*) AS n FROM {$wpdb->posts} GROUP BY post_type",ARRAY_A);
    $counts=[];
    foreach ($types as $item) {
        $type=(string)$item['post_type'];
        if (preg_match('/^[A-Za-z0-9_-]{1,60}$/D',$type)) $counts[$type]=(int)$item['n'];
    }
    $summary['post_types']=$counts;
    return $summary;
}
function pse_template_maintenance_page() {
    if (!current_user_can('manage_options')) wp_die('Insufficient permissions');
    global $wpdb;
    $ran=false;
    if ($_SERVER['REQUEST_METHOD']==='POST' && isset($_POST['pse_template_purge'])) {
        check_admin_referer('pse_template_admin_maintenance');
        if ((string)($_POST['pse_template_purge']??'')!=='cache_and_chats') wp_die('Unexpected operation');
        // Site-specific cache is disposable; clearing transients is WordPress
        // standard behavior, without changing permanent settings or URLs.
        $like1=$wpdb->esc_like('_transient_').'%';
        $like2=$wpdb->esc_like('_site_transient_').'%';
        $deleted=$wpdb->query($wpdb->prepare(
            "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s OR option_name LIKE %s", $like1,$like2
        ));
        if ($deleted===false) wp_die('Transient cleanup failed');
        $purged=['transient_rows'=>(int)$deleted];
        foreach (['esc_chat_histories','esc_chat_summaries'] as $suffix) {
            $table=pse_template_maintenance_table($suffix);
            if ($table!==null) {
                $n=$wpdb->query("DELETE FROM `{$table}`");
                if ($n===false) wp_die('Chat cleanup failed');
                $purged[$suffix.'_rows']=(int)$n;
            }
        }
        $ran=true;
    }
    $summary=pse_template_maintenance_counts();
    echo '<div class="wrap"><h1>Temporary database cleanup</h1>';
    echo '<pre id="pse-template-maintenance-result">';
    echo esc_html(wp_json_encode(['executed'=>$ran,'counts'=>$summary],JSON_UNESCAPED_SLASHES));
    echo '</pre>';
    if (!$ran) {
        echo '<form method="post">';
        wp_nonce_field('pse_template_admin_maintenance');
        echo '<input type="hidden" name="pse_template_purge" value="cache_and_chats">';
        submit_button('Remove transient cache and historical chats only');
        echo '</form>';
    }
    echo '</div>';
}
