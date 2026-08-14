const STORAGE_KEY = "kudora-human-money-v2";

const defaultState = {
  reactions: {},
  transactions: [],
  walletConnected: false,
};

const EVM_ADDRESS = "0x71A4B90c83E5D44fC1019D6b382AC29aE8B90C4e";
const COSMOS_ADDRESS = "kudo1q8m4tz03l9n7y5p2xj0c6w4sra8kd3fnv2";

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...defaultState };
  }
}

const state = { ...loadState(), transactions: [] };
let accountFilter = "All";
let accountSearch = "";
let transactionLimit = 3;
let accountActive = false;
let patchQueued = false;

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ reactions: state.reactions, walletConnected: state.walletConnected }));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function hash(value) {
  return [...String(value)].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) >>> 0, 7);
}

function formatKud(value) {
  return `${Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KUD`;
}

function showToast(message) {
  let toast = document.querySelector(".k-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "k-toast";
    toast.setAttribute("role", "status");
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function shortAddress(value) {
  return `${value.slice(0, 9)}…${value.slice(-5)}`;
}

async function copyAddress(value, label) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const input = document.createElement("textarea");
    input.value = value;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.append(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }
  showToast(`${label} tag copied`);
}

function reactionData(key, baseUseful) {
  const stored = state.reactions[key] || {};
  return {
    choice: stored.choice || null,
    useful: baseUseful + (stored.choice === "useful" ? 1 : 0),
    notUseful: 2 + (hash(key) % 6) + (stored.choice === "not-useful" ? 1 : 0),
    zapTotal: Number(stored.zapTotal || ((hash(key) % 9) / 10)).toFixed(1),
  };
}

function renderReactionBar(bar) {
  const key = bar.dataset.key;
  const baseUseful = Number(bar.dataset.baseUseful || 0);
  const data = reactionData(key, baseUseful);
  bar.innerHTML = `
    <button type="button" class="k-reaction ${data.choice === "useful" ? "active useful" : ""}" data-reaction="useful" aria-pressed="${data.choice === "useful"}">
      <span>◇</span> Useful <b>${data.useful}</b>
    </button>
    <button type="button" class="k-reaction ${data.choice === "not-useful" ? "active not-useful" : ""}" data-reaction="not-useful" aria-pressed="${data.choice === "not-useful"}">
      <span>×</span> Not useful <b>${data.notUseful}</b>
    </button>
    <button type="button" class="k-reaction zap" data-reaction="zap">
      <span>ϟ</span> Zap <b>${data.zapTotal} KUD</b>
    </button>`;
}

function attachReactionBar(host, { key, target, baseUseful = 0, compact = false }) {
  if (host.querySelector(":scope > .k-reaction-bar")) return;
  const bar = document.createElement("span");
  bar.className = `k-reaction-bar ${compact ? "compact" : ""}`;
  bar.dataset.key = key;
  bar.dataset.target = target;
  bar.dataset.baseUseful = String(baseUseful);
  bar.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-reaction]");
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const reaction = button.dataset.reaction;
    if (reaction === "zap") {
      openZapPanel(bar.dataset.target, bar.dataset.key, bar);
      return;
    }
    const current = state.reactions[key] || {};
    current.choice = current.choice === reaction ? null : reaction;
    state.reactions[key] = current;
    saveState();
    renderReactionBar(bar);
  });
  renderReactionBar(bar);
  host.prepend(bar);
}

function patchDiscussionReactions() {
  document.querySelectorAll(".discussion-message footer, .comment-actions").forEach((footer, index) => {
    if (footer.dataset.kudoraReactions) return;
    footer.dataset.kudoraReactions = "true";
    const originalUseful = [...footer.children].find((child) => child.matches?.("button") && /Useful/i.test(child.textContent));
    const baseUseful = Number(originalUseful?.querySelector("b")?.textContent || originalUseful?.textContent.match(/\d+/)?.[0] || (18 + index));
    if (originalUseful) originalUseful.classList.add("k-original-useful");
    const message = footer.closest(".discussion-message, .comment");
    const author = message?.querySelector("header strong, .comment-meta strong")?.textContent?.trim() || "this contributor";
    const copy = message?.querySelector(":scope > div > p, :scope > p")?.textContent?.trim() || `${author}-${index}`;
    attachReactionBar(footer, {
      key: `comment-${hash(`${author}-${copy}`)}`,
      target: author,
      baseUseful,
      compact: true,
    });
  });
}

