import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const htmlPath = resolve(import.meta.dirname, "../mirror-assets/index.html");
let html = await readFile(htmlPath, "utf8");
html = html
  .replace(/<script>\(function\(\)\{function c\(\).*?<\/script>/s, "")
  .replace(/<script id="_R_">.*?<\/script>/s, "")
  .replaceAll("/assets/kudora-enhancements-20260812-v3.css", "/assets/kudora-enhancements.css")
  .replaceAll("/assets/kudora-enhancements-20260812-v3.js", "/assets/kudora-enhancements.js")
  .replaceAll("/assets/kudora-reputation-20260812-v5.css", "/assets/kudora-reputation.css")
  .replaceAll("/assets/kudora-reputation-20260812-v5.js", "/assets/kudora-reputation.js");
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
await writeFile(htmlPath, html);
