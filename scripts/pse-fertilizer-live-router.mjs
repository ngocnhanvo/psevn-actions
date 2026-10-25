import {readFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const title=String(event.head_commit?.message||"").split("\n")[0];
if(title==="test(pse): live NPK Product detail responsive and category Header") await import("./pse-product-detail-responsive-live-qa.mjs");
else if(title==="test(pse): read-only NPK Product detail DOM diagnostic") await import("./pse-product-detail-layout-diagnostic.mjs");
else if(title==="test(pse): live Product Header category active menu") await import("./pse-product-menu-active-live-qa.mjs");
else await import("./pse-fertilizer-live-qa.mjs");
