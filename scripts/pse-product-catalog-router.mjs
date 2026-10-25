/** Route only explicit WordPress Product category SSR cutovers; preserve original native Page importer. */
import { readFile } from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const message=String(event.head_commit?.message||"").split("\n")[0];
if (message==="audit(pse): product category SSR cutover" ||
    message==="cms(pse): enable WordPress Product category SSR routes") {
  await import("./pse-product-ssr-cutover.mjs");
} else {
  await import("./pse-product-catalog-page.mjs");
}
