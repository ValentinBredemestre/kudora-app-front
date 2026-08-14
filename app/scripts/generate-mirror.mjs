import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

const textAssets = [
  ["/", "mirror-assets/index.html", "text/html; charset=utf-8"],
  ["/reputation", "mirror-assets/index.html", "text/html; charset=utf-8"],
  ["/assets/index-JFebml96.css", "mirror-assets/assets/index-JFebml96.css", "text/css; charset=utf-8"],
  ["/assets/kudora-enhancements-20260812-v3.css", "mirror-assets/assets/kudora-enhancements.css", "text/css; charset=utf-8"],
  ["/assets/kudora-enhancements.css", "mirror-assets/assets/kudora-enhancements.css", "text/css; charset=utf-8"],
  ["/assets/kudora-chain.css", "integration/chain.css", "text/css; charset=utf-8"],
  ["/assets/kudora-chain.js", "mirror-assets/assets/kudora-chain.js", "text/javascript; charset=utf-8"],
  ["/assets/kudora-enhancements-20260812-v3.js", "mirror-assets/assets/kudora-enhancements.js", "text/javascript; charset=utf-8"],
  ["/assets/kudora-enhancements.js", "mirror-assets/assets/kudora-enhancements.js", "text/javascript; charset=utf-8"],
  ["/assets/kudora-reputation-20260812-v5.css", "mirror-assets/assets/kudora-reputation.css", "text/css; charset=utf-8"],
  ["/assets/kudora-reputation.css", "mirror-assets/assets/kudora-reputation.css", "text/css; charset=utf-8"],
  ["/assets/kudora-reputation-20260812-v5.js", "mirror-assets/assets/kudora-reputation.js", "text/javascript; charset=utf-8"],
  ["/assets/kudora-reputation.js", "mirror-assets/assets/kudora-reputation.js", "text/javascript; charset=utf-8"],
  ["/assets/kudora-app-CXJMsy6R.js", "mirror-assets/assets/kudora-app-CXJMsy6R.js", "text/javascript; charset=utf-8"],
  ["/assets/index-B6cVLMYm.js", "mirror-assets/assets/index-B6cVLMYm.js", "text/javascript; charset=utf-8"],
  ["/assets/framework-CXnKph_e.js", "mirror-assets/assets/framework-CXnKph_e.js", "text/javascript; charset=utf-8"],
  ["/assets/layout-segment-context-DRRTjjCr.js", "mirror-assets/assets/layout-segment-context-DRRTjjCr.js", "text/javascript; charset=utf-8"],
  ["/assets/rolldown-runtime-S-ySWqyJ.js", "mirror-assets/assets/rolldown-runtime-S-ySWqyJ.js", "text/javascript; charset=utf-8"],
  ["/kudora-logo.svg", "mirror-assets/kudora-logo.svg", "image/svg+xml; charset=utf-8"],
];

