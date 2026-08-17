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
  await form.locator("input").nth(0).fill("Community progress updates");
  await form.locator("input").nth(1).fill(title);
  await form.locator("textarea").nth(0).fill("Community progress is difficult to follow when updates are spread across several places.");
  await form.locator("textarea").nth(1).fill("1. Name the owner and publish the first delivery date.\n2. Publish one short monthly progress update.\n3. Review the result with the community after three months.");
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

test("the original template exposes only live public data while disconnected", async ({ page }) => {
  const started = Date.now();
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => page.locator(".validator-row:not(.validator-head):visible").count()).toBe(3);
  expect(Date.now() - started).toBeLessThan(1_500);

  await expect(page.locator(".desktop-nav")).not.toContainText("Discuss");
  await expect(page.locator(".portfolio-grid")).toBeHidden();
  await expect(page.locator(".network-ticker-group").first().locator(".network-metric")).toHaveCount(6);
  for (const metric of await page.locator(".network-ticker-group").first().locator(".network-metric").all()) {
    expect(await metric.evaluate((node) => getComputedStyle(node).borderRightWidth)).not.toBe("0px");
  }

  const connectButton = page.getByRole("button", { name: /Connect wallet/i });
  await expect(connectButton.locator(".glyph")).toHaveCount(0);
  await expect.poll(() => connectButton.evaluate((node) => getComputedStyle(node).animationName)).toContain("k-wallet-attention");
  await connectButton.click();
  const walletLogos = page.locator(".wallet-panel-options .k-wallet-choice-logo");
  await expect(walletLogos).toHaveCount(2);
  await expect.poll(() => walletLogos.evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0))).toBe(true);
  await expect(await page.request.get("/kudora-token.png")).toBeOK();
  await page.locator(".k-side-panel [data-chain-close-panel]").click();

  await navigate(page, "Choose");
  await expect(page.locator(".validator-group-label:not(.available)")).toBeHidden();
  await expect(page.locator(".validator-group-label.available")).toContainText("OTHER REPRESENTATIVES");
  const rows = page.locator(".validator-row:not(.validator-head):visible");
  await expect(rows).toHaveCount(3);
  await expect(page.locator(".validator-head")).toContainText("Delegators");
  await expect(page.locator(".validator-head > :nth-child(4)")).toHaveText("Proposals");
  await expect(page.locator(".validator-head > :nth-child(5)")).toHaveText("Votes");
  await expect(page.locator(".validator-head")).not.toContainText("Yearly rewards");
  await expect(rows.first().locator(".validator-name small")).toContainText("Address · kudovalop");
  await expect(rows.first().locator(".supporters")).toContainText("delegator");
  await expect(rows.first().locator(".uptime")).toContainText("%");
  await expect(rows.first().locator(".validator-proposals")).toHaveText(/^\d+$/);
  await expect(rows.first().locator(".validator-votes")).toHaveText(/^\d+$/);
  await expect(rows.first().getByRole("button")).toHaveText("Choose");
  await expect(page.locator(".set-stat")).toContainText("ACTIVE TEAMS");
  await expect(page.locator(".set-stat")).toContainText("3");
  await expect(page.locator(".set-stat")).toContainText("% reliable");
});

