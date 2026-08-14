const profiles = [
  { id: "you", name: "Valentin", score: 742, level: 4, rank: "Steward", role: "Product contributor", portrait: "lumen", comments: 44, proposals: 21, contributions: 35 },
  { id: "zenith", name: "Zenith Collective", score: 968, level: 5, rank: "Guardian", role: "Security contributor", portrait: "zenith", comments: 32, proposals: 26, contributions: 42 },
  { id: "northstar", name: "Northstar Guild", score: 931, level: 5, rank: "Guardian", role: "Independent reviewer", portrait: "northstar", comments: 41, proposals: 28, contributions: 31 },
  { id: "civic", name: "Civic Signal", score: 889, level: 4, rank: "Steward", role: "Community facilitator", portrait: "civic", comments: 67, proposals: 12, contributions: 21 },
  { id: "harbor", name: "Harbor Works", score: 851, level: 4, rank: "Steward", role: "Delivery lead", portrait: "harbor", comments: 24, proposals: 15, contributions: 61 },
  { id: "meridian", name: "Meridian House", score: 818, level: 4, rank: "Steward", role: "Public infrastructure", portrait: "meridian", comments: 29, proposals: 16, contributions: 55 },
  { id: "prism", name: "Prism Delegation", score: 794, level: 4, rank: "Steward", role: "Impact analyst", portrait: "prism", comments: 45, proposals: 16, contributions: 39 },
  { id: "forge", name: "Common Forge", score: 776, level: 4, rank: "Steward", role: "Contributor mentor", portrait: "forge", comments: 28, proposals: 10, contributions: 62 },
  { id: "atlas", name: "Atlas Commons", score: 754, level: 4, rank: "Steward", role: "Research partner", portrait: "atlas", comments: 58, proposals: 11, contributions: 31 },
  { id: "mosaic", name: "Mosaic Voice", score: 719, level: 3, rank: "Contributor", role: "Local communities", portrait: "mosaic", comments: 72, proposals: 8, contributions: 20 },
  { id: "orbital", name: "Orbital Nodes", score: 691, level: 3, rank: "Contributor", role: "Public tools", portrait: "orbital", comments: 23, proposals: 8, contributions: 69 },
  { id: "cedar", name: "Cedar Council", score: 648, level: 3, rank: "Contributor", role: "Risk reviewer", portrait: "cedar", comments: 46, proposals: 20, contributions: 34 },
  { id: "echo", name: "Echo Assembly", score: 603, level: 3, rank: "Contributor", role: "Community feedback", portrait: "echo", comments: 73, proposals: 8, contributions: 19 },
  { id: "verge", name: "Verge Collective", score: 574, level: 2, rank: "Member", role: "Resilience", portrait: "verge", comments: 44, proposals: 17, contributions: 39 },
  { id: "aurora", name: "Aurora Circle", score: 548, level: 2, rank: "Member", role: "Community research", portrait: "aurora", comments: 55, proposals: 24, contributions: 21 },
  { id: "kinetic", name: "Kinetic Studio", score: 532, level: 2, rank: "Member", role: "Product design", portrait: "kinetic", comments: 31, proposals: 22, contributions: 47 },
  { id: "neon", name: "Neon Harbor", score: 519, level: 2, rank: "Member", role: "Local coordination", portrait: "neon", comments: 61, proposals: 18, contributions: 21 },
  { id: "quorum", name: "Quorum Lab", score: 503, level: 2, rank: "Member", role: "Decision research", portrait: "quorum", comments: 42, proposals: 39, contributions: 19 },
  { id: "silk", name: "Silk Route Labs", score: 488, level: 2, rank: "Member", role: "Partnership support", portrait: "silk", comments: 34, proposals: 28, contributions: 38 },
  { id: "solace", name: "Solace Network", score: 474, level: 2, rank: "Member", role: "Member support", portrait: "solace", comments: 68, proposals: 12, contributions: 20 },
  { id: "ember", name: "Ember Studio", score: 459, level: 2, rank: "Member", role: "Creative contributor", portrait: "lumen", comments: 39, proposals: 19, contributions: 42 },
  { id: "river", name: "River Commons", score: 445, level: 2, rank: "Member", role: "Community programs", portrait: "atlas", comments: 64, proposals: 14, contributions: 22 },
  { id: "canopy", name: "Canopy Circle", score: 431, level: 2, rank: "Member", role: "Public learning", portrait: "civic", comments: 59, proposals: 17, contributions: 24 },
  { id: "cobalt", name: "Cobalt Studio", score: 418, level: 2, rank: "Member", role: "Design systems", portrait: "northstar", comments: 36, proposals: 23, contributions: 41 },
  { id: "tide", name: "Tide Assembly", score: 403, level: 2, rank: "Member", role: "Community operations", portrait: "harbor", comments: 51, proposals: 16, contributions: 33 },
  { id: "fable", name: "Fable Works", score: 389, level: 1, rank: "Newcomer", role: "Storytelling", portrait: "mosaic", comments: 57, proposals: 20, contributions: 23 },
  { id: "delta", name: "Delta Room", score: 372, level: 1, rank: "Newcomer", role: "Open research", portrait: "meridian", comments: 48, proposals: 31, contributions: 21 },
  { id: "lattice", name: "Lattice Group", score: 356, level: 1, rank: "Newcomer", role: "Contributor support", portrait: "prism", comments: 43, proposals: 15, contributions: 42 },
  { id: "sunward", name: "Sunward Guild", score: 341, level: 1, rank: "Newcomer", role: "Community growth", portrait: "forge", comments: 62, proposals: 13, contributions: 25 },
  { id: "opal", name: "Opal Society", score: 326, level: 1, rank: "Newcomer", role: "Public events", portrait: "echo", comments: 66, proposals: 18, contributions: 16 },
  { id: "pine", name: "Pine Collective", score: 312, level: 1, rank: "Newcomer", role: "Local projects", portrait: "orbital", comments: 38, proposals: 21, contributions: 41 },
  { id: "clearwater", name: "Clearwater Group", score: 297, level: 1, rank: "Newcomer", role: "Community care", portrait: "cedar", comments: 71, proposals: 11, contributions: 18 },
  { id: "aster", name: "Aster Workshop", score: 281, level: 1, rank: "Newcomer", role: "Open tools", portrait: "zenith", comments: 29, proposals: 18, contributions: 53 },
  { id: "willow", name: "Willow House", score: 266, level: 1, rank: "Newcomer", role: "Member onboarding", portrait: "verge", comments: 69, proposals: 14, contributions: 17 },
  { id: "horizon", name: "Horizon Room", score: 251, level: 1, rank: "Newcomer", role: "Public conversations", portrait: "aurora", comments: 74, proposals: 15, contributions: 11 },
  { id: "granite", name: "Granite Circle", score: 236, level: 1, rank: "Newcomer", role: "Delivery review", portrait: "kinetic", comments: 33, proposals: 20, contributions: 47 },
  { id: "wildflower", name: "Wildflower Lab", score: 218, level: 1, rank: "Newcomer", role: "Community experiments", portrait: "silk", comments: 58, proposals: 27, contributions: 15 },
  { id: "fieldnote", name: "Fieldnote Studio", score: 204, level: 1, rank: "Newcomer", role: "Research notes", portrait: "solace", comments: 63, proposals: 25, contributions: 12 },
];

