import { secp256k1 } from "@noble/curves/secp256k1.js";
import { bech32 } from "@scure/base";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  formatEther,
  http,
  keccak256,
  parseEther,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const GAS_PRICE = 1_000_000_000n;
const COSMOS_FEE = 1_000_000_000_000_000n;
const COSMOS_GAS = 1_000_000n;
const METADATA_LIMIT = 8 * 1024;
const CONTENT_LIMIT = 8 * 1024;
const encoder = new TextEncoder();

const discussionAbi = [
  { type: "function", name: "post", stateMutability: "nonpayable", inputs: [{ name: "proposalId", type: "uint64" }, { name: "parentId", type: "uint64" }, { name: "content", type: "bytes" }], outputs: [{ name: "messageId", type: "uint64" }] },
  { type: "function", name: "react", stateMutability: "nonpayable", inputs: [{ name: "proposalId", type: "uint64" }, { name: "messageId", type: "uint64" }, { name: "reaction", type: "uint8" }], outputs: [{ name: "success", type: "bool" }] },
  { type: "function", name: "zap", stateMutability: "nonpayable", inputs: [{ name: "proposalId", type: "uint64" }, { name: "messageId", type: "uint64" }, { name: "amount", type: "uint256" }], outputs: [{ name: "success", type: "bool" }] },
  { type: "function", name: "authorizeSession", stateMutability: "nonpayable", inputs: [{ name: "session", type: "address" }, { name: "expiresAt", type: "uint64" }, { name: "fundAmount", type: "uint256" }], outputs: [{ name: "success", type: "bool" }] },
  { type: "function", name: "revokeSession", stateMutability: "nonpayable", inputs: [{ name: "session", type: "address" }], outputs: [{ name: "success", type: "bool" }] },
];

const govAbi = [
  { type: "event", name: "SubmitProposal", inputs: [{ indexed: true, name: "proposer", type: "address" }, { indexed: false, name: "proposalId", type: "uint64" }] },
  { type: "function", name: "submitProposal", stateMutability: "nonpayable", inputs: [{ name: "proposer", type: "address" }, { name: "jsonProposal", type: "bytes" }, { name: "deposit", type: "tuple[]", components: [{ name: "denom", type: "string" }, { name: "amount", type: "uint256" }] }], outputs: [{ name: "proposalId", type: "uint64" }] },
  { type: "function", name: "vote", stateMutability: "nonpayable", inputs: [{ name: "voter", type: "address" }, { name: "proposalId", type: "uint64" }, { name: "option", type: "uint8" }, { name: "metadata", type: "string" }], outputs: [{ name: "success", type: "bool" }] },
];

const swapAbi = [
  { type: "function", name: "swapExactKUDForUSDC", stateMutability: "payable", inputs: [{ name: "minimumOut", type: "uint256" }], outputs: [{ name: "amountOut", type: "uint256" }] },
];

const tokenAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
];

function bytesFromHex(value) {
  const clean = value.replace(/^0x/, "");
  if (clean.length % 2) throw new Error("Invalid hexadecimal value");
  return Uint8Array.from(clean.match(/.{2}/g)?.map((part) => Number.parseInt(part, 16)) || []);
}