test("MetaMask selection bypasses Brave Wallet and coalesces repeated clicks", async ({ page }) => {
  await page.addInitScript((address) => {
    window.__walletRequests = { brave: [], metamask: [] };
    const braveProvider = {
      isBraveWallet: true,
      isMetaMask: true,
      request: async ({ method }) => {
        window.__walletRequests.brave.push(method);
        if (method === "eth_accounts") return [];
        if (method === "eth_requestAccounts") return ["0x0000000000000000000000000000000000000001"];
        if (method === "wallet_switchEthereumChain") return null;
        throw new Error(`Unexpected Brave Wallet request: ${method}`);
      },
    };
    const metaMaskProvider = {
      isMetaMask: true,
      request: async ({ method }) => {
        window.__walletRequests.metamask.push(method);
        if (method === "eth_accounts") return [];
        if (method === "eth_requestAccounts") {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return [address];
        }
        if (method === "wallet_switchEthereumChain") return null;
        throw new Error(`Unexpected MetaMask request: ${method}`);
      },
    };
    window.ethereum = braveProvider;
    window.addEventListener("eip6963:requestProvider", () => {
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: {
            uuid: "350670db-19fa-4704-a166-e52e178b59d2",
            name: "Brave Wallet",
            icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
            rdns: "com.brave.wallet",
          },
          provider: braveProvider,
        },
      }));
      window.dispatchEvent(new CustomEvent("eip6963:announceProvider", {
        detail: {
          info: {
            uuid: "7677b54f-3486-46e2-4e37-bf8747814f42",
            name: "MetaMask",
            icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>",
            rdns: "io.metamask",
          },
          provider: metaMaskProvider,
        },
      }));
    });
  }, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
  await openApp(page);
  await page.getByRole("button", { name: /Connect wallet/i }).click();
  await page.locator('[data-chain-connect="metamask"]').evaluate((button) => {
    button.click();
    button.click();
  });
  await expect.poll(() => page.evaluate(() => window.KudoraChain.walletMode)).toBe("metamask");
  await expect.poll(() => page.evaluate(() => window.__walletRequests.metamask.filter((method) => method === "eth_requestAccounts").length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__walletRequests.brave.length)).toBe(0);
});