function patchProposalReactions() {
  document.querySelectorAll(".proposal-list-item").forEach((item, index) => {
    if (item.querySelector(":scope > .k-proposal-actions")) return;
    const title = item.querySelector("h3")?.textContent?.trim() || `Proposal ${index + 1}`;
    const host = document.createElement("div");
    host.className = "k-proposal-actions";
    host.addEventListener("click", (event) => event.stopPropagation());
    attachReactionBar(host, {
      key: `proposal-${hash(title)}`,
      target: title,
      baseUseful: 84 + (hash(title) % 140),
    });
    item.insertBefore(host, item.querySelector(".proposal-representative-peek"));
  });

  document.querySelectorAll(".decision-panel").forEach((panel) => {
    if (panel.matches(".proposal-composer-panel, .vote-action-panel, .discussion-panel")) return;
    if (!panel.querySelector(".proposal-result, .discussion-preview")) return;
    const body = panel.querySelector(".decision-panel-body");
    if (!body || body.querySelector(":scope > .k-proposal-detail-actions")) return;
    const title = panel.querySelector("h2, h3")?.textContent?.trim() || "This proposal";
    const host = document.createElement("div");
    host.className = "k-proposal-detail-actions";
    host.innerHTML = `<span>HELP THE BEST IDEAS RISE</span>`;
    attachReactionBar(host, {
      key: `proposal-${hash(title)}`,
      target: title,
      baseUseful: 126 + (hash(title) % 120),
    });
    body.prepend(host);
  });
}

function patchAskButtons() {
  document.querySelectorAll(".peek-ask").forEach((button) => {
    if (button.dataset.kudoraAskBound) return;
    button.dataset.kudoraAskBound = "true";
    const text = button.textContent.trim();
    if (text.startsWith("Sent")) return;
    const name = text.replace(/^Ask\s*/, "").trim();
    if (name) {
      button.setAttribute("aria-label", `Ask ${name} to vote`);
      button.title = `Ask ${name} to vote`;
    }
    button.textContent = "Ask";
  });
}

function patchProposalFee() {
  document.querySelectorAll(".proposal-publish-row").forEach((row) => {
    if (row.querySelector(".k-proposal-fee")) return;
    const fee = document.createElement("small");
    fee.className = "k-proposal-fee";
    fee.innerHTML = `<b>10 KUD</b> publishing fee · keeps proposals focused and reduces spam`;
    row.prepend(fee);
  });
}

function navButtonMarkup(mobile) {
  return mobile
    ? `<span class="glyph" aria-hidden="true">◎</span><span>Account</span>`
    : `<span class="glyph" aria-hidden="true">◎</span> Account`;
}

function patchNavigation() {
  document.querySelectorAll(".desktop-nav, .mobile-nav").forEach((nav) => {
    [...nav.querySelectorAll(":scope > button")].forEach((button) => {
      if (/Discuss/i.test(button.textContent)) button.remove();
      if (!button.classList.contains("k-account-nav") && !button.dataset.accountExitBound) {
        button.dataset.accountExitBound = "true";
        button.addEventListener("click", deactivateAccount);
      }
    });
    if (!nav.querySelector(".k-account-nav")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "k-account-nav";
      button.innerHTML = nav.classList.contains("mobile-nav") ? navButtonMarkup(true) : navButtonMarkup(false);
      button.addEventListener("click", activateAccount);
      nav.insertBefore(button, nav.firstElementChild);
    }
  });
  const brand = document.querySelector(".brand");
  if (brand && !brand.dataset.accountExitBound) {
    brand.dataset.accountExitBound = "true";
    brand.addEventListener("click", deactivateAccount);
  }
  updateNavigationState();
}

function topWalletMarkup() {
  if (!state.walletConnected) {
    return `<button type="button" class="wallet-button k-reconnect-wallet"><span class="glyph" aria-hidden="true">⌁</span> Connect wallet</button>`;
  }
  return `
    <div class="k-top-wallet">
      <button type="button" class="k-top-wallet-main" data-open-wallet aria-label="Open connected account">
        <span class="representative-avatar portrait-lumen k-top-wallet-avatar" aria-hidden="true"></span>
        <span><small>CONNECTED ACCOUNT</small><strong>${escapeHtml(shortAddress(EVM_ADDRESS))}</strong></span>
      </button>
      <button type="button" class="k-top-copy" data-copy-top-address aria-label="Copy EVM tag" title="Copy EVM tag"><span aria-hidden="true">⧉</span> Copy</button>
    </div>`;
}

