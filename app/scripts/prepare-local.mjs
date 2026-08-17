import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const htmlPath = resolve(import.meta.dirname, "../mirror-assets/index.html");
const integrationAssets = [
  "kudora-chain.css",
  "kudora-chain.js",
  "kudora-enhancements.css",
  "kudora-enhancements.js",
  "kudora-reputation.css",
  "kudora-reputation.js",
].map((asset) => resolve(import.meta.dirname, `../mirror-assets/assets/${asset}`));
let html = await readFile(htmlPath, "utf8");
html = html
  .replace(/<script>\(function\(\)\{function c\(\).*?<\/script>/s, "")
  .replaceAll("/assets/kudora-enhancements-20260812-v3.css", "/assets/kudora-enhancements.css")
  .replaceAll("/assets/kudora-enhancements-20260812-v3.js", "/assets/kudora-enhancements.js")
  .replaceAll("/assets/kudora-reputation-20260812-v5.css", "/assets/kudora-reputation.css")
  .replaceAll("/assets/kudora-reputation-20260812-v5.js", "/assets/kudora-reputation.js");
if (!html.includes('id="_R_"')) {
  html = html.replace(
    '<script type="module" src="/assets/kudora-enhancements.js"></script>',
    '<script id="_R_">import("/assets/index-B6cVLMYm.js")</script><script type="module" src="/assets/kudora-enhancements.js"></script>',
  );
}
if (!html.includes("/assets/kudora-chain.js")) {
  html = html.replace(
    "</body>",
    '<script type="module" src="/assets/kudora-enhancements.js"></script><script type="module" src="/assets/kudora-reputation.js"></script><script type="module" src="/assets/kudora-chain.js"></script></body>',
  );
  await writeFile(htmlPath, html);
}
if (!html.includes("/assets/kudora-chain.css")) {
  html = html.replace("</head>", '<link rel="stylesheet" href="/assets/kudora-chain.css"></head>');
  await writeFile(htmlPath, html);
}
if (!html.includes("/assets/kudora-enhancements.css")) {
  html = html.replace("</head>", '<link rel="stylesheet" href="/assets/kudora-enhancements.css"><link rel="stylesheet" href="/assets/kudora-reputation.css"></head>');
}
const integrationHash = createHash("sha256");
for (const asset of integrationAssets) integrationHash.update(await readFile(asset));
const integrationVersion = integrationHash.digest("hex").slice(0, 12);
html = html.replace(
  /\/assets\/kudora-(?:chain|enhancements|reputation)\.(?:js|css)(?:\?v=[^"']*)?/g,
  (asset) => `${asset.split("?")[0]}?v=${integrationVersion}`,
);
await writeFile(htmlPath, html);
