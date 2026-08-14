import { KudoraChain } from "./chain.js";

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const short = (value) => value ? `${value.slice(0, 9)}…${value.slice(-5)}` : "—";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

let chain;
let activeTab = "account";
let status = { state: "idle", label: "Ready", hash: "" };
let balances = { kud: "—", mockUsdc: 0n };
let proposals = [];
let messages = [];
let reactionMap = new Map();
let selectedReply = 0;
let discussionProposalId = 0;

function accountName(address) {
  const match = Object.entries(chain.config.accounts).find(([, account]) => account.evmAddress.toLowerCase() === address.toLowerCase());
  return match ? match[0][0].toUpperCase() + match[0].slice(1) : short(address);
}

function transactionStatus() {
  const hash = status.hash ? `<code data-testid="transaction-hash">${escapeHtml(status.hash)}</code>` : "";
  return `<div class="kc-status ${status.state}" data-testid="transaction-status" data-state="${status.state}"><i></i><span><b>${escapeHtml(status.label)}</b>${hash}</span></div>`;
}

function walletMarkup() {
  const current = chain?.evmAccount ? chain.account() : null;
  return `<section class="kc-wallet glass-card">
    <div class="kc-wallet-heading">
      <div><span class="tiny-label">REAL WALLET</span><h2>${current ? escapeHtml(accountName(current.evmAddress)) : "Connect wallet"}</h2></div>
      <span class="live-chip"><i></i> ${current ? escapeHtml(current.mode.replace("local-", "LOCAL ").toUpperCase()) : "DISCONNECTED"}</span>
    </div>
    <div class="kc-wallet-options" role="group" aria-label="Wallet path">
      <button data-wallet="local-metamask" class="${current?.mode === "local-metamask" ? "active" : ""}">Local MetaMask</button>
      <button data-wallet="local-keplr" class="${current?.mode === "local-keplr" ? "active" : ""}">Local Keplr</button>
      <button data-wallet="metamask" class="${current?.mode === "metamask" ? "active" : ""}">MetaMask</button>
      <button data-wallet="keplr" class="${current?.mode === "keplr" ? "active" : ""}">Keplr</button>
    </div>
    ${current && chain.isLocal() ? `<label class="kc-account-select"><span>Local signer</span><select data-testid="account-select" data-account-select>${Object.keys(chain.config.accounts).map((name) => `<option value="${name}" ${name === chain.accountName ? "selected" : ""}>${name[0].toUpperCase() + name.slice(1)}</option>`).join("")}</select></label>` : ""}
    ${current ? `<div class="kc-addresses">
      <span><small>EVM</small><code data-testid="evm-address">${escapeHtml(current.evmAddress)}</code></span>
      <span><small>COSMOS</small><code data-testid="cosmos-address">${escapeHtml(current.cosmosAddress)}</code></span>
    </div>` : ""}
  </section>`;
}

function accountMarkup() {
  const connected = Boolean(chain?.evmAccount);
  const recipient = chain?.config.accounts.bob;
  return `<section class="kc-grid">
    <article class="k-total-card glass-card kc-balance-card">
      <header><span>REAL ON-CHAIN BALANCE</span><button data-refresh aria-label="Refresh balance">↻</button></header>
      <strong class="k-main-balance" data-testid="kud-balance">${connected ? escapeHtml(Number(balances.kud).toLocaleString(undefined, { maximumFractionDigits: 6 })) : "—"} <small>KUD</small></strong>
      <p>One balance · Cosmos bank and EVM native asset</p>
      <div class="k-balance-breakdown"><span><small>MOCK USDC · LOCALNET ONLY</small><b data-testid="usdc-balance">${(Number(balances.mockUsdc) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 })} MockUSDC</b></span></div>
    </article>
    <article class="glass-card kc-form-card">
      <span class="tiny-label">SEND NATIVE KUD</span><h3>${chain?.isKeplr() ? "Cosmos x/bank" : "EVM native transfer"}</h3>
      <form data-form="send">
        <label><span>Recipient address</span><input name="recipient" required value="${escapeHtml(chain?.isKeplr() ? recipient?.cosmosAddress : recipient?.evmAddress)}"></label>
        <label><span>Amount</span><input name="amount" required type="number" min="0.000001" step="0.000001" value="0.1"></label>
        <button class="k-confirm-button" ${connected ? "" : "disabled"}>Send real KUD <span>→</span></button>
      </form>
    </article>
  </section>`;
}

