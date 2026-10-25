import {readFile} from "node:fs/promises";
const event=JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH,"utf8"));
const title=String(event.head_commit?.message||"").split("\n")[0];
if(title==="cms(pse): create WordPress news category SSR routes" ||
   title==="audit(pse): WordPress news category SSR route readiness"){
  await import("./pse-news-category-ssr-routes.mjs");
}else if(title==="cms(pse): link WordPress news Header categories to SSR" ||
         title==="audit(pse): inspect news Header taxonomy URLs"){
  await import("./pse-news-category-menu-sync.mjs");
}else{
  await import("./pse-news-archive-release.mjs");
}