function patchTopWallet(force = false) {
  const topActions = document.querySelector(".top-actions");
  if (!topActions) return;
  if (topActions.dataset.chainWallet === "true") return;
  const signature = state.walletConnected ? "connected" : "disconnected";
  if (!force && topActions.dataset.kWallet === signature) return;
  topActions.dataset.kWallet = signature;
  topActions.innerHTML = topWalletMarkup();
  topActions.querySelectorAll("[data-open-wallet]").forEach((button) => button.addEventListener("click", openWalletPanel));
  topActions.querySelector("[data-copy-top-address]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    copyAddress(EVM_ADDRESS, "EVM");
  });
  topActions.querySelector(".k-reconnect-wallet")?.addEventListener("click", () => {
    state.walletConnected = true;
    saveState();
    patchTopWallet(true);
    showToast("Wallet connected");
  });
}

function updateNavigationState() {
  document.querySelectorAll(".k-account-nav").forEach((button) => button.classList.toggle("active", accountActive));
  if (accountActive) {
    document.querySelectorAll(".desktop-nav > button:not(.k-account-nav), .mobile-nav > button:not(.k-account-nav)").forEach((button) => button.classList.remove("active"));
  }
}

const baseTransactions = [];

function allTransactions() {
  return [...state.transactions, ...baseTransactions];
}

function accountMarkup() {
  return `
    <section class="k-account-page" aria-label="Your account">
      <div class="k-account-wrap">
        <section class="k-account-intro">
          <div>
            <p class="eyebrow"><span>＋</span> YOUR MONEY</p>
            <h1>Everything in one place.</h1>
            <p class="lead">See what you have, what is supporting the community and every movement in plain language.</p>
          </div>
        </section>

        <section class="k-balance-grid">
          <article class="k-total-card glass-card">
            <header><span>TOTAL BALANCE</span><button type="button" data-privacy-toggle aria-label="Hide balance">◉</button></header>
            <strong class="k-main-balance" data-private-value>15,879.24 <small>KUD</small></strong>
            <p data-private-value>≈ $6,669.28 today</p>
            <div class="k-balance-breakdown">
              <span><small>READY TO USE</small><b data-private-value>12,480.62 KUD</b></span>
              <span><small>SUPPORTING REPS</small><b data-private-value>3,250.00 KUD</b></span>
              <span><small>REWARDS EARNED</small><b class="positive" data-private-value>148.62 KUD</b></span>
            </div>
          </article>
          <aside class="k-quick-actions glass-card">
            <span class="tiny-label">WHAT DO YOU WANT TO DO?</span>
            <button type="button" data-account-action="send"><i>↑</i><span><strong>Send money</strong><small>To a public tag</small></span><b>→</b></button>
            <button type="button" data-account-action="move"><i>⇄</i><span><strong>Move money</strong><small>To another one of your accounts</small></span><b>→</b></button>
            <button type="button" data-account-action="add"><i>＋</i><span><strong>Add money</strong><small>Bring money into Kudora</small></span><b>→</b></button>
          </aside>
        </section>

        <aside class="k-money-guide glass-card">
          <div class="k-money-guide-heading"><span class="tiny-label">THIS MONTH</span><h3>Where your money went</h3></div>
          <div class="k-category-cell"><div class="k-category-row"><span><i class="pink"></i>Community</span><b>36.00 KUD</b></div><div class="k-category-bar"><i style="width:62%"></i></div></div>
          <div class="k-category-cell"><div class="k-category-row"><span><i class="cyan"></i>People & teams</span><b>24.00 KUD</b></div><div class="k-category-bar cyan"><i style="width:41%"></i></div></div>
          <div class="k-category-cell"><div class="k-category-row"><span><i class="violet"></i>Moved elsewhere</span><b>120.00 KUD</b></div><div class="k-category-bar violet"><i style="width:78%"></i></div></div>
        </aside>

        <section class="k-account-layout">
          <article class="k-activity-card glass-card">
            <header class="k-activity-heading">
              <div><span class="tiny-label">ACCOUNT ACTIVITY</span><h2>Your latest movements</h2><p>Every payment, reward, zap and community action appears here.</p></div>
              <label><span>⌕</span><input type="search" data-transaction-search placeholder="Find a movement" aria-label="Find a movement"></label>
            </header>
            <div class="k-transaction-filters" role="group" aria-label="Filter movements">
              ${[
                ["All", "All"],
                ["Received", "Receive"],
                ["Sent", "Send"],
                ["Community", "Community"],
                ["Rewards", "Reward"],
                ["Moved", "Move"],
              ].map(([value, label]) => `<button type="button" data-transaction-filter="${value}" class="${value === "All" ? "active" : ""}">${label}</button>`).join("")}
            </div>
            <div class="k-transaction-list" role="table" aria-label="Account movements"></div>
          </article>

        </section>
      </div>
    </section>`;
}