test("seeded account activity contains real rewards, payments, moves and zaps", async ({ page }) => {
  await freshWallet(page, "MetaMask", "alice");
  const expected = {
    alice: { reward: 125.5, move: -2, sent: -18.5, received: 4.75 },
    bob: { reward: 95.25, move: -1.25, sent: -7.25, received: 18.5 },
    carol: { reward: 70.75, move: -0.75, sent: -4.75, received: 7.25 },
  };

  for (const [name, amounts] of Object.entries(expected)) {
    const transactions = await page.evaluate(async (accountName) => {
      await window.KudoraChainBridge.connect("local-metamask", accountName);
      return window.KudoraChain.transactions();
    }, name);
    expect(transactions.find((transaction) => transaction.category === "Rewards")?.amount).toBeCloseTo(amounts.reward);
    expect(transactions.some((transaction) => transaction.category === "Moved" && Math.abs(transaction.amount - amounts.move) < 0.000001)).toBe(true);
    expect(transactions.some((transaction) => transaction.category === "Sent" && Math.abs(transaction.amount - amounts.sent) < 0.000001)).toBe(true);
    expect(transactions.some((transaction) => transaction.category === "Received" && Math.abs(transaction.amount - amounts.received) < 0.000001)).toBe(true);
    expect(transactions.filter((transaction) => transaction.category === "Community").every((transaction) => transaction.title.startsWith("Zap "))).toBe(true);
    expect(transactions.some((transaction) => transaction.title === "EVM transaction")).toBe(false);
    expect(transactions.every((transaction) => !transaction.note.includes("Block #"))).toBe(true);
  }

  await page.evaluate(() => window.KudoraChainBridge.connect("local-metamask", "alice"));
  const neutralTitle = await page.evaluate(async () => (await window.KudoraChain.transactions())
    .find((transaction) => transaction.amount === 0 && transaction.fee > 0)?.title || "");
  expect(neutralTitle).not.toBe("");
  await navigate(page, "Account");
  await page.locator('[data-transaction-filter="Rewards"]').click();
  await expect(page.locator(".k-transaction-row").first()).toContainText("Airdrop reward from Kudora Validator 1");
  await expect(page.locator(".k-transaction-row").first()).toContainText("+125.50");
  await expect(page.locator(".k-transaction-row").first().locator(".k-transaction-amount")).toHaveCSS("color", "rgb(102, 230, 164)");
  await page.locator('[data-transaction-filter="Moved"]').click();
  await page.locator("[data-transaction-search]").fill("KUD moved to Mock USDC");
  const seededMove = page.locator(".k-transaction-row").filter({ hasText: "−2.00 KUD" });
  await expect(seededMove).toContainText("KUD moved to Mock USDC");
  await expect(seededMove.locator(".k-transaction-amount")).toHaveCSS("color", "rgb(255, 127, 159)");
  await page.locator("[data-transaction-search]").fill("");
  await page.locator('[data-transaction-filter="Community"]').click();
  const incomingZap = page.locator(".k-transaction-row").filter({ hasText: "Zap from Carol" });
  await expect(incomingZap).toContainText("+0.20 KUD");
  await expect(incomingZap.locator(".k-transaction-amount")).toHaveCSS("color", "rgb(102, 230, 164)");
  await expect(page.locator(".k-transaction-row").first()).not.toContainText("Block #");
  await incomingZap.click();
  const detail = page.locator(".k-side-panel");
  await expect(detail).not.toContainText("WHAT HAPPENED");
  await expect(detail).not.toContainText("Complete and recorded");
  await detail.locator("[data-close-panel]").click();

  await page.locator('[data-transaction-filter="All"]').click();
  await page.locator("[data-transaction-search]").fill(neutralTitle);
  const chainAction = page.locator(".k-transaction-row").first();
  await expect(chainAction.locator(".k-transaction-amount")).toContainText("~0 KUD");
  await expect(chainAction.locator(".k-transaction-amount")).not.toContainText("Fee");
  await expect(chainAction.locator(".k-transaction-amount")).toHaveCSS("color", "rgb(168, 128, 255)");
  await expect(chainAction.locator(".k-transaction-icon")).toHaveCSS("color", "rgb(168, 128, 255)");
  await expect(chainAction).not.toContainText("Block #");

  await expect(page.locator(".k-money-guide")).toHaveCount(0);
  await page.locator('[data-account-action="send"]').click();
  const sendPanel = page.locator(".k-side-panel");
  await expect(sendPanel).toContainText("Network fee");
  await expect(sendPanel).toContainText("Recipient address");
  await expect(sendPanel.locator('input[name="recipient"]')).toHaveAttribute("placeholder", "Paste address");
  await expect(sendPanel).not.toContainText("Movement cost");
  await expect(sendPanel).not.toContainText(/\btag\b/i);
  await sendPanel.locator("[data-close-panel]").click();
  await page.locator('[data-account-action="move"]').click();
  const movePanel = page.locator(".k-side-panel");
  await expect(movePanel).not.toContainText("LOCALNET / E2E ONLY");
  await expect(movePanel).not.toContainText("No production DEX claim");
});