[
  ["bramble","Bramble House",198,"civic"],["seabird","Seabird Circle",193,"harbor"],["lantern","Lantern Room",188,"lumen"],["daybreak","Daybreak Guild",182,"aurora"],
  ["meadow","Meadow Commons",176,"mosaic"],["starlight","Starlight Lab",171,"prism"],["driftwood","Driftwood Works",165,"cedar"],["moonrise","Moonrise Assembly",159,"northstar"],
  ["juniper","Juniper Collective",154,"verge"],["waypoint","Waypoint Studio",149,"forge"],["bluebell","Bluebell Society",143,"silk"],["shoreline","Shoreline Group",138,"orbital"],
  ["rainfall","Rainfall House",132,"solace"],["paperkite","Paper Kite Lab",127,"echo"],["goldfinch","Goldfinch Room",121,"zenith"],["springboard","Springboard Guild",116,"kinetic"],
  ["cloudline","Cloudline Commons",110,"atlas"],["openfield","Openfield Circle",104,"meridian"],["redwood","Redwood Studio",98,"cobalt"],["silverlake","Silverlake Works",92,"tide"],
  ["starling","Starling House",86,"fable"],["windward","Windward Lab",80,"pine"],["brook","Brook Assembly",74,"clearwater"],["sundial","Sundial Collective",68,"aster"]
].forEach(([id,name,score,portrait], index) => profiles.push({ id, name, score, level: 1, rank: "Newcomer", role: "Community member", portrait, comments: 48 + index % 25, proposals: 12 + index % 19, contributions: 40 - index % 17 }));

// Every row is one directional opinion: from → to, useful, not useful.
// A pair can have two rows, one row, or no row at all.
const socialLinks = [
  ["you","atlas",64,3],["atlas","you",51,4],["you","harbor",47,8],["harbor","you",33,6],
  ["you","civic",39,4],["civic","you",44,2],["you","forge",31,6],["forge","you",25,5],
  ["you","northstar",26,2],["northstar","you",38,3],["you","zenith",21,1],["zenith","you",29,2],
  ["you","cedar",8,18],["cedar","you",5,23],["you","echo",5,9],["echo","you",14,7],
  ["you","mosaic",14,2],["mosaic","you",19,4],["you","meridian",12,3],["meridian","you",16,2],
  ["you","prism",9,1],["prism","you",13,2],["you","orbital",8,5],
  ["zenith","northstar",44,2],["northstar","zenith",37,3],["civic","mosaic",52,5],["mosaic","civic",28,4],
  ["harbor","forge",46,7],["forge","harbor",18,5],["atlas","prism",34,3],["prism","atlas",21,2],
  ["meridian","orbital",33,4],["orbital","meridian",22,6],["cedar","verge",7,12],["verge","cedar",4,15],
  ["echo","mosaic",12,11],["forge","orbital",24,3],["orbital","forge",17,2],["northstar","cedar",18,5],
  ["cedar","northstar",6,13],["prism","zenith",21,3],["zenith","prism",16,2],["verge","harbor",11,8],
  ["atlas","civic",29,2],["civic","atlas",24,3],["atlas","aurora",22,4],["aurora","atlas",17,3],
  ["civic","neon",25,3],["neon","civic",13,2],["harbor","kinetic",18,4],["kinetic","harbor",20,3],
  ["forge","quorum",16,2],["quorum","forge",9,5],["mosaic","silk",19,3],["silk","mosaic",14,1],
  ["meridian","solace",15,2],["solace","meridian",11,2],["orbital","ember",23,4],["ember","orbital",12,3],
  ["prism","river",14,2],["river","prism",18,4],["northstar","canopy",27,2],["canopy","northstar",12,3],
  ["zenith","cobalt",21,4],["cobalt","zenith",15,2],["echo","tide",9,13],["tide","echo",16,4],
  ["verge","fable",8,5],["fable","verge",11,2],["aurora","delta",14,3],["delta","aurora",9,2],
  ["kinetic","lattice",19,2],["lattice","kinetic",12,3],["neon","sunward",13,4],["sunward","neon",17,2],
  ["quorum","opal",10,6],["opal","quorum",5,11],["silk","pine",16,3],["pine","silk",9,2],
  ["solace","clearwater",21,2],["clearwater","solace",18,3],["ember","aster",12,5],["aster","ember",16,2],
  ["river","willow",17,2],["willow","river",9,3],["canopy","horizon",15,4],["horizon","canopy",8,2],
  ["cobalt","granite",18,3],["granite","cobalt",6,12],["tide","wildflower",12,2],["wildflower","tide",14,3],
  ["fable","fieldnote",11,2],["fieldnote","fable",7,1],["delta","lattice",13,2],["sunward","opal",9,4],
  ["pine","clearwater",8,2],["aster","granite",10,3],["horizon","fieldnote",12,2],
];

socialLinks.push(
  ["fieldnote","bramble",8,2],["bramble","fieldnote",4,7],["bramble","seabird",15,2],["seabird","lantern",7,1],["lantern","seabird",13,3],["lantern","daybreak",4,9],
  ["daybreak","meadow",19,2],["meadow","daybreak",8,3],["meadow","starlight",11,1],["starlight","driftwood",3,12],["driftwood","starlight",6,2],["driftwood","moonrise",14,4],
  ["moonrise","juniper",18,1],["juniper","moonrise",9,2],["juniper","waypoint",7,6],["waypoint","bluebell",22,2],["bluebell","waypoint",13,1],["bluebell","shoreline",5,10],
  ["shoreline","rainfall",12,3],["rainfall","shoreline",16,2],["rainfall","paperkite",8,1],["paperkite","goldfinch",2,14],["goldfinch","paperkite",6,5],["goldfinch","springboard",17,2],
  ["springboard","cloudline",24,1],["cloudline","springboard",10,3],["cloudline","openfield",9,2],["openfield","redwood",4,11],["redwood","openfield",7,2],["redwood","silverlake",13,3],
  ["silverlake","starling",20,2],["starling","silverlake",11,1],["starling","windward",6,8],["windward","brook",15,3],["brook","windward",8,2],["brook","sundial",12,1],
  ["sundial","bramble",5,2],["aurora","bramble",9,1],["kinetic","daybreak",16,3],["solace","meadow",12,2],["ember","starlight",18,4],["river","moonrise",7,1],
  ["canopy","waypoint",14,2],["cobalt","shoreline",6,11],["tide","paperkite",10,2],["delta","springboard",13,1],["lattice","cloudline",5,9],["sunward","redwood",17,2],
  ["opal","starling",8,3],["clearwater","brook",19,1],["granite","sundial",4,10]
);

