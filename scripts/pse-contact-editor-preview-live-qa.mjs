/**
 * Read-only regression: verify three native ESC Insert Code image previews in
 * WordPress Classic Editor after Save -> Reload, and reject an extra preview UI.
 * Canonical implementation is shared with the guarded native CMS repair script.
 * This workflow must never write WordPress content or trigger Astro build.
 */
process.env.PSE_CONTACT_WRAPPER_APPLY = 'false';
await import('./pse-contact-editor-wrapper-repair.mjs');
