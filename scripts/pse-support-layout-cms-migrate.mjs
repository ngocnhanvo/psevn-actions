/**
 * Retired (2026-10-26): ESC Table CSS may not be written into ACF cssmore.
 * Historical legacy CSS files remain read-only reference assets for rollback.
 * The permitted styles live in native Astro Tailwind components; editable
 * WordPress HTML alone may use cssmore. Do not resurrect this writer.
 */
const mode=String(process.env.PSE_SUPPORT_LAYOUT_MODE||'dry');
if(mode!=='dry'){
  throw Error('ESC Table-to-cssmore publication is retired by the approved CSS ownership rule.');
}
console.log('PSE_SUPPORT_LAYOUT_CMS=RETIRED_READ_ONLY_PASS; cssmore_for_Editor_only=true; astro_tailwind_for_ESC=true; no_write=true; no_build=true');
