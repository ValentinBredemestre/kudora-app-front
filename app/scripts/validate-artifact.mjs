import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const workerPath = resolve(projectRoot, "dist/server/index.js");
const manifestPath = resolve(projectRoot, "dist/.openai/hosting.json");

const [source, manifest] = await Promise.all([
  readFile(workerPath, "utf8"),
  readFile(manifestPath, "utf8"),
]);
JSON.parse(manifest);

// A data URL forces ESM parsing even though the generated output has no package.json.
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const workerModule = await import(moduleUrl);
assert.equal(
  typeof workerModule.default?.fetch,
  "function",
  `${pathToFileURL(workerPath)} must export default.fetch`,
);

const rootResponse = await workerModule.default.fetch(
  new Request("https://kudora.test/"),
  {},
  {},
);
assert.equal(rootResponse.status, 200);
const rootHtml = await rootResponse.text();
assert.match(rootHtml, /kudora-chain\.css/);
assert.match(rootHtml, /kudora-chain\.js/);
assert.match(rootHtml, /kudora-enhancements\.css/);
assert.match(rootHtml, /kudora-enhancements\.js/);
assert.match(rootHtml, /id="_R_"/);
assert.doesNotMatch(rootHtml, /cdn-cgi/);

for (const [pathname, contentType] of [
  ["/assets/kudora-chain.css", "text/css; charset=utf-8"],
  ["/assets/kudora-chain.js", "text/javascript; charset=utf-8"],
  ["/assets/kudora-enhancements.css", "text/css; charset=utf-8"],
  ["/assets/kudora-enhancements.js", "text/javascript; charset=utf-8"],
  ["/assets/kudora-reputation.css", "text/css; charset=utf-8"],
  ["/assets/kudora-reputation.js", "text/javascript; charset=utf-8"],
  ["/kudora-manga-avatars.png", "image/png"],
]) {
  const response = await workerModule.default.fetch(
    new Request(`https://kudora.test${pathname}`),
    {},
    {},
  );
  assert.equal(response.status, 200, `${pathname} must be served`);
  assert.equal(response.headers.get("content-type"), contentType);
  assert.ok((await response.arrayBuffer()).byteLength > 0, `${pathname} must not be empty`);
}

const reputationResponse = await workerModule.default.fetch(new Request("https://kudora.test/reputation"), {}, {});
assert.equal(reputationResponse.status, 200, "/reputation must support direct visits");
assert.match(await reputationResponse.text(), /kudora-reputation\.js/);

for (const pathname of ["/kudora-local-config.json", "/kudora-local-wallets.json"]) {
  const response = await workerModule.default.fetch(new Request(`https://kudora.test${pathname}`), {}, {});
  assert.equal(response.status, 404, `${pathname} must not be packaged for production`);
}

console.log("Artifact is valid ESM and exports default.fetch");