function ensureAccountRoot() {
  let root = document.getElementById("kudora-account-root");
  if (root) return root;
  root = document.createElement("div");
  root.id = "kudora-account-root";
  root.innerHTML = accountMarkup();
  document.body.append(root);
  root.addEventListener("click", onAccountClick);
  root.querySelector("[data-transaction-search]").addEventListener("input", (event) => {
    accountSearch = event.target.value.trim().toLowerCase();
    transactionLimit = 3;
    renderTransactions();
  });
  renderTransactions();
  return root;
}

function renderTransactions() {
  const list = document.querySelector(".k-transaction-list");
  if (!list) return;
  const transactions = allTransactions().filter((transaction) => {
    const matchesFilter = accountFilter === "All" || transaction.category === accountFilter;
    const haystack = `${transaction.title} ${transaction.note} ${transaction.category}`.toLowerCase();
    return matchesFilter && (!accountSearch || haystack.includes(accountSearch));
  });
  const visible = transactions.slice(0, transactionLimit);
  list.innerHTML = visible.length ? visible.map((transaction) => `
    <button type="button" class="k-transaction-row" data-transaction-id="${escapeHtml(transaction.id)}" role="row">
      <span class="k-transaction-icon ${transaction.amount > 0 ? "incoming" : "outgoing"}">${escapeHtml(transaction.icon)}</span>
      <span class="k-transaction-copy"><strong>${escapeHtml(transaction.title)}</strong><small>${escapeHtml(transaction.note)}</small></span>
      <span class="k-transaction-date"><strong>${escapeHtml(transaction.date)}</strong><small>${escapeHtml(transaction.category)}</small></span>
      <span class="k-transaction-amount ${transaction.amount > 0 ? "positive" : ""}">${transaction.amount > 0 ? "+" : "−"}${formatKud(Math.abs(transaction.amount))}<small>${escapeHtml(transaction.status)}</small></span>
      <span class="glyph">→</span>
    </button>`).join("") + (visible.length < transactions.length ? `
      <button type="button" class="k-load-movements" data-load-transactions>
        <span>Load more movements</span><small>${transactions.length - visible.length} remaining</small><b>↓</b>
      </button>` : "") : `<div class="k-empty-movements"><strong>No movement found</strong><span>Try another word or category.</span></div>`;
}

function onAccountClick(event) {
  const action = event.target.closest("[data-account-action]")?.dataset.accountAction;
  if (action) return openMoneyPanel(action);
  const filter = event.target.closest("[data-transaction-filter]")?.dataset.transactionFilter;
  if (filter) {
    accountFilter = filter;
    transactionLimit = 3;
    document.querySelectorAll("[data-transaction-filter]").forEach((button) => button.classList.toggle("active", button.dataset.transactionFilter === filter));
    renderTransactions();
    return;
  }
  if (event.target.closest("[data-load-transactions]")) {
    transactionLimit += 3;
    renderTransactions();
    return;
  }
  const transactionId = event.target.closest("[data-transaction-id]")?.dataset.transactionId;
  if (transactionId) {
    const transaction = allTransactions().find((item) => item.id === transactionId);
    if (transaction) openTransactionPanel(transaction);
    return;
  }
  const privacy = event.target.closest("[data-privacy-toggle]");
  if (privacy) {
    document.querySelector(".k-account-page")?.classList.toggle("hide-values");
    privacy.textContent = document.querySelector(".k-account-page")?.classList.contains("hide-values") ? "○" : "◉";
  }
}