test("Choose and Vote retain the template semantics with on-chain personal data", async ({ page }) => {
  await freshWallet(page, "MetaMask", "alice");
  await navigate(page, "Choose");
  await expect(page.locator(".portfolio-grid")).toBeVisible();
  await expect(page.locator(".portfolio-placeholder")).toBeHidden();
  await expect(page.locator(".validator-group-label:not(.available)")).toContainText("YOUR REPRESENTATIVES");
  await expect(page.locator(".validator-group-label.available")).toContainText("OTHER REPRESENTATIVES");
  await expect(page.locator(".validator-row.delegated:visible")).toHaveCount(1);
  await expect(page.locator(".validator-row.delegated:visible").getByRole("button")).toHaveText("Add KUD");
  await expect(page.locator(".active-vote-row:visible").first()).toContainText(/YES|NO|ABSTAIN/);
  await page.locator(".active-vote-row:visible").first().click();
  const activity = page.locator(".representative-activity-panel");
  await expect(activity).toBeVisible();
  await expect(activity).toContainText("REPRESENTATIVE ACTIVITY");
  await expect(activity).toContainText("Kudora Validator 1");
  await expect(activity.locator(".monitor-section-heading").first()).toContainText("1 representative");
  await activity.locator(".monitor-representative-trigger:visible").first().click();
  await expect(activity).toContainText("I voted");
  await activity.locator('[aria-label*="Close"], .discussion-back').first().click();

  await navigate(page, "Vote");
  await expect(page.locator(".proposal-table-head")).toBeVisible();
  await expect(page.locator(".proposal-table-head")).toContainText("Participants");
  await expect(page.locator(".proposal-table-head")).toContainText("Not useful");
  await expect(page.locator(".proposal-table-head")).not.toContainText("Activity");
  await expect(page.locator(".proposal-feed")).not.toContainText("OPEN PROPOSALS");
  await expect(page.locator(".proposal-feed")).not.toContainText("CLOSING SOON");
  await expect(page.locator(".proposal-feed")).not.toContainText("MOST DISCUSSED");
  const dateSort = page.locator('[data-chain-proposal-sort="date"]');
  await expect(dateSort).toHaveAttribute("aria-label", /descending/);
  const newestFirst = await page.locator(".proposal-group:visible").first().locator(".proposal-list-item:visible").first().getAttribute("data-chain-proposal-id");
  await dateSort.click();
  await expect(dateSort).toHaveAttribute("aria-label", /ascending/);
  const oldestFirst = await page.locator(".proposal-group:visible").first().locator(".proposal-list-item:visible").first().getAttribute("data-chain-proposal-id");
  expect(oldestFirst).not.toBe(newestFirst);
  await expect(page.locator(".proposal-group:visible").nth(0).locator(":scope > header")).toContainText("YOUR ACTIVE VOTES");
  expect(await page.locator(".proposal-group:visible").nth(0).locator(".proposal-list-item:visible").count()).toBeGreaterThanOrEqual(2);
  const times = await page.locator(".proposal-list-item:visible .proposal-list-signal strong").allTextContents();
  expect(new Set(times).size).toBeGreaterThan(1);
  const mixed = await page.locator(".proposal-list-item:visible .proposal-result-legend").evaluateAll((legends) => legends.some((legend) => {
    const values = [...legend.querySelectorAll("strong")].map((node) => Number.parseFloat(node.textContent));
    return values.filter((value) => value > 0).length > 1;
  }));
  expect(mixed).toBe(true);
  await expect(page.locator(".proposal-representative-peek:visible").first()).toContainText(/YES|NO|ABSTAIN|Not yet/);
  await expect(page.locator("[data-chain-ask]:visible").first()).toHaveText("Ask");

  const funded = (await proposals()).find((proposal) => {
    const metadata = JSON.parse(proposal.metadata || "{}");
    return proposal.status !== "PROPOSAL_STATUS_VOTING_PERIOD" && metadata.requestedAmount && metadata.requestedAmount !== "None";
  });
  expect(funded).toBeTruthy();
  await page.getByTestId(`proposal-${funded.id}`).click();
  const detail = page.getByTestId(`proposal-detail-${funded.id}`);
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(JSON.parse(funded.metadata).requestedAmount);
  await expect(detail.locator(".decision-delivery-checkpoints li")).toHaveCount(4);
  await expect(detail.locator(".discussion-preview [data-chain-reaction='1']").first()).toContainText("Useful");
  await expect(detail.locator(".discussion-preview [data-chain-reaction='2']").first()).toContainText("Not useful");
  await expect(detail.locator(".discussion-preview [data-chain-zap]").first()).toContainText("Zap");
  await expect(detail).not.toContainText("Strong no");
});

