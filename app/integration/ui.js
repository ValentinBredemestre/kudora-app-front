import { KudoraChain } from "./chain.js";

const encoder = new TextEncoder();
const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");
const shortAddress = (value) => value ? `${value.slice(0, 9)}…${value.slice(-5)}` : "—";
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const state = {
  chain: null,
  proposals: [],
  validators: [],
  transactions: [],
  rewards: "0",
  networkStats: null,
  activeProposal: null,
  balances: null,
  messages: new Map(),
  reactions: new Map(),
  parentId: 0,
  patchQueued: false,
  observer: null,
  observedRoot: null,
  proposalLoading: false,
  discussionLoading: new Set(),
  status: { state: "idle", label: "Ready", hash: "" },
};

function account() {
  try {
    return state.chain?.account() || null;
  } catch {
    return null;
  }
}

function accountName(address = account()?.evmAddress) {
  if (!address || !state.chain) return "Wallet";
  const match = Object.entries(state.chain.config.accounts || {})
    .find(([, candidate]) => candidate.evmAddress.toLowerCase() === address.toLowerCase());
  return match ? `${match[0][0].toUpperCase()}${match[0].slice(1)}` : shortAddress(address);
}

function ensureStatusOutput() {
  let output = document.getElementById("kudora-chain-status");
  if (!output) {
    output = document.createElement("output");
    output.id = "kudora-chain-status";
    output.className = "k-chain-status-output";
    output.dataset.testid = "transaction-status";
    output.setAttribute("aria-live", "polite");
    output.innerHTML = '<span data-chain-status-label></span><code data-testid="transaction-hash"></code>';
    document.body.append(output);
  }
  return output;
}

function setStatus(statusName, label, hash = "") {
  state.status = { state: statusName, label, hash };
  const output = ensureStatusOutput();
  output.dataset.state = statusName;
  output.querySelector("[data-chain-status-label]").textContent = label;
  const hashNode = output.querySelector("[data-testid='transaction-hash']");
  hashNode.textContent = hash;
  hashNode.hidden = !hash;
  document.body.dataset.chainTransactionState = statusName;
  if (statusName !== "idle") window.KudoraHumanUI?.showToast(label);
}

async function transact(label, action) {
  setStatus("awaiting", `Awaiting wallet · ${label}`);
  await sleep(0);
  setStatus("pending", `Submitted · waiting for chain confirmation`);
  try {
    const result = await action();
    setStatus("confirmed", `${label} confirmed`, result.hash || "");
    return result;
  } catch (error) {
    const message = error.shortMessage || error.message || String(error);
    setStatus("failed", message);
    throw error;
  }
}

async function copyAddress(value, label) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.className = "k-chain-copy-input";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  window.KudoraHumanUI?.showToast(`${label} tag copied`);
}

function closeSidePanel() {
  document.querySelector(".k-panel-backdrop")?.remove();
}

function panelHeader(eyebrow, title, copy) {
  return `<header class="k-panel-header"><div><span>${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></div><button type="button" data-chain-close-panel aria-label="Close">×</button></header>`;
}

function openSidePanel(content, label) {
  closeSidePanel();
  const backdrop = document.createElement("div");
  backdrop.className = "k-panel-backdrop open";
  backdrop.innerHTML = `<section class="k-side-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(label)}">${content}</section>`;
  backdrop.addEventListener("mousedown", (event) => event.target === backdrop && closeSidePanel());
  document.body.append(backdrop);
  return backdrop.querySelector(".k-side-panel");
}

function renderTopWallet() {
  const top = document.querySelector(".top-actions");
  if (!top) return;
  const current = account();
  const signature = current ? `${current.mode}:${current.evmAddress}` : "disconnected";
  top.dataset.chainWallet = "true";
  if (top.dataset.chainSignature === signature) return;
  top.dataset.chainSignature = signature;
  top.innerHTML = current ? `
    <div class="k-top-wallet">
      <button type="button" class="k-top-wallet-main" data-chain-open-wallet aria-label="Open connected account">
        <span class="representative-avatar portrait-lumen k-top-wallet-avatar" aria-hidden="true"></span>
        <span><small>CONNECTED ACCOUNT</small><strong>${escapeHtml(shortAddress(current.evmAddress))}</strong></span>
      </button>
      <button type="button" class="k-top-copy" data-chain-copy="evm" aria-label="Copy EVM tag" title="Copy EVM tag"><span aria-hidden="true">⧉</span> Copy</button>
    </div>` : '<button type="button" class="wallet-button" data-chain-open-connect><span class="glyph" aria-hidden="true">⌁</span> Connect wallet</button>';
}

function openConnectPanel() {
  openSidePanel(`
    ${panelHeader("SIGN IN", "Connect a wallet", "Choose the wallet you already use")}
    <div class="k-panel-body">
      <div class="wallet-grid wallet-grid-simple wallet-panel-options">
        <button type="button" data-chain-connect="keplr"><span><strong>Keplr</strong></span><span class="glyph">→</span></button>
        <button type="button" data-chain-connect="metamask"><span><strong>MetaMask</strong></span><span class="glyph">→</span></button>
      </div>
    </div>`, "Connect a wallet");
}

function openConnectedPanel() {
  const current = account();
  if (!current) return openConnectPanel();
  openSidePanel(`
    ${panelHeader("CONNECTED WALLET", "Your public tags.", "Copy either tag when someone needs to send money to you.")}
    <div class="k-panel-body k-wallet-panel-body">
      <section class="k-wallet-address-card"><div><span>EVM TAG</span><strong data-testid="evm-address">${escapeHtml(current.evmAddress)}</strong><small>Your public Ethereum-compatible tag</small></div><button type="button" data-chain-copy="evm" aria-label="Copy EVM tag"><span>⧉</span> Copy tag</button></section>
      <section class="k-wallet-address-card"><div><span>COSMOS TAG</span><strong data-testid="cosmos-address">${escapeHtml(current.cosmosAddress)}</strong><small>Your public Kudora tag</small></div><button type="button" data-chain-copy="cosmos" aria-label="Copy Cosmos tag"><span>⧉</span> Copy tag</button></section>
      <button type="button" class="k-disconnect-wallet" data-chain-disconnect>Disconnect Wallet</button>
    </div>`, "Your public tags");
}

async function connectWallet(kind, accountName = state.chain.accountName || "alice") {
  const useLocal = kind.startsWith("local-")
    || (kind === "metamask" && !window.ethereum)
    || (kind === "keplr" && !window.keplr);
  const mode = kind.startsWith("local-") ? kind : useLocal ? `local-${kind}` : kind;
  await transact(`Connect ${kind.replace("local-", "")}`, () => state.chain.connect(mode, accountName).then(() => ({ hash: "" })));
  closeSidePanel();
  renderTopWallet();
  await Promise.all([refreshAccount(), loadProposals()]);
  schedulePatch();
  return mode;
}

function disconnectWallet() {
  state.chain.walletMode = null;
  state.chain.evmAccount = null;
  state.chain.cosmosAddress = null;
  state.balances = null;
  closeSidePanel();
  renderTopWallet();
  patchAccount();
  setStatus("idle", "Wallet disconnected");
}

function formatKud(value, maximumFractionDigits = 6) {
  return Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits });
}

async function refreshAccount() {
  if (!account()) {
    state.balances = null;
    patchAccount();
    return;
  }
  try {
    [state.balances, state.validators, state.rewards, state.transactions] = await Promise.all([
      state.chain.balances(),
      state.chain.validators(),
      state.chain.rewards(),
      state.chain.transactions(),
    ]);
    window.KudoraHumanUI?.setTransactions?.(state.transactions);
  } catch (error) {
    setStatus("failed", error.message);
  }
  patchAccount();
  patchChoose();
}