function activateAccount() {
  accountActive = true;
  ensureAccountRoot();
  document.body.classList.add("kudora-account-active");
  updateNavigationState();
  renderTransactions();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deactivateAccount() {
  if (!accountActive) return;
  accountActive = false;
  document.body.classList.remove("kudora-account-active");
  updateNavigationState();
}

function panelShell(content, label) {
  closePanel();
  const backdrop = document.createElement("div");
  backdrop.className = "k-panel-backdrop";
  backdrop.innerHTML = `<section class="k-side-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(label)}">${content}</section>`;
  backdrop.addEventListener("mousedown", (event) => {
    if (event.target === backdrop) closePanel();
  });
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("open"));
  document.addEventListener("keydown", onPanelKey);
  return backdrop.querySelector(".k-side-panel");
}

function onPanelKey(event) {
  if (event.key === "Escape") closePanel();
}

function closePanel() {
  const backdrop = document.querySelector(".k-panel-backdrop");
  if (backdrop) {
    backdrop.classList.remove("open");
    setTimeout(() => backdrop.remove(), 220);
  }
  document.removeEventListener("keydown", onPanelKey);
}

function openWalletPanel() {
  if (!state.walletConnected) return;
  const panel = panelShell(`
    ${panelHeader("CONNECTED WALLET", "Your public tags.", "Copy either tag when someone needs to send money to you.")}
    <div class="k-panel-body k-wallet-panel-body">
      <section class="k-wallet-address-card">
        <div><span>EVM TAG</span><strong>${escapeHtml(EVM_ADDRESS)}</strong><small>Your public Ethereum-compatible tag</small></div>
        <button type="button" data-copy-wallet="evm" aria-label="Copy EVM tag"><span>⧉</span> Copy tag</button>
      </section>
      <section class="k-wallet-address-card">
        <div><span>COSMOS TAG</span><strong>${escapeHtml(COSMOS_ADDRESS)}</strong><small>Your public Kudora tag</small></div>
        <button type="button" data-copy-wallet="cosmos" aria-label="Copy Cosmos tag"><span>⧉</span> Copy tag</button>
      </section>
      <button type="button" class="k-disconnect-wallet" data-disconnect-wallet>Disconnect Wallet</button>
    </div>`, "Your public tags");
  bindPanelClose(panel);
  panel.querySelector("[data-copy-wallet='evm']")?.addEventListener("click", () => copyAddress(EVM_ADDRESS, "EVM"));
  panel.querySelector("[data-copy-wallet='cosmos']")?.addEventListener("click", () => copyAddress(COSMOS_ADDRESS, "Cosmos"));
  panel.querySelector("[data-disconnect-wallet]")?.addEventListener("click", () => {
    state.walletConnected = false;
    saveState();
    closePanel();
    patchTopWallet(true);
    showToast("Wallet disconnected");
  });
}

function panelHeader(eyebrow, title, copy) {
  return `<header class="k-panel-header"><div><span>${escapeHtml(eyebrow)}</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(copy)}</p></div><button type="button" data-close-panel aria-label="Close">×</button></header>`;
}

function bindPanelClose(panel) {
  panel.querySelector("[data-close-panel]")?.addEventListener("click", closePanel);
}

function openTransactionPanel(transaction) {
  const panel = panelShell(`
    ${panelHeader(transaction.category.toUpperCase(), transaction.title, "A clear summary of this movement.")}
    <div class="k-panel-body">
      <div class="k-detail-amount ${transaction.amount > 0 ? "positive" : ""}">${transaction.amount > 0 ? "+" : "−"}${formatKud(Math.abs(transaction.amount))}<small>${escapeHtml(transaction.status)}</small></div>
      <section class="k-plain-explanation"><span>WHAT HAPPENED</span><p>${escapeHtml(transaction.explanation)}</p></section>
      <dl class="k-detail-list">
        <div><dt>When</dt><dd>${escapeHtml(transaction.date)}</dd></div>
        <div><dt>Category</dt><dd>${escapeHtml(transaction.category)}</dd></div>
        <div><dt>Cost of the movement</dt><dd>${formatKud(transaction.fee)}</dd></div>
        <div><dt>Reference</dt><dd>${escapeHtml(transaction.note)}</dd></div>
      </dl>
      <div class="k-safe-note"><span>✓</span><p><strong>Complete and recorded.</strong> You do not need a transaction code or network address to understand this movement.</p></div>
    </div>`, transaction.title);
  bindPanelClose(panel);
}

