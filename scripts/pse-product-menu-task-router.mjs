import { readFile } from "node:fs/promises";
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const subject = String(event.head_commit?.message || "").split("\n")[0];
if (subject === "cms(pse): synchronize Product SSR custom Header links") {
  await import("./pse-product-menu-ssr-sync.mjs");
} else {
  await import("./pse-product-menu-cutover.mjs");
}