function proposalCard(proposal) {
  let metadata = {};
  try { metadata = JSON.parse(proposal.metadata || "{}"); } catch { /* external proposal metadata */ }
  const votingPower = (value) => (Number(BigInt(value || 0)) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 3 });
  const tally = proposal.tally || {};
  return `<article class="glass-card kc-proposal" data-testid="proposal-${proposal.id}">
    <header><span>KIP–${escapeHtml(proposal.id)}</span><b>${escapeHtml(String(proposal.status || "").replace("PROPOSAL_STATUS_", "").replaceAll("_", " "))}</b></header>
    <h3>${escapeHtml(proposal.title)}</h3><p>${escapeHtml(proposal.summary)}</p>
    ${metadata.context ? `<dl><div><dt>Context</dt><dd>${escapeHtml(metadata.context)}</dd></div><div><dt>Outcome</dt><dd>${escapeHtml(metadata.outcome)}</dd></div></dl>` : ""}
    <p data-testid="tally-${proposal.id}">Yes ${votingPower(tally.yes_count)} · No ${votingPower(tally.no_count)} · Abstain ${votingPower(tally.abstain_count)} · Veto ${votingPower(tally.no_with_veto_count)}</p>
    <div class="kc-votes" role="group" aria-label="Vote on proposal ${proposal.id}">
      <button data-vote="1" data-proposal-id="${proposal.id}">Yes</button><button data-vote="3" data-proposal-id="${proposal.id}">No</button><button data-vote="2" data-proposal-id="${proposal.id}">Abstain</button><button data-vote="4" data-proposal-id="${proposal.id}">No with veto</button>
    </div>
    <button data-discuss-proposal="${proposal.id}">Discuss this proposal</button>
  </article>`;
}

function governanceMarkup() {
  return `<section class="kc-feature-layout">
    <article class="glass-card kc-form-card">
      <span class="tiny-label">PROPOSAL BUILDER · CHANGE A RULE</span><h2>Create a real x/gov proposal.</h2>
      <form data-form="proposal">
        <label><span>Title</span><input name="title" required value="Keep discussion fees predictable"></label>
        <label><span>Summary</span><input name="summary" required value="Confirm the current low anti-spam publication fee."></label>
        <label><span>Context</span><textarea name="context" required>Permanent content should carry a small economic cost.</textarea></label>
        <label><span>Change</span><textarea name="changes" required>Keep the discussion post fee at 0.001 KUD.</textarea></label>
        <label><span>Expected outcome</span><input name="outcome" required value="Low-cost discussion with basic spam resistance."></label>
        <small>Metadata is minified, versioned and rejected above 8 KiB. The 1 KUD local deposit goes to native x/gov.</small>
        <button class="k-confirm-button" ${chain?.evmAccount ? "" : "disabled"}>Submit through ${chain?.isKeplr() ? "Keplr" : "Gov precompile"} <span>◇</span></button>
      </form>
    </article>
    <section class="kc-list" data-testid="proposal-list">${proposals.length ? proposals.map(proposalCard).join("") : `<div class="glass-card kc-empty">No on-chain proposal yet.</div>`}</section>
  </section>`;
}

function reactionCounts(messageId) {
  const reactions = reactionMap.get(String(messageId)) || [];
  return {
    useful: reactions.filter((reaction) => String(reaction.reaction).endsWith("USEFUL") && !String(reaction.reaction).endsWith("NOT_USEFUL")).length,
    notUseful: reactions.filter((reaction) => String(reaction.reaction).endsWith("NOT_USEFUL")).length,
  };
}

