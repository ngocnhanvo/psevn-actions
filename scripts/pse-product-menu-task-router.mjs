import { readFile } from "node:fs/promises";
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const subject = String(event.head_commit?.message || "").split("\n")[0];
if (subject === "audit(pse): inspect native NPK Product fixed table" ||
    subject === "cms(pse): correct genuine NPK Product fixed description table") {
  await import("./pse-product-detail-cms-table-fix.mjs");
} else if (subject === "cms(pse): synchronize Product SSR custom Header links") {
  await import("./pse-product-menu-ssr-sync.mjs");
} else {
  await import("./pse-product-menu-cutover.mjs");
}