function networkMark(kind) {
  if (kind === "kudora") return `<span class="k-network-mark kudora"><img src="/kudora-logo.svg" alt=""></span>`;
  if (kind === "ethereum") return `<span class="k-network-mark ethereum">◆</span>`;
  if (kind === "solana") return `<span class="k-network-mark solana">≋</span>`;
  return `<span class="k-network-mark card">▣</span>`;
}

function openMoneyPanel(action) {
  const views = {
    send: {
      eyebrow: "SEND MONEY",
      title: "Who are you paying?",
      copy: "Use the recipient's public tag. We show every cost before you send.",
      body: `<form class="k-money-form" data-money-form="send">
        <label class="k-tag-field"><span class="k-field-label">Recipient tag <button type="button" data-tag-help aria-label="What is a tag?">?</button></span><input name="recipient" required placeholder="Paste tag"></label>
        <div class="k-tag-help" hidden><span>TAG</span><p>A tag is a public address, not a username. Ask the person to open their connected wallet and tap <b>Copy tag</b>. This avoids paying the wrong person with a similar name.</p></div>
        <label><span>Amount</span><div class="k-amount-input"><input name="amount" required type="number" min="0.01" step="0.01" placeholder="0.00"><b>KUD</b></div></label>
        <label><span>Note <small>optional</small></span><input name="note" placeholder="What is this for?"></label>
        <div class="k-cost-preview"><span>You send</span><b data-live-amount>0.00 KUD</b><span>Movement cost</span><b>0.01 KUD</b></div>
        <button class="k-confirm-button" type="submit">Review and send <span>→</span></button>
      </form>`,
    },
    move: {
      eyebrow: "MOVE MONEY",
      title: "Move between your accounts.",
      copy: "It works like moving money between two banks. Choose where it starts and where it should arrive.",
      body: `<form class="k-money-form" data-money-form="move">
        <div class="k-network-route">
          <button type="button" class="selected" data-account-picker data-side="from" data-route-from>${networkMark("kudora")}<span><small>FROM</small><strong data-route-from-name>Kudora account</strong></span><b data-route-caret hidden>⌄</b></button>
          <button type="button" class="k-swap-direction" data-swap-direction aria-label="Switch direction" title="Switch direction">⇄</button>
          <button type="button" data-account-picker data-side="to" data-route-to>${networkMark("ethereum")}<span><small>TO</small><strong data-route-to-name>Ethereum account</strong></span><b data-route-caret>⌄</b></button>
        </div>
        <div class="k-destination-options" hidden>
          <button type="button" data-destination="Ethereum" data-network="ethereum">${networkMark("ethereum")} Ethereum account</button>
          <button type="button" data-destination="Solana" data-network="solana">${networkMark("solana")} Solana account</button>
        </div>
        <label><span>How much do you want to move?</span><div class="k-amount-input"><input name="amount" required type="number" min="1" step="0.01" placeholder="0.00"><b>KUD</b></div></label>
        <div class="k-plain-explanation compact"><span>WHAT YOU WILL RECEIVE</span><p><b data-receive-amount>0.00 KUD</b> in your <span data-receive-account>Ethereum account</span> · usually under 2 minutes</p></div>
        <div class="k-cost-preview"><span>Movement cost</span><b>0.28 KUD</b><span>Rate</span><b>1 KUD = 1 KUD</b></div>
        <button class="k-confirm-button" type="submit">Review the move <span>→</span></button>
      </form>`,
    },
    add: {
      eyebrow: "ADD MONEY",
      title: "Add money by card.",
      copy: "Card payments will connect here when the payment service is ready. Moving money from another account lives under Move money.",
      body: `<form class="k-money-form" data-money-form="add">
        <div class="k-source-options">
          <button type="button" class="selected">${networkMark("card")}<span><strong>Payment card</strong><small>Usually instant</small></span><b>✓</b></button>
        </div>
        <label><span>Amount to add</span><div class="k-amount-input"><input name="amount" required type="number" min="1" step="0.01" placeholder="0.00"><b>KUD</b></div></label>
        <div class="k-cost-preview"><span>Money added</span><b data-live-amount>0.00 KUD</b><span>Payment cost</span><b>1.20 KUD</b></div>
        <button class="k-confirm-button" type="submit">Review and add <span>→</span></button>
      </form>`,
    },
  };
  const view = views[action];
  const panel = panelShell(`${panelHeader(view.eyebrow, view.title, view.copy)}<div class="k-panel-body">${view.body}</div>`, view.title);
  bindPanelClose(panel);
  bindMoneyForm(panel, action);
}