const GRAPH_WIDTH = 1800;
const GRAPH_HEIGHT = 1100;
const GRAPH_CENTER_X = GRAPH_WIDTH / 2;
const GRAPH_CENTER_Y = GRAPH_HEIGHT / 2;

const reputationHistory = [
  { type: "contribution", change: 27, kind: "Contribution", title: "Nova research milestone accepted", detail: "The community confirmed your delivery as part of the assigned team.", source: "Nova research delivery", date: "Today, 12:04" },
  { type: "comment", change: 18, kind: "Comment", title: "Accessibility review", detail: "Your comment helped the proposal author make the experience easier to understand.", source: "Comment · Accessibility review", date: "Today, 09:18", quote: "The comparison is clear, but the payment step still asks people to understand the network. Show the destination as an account instead." },
  { type: "proposal", change: 11, kind: "Proposal", title: "Public roadmap proposal accepted", detail: "Your proposal helped the community agree on a clear public roadmap.", source: "Proposal · Public roadmap", date: "Yesterday, 17:42", quote: "A before-and-after view would make the trade-off visible without asking people to read the whole proposal." },
  { type: "comment", change: -4, kind: "Comment", title: "Treasury limits comment", detail: "One trusted reviewer found the answer off-topic.", source: "Comment · Treasury limits", date: "Yesterday, 11:06", quote: "We should probably pause this and revisit the entire model later." },
  { type: "contribution", change: 9, kind: "Contribution", title: "Community toolkit review", detail: "Northstar Guild confirmed that your contribution was careful and complete.", source: "Community toolkit contribution", date: "10 Aug, 15:30" },
  { type: "contribution", change: -12, kind: "Contribution", title: "Local onboarding delivery", detail: "The deadline passed before an updated plan was shared with the community.", source: "Local onboarding contribution", date: "8 Aug, 18:55" },
];

const raters = [
  { name: "Atlas Commons", portrait: "atlas", choice: "Useful", weight: 28 },
  { name: "Civic Signal", portrait: "civic", choice: "Useful", weight: 24 },
  { name: "Northstar Guild", portrait: "northstar", choice: "Useful", weight: 19 },
  { name: "Cedar Council", portrait: "cedar", choice: "Not useful", weight: 17 },
  { name: "Echo Assembly", portrait: "echo", choice: "Not useful", weight: 12 },
];

const ranks = ["Newcomer", "Member", "Contributor", "Steward", "Guardian"];
const profileTags = { you: "0x71A4B990C4e", zenith: "kudo1zen8vm2", northstar: "0x09F2C1A440", civic: "kudo1civm40q", harbor: "0x88A30F6D22", meridian: "kudo1mer9p3x", prism: "0x5B204A7C19", forge: "kudo1for72aa", atlas: "0xA7701531B8", mosaic: "kudo1mosfv16", orbital: "0x31BB019C04", cedar: "kudo1cedee20", echo: "0xE44517B082", verge: "kudo1ver10kx" };
const byId = (id) => profiles.find((profile) => profile.id === id) || profiles[0];
const safe = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
let reputationActive = false;
let patchQueued = false;
let historyDepth = 0;
let panelCenters = [];

const graphStates = {
  main: { centerId: "you", scale: .9, targetScale: .9, x: 0, y: 0, targetX: 0, targetY: 0, ready: false, positions: new Map(), frame: 0, layoutFrame: 0 },
  panel: { centerId: "you", scale: .76, targetScale: .76, x: 0, y: 0, targetX: 0, targetY: 0, ready: false, positions: new Map(), frame: 0, layoutFrame: 0 },
};

function portrait(profile, className = "") {
  return `<span class="representative-avatar portrait-${profile.portrait} ${className}" role="img" aria-label="${safe(profile.name)}"></span>`;
}

function patchNavigation() {
  document.querySelectorAll(".desktop-nav, .mobile-nav").forEach((nav) => {
    if (!nav.querySelector(".k-reputation-nav")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "k-reputation-nav";
      button.innerHTML = nav.classList.contains("mobile-nav") ? `<span class="glyph">✦</span><span>Reputation</span>` : `<span class="glyph">✦</span> Reputation`;
      button.addEventListener("click", activateReputation);
      nav.append(button);
    }
    [...nav.children].forEach((button) => {
      if (button.classList.contains("k-reputation-nav") || button.dataset.reputationExitBound) return;
      button.dataset.reputationExitBound = "true";
      button.addEventListener("click", deactivateReputation);
    });
  });
  const brand = document.querySelector(".brand");
  if (brand && !brand.dataset.reputationExitBound) {
    brand.dataset.reputationExitBound = "true";
    brand.addEventListener("click", deactivateReputation);
  }
  document.querySelectorAll(".k-reputation-nav").forEach((button) => button.classList.toggle("active", reputationActive));
  if (reputationActive) document.querySelectorAll(".desktop-nav > button:not(.k-reputation-nav), .mobile-nav > button:not(.k-reputation-nav)").forEach((button) => button.classList.remove("active"));
}

