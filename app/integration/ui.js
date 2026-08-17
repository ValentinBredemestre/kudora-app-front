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
  proposalSort: { key: "date", direction: "desc" },
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
  window.KudoraHumanUI?.showToast(`${label} address copied`);
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
  document.body.toggleAttribute("data-chain-wallet-connected", Boolean(current));
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
      <button type="button" class="k-top-copy" data-chain-copy="evm" aria-label="Copy EVM address" title="Copy EVM address"><span aria-hidden="true">⧉</span> Copy</button>
    </div>` : '<button type="button" class="wallet-button" data-chain-open-connect>Connect wallet</button>';
}

function openConnectPanel() {
  openSidePanel(`
    ${panelHeader("SIGN IN", "Connect a wallet", "Choose the wallet you already use")}
    <div class="k-panel-body">
      <div class="wallet-grid wallet-grid-simple wallet-panel-options">
        <button type="button" data-chain-connect="keplr"><span class="k-wallet-choice"><img src="/wallet-keplr.svg" alt="" class="k-wallet-choice-logo"><span><strong>Keplr</strong><small>Cosmos wallet</small></span></span><span class="glyph">→</span></button>
        <button type="button" data-chain-connect="metamask"><span class="k-wallet-choice"><img src="/wallet-metamask.svg" alt="" class="k-wallet-choice-logo"><span><strong>MetaMask</strong><small>Ethereum wallet</small></span></span><span class="glyph">→</span></button>
      </div>
    </div>`, "Connect a wallet");
}

function openConnectedPanel() {
  const current = account();
  if (!current) return openConnectPanel();
  openSidePanel(`
    ${panelHeader("CONNECTED WALLET", "Your public addresses.", "Copy either address when someone needs to send money to you.")}
    <div class="k-panel-body k-wallet-panel-body">
      <section class="k-wallet-address-card"><div><span>EVM ADDRESS</span><strong data-testid="evm-address">${escapeHtml(current.evmAddress)}</strong><small>Your public Ethereum-compatible address</small></div><button type="button" data-chain-copy="evm" aria-label="Copy EVM address"><span>⧉</span> Copy address</button></section>
      <section class="k-wallet-address-card"><div><span>COSMOS ADDRESS</span><strong data-testid="cosmos-address">${escapeHtml(current.cosmosAddress)}</strong><small>Your public Kudora address</small></div><button type="button" data-chain-copy="cosmos" aria-label="Copy Cosmos address"><span>⧉</span> Copy address</button></section>
      <button type="button" class="k-disconnect-wallet" data-chain-disconnect>Disconnect Wallet</button>
    </div>`, "Your public addresses");
}

async function connectWallet(kind, accountName = state.chain.accountName || "alice") {
  const useLocal = kind.startsWith("local-")
    || (kind === "metamask" && !window.ethereum && !state.chain.currentMetaMaskProvider())
    || (kind === "keplr" && !window.keplr);
  const mode = kind.startsWith("local-") ? kind : useLocal ? `local-${kind}` : kind;
  delete document.body.dataset.chainValidatorsReady;
  try {
    await transact(`Connect ${kind.replace("local-", "")}`, () => state.chain.connect(mode, accountName).then(() => ({ hash: "" })));
    renderTopWallet();
    await Promise.all([refreshAccount(), loadProposals()]);
    closeSidePanel();
    return mode;
  } finally {
    document.body.dataset.chainValidatorsReady = "true";
    schedulePatch();
  }
}

function disconnectWallet() {
  state.chain.walletMode = null;
  state.chain.evmAccount = null;
  state.chain.ethereumProvider = null;
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
  document.querySelectorAll(".network-live").forEach((node) => {
    const text = [...node.childNodes].find((child) => child.nodeType === Node.TEXT_NODE);
    if (text) text.textContent = " LIVE CHAIN";
  });
  document.querySelectorAll(".network-ticker-group").forEach((group) => {
    group.querySelectorAll(".network-metric").forEach((metric, index) => {
      const [label, value] = metrics[index] || ["ON CHAIN", "—"];
      const labelNode = metric.querySelector("small");
      const valueNode = metric.querySelector(".network-rolling-value");
      if (labelNode) labelNode.textContent = label;
      if (valueNode) {
        valueNode.setAttribute("aria-label", value);
        const characters = [...valueNode.querySelectorAll(":scope > .network-character")];
        characters.forEach((character, characterIndex) => {
          character.textContent = [...value][characterIndex] || "";
        });
      }
    });
  });
}

function patchChoose() {
  const list = document.querySelector(".validator-list");
  if (!list || !state.validators.length) return;
  const header = list.querySelector(".validator-head");
  if (header && !header.querySelector(".validator-votes-head")) {
    const votesHeader = document.createElement("span");
    votesHeader.className = "validator-votes-head";
    header.insertBefore(votesHeader, header.lastElementChild);
  }
  const headerLabels = ["Representative", "Delegators", "Reliability", "Proposals", "Votes"];
  [...header.querySelectorAll(":scope > :not(:last-child)")].forEach((cell, index) => {
    if (cell.textContent !== headerLabels[index]) cell.textContent = headerLabels[index];
  });
  const connected = Boolean(account());
  const chosen = state.validators.filter((validator) => Number(validator.delegationKud) > 0);
  const other = state.validators.filter((validator) => Number(validator.delegationKud) === 0);
  const portfolio = document.querySelector(".portfolio-main");
  if (portfolio) {
    const value = portfolio.querySelector(".portfolio-value strong");
    const label = portfolio.querySelector(".portfolio-value span");
    const detail = portfolio.querySelector(".portfolio-value small");
    const stats = portfolio.querySelectorAll(".portfolio-stats strong");
    const openProposal = state.proposals
      .filter((proposal) => proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD")
      .sort((left, right) => new Date(left.voting_end_time) - new Date(right.voting_end_time))[0];
    if (value) value.textContent = String(chosen.length);
    if (label) label.textContent = "REPRESENTATIVES";
    if (detail) detail.textContent = "chosen by you";
    if (stats[0]) stats[0].textContent = `${formatKud(state.rewards)} KUD`;
    if (stats[1]) stats[1].textContent = openProposal ? proposalTime(openProposal) : "No open vote";
    const note = portfolio.querySelector(".portfolio-placeholder");
    if (note) note.hidden = true;
  }

  const chosenAccounts = new Set(chosen.map((validator) => validator.accountAddress));
  const representativeProposals = state.proposals
    .filter((proposal) => (proposal.votes || []).some((vote) => chosenAccounts.has(vote.voter)))
    .sort((left, right) => Number(right.id) - Number(left.id));
  const activeList = document.querySelector(".active-vote-list");
  if (activeList) {
    const voice = activeList.closest(".voice-card");
    if (voice) voice.hidden = !representativeProposals.length;
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
        const votes = (proposal.votes || []).filter((vote) => chosenAccounts.has(vote.voter));
        [...choices.querySelectorAll(".active-voter")].forEach((voter, voterIndex) => {
          const vote = votes[voterIndex];
          voter.hidden = !vote;
          if (!vote) return;
          const name = voter.querySelector("strong");
          const voteNode = voter.querySelector(".vote-label");
          if (name) name.textContent = validatorNameForVote(vote.voter);
          if (voteNode) {
            const choice = voteLabel(vote);
            voteNode.textContent = choice;
            voteNode.className = `vote-label ${choice.toLowerCase().replaceAll(" ", "-")}`;
          }
        });
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

  const labels = [...list.querySelectorAll(".validator-group-label")];
  const yourLabel = labels.find((node) => !node.classList.contains("available"));
  const otherLabel = labels.find((node) => node.classList.contains("available"));
  const allRows = [...list.querySelectorAll(".validator-row:not(.validator-head)")];
  const yourRows = allRows.filter((row) => yourLabel && otherLabel
    && (yourLabel.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING)
    && (row.compareDocumentPosition(otherLabel) & Node.DOCUMENT_POSITION_FOLLOWING));
  const otherRows = allRows.filter((row) => otherLabel && (otherLabel.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING));

  function patchRows(rows, validators, delegated) {
    rows.forEach((row, index) => {
      const validator = validators[index];
      if (!validator) {
        row.hidden = true;
        delete row.dataset.chainValidator;
        return;
      }
      row.hidden = false;
      row.dataset.chainValidator = validator.operator_address;
      row.classList.toggle("delegated", delegated);
      row.setAttribute("aria-label", `Open ${validator.name}`);
      const rank = row.querySelector(".rank");
      const name = row.querySelector(".validator-name strong");
      const detail = row.querySelector(".validator-name small");
      const supporters = row.querySelector(".supporters");
      const reliability = row.querySelector(".uptime");
      const proposals = row.querySelector(".positive, .validator-engagement, .validator-proposals");
      const button = row.querySelector("button");
      let votes = row.querySelector(".validator-votes");
      if (!votes) {
        votes = document.createElement("span");
        votes.className = "validator-votes";
        row.insertBefore(votes, button);
      }
      if (rank) rank.textContent = String(state.validators.indexOf(validator) + 1).padStart(2, "0");
      if (name) name.firstChild.textContent = validator.name;
      if (detail) detail.textContent = `Address · ${shortAddress(validator.operator_address)}`;
      if (supporters) supporters.textContent = validator.delegatorCount === null ? "—" : `${validator.delegatorCount.toLocaleString("en-US")} delegator${validator.delegatorCount === 1 ? "" : "s"}`;
      if (reliability) reliability.textContent = validator.reliabilityPercent === null ? "—" : `${validator.reliabilityPercent.toFixed(2)}%`;
      if (proposals) {
        proposals.classList.remove("positive", "validator-engagement");
        proposals.classList.add("validator-proposals");
        proposals.textContent = validator.proposalCount === null ? "—" : validator.proposalCount.toLocaleString("en-US");
      }
      votes.textContent = validator.voteCount === null ? "—" : validator.voteCount.toLocaleString("en-US");
      if (button) {
        button.textContent = delegated ? "Add KUD" : "Choose";
        button.dataset.chainDelegate = validator.operator_address;
        button.className = delegated ? "secondary-button small" : "outline-button small";
      }
    });
  }

  patchRows(yourRows, connected ? chosen : [], true);
  patchRows(otherRows, connected ? other : state.validators, false);
  if (yourLabel) {
    yourLabel.hidden = !connected || !chosen.length;
    const count = yourLabel.querySelector("small");
    if (count) count.textContent = `${chosen.length} chosen by you`;
  }
  if (otherLabel) otherLabel.hidden = connected ? !other.length : !state.validators.length;
  list.querySelectorAll(".validator-load-more").forEach((node) => { node.hidden = true; });
  const stat = document.querySelector(".set-stat");
  if (stat) {
    const label = stat.querySelector("small");
    const total = stat.querySelector("strong");
    const status = stat.querySelector("span");
    const reliabilityValues = state.validators.map((validator) => validator.reliabilityPercent).filter((value) => value !== null);
    const reliability = reliabilityValues.length
      ? reliabilityValues.reduce((sum, value) => sum + value, 0) / reliabilityValues.length
      : null;
    if (label) label.textContent = "ACTIVE TEAMS";
    if (total) total.textContent = String(state.validators.length);
    if (status) status.innerHTML = reliability === null ? "Reliability loading" : `<i></i> ${reliability.toFixed(1)}% reliable`;
  }
}

function patchRepresentativeActivity() {
  const panel = document.querySelector(".representative-activity-panel");
  const proposal = state.activeProposal;
  if (!panel || !proposal) return;
  const chosen = state.validators.filter((validator) => Number(validator.delegationKud) > 0);
  const votes = chosen
    .map((validator) => ({ validator, vote: (proposal.votes || []).find((entry) => entry.voter === validator.accountAddress) }))
    .filter((entry) => entry.vote);
  const header = panel.querySelector(".decision-panel-header");
  const headerLabel = header?.querySelector("span");
  const headerTitle = header?.querySelector("h2");
  if (headerLabel) headerLabel.textContent = `KIP–${proposal.id} · REPRESENTATIVE ACTIVITY`;
  if (headerTitle) headerTitle.textContent = proposal.title;

  panel.querySelectorAll(".monitor-representative-grid > article").forEach((card, index) => {
    const entry = votes[index];
    card.hidden = !entry;
    if (!entry) return;
    const name = card.querySelector("strong");
    const vote = card.querySelector(".vote-label");
    if (name) name.textContent = entry.validator.name;
    if (vote) {
      const choice = voteLabel(entry.vote);
      vote.textContent = choice;
      vote.className = `vote-label ${choice.toLowerCase().replaceAll(" ", "-")}`;
      vote.setAttribute("aria-label", `Voted ${choice}`);
    }
  });

  const messages = visibleMessages(proposal.id);
  const representativeSection = panel.querySelector(".monitor-comment-section:not(.community)");
  const representativeCount = representativeSection?.querySelector(".monitor-section-heading small");
  if (representativeCount) representativeCount.textContent = `${votes.length} representative${votes.length === 1 ? "" : "s"}`;
  representativeSection?.querySelectorAll(".monitor-representative-group").forEach((group, index) => {
    const entry = votes[index];
    group.hidden = !entry;
    if (!entry) return;
    const validatorMessages = messages.filter((message) => message.cosmosAuthor === entry.validator.accountAddress);
    const trigger = group.querySelector(".monitor-representative-trigger");
    const name = trigger?.querySelector("strong");
    const count = trigger?.querySelector("small");
    const vote = trigger?.querySelector(".vote-label");
    if (name) name.textContent = entry.validator.name;
    if (count) count.textContent = `${validatorMessages.length} on-chain comment${validatorMessages.length === 1 ? "" : "s"}`;
    if (vote) {
      const choice = voteLabel(entry.vote);
      vote.textContent = choice;
      vote.className = `vote-label ${choice.toLowerCase().replaceAll(" ", "-")}`;
      vote.setAttribute("aria-label", `Voted ${choice}`);
    }
    group.querySelectorAll(".monitor-group-comments .monitor-comment").forEach((comment, commentIndex) => {
      const message = validatorMessages[commentIndex];
      comment.hidden = !message;
      if (!message) return;
      const age = comment.querySelector("header strong");
      const text = comment.querySelector("p");
      const signal = comment.querySelector("div > span");
      if (age) age.textContent = relativeTime(message.created_at);
      if (text) text.textContent = message.parsed?.text || "On-chain contribution";
      if (signal) signal.textContent = `◇ ${reactionState(proposal.id, message).useful} found this useful`;
    });
  });

  const community = panel.querySelector(".monitor-comment-section.community");
  if (community) {
    const top = messages
      .filter((message) => !["validator-comment", "representative-ask"].includes(message.parsed?.role))
      .sort((left, right) => reactionState(proposal.id, right).useful - reactionState(proposal.id, left).useful);
    community.querySelectorAll(".monitor-comment").forEach((comment, index) => {
      const message = top[index];
      comment.hidden = !message;
      if (!message) return;
      const name = comment.querySelector("header strong");
      const age = comment.querySelector("header small");
      const text = comment.querySelector("p");
      const signal = comment.querySelector("div > span");
      if (name) name.textContent = accountName(message.evmAuthor);
      if (age) age.textContent = relativeTime(message.created_at);
      if (text) text.textContent = message.parsed?.text || "On-chain contribution";
      if (signal) signal.textContent = `◇ ${reactionState(proposal.id, message).useful} found this useful`;
    });
    const count = community.querySelector(".monitor-section-heading small");
    if (count) count.textContent = `${messages.length} in the full discussion`;
  }
  const open = panel.querySelector(".monitor-open-discussion small");
  if (open) open.textContent = String(messages.length);
}

function openValidatorPanel(validatorAddress) {
  const validator = state.validators.find((candidate) => candidate.operator_address === validatorAddress);
  if (!validator) return;
  const reliability = validator.reliabilityPercent === null ? "—" : `${validator.reliabilityPercent.toFixed(2)}%`;
  const proposals = validator.proposalCount === null ? "—" : validator.proposalCount.toLocaleString("en-US");
  const votes = validator.voteCount === null ? "—" : validator.voteCount.toLocaleString("en-US");
  const delegation = Number(validator.delegationKud);
  openSidePanel(`
    ${panelHeader("REPRESENTATIVE", validator.name, "Choose how much KUD this representative speaks for.")}
    <div class="k-panel-body k-validator-panel">
      <div class="k-validator-address"><span>Address</span><strong>${escapeHtml(validator.operator_address)}</strong></div>
      <div class="k-validator-overview">
        <div><span>YOUR KUD WITH THEM</span><strong>${formatKud(validator.delegationKud)} KUD</strong></div>
        <div><span>RELIABILITY</span><strong>${reliability}</strong></div>
        <div><span>PROPOSALS</span><strong>${proposals}</strong></div>
        <div><span>VOTES</span><strong>${votes}</strong></div>
      </div>
      <section class="k-validator-actions">
        <nav aria-label="Manage your KUD">
          <button class="selected" type="button" data-chain-stake-mode="add">Add KUD</button>
          ${delegation > 0 ? `<button type="button" data-chain-stake-mode="remove">Remove KUD</button>` : ""}
        </nav>
        <form class="k-money-form k-validator-action" data-chain-stake-form="add" data-chain-delegate-form data-chain-validator="${escapeHtml(validator.operator_address)}">
          <label><span>How much KUD do you want to add?</span><div class="k-amount-input"><input name="amount" required type="number" min="0.000001" step="0.000001" placeholder="0.00"><b>KUD</b></div></label>
          <button class="k-confirm-button" type="submit">Add KUD <span>→</span></button>
        </form>
        ${delegation > 0 ? `<form class="k-money-form k-validator-action undelegate" hidden data-chain-stake-form="remove" data-chain-undelegate-form data-chain-validator="${escapeHtml(validator.operator_address)}">
          <label><span>How much KUD do you want to remove?</span><div class="k-amount-input"><input name="amount" required type="number" min="0.000001" max="${escapeHtml(validator.delegationKud)}" step="0.000001" placeholder="0.00"><b>KUD</b></div></label>
          <p>Your KUD may take a little time to become available again.</p>
          <button class="k-confirm-button secondary" type="submit">Remove KUD <span>→</span></button>
        </form>` : ""}
      </section>
    </div>`, `Manage KUD with ${validator.name}`);
}

function patchMoneyForms() {
  const move = document.querySelector('form[data-money-form="move"]');
  if (move && !move.dataset.chainPatched) {
    move.dataset.chainPatched = "true";
    const panel = move.closest(".k-side-panel");
    const heading = panel?.querySelector(".k-panel-header");
    if (heading) {
      heading.querySelector("span").textContent = "SWAP";
      heading.querySelector("h2").textContent = "Swap KUD for Mock USDC.";
      heading.querySelector("p").textContent = "Exchange KUD for Mock USDC from your Kudora account.";
    }
    move.innerHTML = `
      <div class="k-network-route"><button type="button" class="selected"><span class="k-network-mark kudora"><img src="/kudora-logo.svg" alt=""></span><span><small>FROM</small><strong>KUD</strong></span></button><span class="k-swap-direction">⇄</span><button type="button"><span class="k-network-mark ethereum">$</span><span><small>TO</small><strong>Mock USDC</strong></span></button></div>
      <label><span>How much do you want to swap?</span><div class="k-amount-input"><input name="amount" required type="number" min="0.000001" step="0.000001" value="0.1"><b>KUD</b></div></label>
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