function bindMoneyForm(panel, action) {
  const form = panel.querySelector("[data-money-form]");
  const amount = form.querySelector("input[name='amount']");
  amount?.addEventListener("input", () => {
    const value = Number(amount.value || 0).toFixed(2);
    form.querySelectorAll("[data-live-amount], [data-receive-amount]").forEach((node) => node.textContent = `${value} KUD`);
  });
  form.querySelector("[data-tag-help]")?.addEventListener("click", () => {
    const help = form.querySelector(".k-tag-help");
    help.hidden = !help.hidden;
  });
  form.dataset.direction = "out";
  form.dataset.destination = "Ethereum";
  function renderRoute() {
    if (action !== "move") return;
    const network = form.dataset.destination || "Ethereum";
    const networkKind = network.toLowerCase();
    const incoming = form.dataset.direction === "in";
    const from = form.querySelector("[data-route-from]");
    const to = form.querySelector("[data-route-to]");
    from.querySelector(".k-network-mark").outerHTML = incoming ? networkMark(networkKind) : networkMark("kudora");
    to.querySelector(".k-network-mark").outerHTML = incoming ? networkMark("kudora") : networkMark(networkKind);
    form.querySelector("[data-route-from-name]").textContent = incoming ? `${network} account` : "Kudora account";
    form.querySelector("[data-route-to-name]").textContent = incoming ? "Kudora account" : `${network} account`;
    form.querySelector("[data-receive-account]").textContent = incoming ? "Kudora account" : `${network} account`;
    from.querySelector("[data-route-caret]").hidden = !incoming;
    to.querySelector("[data-route-caret]").hidden = incoming;
    from.classList.toggle("selected", !incoming);
    to.classList.toggle("selected", incoming);
    from.setAttribute("aria-label", incoming ? `Choose source account, currently ${network}` : "Kudora account");
    to.setAttribute("aria-label", incoming ? "Kudora account" : `Choose destination account, currently ${network}`);
  }
  form.querySelector("[data-swap-direction]")?.addEventListener("click", () => {
    form.dataset.direction = form.dataset.direction === "in" ? "out" : "in";
    form.querySelector(".k-destination-options").hidden = true;
    renderRoute();
  });
  form.querySelectorAll("[data-account-picker]").forEach((button) => button.addEventListener("click", () => {
    const incoming = form.dataset.direction === "in";
    const isExternalSide = incoming ? button.dataset.side === "from" : button.dataset.side === "to";
    if (!isExternalSide) return showToast("One side always stays Kudora");
    const options = form.querySelector(".k-destination-options");
    options.hidden = !options.hidden;
  }));
  form.querySelectorAll("[data-destination]").forEach((button) => button.addEventListener("click", () => {
    form.dataset.destination = button.dataset.destination;
    form.querySelector(".k-destination-options").hidden = true;
    renderRoute();
  }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const value = Number(data.get("amount") || 0);
    if (!value) return;
    const destination = form.dataset.destination || "Ethereum";
    const incoming = form.dataset.direction === "in";
    const transaction = action === "send"
      ? { id: `sent-${Date.now()}`, category: "Sent", icon: "↑", title: `Money sent to ${data.get("recipient")}`, note: data.get("note") || "Direct payment", date: "Just now", amount: -value, fee: .01, status: "Completed", explanation: `You sent money directly to ${data.get("recipient")}.` }
      : action === "move"
        ? { id: `moved-${Date.now()}`, category: "Moved", icon: "⇄", title: incoming ? `Moved from your ${destination} account` : `Moved to your ${destination} account`, note: incoming ? `${destination} → Kudora` : `Kudora → ${destination}`, date: "Just now", amount: incoming ? value : -value, fee: .28, status: "Completed", explanation: incoming ? `You moved money from your ${destination} account into Kudora, like moving money between two banks.` : `You moved money from your Kudora account to your ${destination} account, like moving money between two banks.` }
        : { id: `added-${Date.now()}`, category: "Received", icon: "↓", title: "Money added to Kudora", note: "From your payment card", date: "Just now", amount: value, fee: 1.2, status: "Completed", explanation: "You added money to your Kudora account from a connected payment method." };
    state.transactions.unshift(transaction);
    saveState();
    closePanel();
    renderTransactions();
    showToast(action === "send" ? "Money sent" : action === "move" ? "Money is on its way" : "Money added to Kudora");
  });
}