function patchAccount() {
  const card = document.querySelector("#kudora-account-root .k-total-card");
  if (!card) return;
  const connected = account();
  const main = card.querySelector(".k-main-balance");
  if (main) {
    main.dataset.testid = "kud-balance";
    main.innerHTML = connected && state.balances ? `${formatKud(state.balances.kud)} <small>KUD</small>` : `— <small>KUD</small>`;
  }
  const fiat = main?.nextElementSibling;
  if (fiat) fiat.textContent = connected ? "Real balance on Kudora localnet" : "Connect a wallet to see your real balance";
  const values = card.querySelectorAll(".k-balance-breakdown b");
  if (values[0]) values[0].textContent = connected && state.balances ? `${formatKud(state.balances.kud)} KUD` : "—";
  const delegated = state.validators.reduce((sum, validator) => sum + Number(validator.delegationKud || 0), 0);
  if (values[1]) values[1].textContent = connected ? `${formatKud(delegated)} KUD` : "—";
  if (values[2]) values[2].textContent = connected ? `${formatKud(state.rewards)} KUD` : "—";
  patchMoneyGuide();
}

function patchMoneyGuide() {
  const guide = document.querySelector("#kudora-account-root .k-money-guide");
  if (!guide) return;
  const totals = { Community: 0, Sent: 0, Moved: 0 };
  for (const transaction of state.transactions) {
    if (transaction.amount >= 0) continue;
    if (transaction.category === "Community") totals.Community += Math.abs(transaction.amount);
    else if (transaction.category === "Sent") totals.Sent += Math.abs(transaction.amount);
    else totals.Moved += Math.abs(transaction.amount);
  }
  const maximum = Math.max(1, ...Object.values(totals));
  guide.querySelectorAll(".k-category-cell").forEach((cell, index) => {
    const [label, value] = [["Community", totals.Community], ["People & teams", totals.Sent], ["Moved elsewhere", totals.Moved]][index] || ["On chain", 0];
    const name = cell.querySelector("span");
    const amount = cell.querySelector("b");
    const bar = cell.querySelector(".k-category-bar i");
    if (name) name.lastChild.textContent = label;
    if (amount) amount.textContent = `${formatKud(value)} KUD`;
    if (bar) bar.style.width = `${(value / maximum) * 100}%`;
  });
}

function patchNetworkStats() {
  if (!state.networkStats) return;
  const comments = [...state.messages.values()].reduce((total, messages) => total + messages.filter((message) => message.parsed?.role !== "proposal").length, 0);
  const metrics = [
    ["BLOCK HEIGHT", `#${state.networkStats.height.toLocaleString("en-US")}`],
    ["INDEXED TRANSACTIONS", state.networkStats.transactions.toLocaleString("en-US")],
    ["BONDED VALIDATORS", String(state.networkStats.validators)],
    ["ON-CHAIN COMMENTS", comments.toLocaleString("en-US")],
    ["DECISIONS COMPLETED", String(state.networkStats.completed)],
    ["OPEN DECISIONS", String(state.networkStats.open)],
  ];
  document.querySelectorAll(".network-live").forEach((node) => { node.dataset.chainLive = "LIVE CHAIN"; });
  document.querySelectorAll(".network-ticker-group").forEach((group) => {
    group.querySelectorAll(".network-metric").forEach((metric, index) => {
      const [label, value] = metrics[index] || ["ON CHAIN", "—"];
      const labelNode = metric.querySelector("small");
      const valueNode = metric.querySelector(".network-rolling-value");
      if (labelNode) labelNode.dataset.chainLabel = label;
      if (valueNode) {
        valueNode.dataset.chainValue = value;
        valueNode.setAttribute("aria-label", value);
      }
    });
  });
}