function hexFromBytes(value) {
  return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function bytesFromBase64(value) {
  const raw = atob(value);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function base64FromBytes(value) {
  let raw = "";
  for (const byte of value) raw += String.fromCharCode(byte);
  return btoa(raw);
}

function concat(...values) {
  const size = values.reduce((total, value) => total + value.length, 0);
  const result = new Uint8Array(size);
  let offset = 0;
  for (const value of values) {
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

class Proto {
  constructor() {
    this.parts = [];
  }

  raw(value) {
    this.parts.push(value);
    return this;
  }

  varint(value) {
    let remaining = BigInt(value);
    if (remaining < 0n) throw new Error("Negative protobuf integer");
    const result = [];
    while (remaining > 127n) {
      result.push(Number(remaining & 127n) | 128);
      remaining >>= 7n;
    }
    result.push(Number(remaining));
    return this.raw(Uint8Array.from(result));
  }

  uint(field, value) {
    if (BigInt(value) === 0n) return this;
    return this.varint((field << 3) | 0).varint(value);
  }

  bool(field, value) {
    return value ? this.uint(field, 1) : this;
  }

  bytes(field, value) {
    if (!value?.length) return this;
    return this.varint((field << 3) | 2).varint(value.length).raw(value);
  }

  string(field, value) {
    return value ? this.bytes(field, encoder.encode(value)) : this;
  }

  message(field, value) {
    return this.bytes(field, value);
  }

  finish() {
    return concat(...this.parts);
  }
}

const encodeAny = (typeUrl, value) => new Proto().string(1, typeUrl).bytes(2, value).finish();
const encodeCoin = (amount) => new Proto().string(1, "akud").string(2, String(amount)).finish();
const encodePubKey = (key) => new Proto().bytes(1, key).finish();

function encodeMsgSend(from, to, amount) {
  return new Proto().string(1, from).string(2, to).message(3, encodeCoin(amount)).finish();
}

function encodeMsgVote(voter, proposalId, option) {
  return new Proto().uint(1, proposalId).string(2, voter).uint(3, option).finish();
}

function encodeUpdateDiscussionParams(authority, postFee) {
  const params = new Proto().message(1, encodeCoin(postFee)).finish();
  return new Proto().string(1, authority).message(2, params).finish();
}

function encodeMsgSubmitProposal({ proposer, title, summary, metadata, postFee, authority }) {
  const update = encodeAny(
    "/kudora.discussion.v1.MsgUpdateParams",
    encodeUpdateDiscussionParams(authority, postFee),
  );
  return new Proto()
    .message(1, update)
    .message(2, encodeCoin(parseEther("1")))
    .string(3, proposer)
    .string(4, metadata)
    .string(5, title)
    .string(6, summary)
    .finish();
}

function encodeDiscussion(type, data) {
  const writer = new Proto().string(1, data.creator);
  if (type === "post") return writer.uint(2, data.proposalId).uint(3, data.parentId).bytes(4, data.content).finish();
  if (type === "react") return writer.uint(2, data.proposalId).uint(3, data.messageId).uint(4, data.reaction).finish();
  if (type === "zap") return writer.uint(2, data.proposalId).uint(3, data.messageId).string(4, data.amount).finish();
  if (type === "authorize") return writer.string(2, data.sessionAddress).uint(3, data.expiresAt).string(4, data.fundAmount).finish();
  if (type === "revoke") return writer.string(2, data.sessionAddress).finish();
  throw new Error(`Unknown discussion message ${type}`);
}

function encodeTxBody(messages, memo = "") {
  const writer = new Proto();
  for (const message of messages) writer.message(1, encodeAny(message.typeUrl, message.value));
  return writer.string(2, memo).finish();
}

function encodeAuthInfo(publicKey, sequence, feeAmount = COSMOS_FEE, gas = COSMOS_GAS) {
  const key = encodeAny("/cosmos.evm.crypto.v1.ethsecp256k1.PubKey", encodePubKey(publicKey));
  const modeInfo = new Proto().message(1, new Proto().uint(1, 1).finish()).finish();
  const signer = new Proto().message(1, key).message(2, modeInfo).uint(3, sequence).finish();
  const fee = new Proto().message(1, encodeCoin(feeAmount)).uint(2, gas).finish();
  return new Proto().message(1, signer).message(2, fee).finish();
}

function encodeSignDoc(bodyBytes, authInfoBytes, chainId, accountNumber) {
  return new Proto().bytes(1, bodyBytes).bytes(2, authInfoBytes).string(3, chainId).uint(4, accountNumber).finish();
}

function encodeTxRaw(bodyBytes, authInfoBytes, signature) {
  return new Proto().bytes(1, bodyBytes).bytes(2, authInfoBytes).bytes(3, signature).finish();
}

function findScalar(value, name) {
  if (!value || typeof value !== "object") return undefined;
  if (typeof value[name] === "string" || typeof value[name] === "number") return value[name];
  for (const nested of Object.values(value)) {
    const found = findScalar(nested, name);
    if (found !== undefined) return found;
  }
  return undefined;
}

function runtimeUrl(raw) {
  const url = new URL(raw);
  if (["localhost", "127.0.0.1"].includes(url.hostname) && !["localhost", "127.0.0.1"].includes(location.hostname)) {
    url.hostname = location.hostname;
  }
  return url.toString().replace(/\/$/, "");
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || body.error || `${response.status} ${response.statusText}`);
  return body;
}

function cosmosFromEvm(address, prefix = "kudo") {
  return bech32.encode(prefix, bech32.toWords(bytesFromHex(address)), false);
}

function evmFromCosmos(address) {
  return hexFromBytes(Uint8Array.from(bech32.fromWords(bech32.decode(address, false).words)));
}

function contentBytes(content) {
  const canonical = typeof content === "string" ? { v: 1, t: "text", text: content.trim() } : content;
  if (!canonical || canonical.v !== 1 || !canonical.t) throw new Error("Discussion payload must have version 1 and a type");
  if (canonical.t === "text" && !canonical.text?.trim()) throw new Error("Message content is required");
  const payload = encoder.encode(JSON.stringify(canonical));
  if (payload.length > CONTENT_LIMIT) throw new Error("Message exceeds the 8 KiB chain limit");
  return payload;
}

function metadataJson({ title, summary, context, changes, outcome }) {
  // Cosmos SDK 0.54 requires these two fields whenever metadata is a JSON object.
  const metadata = JSON.stringify({
    title: title.trim(),
    summary: summary.trim(),
    v: 1,
    context: context.trim(),
    changes: [changes.trim()],
    outcome: outcome.trim(),
  });
  if (encoder.encode(metadata).length > METADATA_LIMIT) throw new Error("Proposal metadata exceeds the 8 KiB chain limit");
  return metadata;
}

export class KudoraChain {
  constructor(config) {
    this.config = config;
    this.config.cosmosRestUrl = runtimeUrl(config.cosmosRestUrl);
    this.config.cosmosRpcUrl = runtimeUrl(config.cosmosRpcUrl);
    this.config.evmRpcUrl = runtimeUrl(config.evmRpcUrl);
    this.config.evmWsUrl = runtimeUrl(config.evmWsUrl);
    this.chain = {
      id: Number(config.evmChainId),
      name: "Kudora localnet",
      nativeCurrency: { name: "KUD", symbol: "KUD", decimals: 18 },
      rpcUrls: { default: { http: [this.config.evmRpcUrl] } },
    };
    this.publicClient = createPublicClient({ chain: this.chain, transport: http(this.config.evmRpcUrl) });
    this.walletMode = null;
    this.accountName = "alice";
    this.localWallets = null;
    this.evmAccount = null;
    this.cosmosAddress = null;
  }

  static async load() {
    const config = await fetchJson("/kudora-local-config.json");
    return new KudoraChain(config);
  }

  isLocal() {
    return this.walletMode?.startsWith("local-");
  }

  isKeplr() {
    return this.walletMode?.includes("keplr");
  }

  async loadLocalWallets() {
    if (!this.localWallets) this.localWallets = await fetchJson(this.config.localWalletsUrl);
    if (!this.localWallets.localDevelopmentOnly) throw new Error("Refusing non-development local wallet data");
  }

  async connect(mode, accountName = this.accountName) {
    this.walletMode = mode;
    this.accountName = accountName;
    if (mode.startsWith("local-")) {
      await this.loadLocalWallets();
      const privateKey = this.localWallets.accounts[accountName]?.privateKey;
      if (!privateKey) throw new Error(`Unknown local account ${accountName}`);
      this.evmAccount = privateKeyToAccount(privateKey);
      this.cosmosAddress = this.config.accounts[accountName].cosmosAddress;
    } else if (mode === "metamask") {
      if (!window.ethereum) throw new Error("MetaMask is not installed");
      await this.ensureEvmChain(window.ethereum);
      const addresses = await window.ethereum.request({ method: "eth_requestAccounts" });
      this.evmAccount = { address: addresses[0] };
      this.cosmosAddress = cosmosFromEvm(addresses[0]);
    } else if (mode === "keplr") {
      if (!window.keplr) throw new Error("Keplr is not installed");
      await this.suggestKeplrChain();
      await window.keplr.enable(this.config.cosmosChainId);
      const key = await window.keplr.getKey(this.config.cosmosChainId);
      this.cosmosAddress = key.bech32Address;
      this.evmAccount = { address: evmFromCosmos(key.bech32Address) };
    } else {
      throw new Error(`Unknown wallet mode ${mode}`);
    }
    return this.account();
  }

  account() {
    if (!this.evmAccount || !this.cosmosAddress) throw new Error("Connect a wallet first");
    return {
      name: this.isLocal() ? this.accountName : this.walletMode,
      mode: this.walletMode,
      evmAddress: this.evmAccount.address,
      cosmosAddress: this.cosmosAddress,
    };
  }

  async ensureEvmChain(provider) {
    const chainId = `0x${Number(this.config.evmChainId).toString(16)}`;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
    } catch (error) {
      if (error.code !== 4902) throw error;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId,
          chainName: "Kudora",
          nativeCurrency: { name: "KUD", symbol: "KUD", decimals: 18 },
          rpcUrls: [this.config.evmRpcUrl],
        }],
      });
    }
  }

  async suggestKeplrChain() {
    await window.keplr.experimentalSuggestChain({
      chainId: this.config.cosmosChainId,
      chainName: "Kudora",
      rpc: this.config.cosmosRpcUrl,
      rest: this.config.cosmosRestUrl,
      bip44: { coinType: 60 },
      bech32Config: {
        bech32PrefixAccAddr: "kudo", bech32PrefixAccPub: "kudopub",
        bech32PrefixValAddr: "kudovaloper", bech32PrefixValPub: "kudovaloperpub",
        bech32PrefixConsAddr: "kudovalcons", bech32PrefixConsPub: "kudovalconspub",
      },
      currencies: [{ coinDenom: "KUD", coinMinimalDenom: "akud", coinDecimals: 18 }],
      feeCurrencies: [{ coinDenom: "KUD", coinMinimalDenom: "akud", coinDecimals: 18, gasPriceStep: { low: 0.0000000001, average: 0.000000001, high: 0.000000002 } }],
      stakeCurrency: { coinDenom: "KUD", coinMinimalDenom: "akud", coinDecimals: 18 },
      features: ["eth-address-gen", "eth-key-sign"],
    });
  }

  async evmWallet(accountOverride) {
    if (accountOverride) return createWalletClient({ account: accountOverride, chain: this.chain, transport: http(this.config.evmRpcUrl) });
    if (this.isLocal()) return createWalletClient({ account: this.evmAccount, chain: this.chain, transport: http(this.config.evmRpcUrl) });
    if (this.walletMode === "metamask") return createWalletClient({ account: this.evmAccount.address, chain: this.chain, transport: custom(window.ethereum) });
    if (this.walletMode === "keplr") {
      const provider = window.keplr.ethereum || await window.keplr.getEthereumProvider?.();
      if (!provider?.request) throw new Error("This Keplr version does not expose its official EVM provider");
      await this.ensureEvmChain(provider);
      return createWalletClient({ account: this.evmAccount.address, chain: this.chain, transport: custom(provider) });
    }
    throw new Error("Connect a wallet first");
  }

  async balances() {
    const account = this.account();
    const [evm, bank, mockUsdc] = await Promise.all([
      this.publicClient.getBalance({ address: account.evmAddress }),
      fetchJson(`${this.config.cosmosRestUrl}/cosmos/bank/v1beta1/balances/${account.cosmosAddress}/by_denom?denom=akud`).catch(() => ({ balance: { amount: "0" } })),
      this.publicClient.readContract({ address: this.config.swap.mockUsdcAddress, abi: tokenAbi, functionName: "balanceOf", args: [account.evmAddress] }),
    ]);
    const bankAmount = BigInt(bank.balance?.amount || 0);
    if (evm !== bankAmount) throw new Error("Cosmos and EVM returned different native balances");
    return { akud: evm, kud: formatEther(evm), mockUsdc };
  }

  async cosmosAccount() {
    const response = await fetchJson(`${this.config.cosmosRestUrl}/cosmos/auth/v1beta1/accounts/${this.cosmosAddress}`);
    return { accountNumber: BigInt(findScalar(response.account, "account_number") || 0), sequence: BigInt(findScalar(response.account, "sequence") || 0) };
  }

  async broadcastCosmos(messages, memo = "Kudora") {
    const { accountNumber, sequence } = await this.cosmosAccount();
    const bodyBytes = encodeTxBody(messages, memo);
    let authInfoBytes;
    let signature;
    let signedBody = bodyBytes;
    if (this.isLocal()) {
      const privateKey = bytesFromHex(this.localWallets.accounts[this.accountName].privateKey);
      const publicKey = secp256k1.getPublicKey(privateKey, true);
      authInfoBytes = encodeAuthInfo(publicKey, sequence);
      const signDoc = encodeSignDoc(bodyBytes, authInfoBytes, this.config.cosmosChainId, accountNumber);
      signature = secp256k1.sign(bytesFromHex(keccak256(hexFromBytes(signDoc))), privateKey, { prehash: false, lowS: true, format: "compact" });
    } else {
      const key = await window.keplr.getKey(this.config.cosmosChainId);
      authInfoBytes = encodeAuthInfo(key.pubKey, sequence);
      const result = await window.keplr.signDirect(
        this.config.cosmosChainId,
        this.cosmosAddress,
        { bodyBytes, authInfoBytes, chainId: this.config.cosmosChainId, accountNumber },
        {},
      );
      signedBody = result.signed.bodyBytes;
      authInfoBytes = result.signed.authInfoBytes;
      signature = bytesFromBase64(result.signature.signature);
    }
    const txBytes = encodeTxRaw(signedBody, authInfoBytes, signature);
    const broadcast = await fetchJson(`${this.config.cosmosRestUrl}/cosmos/tx/v1beta1/txs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tx_bytes: base64FromBytes(txBytes), mode: "BROADCAST_MODE_SYNC" }),
    });
    const hash = broadcast.tx_response?.txhash;
    if (!hash || Number(broadcast.tx_response.code || 0) !== 0) throw new Error(broadcast.tx_response?.raw_log || "Cosmos transaction broadcast failed");
    return this.waitCosmosTx(hash);
  }

  async waitCosmosTx(hash) {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await fetch(`${this.config.cosmosRestUrl}/cosmos/tx/v1beta1/txs/${hash}`);
      if (response.ok) {
        const body = await response.json();
        if (Number(body.tx_response?.code || 0) !== 0) throw new Error(body.tx_response.raw_log || "Cosmos transaction failed");
        return { hash, receipt: body.tx_response, path: "cosmos" };
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Transaction ${hash} was not confirmed`);
  }

  async writeEvm({ address, abi, functionName, args = [], value = 0n, account }) {
    const wallet = await this.evmWallet(account);
    const hash = await wallet.writeContract({ address, abi, functionName, args, value, gas: 2_000_000n, gasPrice: GAS_PRICE });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") throw new Error(`EVM transaction ${hash} reverted`);
    return { hash, receipt, path: "evm" };
  }

  async sendKud(recipient, amount) {
    const value = parseEther(String(amount));
    if (value <= 0n) throw new Error("Amount must be positive");
    if (this.isKeplr()) {
      const target = recipient.startsWith("0x") ? cosmosFromEvm(recipient) : recipient;
      return this.broadcastCosmos([{ typeUrl: "/cosmos.bank.v1beta1.MsgSend", value: encodeMsgSend(this.cosmosAddress, target, value) }], "Kudora KUD transfer");
    }
    const target = recipient.startsWith("kudo1") ? evmFromCosmos(recipient) : recipient;
    const wallet = await this.evmWallet();
    const hash = await wallet.sendTransaction({ to: target, value, gas: 21_000n, gasPrice: GAS_PRICE });
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") throw new Error(`EVM transaction ${hash} reverted`);
    return { hash, receipt, path: "evm" };
  }

  proposalPayload({ title, summary, context, changes, outcome }) {
    if (!title.trim() || !summary.trim()) throw new Error("Title and summary are required");
    const metadata = metadataJson({ title, summary, context, changes, outcome });
    const updateMessage = {
      "@type": "/kudora.discussion.v1.MsgUpdateParams",
      authority: this.config.governanceAuthority,
      params: { post_fee: { denom: "akud", amount: "1000000000000000" } },
    };
    return {
      title: title.trim(), summary: summary.trim(), metadata,
      json: JSON.stringify({ messages: [updateMessage], metadata, title: title.trim(), summary: summary.trim(), expedited: false }),
    };
  }

  async submitProposal(fields) {
    const proposal = this.proposalPayload(fields);
    if (this.isKeplr()) {
      const value = encodeMsgSubmitProposal({
        proposer: this.cosmosAddress,
        ...proposal,
        postFee: 1_000_000_000_000_000n,
        authority: this.config.governanceAuthority,
      });
      const tx = await this.broadcastCosmos([{ typeUrl: "/cosmos.gov.v1.MsgSubmitProposal", value }], "Kudora proposal");
      const proposals = await this.proposals();
      return { ...tx, proposalId: proposals.at(-1)?.id };
    }
    const tx = await this.writeEvm({
      address: this.config.governancePrecompileAddress,
      abi: govAbi,
      functionName: "submitProposal",
      args: [this.evmAccount.address, stringToHex(proposal.json), [{ denom: "akud", amount: parseEther("1") }]],
    });
    for (const log of tx.receipt.logs) {
      try {
        const decoded = decodeEventLog({ abi: govAbi, data: log.data, topics: log.topics });
        if (decoded.eventName === "SubmitProposal") tx.proposalId = String(decoded.args.proposalId);
      } catch { /* not this event */ }
    }
    return tx;
  }

  async vote(proposalId, option) {
    if (this.isKeplr()) {
      return this.broadcastCosmos([{ typeUrl: "/cosmos.gov.v1.MsgVote", value: encodeMsgVote(this.cosmosAddress, proposalId, option) }], "Kudora governance vote");
    }
    return this.writeEvm({ address: this.config.governancePrecompileAddress, abi: govAbi, functionName: "vote", args: [this.evmAccount.address, BigInt(proposalId), Number(option), ""] });
  }

  async proposals() {
    const body = await fetchJson(`${this.config.cosmosRestUrl}/cosmos/gov/v1/proposals?pagination.limit=100&pagination.reverse=true`);
    const proposals = (body.proposals || []).map((proposal) => ({ ...proposal, id: String(proposal.id || proposal.proposal_id) }));
    return Promise.all(proposals.map(async (proposal) => {
      const response = await fetchJson(`${this.config.cosmosRestUrl}/cosmos/gov/v1/proposals/${proposal.id}/tally`).catch(() => ({}));
      return { ...proposal, tally: response.tally || proposal.final_tally_result };
    }));
  }

  async voteRecord(proposalId, cosmosAddress = this.cosmosAddress) {
    const body = await fetchJson(`${this.config.cosmosRestUrl}/cosmos/gov/v1/proposals/${proposalId}/votes?pagination.limit=100`);
    const vote = (body.votes || []).find((entry) => entry.voter === cosmosAddress);
    if (!vote) throw new Error("No vote recorded for this account");
    return { vote };
  }

  discussionMessage(type, fields) {
    const typeUrl = {
      post: "/kudora.discussion.v1.MsgPost",
      react: "/kudora.discussion.v1.MsgReact",
      zap: "/kudora.discussion.v1.MsgZap",
      authorize: "/kudora.discussion.v1.MsgAuthorizeSession",
      revoke: "/kudora.discussion.v1.MsgRevokeSession",
    }[type];
    return { typeUrl, value: encodeDiscussion(type, { creator: this.cosmosAddress, ...fields }) };
  }

  async post(text, proposalId = 0, parentId = 0, quick = false) {
    return this.postPayload({ v: 1, t: "text", text: text.trim() }, proposalId, parentId, quick);
  }

  async postPayload(payload, proposalId = 0, parentId = 0, quick = false) {
    const content = contentBytes(payload);
    if (quick) {
      const session = await this.sessionAccount();
      return this.writeEvm({ account: session, address: this.config.discussionPrecompileAddress, abi: discussionAbi, functionName: "post", args: [BigInt(proposalId), BigInt(parentId), hexFromBytes(content)] });
    }
    if (this.isKeplr()) return this.broadcastCosmos([this.discussionMessage("post", { proposalId, parentId, content })], "Kudora discussion");
    return this.writeEvm({ address: this.config.discussionPrecompileAddress, abi: discussionAbi, functionName: "post", args: [BigInt(proposalId), BigInt(parentId), hexFromBytes(content)] });
  }

  async react(proposalId, messageId, reaction, quick = false) {
    if (quick) {
      const session = await this.sessionAccount();
      return this.writeEvm({ account: session, address: this.config.discussionPrecompileAddress, abi: discussionAbi, functionName: "react", args: [BigInt(proposalId), BigInt(messageId), Number(reaction)] });
    }
    if (this.isKeplr()) return this.broadcastCosmos([this.discussionMessage("react", { proposalId, messageId, reaction })], "Kudora reaction");
    return this.writeEvm({ address: this.config.discussionPrecompileAddress, abi: discussionAbi, functionName: "react", args: [BigInt(proposalId), BigInt(messageId), Number(reaction)] });
  }

  async zap(proposalId, messageId, amount) {
    const value = parseEther(String(amount));
    if (this.isKeplr()) return this.broadcastCosmos([this.discussionMessage("zap", { proposalId, messageId, amount: value.toString() })], "Kudora Zap");
    return this.writeEvm({ address: this.config.discussionPrecompileAddress, abi: discussionAbi, functionName: "zap", args: [BigInt(proposalId), BigInt(messageId), value] });
  }

  async messages(proposalId = 0) {
    const body = await fetchJson(`${this.config.cosmosRestUrl}/kudora/discussion/v1/messages/${proposalId}?pagination.limit=100`);
    return (body.messages || []).map((message) => ({
      ...message,
      proposalId: String(proposalId),
      messageId: String(message.message_id),
      parentId: String(message.parent_id || 0),
      evmAuthor: hexFromBytes(bytesFromBase64(message.author)),
      cosmosAuthor: bech32.encode("kudo", bech32.toWords(bytesFromBase64(message.author)), false),
      parsed: JSON.parse(new TextDecoder().decode(bytesFromBase64(message.content))),
    }));
  }

  async reactions(proposalId, messageId) {
    const body = await fetchJson(`${this.config.cosmosRestUrl}/kudora/discussion/v1/reactions/${proposalId}/${messageId}?pagination.limit=100`);
    return body.reactions || [];
  }

  generateSession() {
    let key;
    do {
      key = crypto.getRandomValues(new Uint8Array(32));
    } while (!secp256k1.utils.isValidSecretKey(key));
    const privateKey = hexFromBytes(key);
    sessionStorage.setItem("kudora-session-key", privateKey);
    return privateKeyToAccount(privateKey);
  }

  async sessionAccount() {
    const privateKey = sessionStorage.getItem("kudora-session-key");
    if (!privateKey) throw new Error("Enable Quick interactions first");
    return privateKeyToAccount(privateKey);
  }

  async authorizeSession(fundAmount = "0.05", durationSeconds = 3600) {
    const session = sessionStorage.getItem("kudora-session-key") ? await this.sessionAccount() : this.generateSession();
    const expiresAt = BigInt(Math.floor(Date.now() / 1000) + durationSeconds);
    const amount = parseEther(String(fundAmount));
    let tx;
    if (this.isKeplr()) {
      tx = await this.broadcastCosmos([this.discussionMessage("authorize", { sessionAddress: session.address, expiresAt, fundAmount: amount.toString() })], "Authorize Kudora quick interactions");
    } else {
      tx = await this.writeEvm({ address: this.config.discussionPrecompileAddress, abi: discussionAbi, functionName: "authorizeSession", args: [session.address, expiresAt, amount] });
    }
    return { ...tx, sessionAddress: session.address, expiresAt: String(expiresAt) };
  }

  async session() {
    const session = await this.sessionAccount();
    return fetchJson(`${this.config.cosmosRestUrl}/kudora/discussion/v1/sessions/${session.address}`);
  }

  async revokeSession() {
    const session = await this.sessionAccount();
    let tx;
    if (this.isKeplr()) tx = await this.broadcastCosmos([this.discussionMessage("revoke", { sessionAddress: session.address })], "Revoke Kudora quick interactions");
    else tx = await this.writeEvm({ address: this.config.discussionPrecompileAddress, abi: discussionAbi, functionName: "revokeSession", args: [session.address] });
    sessionStorage.removeItem("kudora-session-key");
    return tx;
  }

  async swap(amount) {
    const value = parseEther(String(amount));
    if (value <= 0n) throw new Error("Amount must be positive");
    return this.writeEvm({ address: this.config.swap.routerAddress, abi: swapAbi, functionName: "swapExactKUDForUSDC", args: [0n], value });
  }
}

export { cosmosFromEvm, evmFromCosmos, formatEther, parseEther };