const binaryAssets = [
  ["/kudora-manga-avatars.png", "mirror-assets/kudora-manga-avatars.png", "image/png"],
  ["/assets/_vinext_fonts/geist-8ac0455e797f/geist-ff2310f5.woff2", "mirror-assets/assets/_vinext_fonts/geist-8ac0455e797f/geist-ff2310f5.woff2", "font/woff2"],
  ["/assets/_vinext_fonts/geist-8ac0455e797f/geist-875ccdd4.woff2", "mirror-assets/assets/_vinext_fonts/geist-8ac0455e797f/geist-875ccdd4.woff2", "font/woff2"],
  ["/assets/_vinext_fonts/geist-8ac0455e797f/geist-52306abf.woff2", "mirror-assets/assets/_vinext_fonts/geist-8ac0455e797f/geist-52306abf.woff2", "font/woff2"],
  ["/assets/_vinext_fonts/geist-8ac0455e797f/geist-001175b1.woff2", "mirror-assets/assets/_vinext_fonts/geist-8ac0455e797f/geist-001175b1.woff2", "font/woff2"],
  ["/assets/_vinext_fonts/geist-8ac0455e797f/geist-98bbbccb.woff2", "mirror-assets/assets/_vinext_fonts/geist-8ac0455e797f/geist-98bbbccb.woff2", "font/woff2"],
  ["/assets/_vinext_fonts/geist-mono-00e989178794/geist-mono-f6b33328.woff2", "mirror-assets/assets/_vinext_fonts/geist-mono-00e989178794/geist-mono-f6b33328.woff2", "font/woff2"],
  ["/assets/_vinext_fonts/geist-mono-00e989178794/geist-mono-44e03052.woff2", "mirror-assets/assets/_vinext_fonts/geist-mono-00e989178794/geist-mono-44e03052.woff2", "font/woff2"],
  ["/assets/_vinext_fonts/geist-mono-00e989178794/geist-mono-0638449e.woff2", "mirror-assets/assets/_vinext_fonts/geist-mono-00e989178794/geist-mono-0638449e.woff2", "font/woff2"],
  ["/assets/_vinext_fonts/geist-mono-00e989178794/geist-mono-971fb274.woff2", "mirror-assets/assets/_vinext_fonts/geist-mono-00e989178794/geist-mono-971fb274.woff2", "font/woff2"],
  ["/assets/_vinext_fonts/geist-mono-00e989178794/geist-mono-44745446.woff2", "mirror-assets/assets/_vinext_fonts/geist-mono-00e989178794/geist-mono-44745446.woff2", "font/woff2"],
  ["/assets/_vinext_fonts/geist-mono-00e989178794/geist-mono-013b2f2f.woff2", "mirror-assets/assets/_vinext_fonts/geist-mono-00e989178794/geist-mono-013b2f2f.woff2", "font/woff2"],
];

const textEntries = [];
for (const [pathname, source, contentType] of textAssets) {
  let body = await readFile(resolve(root, source), "utf8");
  if (source === "mirror-assets/index.html") {
    body = body.replace(/<script>\(function\(\)\{function c\(\).*?<\/script>/s, "");
    if (!body.includes("/assets/kudora-enhancements.css")) body = body.replace("</head>", '<link rel="stylesheet" href="/assets/kudora-enhancements.css"><link rel="stylesheet" href="/assets/kudora-reputation.css"></head>');
    if (!body.includes("/assets/kudora-chain.css")) body = body.replace("</head>", '<link rel="stylesheet" href="/assets/kudora-chain.css"></head>');
    if (!body.includes("/assets/kudora-enhancements.js")) body = body.replace("</body>", '<script type="module" src="/assets/kudora-enhancements.js"></script><script type="module" src="/assets/kudora-reputation.js"></script></body>');
    if (!body.includes("/assets/kudora-chain.js")) body = body.replace("</body>", '<script type="module" src="/assets/kudora-chain.js"></script></body>');
  }
  textEntries.push([pathname, { body, contentType }]);
}

const binaryEntries = [];
for (const [pathname, source, contentType] of binaryAssets) {
  const body = await readFile(resolve(root, source));
  binaryEntries.push([pathname, { body: body.toString("base64"), contentType }]);
}

const output = `const textAssets = new Map(${JSON.stringify(textEntries)});
const binaryAssets = new Map(${JSON.stringify(binaryEntries)});

const commonHeaders = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
};

function decodeBase64(value) {
  const decoded = atob(value);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

export default {
  async fetch(request, env, ctx) {
    void env;
    void ctx;

    const url = new URL(request.url);
    const textAsset = textAssets.get(url.pathname);
    if (textAsset) {
      return new Response(request.method === "HEAD" ? null : textAsset.body, {
        status: 200,
        headers: {
          ...commonHeaders,
          "content-type": textAsset.contentType,
          "cache-control": url.pathname === "/" ? "no-cache" : "public, max-age=31536000, immutable",
        },
      });
    }

    const binaryAsset = binaryAssets.get(url.pathname);
    if (binaryAsset) {
      return new Response(request.method === "HEAD" ? null : decodeBase64(binaryAsset.body), {
        status: 200,
        headers: {
          ...commonHeaders,
          "content-type": binaryAsset.contentType,
          "cache-control": "public, max-age=31536000, immutable",
        },
      });
    }

    return new Response("Not found", {
      status: 404,
      headers: { ...commonHeaders, "content-type": "text/plain; charset=utf-8" },
    });
  },
};
`;

await writeFile(resolve(root, "worker/index.js"), output);
console.log(`Generated worker/index.js (${Buffer.byteLength(output).toLocaleString()} bytes)`);