function patchChoose() {
  const list = document.querySelector(".validator-list");
  if (!list || !state.validators.length) return;
  const connected = Boolean(account());
  const chosen = state.validators.filter((validator) => Number(validator.delegationKud) > 0);
  const portfolio = document.querySelector(".portfolio-main");
  if (portfolio) {
    const value = portfolio.querySelector(".portfolio-value strong");
    const label = portfolio.querySelector(".portfolio-value span");
    const detail = portfolio.querySelector(".portfolio-value small");
    const stats = portfolio.querySelectorAll(".portfolio-stats strong");
    const openProposal = state.proposals.find((proposal) => proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD");
    if (value) value.textContent = connected ? String(chosen.length) : "—";
    if (label) label.textContent = "VALIDATORS";
    if (detail) detail.textContent = connected ? "chosen by you on chain" : "connect your wallet";
    if (stats[0]) stats[0].textContent = connected ? `${formatKud(state.rewards)} KUD` : "—";
    if (stats[1]) stats[1].textContent = openProposal ? proposalTime(openProposal) : "No open vote";
    const note = portfolio.querySelector(".portfolio-placeholder");
    if (note) note.textContent = connected ? "Live x/staking data" : "Connect your wallet to read your x/staking data";
  }

  const validatorAccounts = new Set((state.chain?.config.validators || []).map((validator) => validator.accountAddress));
  const representativeProposals = state.proposals.filter((proposal) => (proposal.votes || []).some((vote) => validatorAccounts.has(vote.voter)));
  const activeList = document.querySelector(".active-vote-list");
  if (activeList) {
    const rows = [...activeList.querySelectorAll(".active-vote-row")];
    rows.forEach((row, index) => {
      const proposal = representativeProposals[index];
      if (!proposal) {
        row.hidden = true;
        delete row.dataset.chainProposalId;
        return;
      }
      row.hidden = false;
      row.dataset.chainProposalId = proposal.id;
      const meta = row.querySelector(".active-vote-copy small");
      const title = row.querySelector(".active-vote-copy strong");
      const choices = row.querySelector(".active-vote-choices");
      if (meta) meta.textContent = `KIP–${proposal.id} · ${proposalTime(proposal)}`;
      if (title) title.textContent = proposal.title;
      if (choices) {
        choices.innerHTML = (proposal.votes || []).filter((vote) => validatorAccounts.has(vote.voter)).slice(0, 3)
          .map((vote) => `<span class="active-voter-copyline"><strong>${escapeHtml(validatorNameForVote(vote.voter))}</strong><span class="vote-label">${escapeHtml(voteLabel(vote))}</span></span>`).join("");
      }
    });
    const more = activeList.querySelector(".active-votes-load");
    if (more) {
      const remaining = Math.max(0, representativeProposals.length - rows.length);
      more.hidden = remaining === 0;
      const small = more.querySelector("small");
      if (small) small.textContent = `${remaining} remaining`;
    }
  }

  const rows = [...list.querySelectorAll(".validator-row:not(.validator-head)")];
  rows.forEach((row, index) => {
    const validator = state.validators[index];
    if (!validator) {
      row.hidden = true;
      delete row.dataset.chainValidator;
      return;
    }
    row.hidden = false;
    row.dataset.chainValidator = validator.operator_address;
    row.classList.toggle("delegated", Number(validator.delegationKud) > 0);
    row.setAttribute("aria-label", `Open ${validator.name}`);
    const rank = row.querySelector(".rank");
    const name = row.querySelector(".validator-name strong");
    const detail = row.querySelector(".validator-name small");
    const supporters = row.querySelector(".supporters");
    const uptime = row.querySelector(".uptime");
    const reward = row.querySelector(".positive");
    const button = row.querySelector("button");
    if (rank) rank.textContent = String(index + 1).padStart(2, "0");
    if (name) name.firstChild.textContent = validator.name;
    if (detail) detail.textContent = shortAddress(validator.operator_address);
    if (supporters) supporters.textContent = `${validator.powerPercent.toFixed(1)}% voting power`;
    if (uptime) uptime.textContent = validator.jailed ? "Jailed" : "Bonded";
    if (reward) reward.textContent = `${formatKud(validator.delegationKud)} KUD`;
    if (button) {
      button.textContent = Number(validator.delegationKud) > 0 ? "Add tokens" : "Delegate";
      button.dataset.chainDelegate = validator.operator_address;
      button.className = Number(validator.delegationKud) > 0 ? "secondary-button small" : "outline-button small";
    }
  });
  list.querySelectorAll(".validator-group-label, .validator-load-more").forEach((node) => { node.hidden = true; });
  const stat = document.querySelector(".set-stat");
  if (stat) {
    const label = stat.querySelector("small");
    const total = stat.querySelector("strong");
    const status = stat.querySelector("span");
    if (label) label.textContent = "BONDED VALIDATORS";
    if (total) total.textContent = String(state.validators.length);
    if (status) status.innerHTML = `<i></i> ${state.validators.filter((validator) => !validator.jailed).length} active on chain`;
  }
}

function openRepresentativeVotes(proposalId) {
  const proposal = state.proposals.find((candidate) => candidate.id === proposalId);
  if (!proposal) return;
  const validatorAccounts = new Set((state.chain?.config.validators || []).map((validator) => validator.accountAddress));
  const votes = (proposal.votes || []).filter((vote) => validatorAccounts.has(vote.voter));
  openSidePanel(`
    ${panelHeader(`KIP–${proposal.id} · ON-CHAIN VOTES`, proposal.title, proposal.summary)}
    <div class="k-panel-body">${votes.map((vote) => `<section class="k-wallet-address-card"><div><span>BONDED VALIDATOR</span><strong>${escapeHtml(validatorNameForVote(vote.voter))}</strong><small>${escapeHtml(voteLabel(vote))} · read from x/gov</small></div></section>`).join("")}</div>`, "Validator votes");
}

function openValidatorPanel(validatorAddress) {
  const validator = state.validators.find((candidate) => candidate.operator_address === validatorAddress);
  if (!validator) return;
  openSidePanel(`
    ${panelHeader("BONDED VALIDATOR", validator.name, validator.operator_address)}
    <div class="k-panel-body"><section class="k-wallet-address-card"><div><span>VOTING POWER</span><strong>${validator.powerPercent.toFixed(2)}%</strong><small>${formatKud(Number(validator.tokens) / 1e18)} KUD bonded</small></div></section>
      <section class="k-wallet-address-card"><div><span>YOUR DELEGATION</span><strong>${formatKud(validator.delegationKud)} KUD</strong><small>Read directly from x/staking</small></div></section>
      <form class="k-money-form" data-chain-delegate-form data-chain-validator="${escapeHtml(validator.operator_address)}">
        <label><span>Amount to delegate</span><div class="k-amount-input"><input name="amount" required type="number" min="0.000001" step="0.000001" value="10"><b>KUD</b></div></label>
        <button class="k-confirm-button" type="submit">Delegate on chain <span>→</span></button>
      </form>
    </div>`, `Delegate to ${validator.name}`);
}

function patchMoneyForms() {
  const move = document.querySelector('form[data-money-form="move"]');
  if (move && !move.dataset.chainPatched) {
    move.dataset.chainPatched = "true";
    const panel = move.closest(".k-side-panel");
    const heading = panel?.querySelector(".k-panel-header");
    if (heading) {
      heading.querySelector("span").textContent = "LOCAL SWAP";
      heading.querySelector("h2").textContent = "Swap KUD for Mock USDC.";
      heading.querySelector("p").textContent = "A real local-only EVM swap. This is not a production DEX.";
    }
    move.innerHTML = `
      <div class="k-network-route"><button type="button" class="selected"><span class="k-network-mark kudora"><img src="/kudora-logo.svg" alt=""></span><span><small>FROM</small><strong>KUD</strong></span></button><span class="k-swap-direction">⇄</span><button type="button"><span class="k-network-mark ethereum">$</span><span><small>TO</small><strong>Mock USDC</strong></span></button></div>
      <label><span>How much do you want to swap?</span><div class="k-amount-input"><input name="amount" required type="number" min="0.000001" step="0.000001" value="0.1"><b>KUD</b></div></label>
      <div class="k-plain-explanation compact"><span>LOCALNET / E2E ONLY</span><p>Real contract, balance and receipt. No production DEX claim.</p></div>
      <button class="k-confirm-button" type="submit">Review the swap <span>→</span></button>`;
  }
  const add = document.querySelector('form[data-money-form="add"]');
  if (add && !add.dataset.chainPatched) {
    add.dataset.chainPatched = "true";
    const button = add.querySelector("button[type='submit']");
    if (button) {
      button.disabled = true;
      button.textContent = "Card payments are not available in localnet";
    }
  }
}

function recordTransaction({ id, category, icon, title, note, amount, hash }) {
  window.KudoraHumanUI?.recordTransaction?.({
    id: id || `${category}-${Date.now()}`,
    category,
    icon,
    title,
    note: note || shortAddress(hash),
    date: "Just now",
    amount,
    fee: 0,
    status: "Confirmed",
    explanation: `Confirmed on Kudora. Transaction ${hash}.`,
  });
}

function proposalMetadata(proposal) {
  try {
    const parsed = JSON.parse(proposal.metadata || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function tallyPercentages(proposal) {
  const tally = proposal.tally || proposal.final_tally_result || {};
  const counts = ["yes_count", "no_count", "abstain_count", "no_with_veto_count"].map((key) => BigInt(tally[key] || 0));
  const total = counts.reduce((sum, value) => sum + value, 0n);
  return counts.map((value) => total ? Number((value * 10_000n) / total) / 100 : 0);
}

function patchResult(result, proposal) {
  if (!result) return;
  const percentages = tallyPercentages(proposal);
  result.setAttribute("aria-label", `Current result: ${percentages[0]}% yes, ${percentages[1]}% no, ${percentages[2]}% abstain and ${percentages[3]}% no with veto`);
  const bars = result.querySelectorAll(".proposal-result-bar > span");
  bars.forEach((bar, index) => { bar.style.width = `${percentages[index]}%`; });
  result.querySelectorAll(".proposal-result-legend strong").forEach((node, index) => { node.textContent = `${percentages[index]}%`; });
}

function proposalTime(proposal) {
  const end = proposal.voting_end_time ? new Date(proposal.voting_end_time) : null;
  if (!end || Number.isNaN(end.getTime())) return String(proposal.status || "ON CHAIN").replace("PROPOSAL_STATUS_", "").replaceAll("_", " ");
  if (end.getTime() <= Date.now()) return String(proposal.status || "CLOSED").replace("PROPOSAL_STATUS_", "").replaceAll("_", " ");
  const hours = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 3_600_000));
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h`;
}

function visibleMessages(proposalId) {
  return (state.messages.get(String(proposalId)) || []).filter((message) => message.parsed?.role !== "proposal");
}

function proposalAnchor(proposalId) {
  return (state.messages.get(String(proposalId)) || []).find((message) => message.parsed?.role === "proposal");
}

function validatorNameForVote(voter) {
  const configured = (state.chain?.config.validators || []).find((validator) => validator.accountAddress === voter);
  const user = state.chain?.config.accounts && Object.entries(state.chain.config.accounts).find(([, candidate]) => candidate.cosmosAddress === voter);
  return configured?.name || (user ? `${user[0][0].toUpperCase()}${user[0].slice(1)}` : shortAddress(voter));
}

function voteLabel(vote) {
  return String(vote.options?.[0]?.option || "VOTE_OPTION_UNSPECIFIED").replace("VOTE_OPTION_", "").replaceAll("_", " ");
}

function patchProposalArticle(article, proposal) {
  article.hidden = false;
  article.dataset.chainProposalId = proposal.id;
  article.dataset.testid = `proposal-${proposal.id}`;
  article.setAttribute("aria-label", `Open KIP–${proposal.id}: ${proposal.title}`);
  const copy = article.querySelector(".proposal-list-copy");
  if (copy) {
    copy.querySelector("span").textContent = `KIP–${proposal.id} · ON-CHAIN`;
    copy.querySelector("h3").textContent = proposal.title;
    copy.querySelector("p").textContent = proposal.summary;
  }
  const time = article.querySelector(".proposal-list-signal");
  if (time) {
    time.querySelector("strong").textContent = proposalTime(proposal);
    time.querySelector("small").textContent = "on chain";
  }
  article.querySelector(".personal-choice")?.setAttribute("hidden", "");
  patchResult(article.querySelector(".proposal-result"), proposal);
  const engagement = article.querySelector(".proposal-engagement");
  if (engagement) {
    const values = engagement.querySelectorAll("strong");
    if (values[0]) values[0].textContent = String(proposal.participantCount || 0);
    if (values[1]) values[1].textContent = String(visibleMessages(proposal.id).length);
    if (values[2]) values[2].textContent = `${Number(proposal.participationPercent || 0).toFixed(1)}%`;
    engagement.querySelectorAll("small").forEach((node, index) => { node.textContent = ["participants", "comments", "took part"][index] || ""; });
  }
  const peek = article.querySelector(".proposal-representative-peek");
  if (peek) {
    const representativeVotes = (proposal.votes || []).filter((vote) => (state.chain?.config.validators || []).some((validator) => validator.accountAddress === vote.voter));
    peek.hidden = !representativeVotes.length;
    if (representativeVotes.length) {
      peek.innerHTML = `<span>REPRESENTATIVES TOOK PART</span><div>${representativeVotes.slice(0, 3).map((vote) => `<strong>${escapeHtml(validatorNameForVote(vote.voter))} <small>${escapeHtml(voteLabel(vote))}</small></strong>`).join("")}</div>`;
    }
  }
  let actions = article.querySelector(":scope > .k-proposal-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "k-proposal-actions k-chain-proposal-state";
    article.append(actions);
  }
  const anchor = proposalAnchor(proposal.id);
  if (!anchor) {
    actions.innerHTML = "<small>Community signals will appear when the first on-chain signal is created.</small>";
  } else {
    const reactions = reactionState(proposal.id, anchor);
    actions.dataset.chainMessageId = anchor.messageId;
    actions.innerHTML = `<span class="k-reaction-bar">
      <button type="button" class="k-reaction ${reactions.own === 1 ? "active useful" : ""}" data-chain-proposal-reaction="1"><span>◇</span> Useful <b>${reactions.useful}</b></button>
      <button type="button" class="k-reaction ${reactions.own === 2 ? "active not-useful" : ""}" data-chain-proposal-reaction="2"><span>×</span> Not useful <b>${reactions.notUseful}</b></button>
      <button type="button" class="k-reaction zap" data-chain-proposal-zap><span>ϟ</span> Zap <b>KUD</b></button>
    </span>`;
  }
}

function patchProposalSurface() {
  document.querySelectorAll(".nav-count").forEach((node) => { node.textContent = String(state.proposals.length); });
  const feed = document.querySelector(".proposal-feed");
  if (!feed) return;
  const open = state.proposals.filter((proposal) => proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD").length;
  const count = feed.querySelector(".proposal-feed-toolbar span");
  if (count) count.innerHTML = `<i></i> ${open} OPEN · ${state.proposals.length} TOTAL`;
  const labels = [
    ["YOUR ACTIVE VOTES", "Decisions where your wallet took part", "active"],
    ["YOUR REPRESENTATIVES TOOK PART", "Votes cast by bonded validators", "representatives"],
    ["CLOSING SOON", "Open decisions ordered by their deadline", "closing"],
    ["MOST DISCUSSED", "Completed decisions with the richest discussion", "most-discussed"],
  ];
  const grouped = Object.fromEntries(labels.map(([, , key]) => [key, []]));
  for (const proposal of state.proposals) {
    let group = proposalMetadata(proposal).group;
    if (!grouped[group]) group = proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD" ? "closing" : "most-discussed";
    grouped[group].push(proposal);
  }
  feed.querySelectorAll(".proposal-group").forEach((group, index) => {
    const [labelText, hintText, key] = labels[index] || labels.at(-1);
    const proposals = grouped[key];
    const articles = [...group.querySelectorAll(".proposal-list-item")];
    articles.forEach((article, articleIndex) => {
      const proposal = proposals[articleIndex];
      if (proposal) patchProposalArticle(article, proposal);
      else {
        article.hidden = true;
        delete article.dataset.chainProposalId;
      }
    });
    const visible = articles.some((article) => !article.hidden);
    group.hidden = !visible;
    if (visible) {
      const label = group.querySelector(":scope > header span");
      const hint = group.querySelector(":scope > header small");
      if (label) label.textContent = labelText;
      if (hint) hint.textContent = hintText;
      const more = group.querySelector(".proposal-view-more");
      if (more) {
        const remaining = Math.max(0, proposals.length - articles.length);
        more.hidden = remaining === 0;
        const small = more.querySelector("small");
        if (small) small.textContent = `${remaining} remaining`;
      }
    }
  });
  let empty = feed.querySelector(".k-chain-empty-proposals");
  if (!state.proposals.length) {
    if (!empty) {
      empty = document.createElement("div");
      empty.className = "k-chain-empty-proposals";
      empty.innerHTML = "<strong>No on-chain proposal yet.</strong><span>Use “Propose something” to publish the first real x/gov proposal.</span>";
      feed.querySelector(".proposal-table")?.append(empty);
    }
  } else {
    empty?.remove();
  }
}

async function loadProposals() {
  if (!state.chain || state.proposalLoading) return;
  state.proposalLoading = true;
  try {
    state.proposals = await state.chain.proposals();
    if (state.activeProposal) state.activeProposal = state.proposals.find((proposal) => proposal.id === state.activeProposal.id) || state.activeProposal;
  } catch (error) {
    setStatus("failed", `Could not read x/gov: ${error.message}`);
  } finally {
    state.proposalLoading = false;
  }
  patchProposalSurface();
  patchProposalDetail();
}

async function loadAllDiscussions() {
  const ids = state.proposals.map((proposal) => proposal.id);
  for (let offset = 0; offset < ids.length; offset += 6) {
    await Promise.all(ids.slice(offset, offset + 6).map((id) => loadDiscussion(id, false, true)));
  }
  patchProposalSurface();
  patchCommunitySurface();
  patchNetworkStats();
}

function patchCommunitySurface() {
  const layout = document.querySelector(".community-layout");
  if (!layout) return;
  const conversations = state.proposals
    .filter((proposal) => visibleMessages(proposal.id).length)
    .sort((left, right) => visibleMessages(right.id).length - visibleMessages(left.id).length);
  const cards = [...layout.querySelectorAll(".topic-card")];
  cards.forEach((card, index) => {
    const proposal = conversations[index];
    if (!proposal) {
      card.hidden = true;
      delete card.dataset.chainProposalId;
      return;
    }
    card.hidden = false;
    card.dataset.chainProposalId = proposal.id;
    const messages = visibleMessages(proposal.id);
    const first = messages[0];
    const metadata = card.querySelectorAll(".topic-meta span");
    if (metadata[0]) metadata[0].textContent = `DECISION KIP–${proposal.id}`;
    if (metadata[1]) metadata[1].textContent = first ? relativeTime(first.created_at) : "on chain";
    const title = card.querySelector("h3");
    const excerpt = card.querySelector("p");
    if (title) title.textContent = proposal.title;
    if (excerpt) excerpt.textContent = first?.parsed?.text || proposal.summary;
    const author = card.querySelector(".topic-author");
    if (author && first) author.lastChild.textContent = accountName(first.evmAuthor);
    const linked = card.querySelector(".topic-footer em");
    if (linked) linked.textContent = `KIP–${proposal.id}`;
    const counts = card.querySelectorAll(".topic-counts b");
    const signals = messages.reduce((total, message) => total + reactionState(proposal.id, message).reactions.length, 0);
    if (counts[0]) counts[0].textContent = `⌁ ${messages.length}`;
    if (counts[1]) counts[1].textContent = `◇ ${signals}`;
  });

  const heading = layout.querySelector(".section-mini-heading span:first-child");
  if (heading) heading.textContent = `${conversations.length} ON-CHAIN CONVERSATIONS`;
  const live = layout.querySelector(".community-live");
  if (live) live.innerHTML = `<i></i> ${[...state.messages.values()].reduce((total, messages) => total + messages.filter((message) => message.parsed?.role !== "proposal").length, 0)} comments on chain`;

  const activeCard = cards.find((card) => card.classList.contains("active") && card.dataset.chainProposalId) || cards.find((card) => card.dataset.chainProposalId);
  const proposal = state.proposals.find((candidate) => candidate.id === activeCard?.dataset.chainProposalId);
  const discussion = layout.querySelector("article.discussion");
  if (!proposal || !discussion) return;
  state.activeProposal = proposal;
  const messages = visibleMessages(proposal.id);
  const first = messages[0];
  const head = discussion.querySelector(".discussion-head");
  const metadata = head?.querySelectorAll(".topic-meta span") || [];
  if (metadata[0]) metadata[0].textContent = `DECISION KIP–${proposal.id}`;
  if (metadata[1]) metadata[1].textContent = first ? relativeTime(first.created_at) : "on chain";
  const title = head?.querySelector("h2");
  const excerpt = head?.querySelector(":scope > p");
  if (title) title.textContent = proposal.title;
  if (excerpt) excerpt.textContent = proposal.summary;
  const authorName = head?.querySelector(".discussion-author strong");
  const authorRole = head?.querySelector(".discussion-author small");
  if (authorName) authorName.textContent = first ? accountName(first.evmAuthor) : shortAddress(proposal.proposer || "on chain");
  if (authorRole) authorRole.textContent = "On-chain contributor";
  const linked = head?.querySelector(".discussion-author button");
  if (linked) linked.hidden = true;

  const anchor = proposalAnchor(proposal.id);
  const reactions = anchor ? reactionState(proposal.id, anchor) : { useful: 0, notUseful: 0 };
  const reactionBar = head?.querySelector(".neon-reactions");
  if (reactionBar && anchor) {
    reactionBar.dataset.chainMessageId = anchor.messageId;
    const buttons = reactionBar.querySelectorAll("button");
    if (buttons[0]) {
      buttons[0].dataset.chainProposalReaction = "1";
      buttons[0].innerHTML = `<span>◇</span> Useful <b>${reactions.useful}</b>`;
    }
    if (buttons[1]) {
      buttons[1].dataset.chainProposalReaction = "2";
      buttons[1].innerHTML = `<span>×</span> Not useful <b>${reactions.notUseful}</b>`;
    }
    if (buttons[2]) {
      buttons[2].dataset.chainProposalZap = "true";
      buttons[2].innerHTML = "<span>ϟ</span> Zap <b>KUD</b>";
    }
  }
  const commentsHead = discussion.querySelector(".comments-head span");
  if (commentsHead) commentsHead.textContent = `${messages.length} ON-CHAIN COMMENTS`;
  const comments = discussion.querySelector(".comments-list");
  if (comments) comments.innerHTML = messages.map((message) => renderMessage(proposal.id, message)).join("");
  const form = discussion.querySelector(".comment-composer");
  if (form) {
    form.dataset.chainCommunityForm = "true";
    form.dataset.chainProposalId = proposal.id;
    const textarea = form.querySelector("textarea");
    if (textarea) textarea.placeholder = "Add an on-chain fact, question or point of view…";
    const note = form.querySelector(".composer-bottom span");
    if (note) note.textContent = "Published on Kudora.";
  }
}

function findSection(panel, label) {
  return [...panel.querySelectorAll("section")].find((section) => [...section.querySelectorAll("span, small")].some((node) => node.textContent.trim() === label));
}

async function patchVoteRecord(panel, proposal) {
  const note = panel.querySelector(".your-vote-note");
  if (!note || !account()) return;
  const signature = `${proposal.id}:${account().cosmosAddress}`;
  if (note.dataset.chainVoteSignature === signature) return;
  note.dataset.chainVoteSignature = signature;
  try {
    const record = await state.chain.voteRecord(proposal.id);
    const option = record.vote?.options?.[0]?.option?.replace("VOTE_OPTION_", "").replaceAll("_", " ") || "Recorded";
    note.innerHTML = `<span class="your-vote-orb">✓</span><div><span>YOUR CURRENT VOTE</span><strong>${escapeHtml(option)}</strong><small>Read from x/gov</small></div>`;
  } catch {
    note.innerHTML = '<span class="your-vote-orb">◇</span><div><span>YOUR CURRENT VOTE</span><strong>Not voted yet</strong><small>Your wallet can vote while the proposal is open.</small></div>';
  }
}

function patchProposalDetail() {
  const proposal = state.activeProposal;
  const panel = document.querySelector(".decision-panel:not(.proposal-composer-panel)");
  if (!proposal || !panel) return;
  panel.dataset.chainProposalId = proposal.id;
  panel.dataset.testid = `proposal-detail-${proposal.id}`;
  const header = panel.querySelector(".decision-panel-header");
  const headerLabel = header?.querySelector("span");
  if (headerLabel) headerLabel.textContent = `KIP–${proposal.id} · ${proposalTime(proposal).toUpperCase()}`;
  const title = header?.querySelector("h2") || panel.querySelector("h2");
  if (title) title.textContent = proposal.title;
  patchResult(panel.querySelector(".proposal-result"), proposal);
  const metadata = proposalMetadata(proposal);
  const brief = panel.querySelector(".decision-brief-intro") || findSection(panel, "DECISION BRIEF");
  const briefContext = brief?.querySelector("h3");
  if (briefContext) briefContext.textContent = metadata.context || proposal.summary;
  let briefCopy = brief?.querySelector("p");
  if (!briefCopy && brief) {
    briefCopy = document.createElement("p");
    brief.append(briefCopy);
  }
  if (briefCopy) briefCopy.textContent = proposal.summary;
  const facts = panel.querySelector(".decision-facts");
  if (facts) {
    const author = facts.querySelector(".proposal-author-link");
    if (author) {
      author.disabled = true;
      author.innerHTML = `<span><strong>${escapeHtml(proposal.proposer ? shortAddress(proposal.proposer) : "On-chain proposer")}</strong><small>Recorded by x/gov</small></span>`;
    }
    const values = facts.querySelectorAll("strong");
    if (values.length) values[values.length - 1].textContent = metadata.outcome || proposal.summary;
  }
  const visual = findSection(panel, "VISUAL BRIEF");
  if (visual) visual.hidden = true;
  const delivery = findSection(panel, "DELIVERY AND PUBLIC CHECKPOINTS");
  if (delivery) {
    const list = delivery.querySelector("ol, .proposal-milestones, div:last-child");
    const changes = Array.isArray(metadata.changes) ? metadata.changes : metadata.changes ? [metadata.changes] : [];
    if (list && changes.length) list.innerHTML = changes.map((change, index) => `<div><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(change)}</strong></div>`).join("");
    else delivery.hidden = true;
  }
  panel.querySelector(".k-proposal-detail-actions")?.setAttribute("hidden", "");
  const vote = [...panel.querySelectorAll("button")].find((button) => /^Vote\b|^Change vote\b/i.test(button.textContent.trim()));
  if (vote) {
    vote.dataset.testid = `vote-proposal-${proposal.id}`;
    const open = proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD";
    vote.disabled = !open;
    if (!open) vote.textContent = "Voting closed";
  }
  const discussion = [...panel.querySelectorAll("button")].find((button) => /Open full discussion/i.test(button.textContent));
  if (discussion) {
    discussion.dataset.testid = `discussion-proposal-${proposal.id}`;
    const count = visibleMessages(proposal.id).length;
    discussion.innerHTML = `Open full discussion <small>${count}</small> <span class="glyph">→</span>`;
  }
  patchVoteRecord(panel, proposal);
  loadDiscussion(proposal.id);
}

function patchVotePanel() {
  const proposal = state.activeProposal;
  const panel = document.querySelector(".vote-action-panel");
  if (!proposal || !panel) return;
  panel.dataset.chainProposalId = proposal.id;
  const label = panel.querySelector(".discussion-panel-header > div span");
  if (label) label.textContent = `KIP–${proposal.id} / YOUR CHOICE`;
  const heading = panel.querySelector(".discussion-panel-header h2");
  if (heading) heading.textContent = "Vote on this proposal";
  const form = panel.querySelector(".vote-action-form");
  if (form) {
    form.dataset.chainProposalId = proposal.id;
    form.dataset.testid = "vote-form";
    const note = form.querySelector(".security-note");
    if (note) note.textContent = "Your wallet signs a real x/gov transaction.";
    const summaryValues = form.querySelectorAll(".vote-confirm-summary strong");
    if (summaryValues[1]) summaryValues[1].textContent = proposalTime(proposal);
    const submit = form.querySelector("button[type='submit']");
    if (submit && proposal.status !== "PROPOSAL_STATUS_VOTING_PERIOD") {
      submit.disabled = true;
      submit.textContent = "Voting closed";
    }
  } else if (account()) {
    const kind = state.chain.isKeplr() ? "Keplr" : "MetaMask";
    const button = [...panel.querySelectorAll("button")].find((candidate) => candidate.textContent.trim().startsWith(kind));
    if (button && !button.dataset.chainAdvancing) {
      button.dataset.chainAdvancing = "true";
      button.dataset.chainBypass = "true";
      queueMicrotask(() => button.click());
    }
  }
}

function proposalFields(form) {
  const panel = form.closest(".proposal-composer-panel");
  const preview = panel?.querySelector(".proposal-preview-brief");
  const textareas = [...form.querySelectorAll("textarea")].map((field) => field.value.trim()).filter(Boolean);
  const title = preview?.querySelector("h3")?.textContent.trim()
    || [...form.querySelectorAll("input")].map((field) => field.value.trim()).find(Boolean)
    || "Kudora proposal";
  const previewParagraphs = [...(preview?.querySelectorAll("p") || [])].map((node) => node.textContent.trim()).filter(Boolean);
  const summary = previewParagraphs[0] || textareas[0] || title;
  const outcomeNode = [...(panel?.querySelectorAll("small, span") || [])].find((node) => node.textContent.trim() === "IF APPROVED")?.parentElement;
  const outcome = outcomeNode?.querySelector("p, strong")?.textContent.trim() || textareas.at(-1) || summary;
  const context = textareas[0] || summary;
  const changes = textareas[1] || outcome;
  return { title, summary, context, changes, outcome };
}

function messageKey(proposalId, messageId) {
  return `${proposalId}:${messageId}`;
}

async function loadDiscussion(proposalId, force = false, quiet = false) {
  const id = String(proposalId);
  if (!force && state.messages.has(id)) return;
  if (state.discussionLoading.has(id)) return;
  state.discussionLoading.add(id);
  try {
    const messages = await state.chain.messages(id);
    state.messages.set(id, messages);
    const entries = await Promise.all(messages.map(async (message) => [messageKey(id, message.messageId), await state.chain.reactions(id, message.messageId)]));
    entries.forEach(([key, value]) => state.reactions.set(key, value));
  } catch (error) {
    setStatus("failed", `Could not read discussion: ${error.message}`);
  } finally {
    state.discussionLoading.delete(id);
  }
  if (!quiet) {
    patchProposalSurface();
    patchDiscussionPanel();
    patchDiscussionPreview();
    patchNetworkStats();
  }
}

function relativeTime(value) {
  const timestamp = Number(value || 0) * 1000;
  if (!timestamp) return "on chain";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function reactionState(proposalId, message) {
  const reactions = state.reactions.get(messageKey(proposalId, message.messageId)) || [];
  let own = 0;
  const current = account()?.evmAddress?.slice(2).toLowerCase();
  for (const reaction of reactions) {
    if (current && reaction.account) {
      const bytes = Uint8Array.from(atob(reaction.account), (character) => character.charCodeAt(0));
      const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
      if (hex === current) own = String(reaction.reaction).endsWith("NOT_USEFUL") ? 2 : 1;
    }
  }
  return {
    reactions,
    own,
    useful: reactions.filter((reaction) => String(reaction.reaction).endsWith("USEFUL") && !String(reaction.reaction).endsWith("NOT_USEFUL")).length,
    notUseful: reactions.filter((reaction) => String(reaction.reaction).endsWith("NOT_USEFUL")).length,
  };
}

function contentMarkup(parsed) {
  const text = parsed.text ? `<p>${escapeHtml(parsed.text)}</p>` : "";
  if (!parsed.t || parsed.t === "text") return text;
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return `${text}<section class="discussion-visual-card visual-${escapeHtml(parsed.t)}"><header><span>${escapeHtml(parsed.t.toUpperCase())}</span><strong>${escapeHtml(parsed.title || "Visual contribution")}</strong></header>${items.length ? `<ol>${items.map((item) => `<li>${escapeHtml(Array.isArray(item) ? item.join(" · ") : item)}</li>`).join("")}</ol>` : ""}</section>`;
}

function renderMessage(proposalId, message) {
  const reactions = reactionState(proposalId, message);
  const name = accountName(message.evmAuthor);
  const reply = message.parentId !== "0" ? `<span class="reply-context">↳ Reply to message #${escapeHtml(message.parentId)}</span>` : "";
  return `<article class="discussion-message progressive-reveal ${message.parentId !== "0" ? "depth-1" : "depth-0"}" data-testid="message-${message.messageId}" data-chain-message-id="${message.messageId}">
    <span class="representative-avatar portrait-civic discussion-profile" aria-hidden="true"></span>
    <div><header><strong>${escapeHtml(name)}</strong><small>${escapeHtml(relativeTime(message.created_at))}</small></header>${reply}${contentMarkup(message.parsed)}
      <footer class="comment-actions" data-kudora-reactions="true"><span class="k-reaction-bar compact">
        <button type="button" class="k-reaction ${reactions.own === 1 ? "active useful" : ""}" data-chain-reaction="1"><span>◇</span> Useful <b>${reactions.useful}</b></button>
        <button type="button" class="k-reaction ${reactions.own === 2 ? "active not-useful" : ""}" data-chain-reaction="2"><span>×</span> Not useful <b>${reactions.notUseful}</b></button>
        <button type="button" class="k-reaction zap" data-chain-zap><span>ϟ</span> Zap <b>KUD</b></button>
      </span><button type="button" data-chain-reply>↳ Reply</button></footer>
    </div>
  </article>`;
}

function patchDiscussionPreview() {
  const proposal = state.activeProposal;
  const panel = document.querySelector(".decision-panel:not(.proposal-composer-panel)");
  if (!proposal || !panel) return;
  const section = findSection(panel, "STRONGEST COMMUNITY ARGUMENTS");
  if (!section) return;
  const messages = visibleMessages(proposal.id);
  const count = section.querySelector(".decision-section-title small");
  if (count) count.textContent = `${messages.length} comments`;
  const existing = section.querySelectorAll(":scope > article");
  existing.forEach((article, index) => {
    const message = messages[index];
    if (!message) {
      article.hidden = true;
      return;
    }
    article.hidden = false;
    const author = article.querySelector("header strong");
    const copy = article.querySelector("p");
    const useful = article.querySelector("footer, article > div > span");
    if (author) author.textContent = accountName(message.evmAuthor);
    if (copy) copy.textContent = message.parsed.text || message.parsed.title || "On-chain contribution";
    if (useful) useful.textContent = `◇ ${reactionState(proposal.id, message).useful} found this useful`;
    article.querySelectorAll(".discussion-status").forEach((node) => node.remove());
  });
}

function sessionControls() {
  const enabled = Boolean(sessionStorage.getItem("kudora-session-key"));
  return `<div class="k-chain-session-controls" data-testid="quick-interactions"><span><small>QUICK INTERACTIONS</small><strong>${enabled ? "Enabled for this browser tab" : "Use one approval for comments and reactions"}</strong></span><button type="button" data-chain-session="authorize">${enabled ? "Refill / renew" : "Enable once"}</button>${enabled ? '<button type="button" data-chain-session="revoke">Revoke</button>' : ""}</div>`;
}

function patchDiscussionPanel() {
  const proposal = state.activeProposal;
  const panel = [...document.querySelectorAll(".discussion-panel")].find((candidate) => candidate.querySelector(".discussion-composer"));
  if (!proposal || !panel) return;
  panel.dataset.chainProposalId = proposal.id;
  const label = panel.querySelector(".discussion-panel-header > div span");
  if (label) label.textContent = `KIP–${proposal.id} / DISCUSSION`;
  const messages = visibleMessages(proposal.id);
  const count = panel.querySelector(".discussion-thread-heading small");
  if (count) count.textContent = `${messages.length} comments`;
  const thread = panel.querySelector(".discussion-thread");
  if (thread) thread.innerHTML = messages.length
    ? messages.map((message) => renderMessage(proposal.id, message)).join("")
    : '<div class="k-chain-empty-discussion"><strong>No on-chain comment yet.</strong><span>Start the conversation below.</span></div>';
  const composer = panel.querySelector(".discussion-composer");
  if (composer) {
    composer.dataset.chainProposalId = proposal.id;
    composer.dataset.testid = "discussion-form";
    composer.querySelector(".k-chain-session-controls")?.remove();
    composer.insertAdjacentHTML("afterbegin", sessionControls());
    const identity = composer.querySelector(".comment-identity");
    if (identity) identity.textContent = account() ? accountName() : "Connect wallet";
    let reply = composer.querySelector(".k-chain-reply-context");
    if (state.parentId) {
      if (!reply) {
        reply = document.createElement("span");
        reply.className = "k-chain-reply-context";
        composer.querySelector("label")?.before(reply);
      }
      reply.textContent = `↳ Replying to message #${state.parentId}`;
    } else reply?.remove();
  }
}

function discussionPayload(form) {
  const text = form.querySelector("textarea[placeholder*='discussion']")?.value.trim() || form.querySelector("textarea")?.value.trim() || "";
  const builder = form.querySelector(".discussion-visual-builder");
  if (!builder) return { v: 1, t: "text", text };
  const kindMatch = builder.textContent.match(/EDIT YOUR\s+(TIMELINE|BUDGET|POLL|CAROUSEL)/i);
  const kind = (kindMatch?.[1] || "text").toLowerCase();
  const values = [...builder.querySelectorAll("input, textarea")].map((field) => field.value.trim()).filter(Boolean);
  const payload = { v: 1, t: kind };
  if (text) payload.text = text;
  if (values[0]) payload.title = values[0];
  if (values.length > 1) payload.items = values.slice(1);
  if (encoder.encode(JSON.stringify(payload)).length > 8 * 1024) throw new Error("Discussion payload exceeds the 8 KiB chain limit");
  return payload;
}

function openZapPanel(message) {
  const recipient = accountName(message.evmAuthor);
  const panel = openSidePanel(`
    ${panelHeader("ZAP", `Thank ${recipient}.`, "Send real KUD when someone adds something genuinely useful.")}
    <div class="k-panel-body"><form class="k-money-form k-zap-form" data-chain-zap-form>
      <div class="k-zap-person"><span class="representative-avatar portrait-civic"></span><div><small>YOU ARE THANKING</small><strong>${escapeHtml(recipient)}</strong></div></div>
      <fieldset><legend>Choose a small amount</legend><div class="k-zap-amounts">${[0.01, 0.1, 0.5, 1].map((amount, index) => `<button type="button" class="${index === 0 ? "selected" : ""}" data-chain-zap-amount="${amount}">${amount} KUD</button>`).join("")}</div></fieldset>
      <label><span>Or enter another amount</span><div class="k-amount-input"><input name="amount" type="number" min="0.000001" step="0.000001" value="0.01"><b>KUD</b></div></label>
      <div class="k-cost-preview"><span>${escapeHtml(recipient)} receives</span><b data-chain-zap-receives>0.01 KUD</b><span>Network cost</span><b>Calculated by wallet</b></div>
      <button class="k-confirm-button zap" type="submit">Zap ${escapeHtml(recipient)} <span>ϟ</span></button>
    </form></div>`, `Zap ${recipient}`);
  panel.dataset.chainMessageId = message.messageId;
}

async function handleWalletChoice(button) {
  const text = button.textContent.trim();
  const kind = text.startsWith("Keplr") ? "keplr" : text.startsWith("MetaMask") ? "metamask" : null;
  if (!kind || button.dataset.chainBypass) {
    delete button.dataset.chainBypass;
    return false;
  }
  await connectWallet(kind);
  button.dataset.chainBypass = "true";
  button.click();
  return true;
}

async function onClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("[data-chain-close-panel]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return closeSidePanel();
  }
  if (target.closest("[data-chain-open-connect]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return openConnectPanel();
  }
  if (target.closest("[data-chain-open-wallet]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return openConnectedPanel();
  }
  const copy = target.closest("[data-chain-copy]")?.dataset.chainCopy;
  if (copy) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const current = account();
    return copyAddress(copy === "evm" ? current.evmAddress : current.cosmosAddress, copy === "evm" ? "EVM" : "Cosmos");
  }
  const connect = target.closest("[data-chain-connect]")?.dataset.chainConnect;
  if (connect) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return connectWallet(connect);
  }
  if (target.closest("[data-chain-disconnect]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return disconnectWallet();
  }
  const walletButton = target.closest(".vote-connect-step button, .proposal-connect-step button, .wallet-grid button");
  if (walletButton && !walletButton.closest(".k-panel-backdrop")) {
    if (walletButton.dataset.chainBypass) {
      delete walletButton.dataset.chainBypass;
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    return handleWalletChoice(walletButton);
  }
  const validatorAction = target.closest("[data-chain-delegate], .validator-row[data-chain-validator]");
  if (validatorAction) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    return openValidatorPanel(validatorAction.dataset.chainDelegate || validatorAction.dataset.chainValidator);
  }
  const representativeVote = target.closest(".active-vote-row[data-chain-proposal-id]");
  if (representativeVote) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return openRepresentativeVotes(representativeVote.dataset.chainProposalId);
  }
  const communityTopic = target.closest(".topic-card[data-chain-proposal-id]");
  if (communityTopic) state.activeProposal = state.proposals.find((proposal) => proposal.id === communityTopic.dataset.chainProposalId) || null;
  if (target.closest(".community-toolbar > .primary-button")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return window.KudoraHumanUI?.showToast("Open a decision to start its on-chain discussion");
  }
  const article = target.closest(".proposal-list-item[data-chain-proposal-id]");
  if (article) state.activeProposal = state.proposals.find((proposal) => proposal.id === article.dataset.chainProposalId) || null;
  const proposalReaction = target.closest("[data-chain-proposal-reaction]");
  if (proposalReaction) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const proposalId = state.activeProposal?.id || article?.dataset.chainProposalId;
    const messageId = proposalReaction.closest("[data-chain-message-id]")?.dataset.chainMessageId;
    const current = reactionState(proposalId, { messageId });
    const selected = Number(proposalReaction.dataset.chainProposalReaction);
    await transact(current.own === selected ? "Proposal signal removed" : "Proposal signal", () => state.chain.react(proposalId, messageId, current.own === selected ? 0 : selected));
    await loadDiscussion(proposalId, true);
    return;
  }
  const proposalZap = target.closest("[data-chain-proposal-zap]");
  if (proposalZap) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const proposalId = state.activeProposal?.id || article?.dataset.chainProposalId;
    const messageId = proposalZap.closest("[data-chain-message-id]")?.dataset.chainMessageId;
    const anchor = (state.messages.get(proposalId) || []).find((message) => message.messageId === messageId);
    return openZapPanel(anchor);
  }
  const reactionButton = target.closest("[data-chain-reaction]");
  if (reactionButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const message = reactionButton.closest("[data-chain-message-id]");
    const proposalId = state.activeProposal.id;
    const current = reactionState(proposalId, { messageId: message.dataset.chainMessageId });
    const selected = Number(reactionButton.dataset.chainReaction);
    const value = current.own === selected ? 0 : selected;
    await transact(value ? "Reaction" : "Reaction removed", () => state.chain.react(proposalId, message.dataset.chainMessageId, value, Boolean(sessionStorage.getItem("kudora-session-key"))));
    await loadDiscussion(proposalId, true);
    return;
  }
  const reply = target.closest("[data-chain-reply]");
  if (reply) {
    event.preventDefault();
    event.stopImmediatePropagation();
    state.parentId = Number(reply.closest("[data-chain-message-id]").dataset.chainMessageId);
    patchDiscussionPanel();
    document.querySelector(".discussion-composer textarea")?.focus();
    return;
  }
  const zap = target.closest("[data-chain-zap]");
  if (zap) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const messageId = zap.closest("[data-chain-message-id]").dataset.chainMessageId;
    const message = (state.messages.get(state.activeProposal.id) || []).find((candidate) => candidate.messageId === messageId);
    return openZapPanel(message);
  }
  const zapAmount = target.closest("[data-chain-zap-amount]")?.dataset.chainZapAmount;
  if (zapAmount) {
    event.preventDefault();
    const form = target.closest("form");
    form.querySelector("input[name='amount']").value = zapAmount;
    form.querySelector("[data-chain-zap-receives]").textContent = `${Number(zapAmount).toFixed(2)} KUD`;
    form.querySelectorAll("[data-chain-zap-amount]").forEach((button) => button.classList.toggle("selected", button.dataset.chainZapAmount === zapAmount));
    return;
  }
  const session = target.closest("[data-chain-session]")?.dataset.chainSession;
  if (session) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    if (session === "authorize") await transact("Quick interactions authorized", () => state.chain.authorizeSession());
    else await transact("Quick interactions revoked", () => state.chain.revokeSession());
    patchDiscussionPanel();
    return;
  }
  const nav = target.closest(".desktop-nav > button, .mobile-nav > button");
  if (nav && /Vote/i.test(nav.textContent)) queueMicrotask(loadProposals);
  if (nav && /Account/i.test(nav.textContent)) queueMicrotask(refreshAccount);
}