function proposalSortValue(proposal, key) {
  if (key === "title") return String(proposal.title || "");
  if (key === "result") return tallyPercentages(proposal)[0];
  if (key === "participants") return Number(proposal.participantCount || 0);
  if (key === "comments") return visibleMessages(proposal.id).length;
  if (key === "took-part") return Number(proposal.participationPercent || 0);
  if (key === "useful" || key === "not-useful") {
    const anchor = proposalAnchor(proposal.id);
    if (!anchor) return 0;
    const reactions = reactionState(proposal.id, anchor);
    return key === "useful" ? reactions.useful : reactions.notUseful;
  }
  const date = Date.parse(proposal.voting_end_time || proposal.submit_time || proposal.voting_start_time || "");
  return Number.isNaN(date) ? Number(proposal.id || 0) : date;
}

function sortedProposals(proposals) {
  const multiplier = state.proposalSort.direction === "asc" ? 1 : -1;
  return [...proposals].sort((left, right) => {
    const leftValue = proposalSortValue(left, state.proposalSort.key);
    const rightValue = proposalSortValue(right, state.proposalSort.key);
    const comparison = typeof leftValue === "string"
      ? leftValue.localeCompare(rightValue, undefined, { sensitivity: "base" })
      : leftValue - rightValue;
    if (comparison) return comparison * multiplier;
    return Number(right.id || 0) - Number(left.id || 0);
  });
}