test("the canonical Kudora UI drives real EVM and Cosmos business flows", async ({ page }) => {
  const local = await config();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await test.step("the supplied product design is intact and one wallet has both addresses", async () => {
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

  await test.step("MetaMask delegates and undelegates real KUD from one bonded validator", async () => {
    await freshWallet(page, "MetaMask", "alice");
    const validatorConfig = local.validators[0];
    const validator = validatorConfig.operatorAddress;
    const before = await delegation(local.accounts.alice.cosmosAddress, validator);
    const row = page.locator(".validator-row:not(.validator-head):visible").filter({ hasText: validatorConfig.name });
    await expect(row).toBeVisible();
    await row.locator("button").click();
    const delegateForm = page.locator("[data-chain-delegate-form]");
    await expect(page.locator(".k-validator-address")).toContainText("Address");
    await expect(page.locator(".k-side-panel")).toContainText(validator);
    await expect(page.locator(".k-side-panel")).toContainText("PROPOSALS");
    await expect(page.locator(".k-side-panel")).toContainText("VOTES");
    await expect(page.locator(".k-side-panel")).not.toContainText("Yearly rewards");
    await expect(page.locator(".k-side-panel")).not.toContainText(/tokens|unbonding|undelegate|x\/staking|voting power/i);
    await delegateForm.locator("input[name='amount']").fill("0.01");
    await performTransaction(page, () => delegateForm.locator("button[type='submit']").click());
    expect(await delegation(local.accounts.alice.cosmosAddress, validator) - before).toBe(KUD / 100n);

    const delegatedRow = page.locator(".validator-row:not(.validator-head):visible").filter({ hasText: validatorConfig.name });
    await delegatedRow.locator("button").click();
    await page.locator('[data-chain-stake-mode="remove"]').click();
    const undelegateForm = page.locator("[data-chain-undelegate-form]");
    await expect(undelegateForm).toBeVisible();
    await undelegateForm.locator("input[name='amount']").fill("0.005");
    await performTransaction(page, () => undelegateForm.locator("button[type='submit']").click());
    expect(await delegation(local.accounts.alice.cosmosAddress, validator) - before).toBe(KUD / 200n);
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
    await expect.poll(() => page.evaluate(() => window.KudoraChain.transactions().then((transactions) => transactions.some((transaction) => transaction.category === "Sent" && transaction.title === "Money sent to Bob" && Math.abs(transaction.amount + 0.1) < 0.000001)))).toBe(true);
    await expect(page.locator(".k-transaction-row").filter({ hasText: "Money sent to Bob" }).first()).toContainText("−0.10");
  });

  await test.step("Keplr sends native KUD from the same product panel", async () => {
    await freshWallet(page, "Keplr", "bob");
    await navigate(page, "Account");
    await expect.poll(() => page.evaluate(() => window.KudoraChain.transactions().then((transactions) => transactions.some((transaction) => transaction.category === "Received" && transaction.title === "Money received from Alice" && Math.abs(transaction.amount - 0.1) < 0.000001)))).toBe(true);
    const carolBefore = await bankBalance(local.accounts.carol.cosmosAddress);
    await page.getByRole("button", { name: /Send money/i }).click();
    const form = page.locator('form[data-money-form="send"]');
    await form.locator('[name="recipient"]').fill(local.accounts.carol.cosmosAddress);
    await form.locator('[name="amount"]').fill("0.1");
    await performTransaction(page, () => form.locator('button[type="submit"]').click());
    expect(await bankBalance(local.accounts.carol.cosmosAddress) - carolBefore).toBe(KUD / 10n);
    await expect.poll(() => page.evaluate(() => window.KudoraChain.transactions().then((transactions) => transactions.some((transaction) => transaction.category === "Sent" && transaction.title === "Money sent to Carol" && Math.abs(transaction.amount + 0.1) < 0.000001)))).toBe(true);
  });

  let evmProposal;
  await test.step("the original proposal builder publishes through the EVM gov precompile", async () => {
    await freshWallet(page, "MetaMask", "alice");
    const title = `Publish community progress update #${(await proposals()).length + 1}`;
    await publishProposal(page, title);
    evmProposal = (await proposals()).find((proposal) => proposal.title === title);
    expect(evmProposal).toBeTruthy();
    expect(evmProposal.status).toBe("PROPOSAL_STATUS_VOTING_PERIOD");
    const metadata = JSON.parse(evmProposal.metadata);
    expect(metadata).toMatchObject({
      v: 1,
      context: expect.any(String),
      outcome: expect.any(String),
    });
    expect(metadata.changes).toEqual([
      "Name the owner and publish the first delivery date.",
      "Publish one short monthly progress update.",
      "Review the result with the community after three months.",
    ]);
  });

  await test.step("the original vote panel records a native Keplr vote", async () => {
    await freshWallet(page, "Keplr", "bob");
    await openProposal(page, evmProposal.id);
    await expect(page.locator('.your-vote-note[data-vote-state="pending"]')).toBeVisible();
    await expect.poll(() => page.locator(".your-vote-note").evaluate((node) => getComputedStyle(node).animationName)).toBe("k-vote-prompt");
    await expect(page.locator('[data-chain-switch-vote="4"]')).toHaveText("No with veto");
    await page.locator('[data-chain-switch-vote="3"]').hover();
    await expect.poll(() => page.locator('[data-chain-switch-vote="3"]').evaluate((node) => getComputedStyle(node).color)).toBe("rgb(255, 100, 117)");
    await expect(page.getByTestId(`vote-proposal-${evmProposal.id}`)).toBeHidden();
    await performTransaction(page, () => page.locator('[data-chain-switch-vote="1"]').click());
    let vote = await json(`${REST}/cosmos/gov/v1/proposals/${evmProposal.id}/votes/${local.accounts.bob.cosmosAddress}`);
    expect(vote.vote.options[0].option).toBe("VOTE_OPTION_YES");
    await expect(page.locator(".your-vote-note")).toContainText("YOUR CURRENT VOTE");
    await expect(page.locator(".your-vote-note")).toContainText("Yes");
    await expect(page.locator(".your-vote-note")).toHaveAttribute("data-vote-state", "yes");
    await expect(page.locator(".decision-delivery-checkpoints li")).toHaveCount(3);
    await expect(page.locator(".decision-delivery-checkpoints li").first()).toContainText("01");
    await expect(page.locator(".k-direct-vote-note")).toContainText("Your choice counts directly");
    await performTransaction(page, () => page.locator('[data-chain-switch-vote="3"]').click());
    vote = await json(`${REST}/cosmos/gov/v1/proposals/${evmProposal.id}/votes/${local.accounts.bob.cosmosAddress}`);
    expect(vote.vote.options[0].option).toBe("VOTE_OPTION_NO");
    await expect(page.locator(".your-vote-note")).toContainText("No");
  });

  await test.step("Keplr publishes and MetaMask votes through the same x/gov", async () => {
    await freshWallet(page, "Keplr", "carol");
    const title = `Open a public delivery tracker #${(await proposals()).length + 1}`;
    await publishProposal(page, title);
    const proposal = (await proposals()).find((item) => item.title === title);
    expect(proposal).toBeTruthy();
    await freshWallet(page, "MetaMask", "alice");
    await openProposal(page, proposal.id);
    await performTransaction(page, () => page.locator('[data-chain-switch-vote="3"]').click());
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

  await test.step("Useful, Not useful and removal keep one canonical reaction", async () => {
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

  await test.step("the proposal preview exposes community actions without opening the discussion", async () => {
    await freshWallet(page, "MetaMask", "bob");
    await openProposal(page, evmProposal.id);
    const preview = page.getByTestId(`message-preview-${rootMessage.message_id}`);
    await expect(preview).toBeVisible();
    await expect(preview.locator('[data-chain-reaction="1"]')).toContainText("Useful");
    await expect(preview.locator('[data-chain-reaction="2"]')).toContainText("Not useful");
    await expect(preview.locator("[data-chain-zap]")).toContainText("Zap");
    await performTransaction(page, () => preview.locator('[data-chain-reaction="1"]').click());
    expect(await reactions(evmProposal.id, rootMessage.message_id)).toHaveLength(1);
    await performTransaction(page, () => page.getByTestId(`message-preview-${rootMessage.message_id}`).locator('[data-chain-reaction="1"]').click());
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
    await expect.poll(() => page.evaluate(() => window.KudoraChain.transactions().then((transactions) => transactions.some((transaction) => transaction.category === "Moved" && Math.abs(transaction.amount + 0.1) < 0.000001)))).toBe(true);

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