function pageMarkup() {
  const me = profiles[0];
  return `<main class="k-reputation-page">
    <section class="k-reputation-hero"><div><p class="eyebrow"><span>✦</span> REPUTATION</p><h1>Trust people can trace.</h1><p class="lead">See how someone contributes, who supports their ideas and where criticism comes from.</p></div><div class="k-reputation-seal"><i></i><span>HUMAN TRUST</span><small>earned, never bought</small></div></section>
    <section class="k-reputation-overview">
      <article class="k-my-reputation k-rep-card"><header><span class="tiny-label">YOUR REPUTATION</span><span class="k-level-chip">LEVEL ${me.level}</span></header><div class="k-score-line"><strong>${me.score}</strong><div><b>${me.rank}</b><span>your current rank</span></div></div><div class="k-level-progress"><i style="width:74%"></i></div><div class="k-next-level"><span>258 points to Guardian</span><b>742 / 1,000</b></div><div class="k-rank-mini">${ranks.map((rank, index) => `<span class="${index + 1 === me.level ? "current" : index + 1 < me.level ? "passed" : ""}"><i></i><small>${index + 1}</small><b>${rank}</b></span>`).join("")}</div></article>
      <article class="k-rep-breakdown k-rep-card"><span class="tiny-label">WHAT YOUR SCORE SAYS</span><h2>One score, three sources.</h2><div class="k-breakdown-donut" style="--comments:${me.comments};--proposals:${me.proposals}"><span><b>${me.score}</b><small>TOTAL</small></span></div><div class="k-breakdown-legend"><span><i class="comments"></i><b>Comments</b><small>${me.comments}%</small></span><span><i class="proposals"></i><b>Proposals</b><small>${me.proposals}%</small></span><span><i class="contributions"></i><b>Contributions</b><small>${me.contributions}%</small></span></div></article>
      <article class="k-rep-changes k-rep-card"><span class="tiny-label">RECENT CHANGES</span><div><i class="up">+18</i><span><b>Useful from Atlas Commons</b><small>Accessibility review</small></span></div><div><i class="up">+27</i><span><b>Nova milestone accepted</b><small>Completed work</small></span></div><div><i class="down">−4</i><span><b>Comment marked not useful</b><small>Treasury limits</small></span></div><button type="button" data-open-history>Open your full history <span>→</span></button></article>
    </section>
    <section class="k-trust-map-section k-rep-card"><header class="k-rep-section-head"><div><span class="tiny-label">YOUR SOCIAL MAP</span><h2 data-main-title>${safe(me.name)} at the center.</h2><p>Each arrow shows who rated whom. Green is a positive balance; red is a negative balance.</p></div></header><div class="k-graph-legend"><span><i class="useful"></i>Positive balance</span><span><i class="not-useful"></i>Negative balance</span></div><div class="k-social-graph" data-graph="main"></div></section>
    <section class="k-top-reputation k-rep-card"><header class="k-rep-section-head"><div><span class="tiny-label">PEOPLE TO KNOW</span><h2>Top reputation.</h2><p>Find a person and open their social map.</p></div><label><span>⌕</span><input type="search" data-reputation-search placeholder="Search a person" aria-label="Search reputation"></label></header><div class="k-top-list" data-reputation-list></div></section>
  </main>`;
}

function ensureRoot() {
  let root = document.getElementById("kudora-reputation-root");
  if (root) return root;
  root = document.createElement("div");
  root.id = "kudora-reputation-root";
  root.innerHTML = pageMarkup();
  document.body.append(root);
  root.addEventListener("click", onPageClick);
  root.querySelector("[data-reputation-search]").addEventListener("input", renderRanking);
  renderRanking();
  mountGraph(root.querySelector('[data-graph="main"]'), "main", "you");
  return root;
}

function activateReputation() {
  window.KudoraHumanUI?.deactivateAccount?.();
  reputationActive = true;
  ensureRoot();
  document.body.classList.add("kudora-reputation-active");
  patchNavigation();
  requestAnimationFrame(() => {
    const host = document.querySelector('[data-graph="main"]');
    if (host) {
      graphStates.main.ready = false;
      mountGraph(host, "main", graphStates.main.centerId);
    }
  });
  if (location.pathname !== "/reputation") history.pushState({ page: "reputation" }, "", "/reputation");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deactivateReputation() {
  if (!reputationActive) return;
  reputationActive = false;
  document.body.classList.remove("kudora-reputation-active");
  closeDrawer();
  patchNavigation();
  if (location.pathname === "/reputation") history.replaceState({}, "", "/");
}

function connectedProfiles(centerId) {
  const directIds = [...new Set(socialLinks
    .filter(([a, b]) => a === centerId || b === centerId)
    .sort((a, b) => Math.abs(b[2] - b[3]) - Math.abs(a[2] - a[3]))
    .map(([a, b]) => a === centerId ? b : a))];
  const direct = directIds.map(byId);
  const rest = profiles.filter((profile) => profile.id !== centerId && !direct.some((item) => item.id === profile.id));
  return [byId(centerId), ...direct, ...rest];
}

function layoutPositions(centerId) {
  const nodes = connectedProfiles(centerId);
  const positions = new Map([[centerId, { x: GRAPH_CENTER_X, y: GRAPH_CENTER_Y, depth: 0 }]]);
  nodes.slice(1).forEach((profile, index) => {
    const depth = index < 8 ? 1 : index < 20 ? 2 : 3;
    const ringStart = depth === 1 ? 0 : depth === 2 ? 8 : 20;
    const ringIndex = index - ringStart;
    const ringTotal = depth === 1 ? 8 : depth === 2 ? 12 : Math.max(1, nodes.length - 21);
    const angleOffset = depth === 1 ? .08 : depth === 2 ? .31 : .17;
    const angle = (ringIndex / ringTotal) * Math.PI * 2 - Math.PI / 2 + angleOffset;
    const rx = depth === 1 ? 305 : depth === 2 ? 520 : 760;
    const ry = depth === 1 ? 220 : depth === 2 ? 335 : 470;
    positions.set(profile.id, { x: GRAPH_CENTER_X + Math.cos(angle) * rx, y: GRAPH_CENTER_Y + Math.sin(angle) * ry, depth });
  });
  return { nodes, positions };
}

function relationsFor(a, b) {
  return socialLinks.filter(([from, to]) => (from === a && to === b) || (from === b && to === a));
}

function nodeTone(centerId, nodeId) {
  const relations = relationsFor(centerId, nodeId);
  if (!relations.length) {
    const score = byId(nodeId).score;
    return score > 680 ? { tone: "positive", strength: clamp((score - 560) / 430, .2, .95) } : { tone: "neutral", strength: .15 };
  }
  const balance = relations.reduce((total, [, , useful, notUseful]) => total + useful - notUseful, 0);
  return { tone: balance > 3 ? "positive" : balance < -3 ? "negative" : "neutral", strength: clamp(Math.abs(balance) / 96, .12, 1) };
}

function edgeOffset(a, b) {
  return socialLinks.some(([from, to]) => from === b && to === a) ? -8 : 0;
}

function pathBetween(a, b, offset = 0, trim = 48) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const ox = (-dy / length) * offset;
  const oy = (dx / length) * offset;
  const startX = a.x + ux * trim + ox;
  const startY = a.y + uy * trim + oy;
  const endX = b.x - ux * trim + ox;
  const endY = b.y - uy * trim + oy;
  const mx = (startX + endX) / 2;
  const my = (startY + endY) / 2;
  return `M ${startX} ${startY} Q ${mx + dy * .035} ${my - dx * .035} ${endX} ${endY}`;
}

