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

const config = () => json(`${FRONTEND}/kudora-local-config.json`);

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

async function delegation(delegator, validator) {
  const response = await fetch(`${REST}/cosmos/staking/v1beta1/validators/${validator}/delegations/${delegator}`);
  if (response.status === 404) return 0n;
  const body = await response.json();
  if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`);
  return BigInt(body.delegation_response?.balance?.amount || 0);
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

function messageText(message) {
  return JSON.parse(Buffer.from(message.content, "base64").toString()).text;
}

async function openApp(page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator(".brand")).toContainText("KUDORA");
  await expect(page.locator(".desktop-nav")).toContainText("Choose");
  await expect(page.locator(".desktop-nav")).toContainText("Vote");
  await expect(page.locator(".desktop-nav")).toContainText("Reputation");
  await expect.poll(() => page.evaluate(() => Boolean(window.KudoraChain))).toBe(true);
}

async function navigate(page, label) {
  await page.locator(".desktop-nav > button").filter({ hasText: label }).click();
}

async function connect(page, family, accountName = "alice") {
  await page.getByRole("button", { name: /Connect wallet/i }).click();
  const panel = page.locator(".k-side-panel").last();
  await panel.getByRole("button", { name: new RegExp(`^${family}`) }).click();
  const expectedMode = `local-${family.toLowerCase()}`;
  await expect.poll(() => page.evaluate(() => window.KudoraChain.walletMode)).toBe(expectedMode);

  if (accountName !== "alice") {
    await page.evaluate(({ mode, name }) => window.KudoraChainBridge.connect(mode, name), {
      mode: expectedMode,
      name: accountName,
    });
    await expect.poll(() => page.evaluate(() => window.KudoraChain.accountName)).toBe(accountName);
  }
}

async function freshWallet(page, family, accountName = "alice") {
  await openApp(page);
  await connect(page, family, accountName);
}

async function performTransaction(page, action) {
  const before = await page.getByTestId("transaction-hash").textContent().catch(() => "");
  await action();
  const hash = await expect.poll(async () => {
    return page.evaluate((previous) => {
      const status = document.querySelector('[data-testid="transaction-status"]');
      const current = document.querySelector('[data-testid="transaction-hash"]')?.textContent || "";
      return status?.dataset.state === "confirmed" && current && current !== previous ? current : "";
    }, before);
  }, { timeout: 90_000 }).not.toBe("");
  await expect(page.getByTestId("transaction-status")).toHaveAttribute("data-state", "confirmed");
  return hash;
}

async function publishProposal(page, title) {
  await navigate(page, "Vote");
  await page.getByRole("button", { name: /Propose something/i }).click();
  const panel = page.locator('[role="dialog"]').last();
  await panel.getByRole("button", { name: /Change a rule/i }).click();
  const form = page.locator("form.proposal-form");
  await expect(form).toBeVisible();
  await form.locator("input").nth(0).fill("Community participation");
  await form.locator("input").nth(1).fill(title);
  await form.locator("textarea").nth(0).fill("The current participation rule is not clear enough for every member.");
  await form.locator("textarea").nth(1).fill("If approved, publish one clear rule and one public checkpoint.");
  await performTransaction(page, () => form.locator('button[type="submit"]').click());
  return expect.poll(async () => (await proposals()).find((proposal) => proposal.title === title) || null).not.toBeNull();
}

async function openProposal(page, proposalId) {
  await navigate(page, "Vote");
  const row = page.getByTestId(`proposal-${proposalId}`);
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByTestId(`proposal-detail-${proposalId}`)).toBeVisible();
}

async function openDiscussion(page, proposalId) {
  await openProposal(page, proposalId);
  await page.getByTestId(`discussion-proposal-${proposalId}`).click();
  await expect(page.getByTestId("discussion-form")).toBeVisible();
}

test("the canonical Kudora UI drives real EVM and Cosmos business flows", async ({ page }) => {
  const local = await config();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await test.step("the supplied product design is intact and one wallet has both tags", async () => {
    await freshWallet(page, "MetaMask");
    await navigate(page, "Account");
    await expect(page.locator("body")).toContainText("Everything in one place.");
    await expect(page.getByText("Local MetaMask", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Local Keplr", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Open connected account" }).click();
    const evmAddress = await page.getByTestId("evm-address").textContent();
    const cosmosAddress = await page.getByTestId("cosmos-address").textContent();
    const decoded = Uint8Array.from(bech32.fromWords(bech32.decode(cosmosAddress, false).words));
    expect(`0x${Buffer.from(decoded).toString("hex")}`.toLowerCase()).toBe(evmAddress.toLowerCase());
    expect(await bankBalance(cosmosAddress)).toBeGreaterThan(0n);
  });

  await test.step("MetaMask delegates real KUD to one of the three bonded validators", async () => {
    await freshWallet(page, "MetaMask", "alice");
    const validator = local.validators[0].operatorAddress;
    const before = await delegation(local.accounts.alice.cosmosAddress, validator);
    const row = page.locator(`.validator-row[data-chain-validator="${validator}"]`);
    await expect(row).toBeVisible();
    await row.locator("button").click();
    const form = page.locator("[data-chain-delegate-form]");
    await form.locator("input[name='amount']").fill("0.01");
    await performTransaction(page, () => form.locator("button[type='submit']").click());
    expect(await delegation(local.accounts.alice.cosmosAddress, validator) - before).toBe(KUD / 100n);
  });

  await test.step("MetaMask sends native KUD from the original Send money panel", async () => {
    await freshWallet(page, "MetaMask", "alice");
    await navigate(page, "Account");
    const aliceBefore = await bankBalance(local.accounts.alice.cosmosAddress);
    const bobBefore = await bankBalance(local.accounts.bob.cosmosAddress);
    const visibleBalance = await page.getByTestId("kud-balance").textContent();
    await page.getByRole("button", { name: /Send money/i }).click();
    const form = page.locator('form[data-money-form="send"]');
    await form.locator('[name="recipient"]').fill(local.accounts.bob.evmAddress);
    await form.locator('[name="amount"]').fill("0.1");
    await performTransaction(page, () => form.locator('button[type="submit"]').click());
    expect(await bankBalance(local.accounts.bob.cosmosAddress) - bobBefore).toBe(KUD / 10n);
    expect(await bankBalance(local.accounts.alice.cosmosAddress)).toBeLessThan(aliceBefore - KUD / 10n);
    await expect(page.getByTestId("kud-balance")).not.toHaveText(visibleBalance);
  });

  await test.step("Keplr sends native KUD from the same product panel", async () => {
    await freshWallet(page, "Keplr", "bob");
    await navigate(page, "Account");
    const carolBefore = await bankBalance(local.accounts.carol.cosmosAddress);
    await page.getByRole("button", { name: /Send money/i }).click();
    const form = page.locator('form[data-money-form="send"]');
    await form.locator('[name="recipient"]').fill(local.accounts.carol.cosmosAddress);
    await form.locator('[name="amount"]').fill("0.1");
    await performTransaction(page, () => form.locator('button[type="submit"]').click());
    expect(await bankBalance(local.accounts.carol.cosmosAddress) - carolBefore).toBe(KUD / 10n);
  });

  let evmProposal;
  await test.step("the original proposal builder publishes through the EVM gov precompile", async () => {
    await freshWallet(page, "MetaMask", "alice");
    const title = `MetaMask proposal ${Date.now()}`;
    await publishProposal(page, title);
    evmProposal = (await proposals()).find((proposal) => proposal.title === title);
    expect(evmProposal).toBeTruthy();
    expect(evmProposal.status).toBe("PROPOSAL_STATUS_VOTING_PERIOD");
    expect(JSON.parse(evmProposal.metadata)).toMatchObject({
      v: 1,
      context: expect.any(String),
      changes: [expect.any(String)],
      outcome: expect.any(String),
    });
  });

  await test.step("the original vote panel records a native Keplr vote", async () => {
    await freshWallet(page, "Keplr", "bob");
    await openProposal(page, evmProposal.id);
    await page.getByTestId(`vote-proposal-${evmProposal.id}`).click();
    const form = page.locator("form.vote-action-form");
    await expect(form).toBeVisible();
    await form.getByRole("button", { name: /Yes\s+I agree/i }).click();
    await performTransaction(page, () => form.locator('button[type="submit"]').click());
    const vote = await json(`${REST}/cosmos/gov/v1/proposals/${evmProposal.id}/votes/${local.accounts.bob.cosmosAddress}`);
    expect(vote.vote.options[0].option).toBe("VOTE_OPTION_YES");
  });

  await test.step("Keplr publishes and MetaMask votes through the same x/gov", async () => {
    await freshWallet(page, "Keplr", "carol");
    const title = `Keplr proposal ${Date.now()}`;
    await publishProposal(page, title);
    const proposal = (await proposals()).find((item) => item.title === title);
    expect(proposal).toBeTruthy();
    await freshWallet(page, "MetaMask", "alice");
    await openProposal(page, proposal.id);
    await page.getByTestId(`vote-proposal-${proposal.id}`).click();
    const form = page.locator("form.vote-action-form");
    await expect(form).toBeVisible();
    await form.getByRole("button", { name: /No\s+I disagree/i }).click();
    await performTransaction(page, () => form.locator('button[type="submit"]').click());
    const vote = await json(`${REST}/cosmos/gov/v1/proposals/${proposal.id}/votes/${local.accounts.alice.cosmosAddress}`);
    expect(vote.vote.options[0].option).toBe("VOTE_OPTION_NO");
  });

  let rootMessage;
  let replyMessage;
  await test.step("real comments and replies use the original discussion panel", async () => {
    await freshWallet(page, "Keplr", "alice");
    await openDiscussion(page, evmProposal.id);
    const rootText = `Native Keplr comment ${Date.now()}`;
    let form = page.getByTestId("discussion-form");
    await form.locator("textarea").first().fill(rootText);
    await performTransaction(page, () => form.locator('button[type="submit"]').click());
    rootMessage = (await discussionMessages(evmProposal.id)).find((message) => messageText(message) === rootText);
    expect(rootMessage).toBeTruthy();

    await freshWallet(page, "MetaMask", "bob");
    await openDiscussion(page, evmProposal.id);
    const rootCard = page.getByTestId(`message-${rootMessage.message_id}`);
    await rootCard.getByRole("button", { name: /Reply/i }).click();
    const replyText = `EVM precompile reply ${Date.now()}`;
    form = page.getByTestId("discussion-form");
    await expect(form).toContainText(`Replying to message #${rootMessage.message_id}`);
    await form.locator("textarea").first().fill(replyText);
    await performTransaction(page, () => form.locator('button[type="submit"]').click());
    replyMessage = (await discussionMessages(evmProposal.id)).find((message) => messageText(message) === replyText);
    expect(String(replyMessage.parent_id)).toBe(String(rootMessage.message_id));
  });

  await test.step("the Discuss page contains only on-chain conversations", async () => {
    await page.getByRole("button", { name: "Close all panels" }).click();
    await navigate(page, "Discuss");
    const topic = page.locator(`.topic-card[data-chain-proposal-id="${evmProposal.id}"]`);
    await expect(topic).toBeVisible();
    await topic.click();
    await expect(page.locator("article.discussion h2")).toHaveText(evmProposal.title);
    await expect(page.locator("article.discussion .comments-list > [data-chain-message-id]")).toHaveCount(2);
    await expect(page.locator(".community-live")).toContainText("comments on chain");
    await expect(page.locator(".topic-card:not([data-chain-proposal-id]):visible")).toHaveCount(0);
  });

  await test.step("Useful, Not useful and removal keep one canonical reaction", async () => {
    await openDiscussion(page, evmProposal.id);
    const card = page.getByTestId(`message-${rootMessage.message_id}`);
    await performTransaction(page, () => card.locator('[data-chain-reaction="1"]').click());
    expect(await reactions(evmProposal.id, rootMessage.message_id)).toHaveLength(1);
    await performTransaction(page, () => page.getByTestId(`message-${rootMessage.message_id}`).locator('[data-chain-reaction="2"]').click());
    let current = await reactions(evmProposal.id, rootMessage.message_id);
    expect(current).toHaveLength(1);
    expect(current[0].reaction).toBe("REACTION_NOT_USEFUL");
    await performTransaction(page, () => page.getByTestId(`message-${rootMessage.message_id}`).locator('[data-chain-reaction="2"]').click());
    expect(await reactions(evmProposal.id, rootMessage.message_id)).toHaveLength(0);
  });

  await test.step("one quick authorization posts and reacts as its owner, then revokes", async () => {
    await freshWallet(page, "MetaMask", "alice");
    await openDiscussion(page, evmProposal.id);
    await performTransaction(page, () => page.locator('[data-chain-session="authorize"]').click());
    const sessionKey = await page.evaluate(() => sessionStorage.getItem("kudora-session-key"));
    expect(sessionKey).toMatch(/^0x[0-9a-f]{64}$/);
    const sessionAddress = await page.evaluate(() => window.KudoraChain.sessionAccount().then((item) => item.address));
    const sessionState = await json(`${REST}/kudora/discussion/v1/sessions/${sessionAddress}`);
    const owner = `0x${Buffer.from(sessionState.session.owner, "base64").toString("hex")}`;
    expect(owner.toLowerCase()).toBe(local.accounts.alice.evmAddress.toLowerCase());
    const quickText = `Quick session post ${Date.now()}`;
    const form = page.getByTestId("discussion-form");
    await form.locator("textarea").first().fill(quickText);
    await performTransaction(page, () => form.locator('button[type="submit"]').click());
    const quick = (await discussionMessages(evmProposal.id)).find((message) => messageText(message) === quickText);
    expect(`0x${Buffer.from(quick.author, "base64").toString("hex")}`.toLowerCase()).toBe(local.accounts.alice.evmAddress.toLowerCase());
    await performTransaction(page, () => page.getByTestId(`message-${replyMessage.message_id}`).locator('[data-chain-reaction="1"]').click());
    await performTransaction(page, () => page.locator('[data-chain-session="revoke"]').click());
    expect((await fetch(`${REST}/kudora/discussion/v1/sessions/${sessionAddress}`)).status).toBe(404);

    await page.evaluate((key) => sessionStorage.setItem("kudora-session-key", key), sessionKey);
    await page.getByTestId("discussion-form").locator("textarea").first().fill("This revoked authorization must fail");
    await page.getByTestId("discussion-form").locator('button[type="submit"]').click();
    await expect(page.getByTestId("transaction-status")).toHaveAttribute("data-state", "failed", { timeout: 90_000 });
    await page.evaluate(() => sessionStorage.removeItem("kudora-session-key"));
  });

  await test.step("Zap transfers exact KUD to the comment author", async () => {
    await freshWallet(page, "MetaMask", "alice");
    await openDiscussion(page, evmProposal.id);
    const aliceBefore = await bankBalance(local.accounts.alice.cosmosAddress);
    const bobBefore = await bankBalance(local.accounts.bob.cosmosAddress);
    await page.getByTestId(`message-${replyMessage.message_id}`).locator("[data-chain-zap]").click();
    const form = page.locator("form[data-chain-zap-form]");
    await form.locator('[name="amount"]').fill("0.01");
    await performTransaction(page, () => form.locator('button[type="submit"]').click());
    expect(await bankBalance(local.accounts.bob.cosmosAddress) - bobBefore).toBe(KUD / 100n);
    expect(await bankBalance(local.accounts.alice.cosmosAddress)).toBeLessThan(aliceBefore - KUD / 100n);
  });

  await test.step("Move money executes the real local KUD / MockUSDC contract", async () => {
    await freshWallet(page, "MetaMask", "alice");
    await navigate(page, "Account");
    const tokenBefore = await tokenBalance(local.swap.mockUsdcAddress, local.accounts.alice.evmAddress);
    await page.getByRole("button", { name: /Move money/i }).click();
    const form = page.locator('form[data-money-form="move"]');
    await form.locator('[name="amount"]').fill("0.1");
    await performTransaction(page, () => form.locator('button[type="submit"]').click());
    expect(await tokenBalance(local.swap.mockUsdcAddress, local.accounts.alice.evmAddress)).toBeGreaterThan(tokenBefore);

    await freshWallet(page, "Keplr", "bob");
    await navigate(page, "Account");
    const bobBefore = await tokenBalance(local.swap.mockUsdcAddress, local.accounts.bob.evmAddress);
    await page.getByRole("button", { name: /Move money/i }).click();
    const keplrForm = page.locator('form[data-money-form="move"]');
    await keplrForm.locator('[name="amount"]').fill("0.1");
    await performTransaction(page, () => keplrForm.locator('button[type="submit"]').click());
    expect(await tokenBalance(local.swap.mockUsdcAddress, local.accounts.bob.evmAddress)).toBeGreaterThan(bobBefore);
  });

  expect(errors.filter((error) => !/favicon|Failed to load resource.*404/.test(error))).toEqual([]);
});