function messageCard(message) {
  const counts = reactionCounts(message.messageId);
  return `<article class="glass-card kc-message" data-testid="message-${message.messageId}">
    <header><div><strong>${escapeHtml(accountName(message.evmAuthor))}</strong><small>${escapeHtml(message.cosmosAuthor)} · #${message.messageId}${message.parentId !== "0" ? ` · reply to #${message.parentId}` : ""}</small></div></header>
    <p>${escapeHtml(message.parsed.text || JSON.stringify(message.parsed))}</p>
    <footer class="kc-message-actions">
      <button data-reaction="1" data-proposal-id="${message.proposalId}" data-message-id="${message.messageId}">◇ Useful <b>${counts.useful}</b></button>
      <button data-reaction="2" data-proposal-id="${message.proposalId}" data-message-id="${message.messageId}">× Not useful <b>${counts.notUseful}</b></button>
      <button data-reaction="0" data-proposal-id="${message.proposalId}" data-message-id="${message.messageId}">Remove reaction</button>
      <button data-reply="${message.messageId}">Reply</button>
      <button data-zap="${message.messageId}" data-proposal-id="${message.proposalId}">ϟ Zap 0.01 KUD</button>
    </footer>
  </article>`;
}

function discussionMarkup() {
  let sessionLabel = "Not enabled";
  const hasSession = Boolean(sessionStorage.getItem("kudora-session-key"));
  if (hasSession) sessionLabel = "Session key available";
  return `<section class="kc-feature-layout">
    <article class="glass-card kc-form-card">
      <span class="tiny-label">ONE NATIVE DISCUSSION STATE · ${discussionProposalId ? `PROPOSAL #${discussionProposalId}` : "GENERAL"}</span><h2>${selectedReply ? `Reply to message #${selectedReply}` : "Post a real message."}</h2>
      <form data-form="discussion">
        <input type="hidden" name="parentId" value="${selectedReply}">
        <label><span>Message</span><textarea name="text" maxlength="8000" required>${selectedReply ? "A real interoperable reply." : "A real Kudora discussion message."}</textarea></label>
        <label class="kc-check"><input name="quick" type="checkbox" ${sessionStorage.getItem("kudora-session-key") ? "checked" : ""}><span>Use Quick interactions (no primary-wallet popup)</span></label>
        <button class="k-confirm-button" ${chain?.evmAccount ? "" : "disabled"}>Publish on-chain <span>⌁</span></button>
      </form>
      <div class="kc-session">
        <span><small>QUICK INTERACTIONS</small><b data-testid="session-status">${sessionLabel}</b></span>
        <button data-session="authorize">${hasSession ? "Refill / renew" : "Enable once"} · fund 0.05 KUD</button><button data-session="revoke">Revoke</button>
      </div>
      ${discussionProposalId ? '<button data-discussion-general>Return to general discussion</button>' : ""}
    </article>
    <section class="kc-list" data-testid="discussion-list">${messages.length ? messages.map(messageCard).join("") : `<div class="glass-card kc-empty">No on-chain message yet.</div>`}</section>
  </section>`;
}

function swapMarkup() {
  return `<section class="kc-swap glass-card">
    <span class="tiny-label">LOCALNET / E2E ONLY · NOT A PRODUCTION DEX</span><h2>Swap KUD for Mock USDC.</h2>
    <p>One real constant-product EVM pool, one router, real liquidity and receipts.</p>
    <form data-form="swap"><label><span>KUD amount</span><input name="amount" type="number" min="0.000001" step="0.000001" value="0.1" required></label><button class="k-confirm-button" ${chain?.evmAccount ? "" : "disabled"}>Execute real swap <span>⇄</span></button></form>
    <dl><div><dt>Router</dt><dd><code>${escapeHtml(chain?.config.swap.routerAddress)}</code></dd></div><div><dt>Mock USDC</dt><dd><code>${escapeHtml(chain?.config.swap.mockUsdcAddress)}</code></dd></div></dl>
  </section>`;
}

function render() {
  const root = document.querySelector("#kudora-account-root .k-account-wrap");
  if (!root || !chain) return;
  root.innerHTML = `<section class="kc-page" data-testid="chain-app">
    <section class="k-account-intro"><div><p class="eyebrow"><span>＋</span> KUDORA LOCALNET</p><h1>Real chain. Real transactions.</h1><p class="lead">Three validators · one shared Cosmos/EVM state · no backend.</p></div></section>
    ${walletMarkup()}
    <nav class="kc-tabs" aria-label="Chain features">
      ${[["account", "KUD"], ["governance", "Governance"], ["discussion", "Discussion"], ["swap", "Swap"]].map(([id, label]) => `<button data-chain-tab="${id}" class="${id === activeTab ? "active" : ""}">${label}</button>`).join("")}
    </nav>
    ${transactionStatus()}
    ${activeTab === "account" ? accountMarkup() : activeTab === "governance" ? governanceMarkup() : activeTab === "discussion" ? discussionMarkup() : swapMarkup()}
  </section>`;
  patchTopWallet();
}

function patchTopWallet() {
  const top = document.querySelector(".top-actions");
  if (!top) return;
  top.dataset.chainWallet = "true";
  const current = chain?.evmAccount ? chain.account() : null;
  top.innerHTML = current
    ? `<button class="wallet-button kc-top-wallet" data-open-chain-wallet><span class="glyph">⌁</span>${escapeHtml(accountName(current.evmAddress))} · ${escapeHtml(short(current.evmAddress))}</button>`
    : `<button class="wallet-button" data-open-chain-wallet><span class="glyph">⌁</span> Connect wallet</button>`;
  for (const button of document.querySelectorAll(".desktop-nav > button")) {
    if (!/Vote/i.test(button.textContent)) continue;
    const count = button.querySelector(".nav-count");
    if (count) count.textContent = String(proposals.length);
  }
}

async function refresh({ renderNow = true } = {}) {
  if (chain.evmAccount) balances = await chain.balances();
  if (activeTab === "governance") proposals = await chain.proposals();
  if (activeTab === "discussion") {
    messages = await chain.messages(discussionProposalId);
    reactionMap = new Map(await Promise.all(messages.map(async (message) => [message.messageId, await chain.reactions(discussionProposalId, message.messageId)])));
  }
  if (renderNow) render();
}

async function transact(label, action) {
  status = { state: "awaiting", label: `Awaiting wallet · ${label}`, hash: "" };
  render();
  try {
    status = { state: "pending", label: `Submitted · waiting for chain confirmation`, hash: "" };
    render();
    const result = await action();
    status = { state: "confirmed", label: `${label} confirmed`, hash: result.hash };
    await refresh({ renderNow: false });
    render();
    return result;
  } catch (error) {
    status = { state: "failed", label: error.shortMessage || error.message || String(error), hash: "" };
    render();
    throw error;
  }
}

async function connect(mode, account = chain.accountName) {
  status = { state: "awaiting", label: `Connecting ${mode}`, hash: "" };
  render();
  try {
    await chain.connect(mode, account);
    await refresh({ renderNow: false });
    status = { state: "confirmed", label: "Wallet connected to the real chain", hash: "" };
  } catch (error) {
    status = { state: "failed", label: error.message, hash: "" };
  }
  render();
}

async function onSubmit(event) {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(form));
  if (form.dataset.form === "send") await transact("KUD transfer", () => chain.sendKud(fields.recipient, fields.amount));
  if (form.dataset.form === "proposal") await transact("Governance proposal", () => chain.submitProposal(fields));
  if (form.dataset.form === "discussion") {
    await transact(fields.quick ? "Quick discussion post" : "Discussion post", () => chain.post(fields.text, discussionProposalId, Number(fields.parentId), Boolean(fields.quick)));
    selectedReply = 0;
  }
  if (form.dataset.form === "swap") await transact("Local swap", () => chain.swap(fields.amount));
}

async function onClick(event) {
  const wallet = event.target.closest("[data-wallet]")?.dataset.wallet;
  if (wallet) return connect(wallet);
  const tab = event.target.closest("[data-chain-tab]")?.dataset.chainTab;
  if (tab) {
    activeTab = tab;
    status = { state: "idle", label: "Ready", hash: "" };
    try {
      await refresh({ renderNow: false });
    } catch (error) {
      status = { state: "failed", label: error.message, hash: "" };
    }
    render();
    return;
  }
  if (event.target.closest("[data-refresh]")) return refresh();
  const proposalDiscussion = event.target.closest("[data-discuss-proposal]")?.dataset.discussProposal;
  if (proposalDiscussion) {
    discussionProposalId = Number(proposalDiscussion);
    selectedReply = 0;
    activeTab = "discussion";
    await refresh({ renderNow: false });
    render();
    return;
  }
  if (event.target.closest("[data-discussion-general]")) {
    discussionProposalId = 0;
    selectedReply = 0;
    await refresh({ renderNow: false });
    render();
    return;
  }
  const vote = event.target.closest("[data-vote]");
  if (vote) return transact("Governance vote", () => chain.vote(vote.dataset.proposalId, vote.dataset.vote));
  const reaction = event.target.closest("[data-reaction]");
  if (reaction) return transact("Reaction", () => chain.react(reaction.dataset.proposalId, reaction.dataset.messageId, reaction.dataset.reaction, Boolean(sessionStorage.getItem("kudora-session-key"))));
  const reply = event.target.closest("[data-reply]")?.dataset.reply;
  if (reply) { selectedReply = Number(reply); render(); return; }
  const zap = event.target.closest("[data-zap]")?.dataset.zap;
  if (zap) return transact("Zap", () => chain.zap(event.target.closest("[data-zap]").dataset.proposalId, zap, "0.01"));
  const session = event.target.closest("[data-session]")?.dataset.session;
  if (session === "authorize") return transact("Quick interactions authorized", () => chain.authorizeSession());
  if (session === "revoke") return transact("Quick interactions revoked", () => chain.revokeSession());
  if (event.target.closest("[data-open-chain-wallet]")) {
    window.KudoraHumanUI?.activateAccount();
    activeTab = "account";
    render();
  }
}

function bindNavigation() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest(".desktop-nav > button, .mobile-nav > button");
    if (!button) return;
    const text = button.textContent;
    let tab;
    if (/Account/i.test(text)) tab = "account";
    if (/Vote/i.test(text)) tab = "governance";
    if (/Discuss/i.test(text)) tab = "discussion";
    if (!tab) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.KudoraHumanUI?.activateAccount();
    activeTab = tab;
    status = { state: "idle", label: "Ready", hash: "" };
    refresh({ renderNow: false })
      .catch((error) => { status = { state: "failed", label: error.message, hash: "" }; })
      .finally(render);
  }, true);
}

async function start() {
  for (let attempt = 0; attempt < 100 && !document.querySelector("#kudora-account-root .k-account-wrap"); attempt += 1) await sleep(25);
  bindNavigation();
  document.addEventListener("click", (event) => { onClick(event).catch(() => {}); });
  document.addEventListener("submit", (event) => { onSubmit(event).catch(() => {}); });
  document.addEventListener("change", (event) => {
    const account = event.target.closest("[data-account-select]")?.value;
    if (account) connect(chain.walletMode, account);
  });
  try {
    chain = await KudoraChain.load();
    window.KudoraChain = chain;
    render();
    await connect("local-metamask", "alice");
  } catch (error) {
    const root = document.querySelector("#kudora-account-root .k-account-wrap");
    if (root) root.insertAdjacentHTML("afterbegin", `<div class="kc-status failed"><b>Chain configuration unavailable:</b> ${escapeHtml(error.message)}</div>`);
  }
}

start();