function graphMarkup(scope) {
  const state = graphStates[scope];
  const { nodes, positions } = layoutPositions(state.centerId);
  state.positions = positions;
  const edges = socialLinks.filter(([, , useful, notUseful]) => useful !== notUseful);
  const edgeMarkup = edges.map(([a, b, useful, notUseful], index) => {
    const start = positions.get(a); const end = positions.get(b);
    const balance = useful - notUseful;
    const tone = balance > 0 ? "positive" : balance < 0 ? "negative" : "neutral";
    const strength = clamp(Math.abs(balance) / 61, .07, 1);
    const depth = Math.max(start.depth, end.depth);
    const path = pathBetween(start, end, edgeOffset(a, b));
    return `<g data-edge="${a}:${b}:${index}" data-depth="${depth}" data-useful="${useful}" data-not-useful="${notUseful}" data-balance="${balance}"><path class="k-edge ${tone}" d="${path}" marker-end="url(#k-arrow-${tone}-${scope})" style="--strength:${strength};--delay:${index * -.17}s"></path><path class="k-edge-hit" d="${path}"></path></g>`;
  }).join("");
  const nodeMarkup = nodes.map((profile, index) => {
    const position = positions.get(profile.id); const { tone, strength } = nodeTone(state.centerId, profile.id);
    return `<button type="button" class="k-social-node ${index === 0 ? "center" : ""} ${tone}" style="--node-x:${position.x}px;--node-y:${position.y}px;--halo:${strength}" data-depth="${position.depth}" data-social-node="${profile.id}"><span>${portrait(profile)}</span><b>${safe(profile.name)}</b></button>`;
  }).join("");
  const miniEdges = edges.map(([a, b, useful, notUseful], index) => { const start = positions.get(a); const end = positions.get(b); const balance = useful - notUseful; const tone = balance > 0 ? "positive" : balance < 0 ? "negative" : "neutral"; return `<line class="${tone}" data-mini-edge="${a}:${b}:${index}" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"></line>`; }).join("");
  const miniNodes = nodes.map((profile) => { const point = positions.get(profile.id); return `<circle data-mini-node="${profile.id}" cx="${point.x}" cy="${point.y}" r="${profile.id === state.centerId ? 15 : 8}"></circle>`; }).join("");
  const markers = `<defs><marker id="k-arrow-positive-${scope}" viewBox="0 0 9 9" refX="7.2" refY="4.5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 9 4.5 L 0 9 Z" fill="#70f6b2"></path></marker><marker id="k-arrow-negative-${scope}" viewBox="0 0 9 9" refX="7.2" refY="4.5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 9 4.5 L 0 9 Z" fill="#ff6683"></path></marker><marker id="k-arrow-neutral-${scope}" viewBox="0 0 9 9" refX="7.2" refY="4.5" markerWidth="8" markerHeight="8" orient="auto" markerUnits="userSpaceOnUse"><path d="M 0 0 L 9 4.5 L 0 9 Z" fill="#8f8e99"></path></marker></defs>`;
  return `<div class="k-graph-stars"></div><div class="k-graph-world"><svg viewBox="0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}" aria-label="Directional social reputation map">${markers}${edgeMarkup}</svg>${nodeMarkup}</div><div class="k-link-tooltip" hidden></div><div class="k-graph-controls"><button type="button" data-graph-reset aria-label="Reset view" title="Reset view"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.34 5.66M20 4v7h-7"></path></svg></button></div><div class="k-graph-minimap"><svg viewBox="0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}" preserveAspectRatio="none">${miniEdges}${miniNodes}<rect data-mini-viewport></rect></svg></div>`;
}

function mountGraph(host, scope, centerId) {
  const state = graphStates[scope];
  state.centerId = centerId;
  host.innerHTML = graphMarkup(scope);
  bindGraph(host, scope);
  centerGraph(host, state);
  updateGraphVisibility(host, state.scale);
}

function centerGraph(host, state) {
  const rect = host.getBoundingClientRect();
  state.x = rect.width / 2 - GRAPH_CENTER_X * state.scale;
  state.y = rect.height / 2 - GRAPH_CENTER_Y * state.scale;
  state.targetX = state.x;
  state.targetY = state.y;
  state.targetScale = state.scale;
  state.ready = true;
  applyGraphTransform(host, state);
}