async function onSubmit(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.matches("[data-chain-community-form]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const textarea = form.querySelector("textarea");
    const text = textarea?.value.trim() || "";
    if (!text) throw new Error("Message content is required");
    await transact("Discussion post", () => state.chain.postPayload({ v: 1, t: "text", text }, form.dataset.chainProposalId));
    if (textarea) {
      textarea.value = "";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await loadDiscussion(form.dataset.chainProposalId, true);
    patchCommunitySurface();
    return;
  }
  if (form.matches('[data-money-form="send"]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const fields = new FormData(form);
    const amount = Number(fields.get("amount"));
    const result = await transact("KUD transfer", () => state.chain.sendKud(String(fields.get("recipient")), String(amount)));
    recordTransaction({ category: "Sent", icon: "↑", title: `Money sent to ${fields.get("recipient")}`, note: fields.get("note") || shortAddress(result.hash), amount: -amount, hash: result.hash });
    closeSidePanel();
    await refreshAccount();
    return;
  }
  if (form.matches('[data-money-form="move"]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const amount = Number(new FormData(form).get("amount"));
    const result = await transact("Local KUD / MockUSDC swap", () => state.chain.swap(String(amount)));
    recordTransaction({ category: "Moved", icon: "⇄", title: "KUD swapped for Mock USDC", amount: -amount, hash: result.hash });
    closeSidePanel();
    await refreshAccount();
    return;
  }
  if (form.matches('[data-money-form="add"]')) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return window.KudoraHumanUI?.showToast("Card payments are a prototype and are not available in localnet");
  }
  if (form.matches("[data-chain-delegate-form]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const amount = String(new FormData(form).get("amount"));
    await transact("Delegation", () => state.chain.delegate(form.dataset.chainValidator, amount));
    closeSidePanel();
    await refreshAccount();
    return;
  }
  if (form.matches(".proposal-form")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const fields = proposalFields(form);
    const result = await transact("Governance proposal", () => state.chain.submitProposal(fields));
    if (result.proposalId) {
      await transact("Proposal community signal", () => state.chain.postPayload({ v: 1, t: "text", role: "proposal", text: "On-chain community signal for this proposal." }, result.proposalId));
    }
    recordTransaction({ category: "Community", icon: "◇", title: "Proposal published", note: `KIP–${result.proposalId || "new"}`, amount: -1, hash: result.hash });
    form.closest(".proposal-composer-panel")?.querySelector('[aria-label="Close proposal builder"]')?.click();
    await loadProposals();
    return;
  }
  if (form.matches(".vote-action-form")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const active = form.querySelector("button.active");
    const label = active?.textContent.trim() || "Yes";
    const option = active?.classList.contains("no-with-veto") ? 4
      : active?.classList.contains("no") ? 3
        : active?.classList.contains("abstain") ? 2
          : 1;
    await transact(`Vote ${label.split(/\s{2,}|I agree|I disagree|I strongly|I take/)[0].trim()}`, () => state.chain.vote(state.activeProposal.id, option));
    await loadProposals();
    form.closest(".vote-action-panel")?.querySelector(".discussion-back")?.click();
    return;
  }
  if (form.matches(".discussion-composer")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const payload = discussionPayload(form);
    if (!payload.text && !payload.items?.length) throw new Error("Message content is required");
    const quick = Boolean(sessionStorage.getItem("kudora-session-key"));
    await transact(state.parentId ? "Discussion reply" : "Discussion post", () => state.chain.postPayload(payload, state.activeProposal.id, state.parentId, quick));
    state.parentId = 0;
    const textarea = form.querySelector("textarea[placeholder*='discussion']") || form.querySelector("textarea");
    if (textarea) {
      textarea.value = "";
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
    await loadDiscussion(state.activeProposal.id, true);
    return;
  }
  if (form.matches("[data-chain-zap-form]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const panel = form.closest(".k-side-panel");
    const amount = String(new FormData(form).get("amount"));
    await transact("Zap", () => state.chain.zap(state.activeProposal.id, panel.dataset.chainMessageId, amount));
    closeSidePanel();
    await Promise.all([refreshAccount(), loadDiscussion(state.activeProposal.id, true)]);
  }
}

function patchAll() {
  state.observer?.disconnect();
  try {
    renderTopWallet();
    patchAccount();
    patchMoneyForms();
    patchChoose();
    patchNetworkStats();
    patchProposalSurface();
    patchCommunitySurface();
    patchProposalDetail();
    patchVotePanel();
    patchDiscussionPanel();
    window.KudoraHumanUI?.patch?.();
  } finally {
    if (state.observer && state.observedRoot) {
      state.observer.observe(state.observedRoot, { childList: true, subtree: true });
    }
  }
}

function schedulePatch() {
  if (state.patchQueued) return;
  state.patchQueued = true;
  requestAnimationFrame(() => {
    state.patchQueued = false;
    patchAll();
  });
}

async function start() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const root = document.querySelector(".app-shell");
    if (root && Object.keys(root).some((key) => key.startsWith("__reactFiber") || key.startsWith("__reactProps") || key.startsWith("__reactContainer"))) break;
    await sleep(25);
  }
  ensureStatusOutput();
  const patchAfterInteraction = () => {
    schedulePatch();
    setTimeout(schedulePatch, 100);
  };
  document.addEventListener("click", (event) => {
    onClick(event).catch((error) => setStatus("failed", error.message)).finally(patchAfterInteraction);
  }, true);
  document.addEventListener("submit", (event) => {
    onSubmit(event).catch((error) => setStatus("failed", error.message)).finally(patchAfterInteraction);
  }, true);
  state.observedRoot = document.documentElement;
  state.observer = new MutationObserver(schedulePatch);
  state.observer.observe(state.observedRoot, { childList: true, subtree: true });
  try {
    state.chain = await KudoraChain.load();
    window.KudoraChain = state.chain;
    window.KudoraChainBridge = {
      get account() { return account(); },
      get proposals() { return state.proposals; },
      get status() { return state.status; },
      connect: connectWallet,
      loadDiscussion,
      refreshAccount,
    };
    setStatus("idle", "Ready");
    renderTopWallet();
    await loadProposals();
    [state.validators, state.networkStats] = await Promise.all([
      state.chain.validators(),
      state.chain.networkStats(state.proposals),
    ]);
    document.body.dataset.chainDataReady = "true";
    patchAll();
    await loadAllDiscussions();
    await refreshAccount();
    schedulePatch();
  } catch (error) {
    setStatus("failed", `Chain configuration unavailable: ${error.message}`);
  }
}

start();