function openZapPanel(target, key, bar) {
  const panel = panelShell(`
    ${panelHeader("ZAP", `Thank ${target}.`, "Send a tiny amount of KUD when someone adds something genuinely useful.")}
    <div class="k-panel-body">
      <form class="k-money-form k-zap-form">
        <div class="k-zap-person"><span class="representative-avatar portrait-civic"></span><div><small>YOU ARE THANKING</small><strong>${escapeHtml(target)}</strong></div></div>
        <fieldset><legend>Choose a small amount</legend><div class="k-zap-amounts">${[0.1, 0.5, 1, 2].map((amount, index) => `<button type="button" class="${index === 1 ? "selected" : ""}" data-zap-amount="${amount}">${amount} KUD</button>`).join("")}</div></fieldset>
        <label><span>Or enter another amount</span><div class="k-amount-input"><input name="amount" type="number" min="0.01" step="0.01" value="0.5"><b>KUD</b></div></label>
        <div class="k-cost-preview"><span>${escapeHtml(target)} receives</span><b data-zap-receives>0.50 KUD</b><span>Movement cost</span><b>0.01 KUD</b></div>
        <button class="k-confirm-button zap" type="submit">Zap ${escapeHtml(target)} <span>ϟ</span></button>
      </form>
    </div>`, `Zap ${target}`);
  bindPanelClose(panel);
  const form = panel.querySelector("form");
  const input = form.querySelector("input[name='amount']");
  function setAmount(value) {
    input.value = value;
    form.querySelector("[data-zap-receives]").textContent = `${Number(value).toFixed(2)} KUD`;
    form.querySelectorAll("[data-zap-amount]").forEach((button) => button.classList.toggle("selected", Number(button.dataset.zapAmount) === Number(value)));
  }
  form.querySelectorAll("[data-zap-amount]").forEach((button) => button.addEventListener("click", () => setAmount(button.dataset.zapAmount)));
  input.addEventListener("input", () => setAmount(input.value || 0));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const amount = Number(input.value || 0);
    if (!amount) return;
    const current = state.reactions[key] || {};
    current.zapTotal = Number(current.zapTotal || 0) + amount;
    state.reactions[key] = current;
    state.transactions.unshift({ id: `zap-${Date.now()}`, category: "Community", icon: "ϟ", title: `Zap to ${target}`, note: "Thanks for something useful", date: "Just now", amount: -amount, fee: .01, status: "Completed", explanation: `You thanked ${target} with a small amount of KUD for something useful.` });
    saveState();
    closePanel();
    renderReactionBar(bar);
    renderTransactions();
    showToast(`${amount.toFixed(2)} KUD zapped to ${target}`);
  });
}

function patchAll() {
  patchNavigation();
  patchTopWallet();
  patchAskButtons();
  patchDiscussionReactions();
  patchProposalReactions();
  patchProposalFee();
  ensureAccountRoot();
  if (accountActive) document.body.classList.add("kudora-account-active");
}

window.KudoraHumanUI = {
  activateAccount,
  deactivateAccount,
  showToast,
  closePanel,
  patch: patchAll,
  setTransactions(transactions) {
    state.transactions = [...transactions];
    renderTransactions();
  },
  recordTransaction(transaction) {
    state.transactions.unshift(transaction);
    renderTransactions();
  },
};

function queuePatch() {
  if (patchQueued) return;
  patchQueued = true;
  requestAnimationFrame(() => {
    patchQueued = false;
    patchAll();
  });
}

async function startEnhancements() {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const root = document.querySelector(".app-shell");
    if (root && Object.keys(root).some((key) => key.startsWith("__reactFiber") || key.startsWith("__reactProps") || key.startsWith("__reactContainer"))) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const patchAfterInteraction = () => {
    queuePatch();
    setTimeout(queuePatch, 100);
  };
  document.addEventListener("click", patchAfterInteraction, true);
  document.addEventListener("submit", patchAfterInteraction, true);
  patchAll();
}

startEnhancements();
