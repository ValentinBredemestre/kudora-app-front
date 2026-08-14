import { expect, test } from "@playwright/test";
import { bech32 } from "@scure/base";

const REST = process.env.KUDORA_REST_URL || "http://host.docker.internal:1317";
const EVM = process.env.KUDORA_EVM_RPC_URL || "http://host.docker.internal:8545";
const FRONTEND = process.env.KUDORA_FRONTEND_URL || "http://host.docker.internal:3000";
const KUD = 10n ** 18n;

async function json(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${url}: ${JSON.stringify(body)}`);
  return body;
}

async function config() {
  return json(`${FRONTEND}/kudora-local-config.json`);
}

async function bankBalance(address) {
  const body = await json(`${REST}/cosmos/bank/v1beta1/balances/${address}/by_denom?denom=akud`);
  return BigInt(body.balance?.amount || 0);
}

async function proposals() {
  return (await json(`${REST}/cosmos/gov/v1/proposals?pagination.limit=100`)).proposals || [];
}

async function discussionMessages(proposalId) {
  return (await json(`${REST}/kudora/discussion/v1/messages/${proposalId}?pagination.limit=100`)).messages || [];
}

async function reactions(proposalId, messageId) {
  return (await json(`${REST}/kudora/discussion/v1/reactions/${proposalId}/${messageId}?pagination.limit=100`)).reactions || [];
}

async function rpc(method, params) {
  const body = await json(EVM, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (body.error) throw new Error(JSON.stringify(body.error));
  return body.result;
}

async function tokenBalance(token, address) {
  const data = `0x70a08231${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  return BigInt(await rpc("eth_call", [{ to: token, data }, "latest"]));
}

async function chooseWallet(page, mode, account) {
  await page.getByRole("button", { name: mode, exact: true }).click();
  await expect(page.getByTestId("transaction-status")).toHaveAttribute("data-state", "confirmed");
  if (account) {
    await page.getByTestId("account-select").selectOption(account);
    await expect(page.getByTestId("transaction-status")).toHaveAttribute("data-state", "confirmed");
  }
}

async function waitConfirmed(page) {
  await expect(page.getByTestId("transaction-status")).toHaveAttribute("data-state", "confirmed", { timeout: 90_000 });
  await expect(page.getByTestId("transaction-hash")).toBeVisible();
}

test("real Kudora business flows share one three-validator chain", async ({ page }) => {
  const local = await config();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await test.step("unified local MetaMask and Keplr account", async () => {
    await page.goto("/");
    await expect(page.getByTestId("chain-app")).toBeVisible();
    await expect(page.getByTestId("transaction-status")).toHaveAttribute("data-state", "confirmed");
    const evmAddress = await page.getByTestId("evm-address").textContent();
    const cosmosAddress = await page.getByTestId("cosmos-address").textContent();
    const decoded = Uint8Array.from(bech32.fromWords(bech32.decode(cosmosAddress, false).words));
    expect(`0x${Buffer.from(decoded).toString("hex")}`.toLowerCase()).toBe(evmAddress.toLowerCase());
    const metaBalance = await page.getByTestId("kud-balance").textContent();
    await chooseWallet(page, "Local Keplr");
    await expect(page.getByTestId("kud-balance")).toHaveText(metaBalance);
    expect(await bankBalance(cosmosAddress)).toBeGreaterThan(0n);
  });

  await test.step("MetaMask sends native KUD and chain confirms balances", async () => {
    await chooseWallet(page, "Local MetaMask", "alice");
    const uiBalanceBefore = await page.getByTestId("kud-balance").textContent();
    const aliceBefore = await bankBalance(local.accounts.alice.cosmosAddress);
    const bobBefore = await bankBalance(local.accounts.bob.cosmosAddress);
    const form = page.locator('form[data-form="send"]');
    await form.locator('[name="recipient"]').fill(local.accounts.bob.evmAddress);
    await form.locator('[name="amount"]').fill("0.1");
    await form.getByRole("button", { name: /Send real KUD/ }).click();
    await waitConfirmed(page);
    const aliceAfter = await bankBalance(local.accounts.alice.cosmosAddress);
    const bobAfter = await bankBalance(local.accounts.bob.cosmosAddress);
    expect(bobAfter - bobBefore).toBe(KUD / 10n);
    expect(aliceAfter).toBeLessThan(aliceBefore - KUD / 10n);
    await expect(page.getByTestId("kud-balance")).not.toHaveText(uiBalanceBefore);
  });

  await test.step("Keplr sends native Cosmos KUD", async () => {
    await chooseWallet(page, "Local Keplr", "bob");
    const uiBalanceBefore = await page.getByTestId("kud-balance").textContent();
    const bobBefore = await bankBalance(local.accounts.bob.cosmosAddress);
    const carolBefore = await bankBalance(local.accounts.carol.cosmosAddress);
    const form = page.locator('form[data-form="send"]');
    await form.locator('[name="recipient"]').fill(local.accounts.carol.cosmosAddress);
    await form.locator('[name="amount"]').fill("0.1");
    await form.getByRole("button", { name: /Send real KUD/ }).click();
    await waitConfirmed(page);
    expect(await bankBalance(local.accounts.carol.cosmosAddress) - carolBefore).toBe(KUD / 10n);
    expect(await bankBalance(local.accounts.bob.cosmosAddress)).toBeLessThan(bobBefore - KUD / 10n);
    await expect(page.getByTestId("kud-balance")).not.toHaveText(uiBalanceBefore);
  });

  let metaProposalId;
  await test.step("MetaMask creates x/gov proposal; Keplr vote is native", async () => {
    await chooseWallet(page, "Local MetaMask", "alice");
    await page.getByRole("button", { name: "Governance", exact: true }).click();
    const title = `MetaMask proposal ${Date.now()}`;
    const form = page.locator('form[data-form="proposal"]');
    await form.locator('[name="title"]').fill(title);
    await form.getByRole("button", { name: /Submit through Gov precompile/ }).click();
    await waitConfirmed(page);
    const proposal = (await proposals()).find((item) => item.title === title);
    expect(proposal).toBeTruthy();
    expect(JSON.parse(proposal.metadata)).toMatchObject({ v: 1, context: expect.any(String), changes: [expect.any(String)], outcome: expect.any(String) });
    metaProposalId = String(proposal.id);
    await chooseWallet(page, "Local Keplr", "bob");
    await page.getByTestId(`proposal-${metaProposalId}`).getByRole("button", { name: "Yes", exact: true }).click();
    await waitConfirmed(page);
    const vote = await json(`${REST}/cosmos/gov/v1/proposals/${metaProposalId}/votes/${local.accounts.bob.cosmosAddress}`);
    expect(vote.vote.voter).toBe(local.accounts.bob.cosmosAddress);
    expect(vote.vote.options[0].option).toBe("VOTE_OPTION_YES");
  });

  await test.step("Keplr creates x/gov proposal; MetaMask vote reaches same x/gov", async () => {
    await chooseWallet(page, "Local Keplr", "carol");
    const title = `Keplr proposal ${Date.now()}`;
    const form = page.locator('form[data-form="proposal"]');
    await form.locator('[name="title"]').fill(title);
    await form.getByRole("button", { name: /Submit through Keplr/ }).click();
    await waitConfirmed(page);
    const proposal = (await proposals()).find((item) => item.title === title);
    expect(proposal).toBeTruthy();
    await chooseWallet(page, "Local MetaMask", "alice");
    await page.getByTestId(`proposal-${proposal.id}`).getByRole("button", { name: "No", exact: true }).click();
    await waitConfirmed(page);
    const vote = await json(`${REST}/cosmos/gov/v1/proposals/${proposal.id}/votes/${local.accounts.alice.cosmosAddress}`);
    expect(vote.vote.options[0].option).toBe("VOTE_OPTION_NO");
  });

  let rootMessageId;
  let replyMessageId;
  await test.step("Keplr post and MetaMask reply share x/discussion", async () => {
    await chooseWallet(page, "Local Keplr", "alice");
    await page.getByTestId(`proposal-${metaProposalId}`).getByRole("button", { name: "Discuss this proposal", exact: true }).click();
    const rootText = `Native Keplr comment ${Date.now()}`;
    const form = page.locator('form[data-form="discussion"]');
    await form.locator('[name="quick"]').uncheck();
    await form.locator('[name="text"]').fill(rootText);
    await form.getByRole("button", { name: /Publish on-chain/ }).click();
    await waitConfirmed(page);
    const root = (await discussionMessages(metaProposalId)).find((message) => JSON.parse(Buffer.from(message.content, "base64").toString()).text === rootText);
    expect(root).toBeTruthy();
    rootMessageId = String(root.message_id);
    await chooseWallet(page, "Local MetaMask", "bob");
    await page.getByTestId(`message-${rootMessageId}`).getByRole("button", { name: "Reply", exact: true }).click();
    const replyText = `EVM precompile reply ${Date.now()}`;
    await page.locator('form[data-form="discussion"] [name="quick"]').uncheck();
    await page.locator('form[data-form="discussion"] [name="text"]').fill(replyText);
    await page.locator('form[data-form="discussion"]').getByRole("button", { name: /Publish on-chain/ }).click();
    await waitConfirmed(page);
    const reply = (await discussionMessages(metaProposalId)).find((message) => JSON.parse(Buffer.from(message.content, "base64").toString()).text === replyText);
    expect(String(reply.parent_id)).toBe(rootMessageId);
    replyMessageId = String(reply.message_id);
    await chooseWallet(page, "Local Keplr", "alice");
    await expect(page.getByTestId(`message-${replyMessageId}`)).toContainText(replyText);
  });

  await test.step("Useful, Not useful and removal keep one canonical reaction", async () => {
    await chooseWallet(page, "Local MetaMask", "bob");
    const card = page.getByTestId(`message-${rootMessageId}`);
    await card.getByRole("button", { name: /Useful/ }).click();
    await waitConfirmed(page);
    expect((await reactions(metaProposalId, rootMessageId))).toHaveLength(1);
    await page.getByTestId(`message-${rootMessageId}`).getByRole("button", { name: /Not useful/ }).click();
    await waitConfirmed(page);
    let current = await reactions(metaProposalId, rootMessageId);
    expect(current).toHaveLength(1);
    expect(current[0].reaction).toBe("REACTION_NOT_USEFUL");
    await page.getByTestId(`message-${rootMessageId}`).getByRole("button", { name: "Remove reaction" }).click();
    await waitConfirmed(page);
    expect(await reactions(metaProposalId, rootMessageId)).toHaveLength(0);
  });

  await test.step("quick session posts as owner, reacts, revokes and is rejected", async () => {
    await chooseWallet(page, "Local MetaMask", "alice");
    await page.locator('[data-chain-tab="discussion"]').click();
    await page.getByRole("button", { name: /Enable once/ }).click();
    await waitConfirmed(page);
    const sessionKey = await page.evaluate(() => sessionStorage.getItem("kudora-session-key"));
    expect(sessionKey).toMatch(/^0x[0-9a-f]{64}$/);
    const sessionAddress = await page.evaluate(() => window.KudoraChain.sessionAccount().then((account) => account.address));
    const sessionState = await json(`${REST}/kudora/discussion/v1/sessions/${sessionAddress}`);
    const ownerHex = `0x${Buffer.from(sessionState.session.owner, "base64").toString("hex")}`;
    expect(ownerHex.toLowerCase()).toBe(local.accounts.alice.evmAddress.toLowerCase());
    expect(await bankBalance(local.accounts.alice.cosmosAddress)).toBeGreaterThan(0n);
    const sessionCosmos = bech32.encode("kudo", bech32.toWords(Buffer.from(sessionAddress.slice(2), "hex")), false);
    expect(await bankBalance(sessionCosmos)).toBeGreaterThan(0n);

    const quickText = `Quick session post ${Date.now()}`;
    const form = page.locator('form[data-form="discussion"]');
    await form.locator('[name="quick"]').check();
    await form.locator('[name="text"]').fill(quickText);
    await form.getByRole("button", { name: /Publish on-chain/ }).click();
    await waitConfirmed(page);
    const quick = (await discussionMessages(metaProposalId)).find((message) => JSON.parse(Buffer.from(message.content, "base64").toString()).text === quickText);
    expect(`0x${Buffer.from(quick.author, "base64").toString("hex")}`.toLowerCase()).toBe(local.accounts.alice.evmAddress.toLowerCase());
    await page.getByTestId(`message-${quick.message_id}`).getByRole("button", { name: "Reply", exact: true }).click();
    const quickReplyText = `Quick session reply ${Date.now()}`;
    await page.locator('form[data-form="discussion"] [name="text"]').fill(quickReplyText);
    await page.locator('form[data-form="discussion"]').getByRole("button", { name: /Publish on-chain/ }).click();
    await waitConfirmed(page);
    const quickReply = (await discussionMessages(metaProposalId)).find((message) => JSON.parse(Buffer.from(message.content, "base64").toString()).text === quickReplyText);
    expect(String(quickReply.parent_id)).toBe(String(quick.message_id));
    expect(`0x${Buffer.from(quickReply.author, "base64").toString("hex")}`.toLowerCase()).toBe(local.accounts.alice.evmAddress.toLowerCase());
    await page.getByTestId(`message-${replyMessageId}`).getByRole("button", { name: /Useful/ }).click();
    await waitConfirmed(page);
    expect(await reactions(metaProposalId, replyMessageId)).toHaveLength(1);
    await page.getByRole("button", { name: "Revoke", exact: true }).click();
    await waitConfirmed(page);
    const revoked = await fetch(`${REST}/kudora/discussion/v1/sessions/${sessionAddress}`);
    expect(revoked.status).toBe(404);
    await page.evaluate((key) => sessionStorage.setItem("kudora-session-key", key), sessionKey);
    await page.locator('form[data-form="discussion"] [name="quick"]').check();
    await page.locator('form[data-form="discussion"] [name="text"]').fill("This expired authorization must fail");
    await page.locator('form[data-form="discussion"]').getByRole("button", { name: /Publish on-chain/ }).click();
    await expect(page.getByTestId("transaction-status")).toHaveAttribute("data-state", "failed");
    await page.evaluate(() => sessionStorage.removeItem("kudora-session-key"));
  });

  await test.step("Zap transfers exact KUD to author through primary wallet", async () => {
    await chooseWallet(page, "Local MetaMask", "alice");
    await page.locator('[data-chain-tab="discussion"]').click();
    const aliceBefore = await bankBalance(local.accounts.alice.cosmosAddress);
    const bobBefore = await bankBalance(local.accounts.bob.cosmosAddress);
    await page.getByTestId(`message-${replyMessageId}`).getByRole("button", { name: /Zap 0.01/ }).click();
    await waitConfirmed(page);
    expect(await bankBalance(local.accounts.bob.cosmosAddress) - bobBefore).toBe(KUD / 100n);
    expect(await bankBalance(local.accounts.alice.cosmosAddress)).toBeLessThan(aliceBefore - KUD / 100n);
  });

  await test.step("real local swap updates EVM token balances for both wallet paths", async () => {
    await chooseWallet(page, "Local MetaMask", "alice");
    await page.getByRole("button", { name: "KUD", exact: true }).click();
    const before = await tokenBalance(local.swap.mockUsdcAddress, local.accounts.alice.evmAddress);
    const kudBefore = await bankBalance(local.accounts.alice.cosmosAddress);
    const uiTokenBefore = await page.getByTestId("usdc-balance").textContent();
    await page.getByRole("button", { name: "Swap", exact: true }).click();
    await page.locator('form[data-form="swap"] [name="amount"]').fill("0.1");
    await page.locator('form[data-form="swap"]').getByRole("button", { name: /Execute real swap/ }).click();
    await waitConfirmed(page);
    expect(await tokenBalance(local.swap.mockUsdcAddress, local.accounts.alice.evmAddress)).toBeGreaterThan(before);
    expect(await bankBalance(local.accounts.alice.cosmosAddress)).toBeLessThan(kudBefore - KUD / 10n);
    await page.getByRole("button", { name: "KUD", exact: true }).click();
    await expect(page.getByTestId("usdc-balance")).not.toHaveText(uiTokenBefore);
    await chooseWallet(page, "Local Keplr", "bob");
    await page.getByRole("button", { name: "Swap", exact: true }).click();
    const bobTokenBefore = await tokenBalance(local.swap.mockUsdcAddress, local.accounts.bob.evmAddress);
    await page.locator('form[data-form="swap"] [name="amount"]').fill("0.1");
    await page.locator('form[data-form="swap"]').getByRole("button", { name: /Execute real swap/ }).click();
    await waitConfirmed(page);
    expect(await tokenBalance(local.swap.mockUsdcAddress, local.accounts.bob.evmAddress)).toBeGreaterThan(bobTokenBefore);
  });

  expect(errors.filter((error) => !/favicon|Failed to load resource.*404/.test(error))).toEqual([]);
});