function applyGraphTransform(host, state) {
  const world = host.querySelector(".k-graph-world");
  if (!world) return;
  world.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`;
  host.style.setProperty("--zoom", state.scale);
  updateMinimap(host, state);
  updateGraphVisibility(host, state.scale);
}

function animateTransform(host, state) {
  if (state.frame) return;
  const tick = () => {
    state.scale += (state.targetScale - state.scale) * .19;
    state.x += (state.targetX - state.x) * .19;
    state.y += (state.targetY - state.y) * .19;
    applyGraphTransform(host, state);
    const remaining = Math.abs(state.targetScale - state.scale) + Math.abs(state.targetX - state.x) / 300 + Math.abs(state.targetY - state.y) / 300;
    if (remaining > .002) state.frame = requestAnimationFrame(tick);
    else {
      state.scale = state.targetScale; state.x = state.targetX; state.y = state.targetY;
      applyGraphTransform(host, state); state.frame = 0;
    }
  };
  state.frame = requestAnimationFrame(tick);
}

function updateGraphVisibility(host, scale) {
  const showMiddle = scale < .86;
  const showOuter = scale < .64;
  host.querySelectorAll("[data-depth='2']").forEach((element) => element.classList.toggle("is-hidden", !showMiddle));
  host.querySelectorAll("[data-depth='3']").forEach((element) => element.classList.toggle("is-hidden", !showOuter));
}

function updateMinimap(host, state) {
  const rect = host.getBoundingClientRect();
  const viewport = host.querySelector("[data-mini-viewport]");
  if (!viewport) return;
  viewport.setAttribute("x", String(clamp(-state.x / state.scale, 0, GRAPH_WIDTH)));
  viewport.setAttribute("y", String(clamp(-state.y / state.scale, 0, GRAPH_HEIGHT)));
  viewport.setAttribute("width", String(Math.min(GRAPH_WIDTH, rect.width / state.scale)));
  viewport.setAttribute("height", String(Math.min(GRAPH_HEIGHT, rect.height / state.scale)));
}

function updateGraphGeometry(host, state) {
  host.querySelectorAll("[data-social-node]").forEach((node) => {
    const position = state.positions.get(node.dataset.socialNode);
    if (position) { node.style.setProperty("--node-x", `${position.x}px`); node.style.setProperty("--node-y", `${position.y}px`); }
  });
  host.querySelectorAll("[data-edge]").forEach((group) => {
    const [a, b] = group.dataset.edge.split(":"); const start = state.positions.get(a); const end = state.positions.get(b);
    if (!start || !end) return;
    const path = pathBetween(start, end, edgeOffset(a, b));
    group.querySelector(".k-edge").setAttribute("d", path);
    group.querySelector(".k-edge-hit").setAttribute("d", path);
  });
  host.querySelectorAll("[data-mini-node]").forEach((node) => {
    const point = state.positions.get(node.dataset.miniNode);
    if (point) { node.setAttribute("cx", point.x); node.setAttribute("cy", point.y); }
  });
  host.querySelectorAll("[data-mini-edge]").forEach((line) => {
    const [a, b] = line.dataset.miniEdge.split(":"); const start = state.positions.get(a); const end = state.positions.get(b);
    if (start && end) { line.setAttribute("x1", start.x); line.setAttribute("y1", start.y); line.setAttribute("x2", end.x); line.setAttribute("y2", end.y); }
  });
}

function bindGraph(host, scope) {
  const state = graphStates[scope];
  let gesture = null;
  host.addEventListener("wheel", (event) => {
    event.preventDefault();
    const rect = host.getBoundingClientRect();
    const pointX = event.clientX - rect.left; const pointY = event.clientY - rect.top;
    const worldX = (pointX - state.targetX) / state.targetScale; const worldY = (pointY - state.targetY) / state.targetScale;
    state.targetScale = clamp(state.targetScale * Math.exp(-event.deltaY * .001), .34, 1.3);
    state.targetX = pointX - worldX * state.targetScale; state.targetY = pointY - worldY * state.targetScale;
    animateTransform(host, state);
  }, { passive: false });
  host.addEventListener("pointerdown", (event) => {
    if (event.target.closest("[data-graph-reset], .k-graph-minimap")) return;
    const node = event.target.closest("[data-social-node]");
    if (node) return;
    gesture = { startX: event.clientX, startY: event.clientY, baseX: state.x, baseY: state.y, moved: false };
    host.setPointerCapture(event.pointerId);
    host.classList.add("panning");
  });
  host.addEventListener("pointermove", (event) => {
    const edge = event.target.closest("[data-edge]");
    const tooltip = host.querySelector(".k-link-tooltip");
    if (edge && !gesture) {
      const [a, b] = edge.dataset.edge.split(":"); const rect = host.getBoundingClientRect();
      const balance = Number(edge.dataset.balance);
      tooltip.innerHTML = `<b>${safe(byId(a).name)} → ${safe(byId(b).name)}</b><span class="positive">+${edge.dataset.useful} useful</span><span class="negative">−${edge.dataset.notUseful} not useful</span><em class="${balance >= 0 ? "positive" : "negative"}">${balance >= 0 ? "+" : "−"}${Math.abs(balance)} balance</em>`;
      tooltip.style.left = `${event.clientX - rect.left + 14}px`; tooltip.style.top = `${event.clientY - rect.top + 14}px`; tooltip.hidden = false;
    } else if (!edge) tooltip.hidden = true;
    if (!gesture) return;
    const dx = event.clientX - gesture.startX; const dy = event.clientY - gesture.startY;
    if (Math.hypot(dx, dy) > 4) gesture.moved = true;
    state.x = gesture.baseX + dx; state.y = gesture.baseY + dy;
    state.targetX = state.x; state.targetY = state.y; applyGraphTransform(host, state);
  });
  const endGesture = (event) => {
    if (!gesture) return;
    host.classList.remove("panning");
    if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId);
    gesture = null;
  };
  host.addEventListener("pointerup", endGesture);
  host.addEventListener("pointercancel", endGesture);
  host.addEventListener("pointerleave", () => { const tooltip = host.querySelector(".k-link-tooltip"); if (tooltip) tooltip.hidden = true; });
  host.querySelectorAll("[data-social-node]").forEach((node) => node.addEventListener("click", () => recenterGraph(host, scope, node.dataset.socialNode)));
  host.querySelector("[data-graph-reset]").addEventListener("click", () => resetGraph(host, scope));
}

function animateLayout(host, state, nextPositions, duration = 620) {
  if (state.layoutFrame) cancelAnimationFrame(state.layoutFrame);
  const from = new Map([...state.positions].map(([id, point]) => [id, { ...point }]));
  const start = performance.now();
  const tick = (now) => {
    const linear = clamp((now - start) / duration, 0, 1);
    const eased = 1 - Math.pow(1 - linear, 4);
    nextPositions.forEach((next, id) => {
      const previous = from.get(id) || next;
      state.positions.set(id, { x: previous.x + (next.x - previous.x) * eased, y: previous.y + (next.y - previous.y) * eased, depth: next.depth });
    });
    updateGraphGeometry(host, state);
    if (linear < 1) state.layoutFrame = requestAnimationFrame(tick);
    else { state.layoutFrame = 0; updateNodePresentation(host, state); }
  };
  state.layoutFrame = requestAnimationFrame(tick);
}

function updateNodePresentation(host, state) {
  host.querySelectorAll("[data-social-node]").forEach((node) => {
    const id = node.dataset.socialNode; const point = state.positions.get(id); const { tone, strength } = nodeTone(state.centerId, id);
    node.dataset.depth = String(point.depth);
    node.classList.toggle("center", id === state.centerId);
    node.classList.remove("positive", "negative", "neutral"); node.classList.add(tone);
    node.style.setProperty("--halo", strength);
  });
  host.querySelectorAll("[data-edge]").forEach((edge) => {
    const [a, b] = edge.dataset.edge.split(":");
    edge.dataset.depth = String(Math.max(state.positions.get(a).depth, state.positions.get(b).depth));
  });
  host.querySelectorAll("[data-mini-node]").forEach((node) => node.setAttribute("r", node.dataset.miniNode === state.centerId ? "15" : "8"));
  updateGraphVisibility(host, state.scale);
}

function recenterGraph(host, scope, id) {
  const state = graphStates[scope];
  if (state.centerId === id) return;
  state.centerId = id;
  const next = layoutPositions(id).positions;
  animateLayout(host, state, next);
  state.targetX = host.clientWidth / 2 - GRAPH_CENTER_X * state.targetScale;
  state.targetY = host.clientHeight / 2 - GRAPH_CENTER_Y * state.targetScale;
  animateTransform(host, state);
  updateNodePresentation(host, state);
  if (scope === "panel") {
    panelCenters.push(id);
    updateProfilePanel(id);
  } else {
    document.querySelector("[data-main-title]").textContent = `${byId(id).name} at the center.`;
  }
}

function resetGraph(host, scope) {
  const state = graphStates[scope];
  const id = scope === "main" ? "you" : state.centerId;
  state.centerId = id;
  const next = layoutPositions(id).positions;
  animateLayout(host, state, next, 540);
  state.targetScale = scope === "main" ? .9 : .76;
  state.targetX = host.clientWidth / 2 - GRAPH_CENTER_X * state.targetScale;
  state.targetY = host.clientHeight / 2 - GRAPH_CENTER_Y * state.targetScale;
  animateTransform(host, state);
  updateNodePresentation(host, state);
  if (scope === "main") {
    document.querySelector("[data-main-title]").textContent = `${byId(id).name} at the center.`;
  }
}

function renderRanking() {
  const list = document.querySelector("[data-reputation-list]");
  if (!list) return;
  const query = document.querySelector("[data-reputation-search]")?.value.trim().toLowerCase() || "";
  const results = profiles.filter((profile) => `${profile.name} ${profile.role} ${profileTags[profile.id] || ""}`.toLowerCase().includes(query)).slice(0, query ? 12 : 8);
  list.innerHTML = results.length ? results.map((profile, index) => `<button type="button" data-open-profile="${profile.id}"><span class="k-top-rank">${String(index + 1).padStart(2, "0")}</span>${portrait(profile, "k-top-avatar")}<span class="k-rep-person-copy"><strong>${safe(profile.name)}${profile.id === "you" ? " <i>YOU</i>" : ""}</strong><small>${safe(profile.role)}</small></span><span class="k-top-score"><b>${profile.score}</b><small>LEVEL ${profile.level} · ${profile.rank.toUpperCase()}</small></span><span class="glyph">→</span></button>`).join("") : `<div class="k-rep-empty"><b>No person found</b><span>Try another name.</span></div>`;
}

function onPageClick(event) {
  if (event.target.closest("[data-open-history]")) return openHistory();
  const profileId = event.target.closest("[data-open-profile]")?.dataset.openProfile;
  if (profileId) openProfile(profileId);
}

function ensureBackdrop() {
  let backdrop = document.querySelector(".k-rep-modal-backdrop");
  if (!backdrop) { backdrop = document.createElement("div"); backdrop.className = "k-rep-modal-backdrop"; document.body.append(backdrop); }
  return backdrop;
}

function historyListMarkup() {
  return `<div class="k-rep-history-panel"><header><div><span class="tiny-label">YOUR REPUTATION</span><h2>Full history</h2><p>Every gain and loss, with the contribution that caused it.</p></div><button type="button" data-drawer-close>×</button></header><div class="k-history-summary"><span><small>CURRENT SCORE</small><b>742</b></span><span><small>LAST 30 DAYS</small><b class="positive">+49</b></span><span><small>GAINS / LOSSES</small><b>5 / 2</b></span></div><div class="k-history-list">${reputationHistory.map((item, index) => `<article class="${item.change > 0 ? "gain" : "loss"}"><span class="k-history-change">${item.change > 0 ? "+" : "−"}${Math.abs(item.change)}</span><div><small>${safe(item.kind)} · ${safe(item.date)}</small><h3>${safe(item.title)}</h3><p>${safe(item.detail)}</p><button type="button" data-history-detail="${index}">${safe(item.source)} <span>→</span></button></div></article>`).join("")}</div></div>`;
}

function historyDetailMarkup(item, index) {
  const isComment = item.type === "comment";
  const isProposal = item.type === "proposal";
  return `<div class="k-rep-history-panel"><header><button type="button" data-history-back>←</button><div><span class="tiny-label">${safe(item.kind).toUpperCase()}</span><h2>${safe(item.title)}</h2><p>${safe(item.date)}</p></div><button type="button" data-drawer-close>×</button></header><div class="k-history-detail"><div class="k-detail-score ${item.change > 0 ? "gain" : "loss"}"><strong>${item.change > 0 ? "+" : "−"}${Math.abs(item.change)}</strong><span>REPUTATION</span></div>${isComment ? `<section class="k-comment-evidence"><span class="tiny-label">YOUR COMMENT</span><blockquote>${safe(item.quote)}</blockquote><small>${safe(item.source)}</small></section><section class="k-rater-section"><header><div><span class="tiny-label">WHO RATED IT</span><h3>Share of the final result.</h3></div><div><b class="positive">3 useful</b><b class="negative">2 not useful</b></div></header><div class="k-rater-list">${raters.map((rater) => `<article><span class="representative-avatar portrait-${rater.portrait}"></span><div><b>${safe(rater.name)}</b><small>${rater.weight}% of the total weight</small></div><strong class="${rater.choice === "Useful" ? "positive" : "negative"}">${safe(rater.choice)}</strong><i class="${rater.choice === "Useful" ? "positive" : "negative"}"><em style="width:${rater.weight}%"></em></i></article>`).join("")}</div></section>` : `<section class="k-project-evidence"><span class="tiny-label">${isProposal ? "THE PROPOSAL" : "THE CONTRIBUTION"}</span>${isProposal && item.quote ? `<blockquote>${safe(item.quote)}</blockquote>` : ""}<h3>${safe(item.source)}</h3><p>${safe(item.detail)}</p><div><span><small>COMMUNITY REVIEW</small><b>${item.change > 0 ? "Accepted" : "Needs a new plan"}</b></span><span><small>YOUR CHANGE</small><b class="${item.change > 0 ? "positive" : "negative"}">${item.change > 0 ? "+" : "−"}${Math.abs(item.change)}</b></span></div></section>`}</div></div>`;
}

function bindHistory(backdrop) {
  backdrop.querySelector("[data-drawer-close]")?.addEventListener("click", closeDrawer);
  backdrop.querySelector("[data-history-back]")?.addEventListener("click", renderHistoryList);
  backdrop.querySelectorAll("[data-history-detail]").forEach((button) => button.addEventListener("click", () => renderHistoryDetail(Number(button.dataset.historyDetail))));
  backdrop.onclick = (event) => { if (event.target === backdrop) historyDepth ? renderHistoryList() : closeDrawer(); };
}

function openHistory() {
  closeDrawer(true); historyDepth = 0;
  const backdrop = ensureBackdrop(); backdrop.innerHTML = historyListMarkup(); bindHistory(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("visible"));
}

function renderHistoryList() {
  const backdrop = ensureBackdrop(); historyDepth = 0; backdrop.innerHTML = historyListMarkup(); bindHistory(backdrop);
}

function renderHistoryDetail(index) {
  const backdrop = ensureBackdrop(); historyDepth = 1; backdrop.innerHTML = historyDetailMarkup(reputationHistory[index], index); bindHistory(backdrop);
}

function supporters(profileId) {
  return socialLinks.filter(([, to]) => to === profileId).map(([from, , useful, notUseful]) => ({ profile: byId(from), useful, notUseful })).sort((a, b) => b.useful - a.useful);
}

function relationColumnsMarkup(profile) {
  const relations = supporters(profile.id);
  const positive = relations;
  const negative = [...relations].sort((a, b) => b.notUseful - a.notUseful);
  const relationList = (items, type) => items.map((item) => `<article>${portrait(item.profile)}<span><b>${safe(item.profile.name)}</b><small>${type === "positive" ? `+${item.useful} useful` : `−${item.notUseful} not useful`}</small></span></article>`).join("");
  return `<section class="k-relation-columns show-3" data-relations-host><div><span class="tiny-label positive">STRONGEST SUPPORT</span>${relationList(positive, "positive")}</div><div><span class="tiny-label negative">MOST CRITICAL</span>${relationList(negative, "negative")}</div>${Math.max(positive.length, negative.length) > 3 ? `<button type="button" data-load-relations data-limit="3">Load 3 more on each side</button>` : ""}</section>`;
}

function profileMarkup(profile) {
  return `<div class="k-rep-modal"><header><button type="button" data-profile-back>←</button><div><span class="tiny-label">TRUST PROFILE</span><h2 data-panel-name>${safe(profile.name)}</h2><p data-panel-role>${safe(profile.role)}</p></div><button type="button" data-drawer-close>×</button></header><div class="k-profile-compact"><span data-profile-avatar>${portrait(profile, "k-profile-avatar")}</span><strong data-profile-score>${profile.score}</strong><span data-profile-level>LEVEL ${profile.level} · ${safe(profile.rank).toUpperCase()}</span><div class="k-profile-bars"><label><span>Comments</span><b data-profile-comments>${profile.comments}%</b><i><em data-profile-comments-bar style="width:${profile.comments}%"></em></i></label><label><span>Proposals</span><b data-profile-proposals>${profile.proposals}%</b><i><em data-profile-proposals-bar style="width:${profile.proposals}%"></em></i></label><label><span>Contributions</span><b data-profile-contributions>${profile.contributions}%</b><i><em data-profile-contributions-bar style="width:${profile.contributions}%"></em></i></label></div></div>${relationColumnsMarkup(profile)}<section class="k-panel-graph"><div class="k-social-graph compact" data-graph="panel"></div></section></div>`;
}

function openProfile(id) {
  closeDrawer(true); panelCenters = [id];
  const backdrop = ensureBackdrop(); renderProfilePanel(id);
  requestAnimationFrame(() => backdrop.classList.add("visible"));
}

function renderProfilePanel(id) {
  const backdrop = ensureBackdrop();
  backdrop.innerHTML = profileMarkup(byId(id));
  bindProfile(backdrop);
}

function bindProfile(backdrop) {
  const id = panelCenters.at(-1); const host = backdrop.querySelector('[data-graph="panel"]');
  graphStates.panel.centerId = id; graphStates.panel.ready = false; mountGraph(host, "panel", id);
  backdrop.querySelector("[data-drawer-close]").addEventListener("click", closeDrawer);
  backdrop.querySelector("[data-profile-back]").disabled = panelCenters.length < 2;
  backdrop.querySelector("[data-profile-back]").addEventListener("click", previousPanelCenter);
  bindRelationLoader(backdrop);
  backdrop.onclick = (event) => { if (event.target === backdrop) panelCenters.length > 1 ? previousPanelCenter() : closeDrawer(); };
}

function bindRelationLoader(backdrop) {
  backdrop.querySelector("[data-load-relations]")?.addEventListener("click", (event) => {
    const button = event.currentTarget;
    const section = button.closest(".k-relation-columns");
    const maximum = Math.max(section.querySelectorAll(":scope > div:first-child article").length, section.querySelectorAll(":scope > div:nth-child(2) article").length);
    const next = Math.min(maximum, Number(button.dataset.limit || 3) + 3);
    button.dataset.limit = String(next);
    section.className = `k-relation-columns show-${next}`;
    if (next >= maximum) button.remove();
    else button.textContent = "Load 3 more on each side";
  });
}

function updateProfilePanel(id) {
  const profile = byId(id); const backdrop = document.querySelector(".k-rep-modal-backdrop");
  if (!backdrop) return;
  backdrop.querySelector("[data-panel-name]").textContent = profile.name;
  backdrop.querySelector("[data-panel-role]").textContent = profile.role;
  backdrop.querySelector("[data-profile-avatar]").innerHTML = portrait(profile, "k-profile-avatar");
  backdrop.querySelector("[data-profile-score]").textContent = profile.score;
  backdrop.querySelector("[data-profile-level]").textContent = `LEVEL ${profile.level} · ${profile.rank.toUpperCase()}`;
  ["comments", "proposals", "contributions"].forEach((key) => {
    backdrop.querySelector(`[data-profile-${key}]`).textContent = `${profile[key]}%`;
    backdrop.querySelector(`[data-profile-${key}-bar]`).style.width = `${profile[key]}%`;
  });
  backdrop.querySelector("[data-relations-host]").outerHTML = relationColumnsMarkup(profile);
  bindRelationLoader(backdrop);
  backdrop.querySelector("[data-profile-back]").disabled = panelCenters.length < 2;
}

function previousPanelCenter() {
  if (panelCenters.length < 2) return;
  panelCenters.pop();
  const id = panelCenters.at(-1);
  const host = document.querySelector('[data-graph="panel"]');
  const state = graphStates.panel;
  state.centerId = id;
  const next = layoutPositions(id).positions;
  animateLayout(host, state, next);
  state.targetX = host.clientWidth / 2 - GRAPH_CENTER_X * state.targetScale;
  state.targetY = host.clientHeight / 2 - GRAPH_CENTER_Y * state.targetScale;
  animateTransform(host, state);
  updateNodePresentation(host, state);
  updateProfilePanel(id);
}

function closeDrawer(immediate = false) {
  const backdrop = document.querySelector(".k-rep-modal-backdrop");
  if (!backdrop) return;
  backdrop.classList.remove("visible");
  if (immediate) backdrop.remove(); else window.setTimeout(() => backdrop.remove(), 180);
  historyDepth = 0; panelCenters = [];
}

function queuePatch() {
  if (patchQueued) return;
  patchQueued = true;
  requestAnimationFrame(() => { patchQueued = false; patchNavigation(); });
}

document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeDrawer(); });
window.addEventListener("popstate", () => location.pathname === "/reputation" ? activateReputation() : deactivateReputation());
new MutationObserver(queuePatch).observe(document.documentElement, { childList: true, subtree: true });
patchNavigation(); ensureRoot();
if (location.pathname === "/reputation") activateReputation();