function patchProposalSort(feed) {
  feed.querySelector(".k-proposal-sort")?.remove();
  const head = feed.querySelector(".proposal-table-head");
  if (!head) return;
  const columns = [
    ["title", "Proposal"],
    ["date", "Closes"],
    ["result", "Current result"],
    ["participants", "Participants"],
    ["comments", "Comments"],
    ["took-part", "Took part"],
    ["useful", "Useful"],
    ["not-useful", "Not useful"],
  ];
  if (head.dataset.chainColumns !== "true") {
    head.dataset.chainColumns = "true";
    head.innerHTML = `${columns.map(([key, label]) => `<button type="button" role="columnheader" data-chain-proposal-sort="${key}"><span>${label}</span><i aria-hidden="true">↕</i></button>`).join("")}<span aria-hidden="true"></span>`;
  }
  head.querySelectorAll("[data-chain-proposal-sort]").forEach((button) => {
    const active = button.dataset.chainProposalSort === state.proposalSort.key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
    const label = button.querySelector("span")?.textContent || "Column";
    button.setAttribute("aria-label", `${label}, ${active ? state.proposalSort.direction === "asc" ? "ascending" : "descending" : "select to sort"}`);
    const arrow = button.querySelector("i");
    if (arrow) arrow.textContent = active ? state.proposalSort.direction === "asc" ? "↑" : "↓" : "↕";
  });
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
  const personal = article.querySelector(".personal-choice");
  const ownVote = account() ? (proposal.votes || []).find((vote) => vote.voter === account().cosmosAddress) : null;
  const anchor = proposalAnchor(proposal.id);
  const reactions = anchor ? reactionState(proposal.id, anchor) : { useful: 0, notUseful: 0, own: 0 };
  if (personal) {
    personal.hidden = !ownVote;
    const choice = personal.querySelector(".vote-label");
    if (choice && ownVote) {
      const label = voteLabel(ownVote);
      choice.textContent = label;
      choice.className = `vote-label ${label.toLowerCase().replaceAll(" ", "-")}`;
    }
  }
  patchResult(article.querySelector(".proposal-result"), proposal);
  const engagement = article.querySelector(".proposal-engagement");
  if (engagement) {
    const metrics = [
      ["participants", String(proposal.participantCount || 0)],
      ["comments", String(visibleMessages(proposal.id).length)],
      ["took part", `${Number(proposal.participationPercent || 0).toFixed(1)}%`],
      ["useful", String(reactions.useful)],
      ["not useful", String(reactions.notUseful)],
    ];
    if (engagement.dataset.chainMetrics !== "true") {
      engagement.dataset.chainMetrics = "true";
      engagement.innerHTML = metrics.map(([label]) => `<span><strong></strong><small>${label}</small></span>`).join("");
    }
    engagement.querySelectorAll(":scope > span").forEach((metric, index) => {
      const [label, value] = metrics[index];
      metric.querySelector("strong").textContent = value;
      metric.querySelector("small").textContent = label;
    });
  }
  const peek = article.querySelector(".proposal-representative-peek");
  if (peek) {
    const chosen = state.validators.filter((validator) => Number(validator.delegationKud) > 0);
    peek.hidden = !account() || !chosen.length;
    const label = peek.querySelector(".peek-label");
    if (label) label.textContent = "YOUR REPRESENTATIVES";
    peek.querySelectorAll(".peek-representative").forEach((item, index) => {
      const validator = chosen[index];
      item.hidden = !validator;
      if (!validator) return;
      const vote = (proposal.votes || []).find((entry) => entry.voter === validator.accountAddress);
      const name = item.querySelector("strong");
      const voteNode = item.querySelector(".vote-label");
      if (name) name.textContent = validator.name;
      if (voteNode) {
        const choice = vote ? voteLabel(vote) : "Not yet";
        voteNode.textContent = choice;
        voteNode.className = `vote-label ${choice.toLowerCase().replaceAll(" ", "-")}`;
      }
      let ask = item.querySelector(".peek-ask");
      if (!vote && !ask) {
        ask = document.createElement("button");
        ask.type = "button";
        ask.className = "peek-ask";
        item.append(ask);
      }
      if (ask) {
        ask.hidden = Boolean(vote);
        ask.textContent = "Ask";
        ask.dataset.chainAsk = validator.operator_address;
        ask.dataset.chainProposalId = proposal.id;
        ask.setAttribute("aria-label", `Ask ${validator.name} to vote`);
      }
    });
  }
  let actions = article.querySelector(":scope > .k-proposal-actions");
  if (!actions) {
    actions = document.createElement("div");
    actions.className = "k-proposal-actions k-chain-proposal-state";
    article.append(actions);
  }
  if (!anchor) {
    actions.innerHTML = "<small>Community signals will appear when the first on-chain signal is created.</small>";
  } else {
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
  patchProposalSort(feed);
  const labels = [
    ["YOUR ACTIVE VOTES", "Decisions where your wallet took part", "active"],
    ["YOUR REPRESENTATIVES TOOK PART", "Votes cast by bonded validators", "representatives"],
    ["", "", "open"],
    ["PAST PROPOSALS", "Decisions whose vote has ended", "past"],
  ];
  const grouped = Object.fromEntries(labels.map(([, , key]) => [key, []]));
  const current = account();
  const chosenAccounts = new Set(state.validators.filter((validator) => Number(validator.delegationKud) > 0).map((validator) => validator.accountAddress));
  for (const proposal of state.proposals) {
    const openProposal = proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD";
    const ownVote = current && (proposal.votes || []).some((vote) => vote.voter === current.cosmosAddress);
    const representativeVote = (proposal.votes || []).some((vote) => chosenAccounts.has(vote.voter));
    const group = openProposal && ownVote ? "active"
      : openProposal && representativeVote ? "representatives"
        : openProposal ? "open" : "past";
    grouped[group].push(proposal);
  }
  Object.keys(grouped).forEach((key) => { grouped[key] = sortedProposals(grouped[key]); });
  const table = feed.querySelector(".proposal-table");
  if (table) table.setAttribute("aria-label", `${state.proposals.length} proposals`);
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
    const groupHeader = group.querySelector(":scope > header");
    if (groupHeader) groupHeader.hidden = key === "open";
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
  patchNetworkStats();
}

function findSection(panel, label) {
  return [...panel.querySelectorAll("section")].find((section) => [...section.querySelectorAll("span, small")].some((node) => node.textContent.trim() === label));
}

function voteOptionNumber(vote) {
  const option = String(vote?.options?.[0]?.option || "");
  if (option.endsWith("NO_WITH_VETO")) return 4;
  if (option.endsWith("NO")) return 3;
  if (option.endsWith("ABSTAIN")) return 2;
  if (option.endsWith("YES")) return 1;
  return 0;
}

function patchVoteRecord(panel, proposal) {
  const note = panel.querySelector(".your-vote-note");
  if (!note || !account()) return;
  const ownVote = (proposal.votes || []).find((vote) => vote.voter === account().cosmosAddress);
  const currentOption = voteOptionNumber(ownVote);
  const open = proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD";
  const voteState = ["pending", "yes", "abstain", "no", "veto"][currentOption] || "pending";
  note.dataset.voteState = voteState;
  const signature = `${proposal.id}:${account().cosmosAddress}:${currentOption}:${open}`;
  if (note.dataset.chainVoteSignature === signature) return;
  note.dataset.chainVoteSignature = signature;
  const options = [[1, "Yes"], [3, "No"], [2, "Abstain"], [4, "No with veto"]];
  const currentLabel = options.find(([option]) => option === currentOption)?.[1] || "Not voted yet";
  const guidance = currentOption
    ? "Your choice counts directly. You can change it until voting closes."
    : "Choose below to make your voice count directly.";
  note.innerHTML = `<span class="your-vote-orb">${currentOption ? "✓" : "◇"}</span><div class="k-current-vote-copy"><span>YOUR CURRENT VOTE</span><strong>${escapeHtml(currentLabel)}</strong><small>${open ? guidance : "Voting has ended."}</small></div>${open ? `<div class="k-vote-switch"><span>${currentOption ? "CHANGE TO" : "VOTE NOW"}</span>${options.map(([option, label]) => `<button type="button" data-chain-switch-vote="${option}" class="${option === currentOption ? "selected" : ""}" aria-pressed="${option === currentOption}" ${option === currentOption ? "disabled" : ""}>${label}</button>`).join("")}</div>` : ""}`;
}

function patchProposalDetail() {
  const proposal = state.activeProposal;
  const panel = document.querySelector(".decision-panel:not(.proposal-composer-panel):not(.representative-activity-panel)");
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
    const entries = [...facts.querySelectorAll(":scope > span")];
    const author = facts.querySelector(".proposal-author-link");
    if (author) {
      author.disabled = true;
      author.innerHTML = `<span><strong>${escapeHtml(proposal.proposer ? shortAddress(proposal.proposer) : "Kudora member")}</strong><small>Public Kudora address</small></span>`;
    }
    const moneyLabel = entries[1]?.querySelector("small");
    if (moneyLabel) moneyLabel.textContent = "KUD REQUESTED";
    const moneyValue = entries[1]?.querySelector(":scope > strong");
    if (moneyValue) moneyValue.textContent = metadata.requestedAmount || "None";
    const outcomeLabel = entries[2]?.querySelector("small");
    if (outcomeLabel) outcomeLabel.textContent = "IF APPROVED";
    const outcomeValue = entries[2]?.querySelector(":scope > strong");
    if (outcomeValue) outcomeValue.textContent = metadata.outcome || proposal.summary;
  }
  if (account() && proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD" && !panel.querySelector(".your-vote-note")) {
    const note = document.createElement("aside");
    note.className = "your-vote-note k-injected-vote-note";
    note.setAttribute("aria-label", "Manage your vote");
    facts?.after(note);
  }
  const visual = findSection(panel, "VISUAL BRIEF");
  if (visual) visual.hidden = true;
  const delivery = findSection(panel, "DELIVERY AND PUBLIC CHECKPOINTS");
  if (delivery) {
    const list = delivery.querySelector("ol, .proposal-milestones");
    const changes = Array.isArray(metadata.changes) ? metadata.changes : metadata.changes ? [metadata.changes] : [];
    delivery.hidden = !list || !changes.length;
    if (list && changes.length) {
      list.classList.add("k-chain-checkpoints");
      list.innerHTML = changes.map((change, index) => `<li><i>${String(index + 1).padStart(2, "0")}</i><div><strong>${escapeHtml(change)}</strong><small>Public checkpoint</small></div></li>`).join("");
    }
  }
  panel.querySelector(".k-proposal-detail-actions")?.setAttribute("hidden", "");
  const vote = [...panel.querySelectorAll("button")].find((button) => /^Vote\b|^Change vote\b/i.test(button.textContent.trim()));
  if (vote) {
    vote.dataset.testid = `vote-proposal-${proposal.id}`;
    const open = proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD";
    vote.disabled = !open;
    const ownVote = account() && (proposal.votes || []).some((entry) => entry.voter === account().cosmosAddress);
    vote.innerHTML = open ? `${ownVote ? "Change vote" : "Vote"} <span class="glyph" aria-hidden="true">→</span>` : "Voting closed";
    const managedAbove = Boolean(account() && panel.querySelector(".your-vote-note"));
    vote.hidden = managedAbove;
    vote.closest(".decision-primary-actions")?.classList.toggle("k-vote-managed", managedAbove);
  }
  const discussion = [...panel.querySelectorAll("button")].find((button) => /Open full discussion/i.test(button.textContent));
  if (discussion) {
    discussion.dataset.testid = `discussion-proposal-${proposal.id}`;
    const count = visibleMessages(proposal.id).length;
    discussion.innerHTML = `Open full discussion <small>${count}</small> <span class="glyph">→</span>`;
  }
  const override = panel.querySelector(".override-note");
  if (override) {
    override.classList.add("k-direct-vote-note");
    override.innerHTML = '<span class="glyph" aria-hidden="true">◇</span><span><strong>Your choice counts directly.</strong><small>When you vote, your choice replaces your representatives’ votes for this proposal only.</small></span>';
  }
  patchVoteRecord(panel, proposal);
  loadDiscussion(proposal.id);
  patchDiscussionPreview();
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
  const action = title.charAt(0).toLowerCase() + title.slice(1).replace(/[.!?]+$/, "");
  const outcome = `Kudora will ${action}. Progress and the final result will be published at the checkpoints below.`;
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
  const panel = document.querySelector(".decision-panel:not(.proposal-composer-panel):not(.representative-activity-panel)");
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
    article.dataset.chainMessageId = message.messageId;
    article.dataset.testid = `message-preview-${message.messageId}`;
    const author = article.querySelector("header strong");
    const copy = article.querySelector("p");
    if (author) author.textContent = accountName(message.evmAuthor);
    if (copy) copy.textContent = message.parsed.text || message.parsed.title || "On-chain contribution";
    const authorVote = (proposal.votes || []).find((vote) => vote.voter === message.cosmosAuthor);
    const choice = authorVote ? voteLabel(authorVote) : message.parsed.vote || "";
    const header = article.querySelector("header");
    let status = header?.querySelector(".discussion-status");
    if (choice && header) {
      if (!status) {
        status = document.createElement("em");
        header.append(status);
      }
      status.className = `discussion-status discussion-vote-status ${choice.toLowerCase().replaceAll(" ", "-")}`;
      status.innerHTML = `<i>◆</i>${escapeHtml(choice)}`;
      status.setAttribute("aria-label", `Voted ${choice}`);
    } else status?.remove();
    const reactions = reactionState(proposal.id, message);
    let footer = article.querySelector("footer");
    if (!footer) {
      footer = document.createElement("footer");
      article.querySelector(":scope > div")?.append(footer);
    }
    footer.innerHTML = `<span class="k-reaction-bar compact">
      <button type="button" class="k-reaction ${reactions.own === 1 ? "active useful" : ""}" data-chain-reaction="1"><span>◇</span> Useful <b>${reactions.useful}</b></button>
      <button type="button" class="k-reaction ${reactions.own === 2 ? "active not-useful" : ""}" data-chain-reaction="2"><span>×</span> Not useful <b>${reactions.notUseful}</b></button>
      <button type="button" class="k-reaction zap" data-chain-zap><span>ϟ</span> Zap <b>KUD</b></button>
    </span><button type="button" data-chain-reply>↳ Reply</button>`;
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
      <div class="k-cost-preview"><span>${escapeHtml(recipient)} receives</span><b data-chain-zap-receives>0.01 KUD</b><span>Network fee</span><b>Calculated by wallet</b></div>
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
  const proposalSort = target.closest("[data-chain-proposal-sort]");
  if (proposalSort) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const key = proposalSort.dataset.chainProposalSort;
    if (state.proposalSort.key === key) {
      state.proposalSort.direction = state.proposalSort.direction === "desc" ? "asc" : "desc";
    } else {
      state.proposalSort = { key, direction: "desc" };
    }
    patchProposalSurface();
    return;
  }
  const switchVote = target.closest("[data-chain-switch-vote]");
  if (switchVote) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const proposalId = switchVote.closest("[data-chain-proposal-id]")?.dataset.chainProposalId || state.activeProposal?.id;
    const proposal = state.proposals.find((candidate) => candidate.id === proposalId);
    if (!proposal || proposal.status !== "PROPOSAL_STATUS_VOTING_PERIOD") throw new Error("Voting has ended for this proposal");
    const option = Number(switchVote.dataset.chainSwitchVote);
    const label = switchVote.textContent.trim();
    await transact(`${label} vote`, () => state.chain.vote(proposal.id, option));
    await loadProposals();
    return;
  }
  const stakeMode = target.closest("[data-chain-stake-mode]");
  if (stakeMode) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const actions = stakeMode.closest(".k-validator-actions");
    actions.querySelectorAll("[data-chain-stake-mode]").forEach((button) => button.classList.toggle("selected", button === stakeMode));
    actions.querySelectorAll("[data-chain-stake-form]").forEach((form) => { form.hidden = form.dataset.chainStakeForm !== stakeMode.dataset.chainStakeMode; });
    return;
  }
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
  const validatorRow = target.closest(".validator-row[data-chain-validator]");
  const validatorAction = validatorRow || target.closest("[data-chain-delegate]");
  if (validatorAction) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const displayedName = validatorRow?.querySelector(".validator-name strong")?.textContent.trim();
    const displayedValidator = state.validators.find((validator) => validator.name === displayedName);
    return openValidatorPanel(displayedValidator?.operator_address || validatorRow?.dataset.chainValidator || validatorAction.dataset.chainDelegate);
  }
  const ask = target.closest("[data-chain-ask]");
  if (ask) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const validator = state.validators.find((candidate) => candidate.operator_address === ask.dataset.chainAsk);
    if (!validator) return;
    await transact("Representative vote request", () => state.chain.postPayload({
      v: 1,
      t: "text",
      role: "representative-ask",
      validator: validator.operator_address,
      text: `Please review KIP–${ask.dataset.chainProposalId} and publish your vote.`,
    }, ask.dataset.chainProposalId));
    await loadDiscussion(ask.dataset.chainProposalId, true);
    window.KudoraHumanUI?.showToast(`Asked ${validator.name} to vote`);
    return;
  }
  const representativeVote = target.closest(".active-vote-row[data-chain-proposal-id]");
  if (representativeVote) {
    state.activeProposal = state.proposals.find((proposal) => proposal.id === representativeVote.dataset.chainProposalId) || null;
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
    const focusComposer = () => {
      patchDiscussionPanel();
      document.querySelector(".discussion-composer textarea")?.focus();
    };
    const composer = document.querySelector(".discussion-composer textarea");
    if (composer) focusComposer();
    else {
      document.querySelector(`[data-testid="discussion-proposal-${state.activeProposal.id}"]`)?.click();
      window.setTimeout(focusComposer, 80);
    }
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
  if (form.matches("[data-chain-undelegate-form]")) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!account()) return openConnectPanel();
    const amount = String(new FormData(form).get("amount"));
    await transact("Undelegation", () => state.chain.undelegate(form.dataset.chainValidator, amount));
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
    recordTransaction({ category: "Activity", icon: "◇", title: "Proposal published", note: `KIP–${result.proposalId || "new"}`, amount: -1, hash: result.hash });
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
    patchRepresentativeActivity();
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
    state.validators = (state.chain.config.validators || []).map((validator) => ({
      ...validator,
      operator_address: validator.operatorAddress,
      accountAddress: validator.accountAddress,
      delegationAkud: "0",
      delegationKud: "0",
      delegatorCount: null,
      jailed: false,
      powerPercent: null,
      reliabilityPercent: null,
      observedBlocks: null,
      missedBlocks: null,
      voteCount: null,
      proposalCount: null,
      tokens: null,
    }));
    document.body.dataset.chainValidatorsReady = "true";
    patchChoose();
    await Promise.all([
      loadProposals(),
      state.chain.validators().then((validators) => {
        state.validators = validators;
        patchChoose();
      }),
    ]);
    state.networkStats = await state.chain.networkStats(state.proposals, state.validators.length);
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
