/** Route only explicit PSE no-build Product import, content parity, or excerpt formatting events. */
import { readFile } from "node:fs/promises";
const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, "utf8"));
const message = String(event.head_commit?.message || "").split("\n")[0];
if (message === "audit(pse): product excerpt lines dry-run" || /^cms\(pse\): format product excerpt lines batch [1-9][0-9]*$/.test(message)) {
  await import("./pse-product-excerpt-format.mjs");
} else if ((message === "audit(pse): product content parity dry-run" || message === "audit(pse): product content exceptional dry-run") || /^cms\(pse\): restore verified fertilizer descriptions batch [1-9][0-9]*$/.test(message)) {
  await import("./pse-product-description-repair.mjs");
} else {
  await import("./pse-product-batch.mjs");
}
