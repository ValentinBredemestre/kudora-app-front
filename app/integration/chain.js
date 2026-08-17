import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bech32 } from "@scure/base";
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  formatEther,
  getAddress,
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

const stakingAbi = [
  { type: "function", name: "delegate", stateMutability: "nonpayable", inputs: [{ name: "delegatorAddress", type: "address" }, { name: "validatorAddress", type: "string" }, { name: "amount", type: "uint256" }], outputs: [{ name: "success", type: "bool" }] },
  { type: "function", name: "undelegate", stateMutability: "nonpayable", inputs: [{ name: "delegatorAddress", type: "address" }, { name: "validatorAddress", type: "string" }, { name: "amount", type: "uint256" }], outputs: [{ name: "completionTime", type: "int64" }] },
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

function encodeMsgDelegate(delegator, validator, amount) {
  return new Proto().string(1, delegator).string(2, validator).message(3, encodeCoin(amount)).finish();
}

function encodeMsgUndelegate(delegator, validator, amount) {
  return new Proto().string(1, delegator).string(2, validator).message(3, encodeCoin(amount)).finish();
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

function validatorConsensusAddress(publicKey) {
  return bech32.encode("kudovalcons", bech32.toWords(sha256(bytesFromBase64(publicKey.key)).slice(0, 20)), false);
}

function validatorAccountAddress(operatorAddress) {
  return bech32.encode("kudo", bech32.decode(operatorAddress, false).words, false);
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
  const roadmap = changes.split(/\r?\n/)
    .map((step) => step.replace(/^\s*(?:\d+[.)]|[-*])\s*/, "").trim())
    .filter(Boolean);
  const metadata = JSON.stringify({
    title: title.trim(),
    summary: summary.trim(),
    v: 1,
    context: context.trim(),
    changes: roadmap.length ? roadmap : [changes.trim()],
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
    this.ethereumProvider = null;
    this.ethereumProviders = new Map();
    this.cosmosAddress = null;
    this.connecting = null;
    this.blockTimeCache = new Map();
    window.addEventListener("eip6963:announceProvider", (event) => {
      const detail = event.detail;
      if (detail?.info?.uuid && detail.provider?.request) {
        this.ethereumProviders.set(detail.info.uuid, detail);
      }
    });
    this.requestEthereumProviders();
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
    if (this.connecting) return this.connecting;
    this.connecting = this.connectNow(mode, accountName);
    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async connectNow(mode, accountName) {
    this.walletMode = mode;
    this.accountName = accountName;
    if (mode.startsWith("local-")) {
      await this.loadLocalWallets();
      const privateKey = this.localWallets.accounts[accountName]?.privateKey;
      if (!privateKey) throw new Error(`Unknown local account ${accountName}`);
      this.evmAccount = privateKeyToAccount(privateKey);
      this.cosmosAddress = this.config.accounts[accountName].cosmosAddress;
    } else if (mode === "metamask") {
      const provider = await this.metaMaskProvider();
      // Request access immediately. Asking for passive accounts first can move
      // the real prompt outside the user's click and some wallets then ignore it.
      const addresses = await provider.request({ method: "eth_requestAccounts" });
      await this.ensureEvmChain(provider);
      this.ethereumProvider = provider;
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

  requestEthereumProviders() {
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }

  currentMetaMaskProvider() {
    const announced = [...this.ethereumProviders.values()].find(({ info }) => (
      info.rdns === "io.metamask" || /^metamask$/i.test(info.name)
    ));
    if (announced) return announced.provider;

    const injected = Array.isArray(window.ethereum?.providers)
      ? window.ethereum.providers
      : [window.ethereum].filter(Boolean);
    return injected.find((provider) => provider.isMetaMask && !provider.isBraveWallet) || null;
  }

  async metaMaskProvider() {
    let provider = this.currentMetaMaskProvider();
    if (provider) return provider;

    this.requestEthereumProviders();
    for (let attempt = 0; attempt < 10 && !provider; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      provider = this.currentMetaMaskProvider();
    }
    if (!provider) throw new Error("MetaMask is not installed or is not available on this site");
    return provider;
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
          iconUrls: [new URL("/kudora-token.png", location.origin).href],
        }],
      });
    }
  }

  async suggestKeplrChain() {
    const coinImageUrl = new URL("/kudora-token.png", location.origin).href;
    await window.keplr.experimentalSuggestChain({
      chainId: this.config.cosmosChainId,
      chainName: "Kudora",
      chainSymbolImageUrl: coinImageUrl,
      rpc: this.config.cosmosRpcUrl,
      rest: this.config.cosmosRestUrl,
      bip44: { coinType: 60 },
      bech32Config: {
        bech32PrefixAccAddr: "kudo", bech32PrefixAccPub: "kudopub",
        bech32PrefixValAddr: "kudovaloper", bech32PrefixValPub: "kudovaloperpub",
        bech32PrefixConsAddr: "kudovalcons", bech32PrefixConsPub: "kudovalconspub",
      },
      currencies: [{ coinDenom: "KUD", coinMinimalDenom: "akud", coinDecimals: 18, coinImageUrl }],
      feeCurrencies: [{ coinDenom: "KUD", coinMinimalDenom: "akud", coinDecimals: 18, coinImageUrl, gasPriceStep: { low: 0.0000000001, average: 0.000000001, high: 0.000000002 } }],
      stakeCurrency: { coinDenom: "KUD", coinMinimalDenom: "akud", coinDecimals: 18, coinImageUrl },
      features: ["eth-address-gen", "eth-key-sign"],
    });
  }

  evmWalletNow(accountOverride) {
    if (accountOverride) return createWalletClient({ account: accountOverride, chain: this.chain, transport: http(this.config.evmRpcUrl) });
    if (this.isLocal()) return createWalletClient({ account: this.evmAccount, chain: this.chain, transport: http(this.config.evmRpcUrl) });
    if (this.walletMode === "metamask") return createWalletClient({ account: this.evmAccount.address, chain: this.chain, transport: custom(this.ethereumProvider) });
    return null;
  }

  async evmWallet(accountOverride) {
    const wallet = this.evmWalletNow(accountOverride);
    if (wallet) return wallet;
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

  async rpc(method, params = {}) {
    const url = new URL(`${this.config.cosmosRpcUrl}/${method}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, JSON.stringify(value)));
    const body = await fetchJson(url);
    if (body.error) throw new Error(body.error.message || `RPC ${method} failed`);
    return body.result;
  }

  async blockTime(height) {
    const key = String(height);
    if (!this.blockTimeCache.has(key)) {
      this.blockTimeCache.set(key, this.rpc("block", { height: key })
        .then((result) => result.block?.header?.time || "")
        .catch(() => ""));
    }
    return this.blockTimeCache.get(key);
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
    const immediateWallet = this.evmWalletNow(account);
    const wallet = immediateWallet || await this.evmWallet(account);
    const hashRequest = wallet.writeContract({ address, abi, functionName, args, value, gas: 2_000_000n, gasPrice: GAS_PRICE });
    const hash = await hashRequest;
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
    const immediateWallet = this.evmWalletNow();
    const wallet = immediateWallet || await this.evmWallet();
    const hashRequest = wallet.sendTransaction({ to: target, value, gas: 21_000n, gasPrice: GAS_PRICE });
    const hash = await hashRequest;
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
      return { ...tx, proposalId: proposals.at(0)?.id };
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
    const [body, pool] = await Promise.all([
      fetchJson(`${this.config.cosmosRestUrl}/cosmos/gov/v1/proposals?pagination.limit=100&pagination.reverse=true`),
      fetchJson(`${this.config.cosmosRestUrl}/cosmos/staking/v1beta1/pool`).catch(() => ({ pool: {} })),
    ]);
    const proposals = (body.proposals || []).map((proposal) => ({ ...proposal, id: String(proposal.id || proposal.proposal_id) }));
    return Promise.all(proposals.map(async (proposal) => {
      const [response, voteResponse] = await Promise.all([
        fetchJson(`${this.config.cosmosRestUrl}/cosmos/gov/v1/proposals/${proposal.id}/tally`).catch(() => ({})),
        fetchJson(`${this.config.cosmosRestUrl}/cosmos/gov/v1/proposals/${proposal.id}/votes?pagination.limit=100`).catch(() => ({ votes: [] })),
      ]);
      const tally = response.tally || proposal.final_tally_result || {};
      const votingPower = ["yes_count", "no_count", "abstain_count", "no_with_veto_count"]
        .reduce((sum, key) => sum + BigInt(tally[key] || 0), 0n);
      const bonded = BigInt(pool.pool?.bonded_tokens || 0);
      return {
        ...proposal,
        tally,
        votes: voteResponse.votes || [],
        participantCount: (voteResponse.votes || []).length,
        participationPercent: bonded ? Number((votingPower * 10_000n) / bonded) / 100 : 0,
      };
    }));
  }

  async validators() {
    const requests = [
      fetchJson(`${this.config.cosmosRestUrl}/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=100`),
      fetchJson(`${this.config.cosmosRestUrl}/cosmos/staking/v1beta1/pool`),
      fetchJson(`${this.config.cosmosRestUrl}/cosmos/slashing/v1beta1/signing_infos?pagination.limit=100`).catch(() => ({ info: [] })),
    ];
    if (this.cosmosAddress) requests.push(fetchJson(`${this.config.cosmosRestUrl}/cosmos/staking/v1beta1/delegations/${this.cosmosAddress}?pagination.limit=100`).catch(() => ({ delegation_responses: [] })));
    const [validatorResponse, poolResponse, signingResponse, delegationResponse = { delegation_responses: [] }] = await Promise.all(requests);
    const bonded = BigInt(poolResponse.pool?.bonded_tokens || 0);
    const delegations = new Map((delegationResponse.delegation_responses || []).map((item) => [item.delegation.validator_address, item.balance?.amount || "0"]));
    const configured = new Map((this.config.validators || []).map((item) => [item.operatorAddress, item]));
    const validators = await Promise.all((validatorResponse.validators || []).map(async (validator, index) => {
      const tokens = BigInt(validator.tokens || 0);
      const local = configured.get(validator.operator_address);
      const accountAddress = local?.accountAddress || validatorAccountAddress(validator.operator_address);
      const consensusAddress = validatorConsensusAddress(validator.consensus_pubkey);
      const signing = (signingResponse.info || []).find((item) => item.address === consensusAddress);
      const blocks = Number(signing?.index_offset || 0);
      const missed = Number(signing?.missed_blocks_counter || 0);
      const governanceSearch = (action) => this.rpc("tx_search", {
        query: `message.sender='${accountAddress}' AND message.action='${action}'`,
        prove: false,
        page: "1",
        per_page: "1",
        order_by: "desc",
      }).catch(() => null);
      const [delegationResult, voteResult, proposalResult] = await Promise.all([
        fetchJson(`${this.config.cosmosRestUrl}/cosmos/staking/v1beta1/validators/${validator.operator_address}/delegations?pagination.limit=1&pagination.count_total=true`).catch(() => null),
        governanceSearch("/cosmos.gov.v1.MsgVote"),
        governanceSearch("/cosmos.gov.v1.MsgSubmitProposal"),
      ]);
      return {
        ...validator,
        name: local?.name || validator.description?.moniker || `Validator ${index + 1}`,
        accountAddress,
        consensusAddress,
        delegatorCount: delegationResult ? Number(delegationResult.pagination?.total || 0) : null,
        delegationAkud: delegations.get(validator.operator_address) || "0",
        delegationKud: formatEther(BigInt(delegations.get(validator.operator_address) || 0)),
        powerPercent: bonded ? Number((tokens * 10_000n) / bonded) / 100 : null,
        reliabilityPercent: blocks ? ((blocks - missed) / blocks) * 100 : null,
        observedBlocks: blocks || null,
        missedBlocks: blocks ? missed : null,
        voteCount: voteResult ? Number(voteResult.total_count || 0) : null,
        proposalCount: proposalResult ? Number(proposalResult.total_count || 0) : null,
      };
    }));
    return validators.sort((left, right) => Number(BigInt(right.tokens) - BigInt(left.tokens)));
  }

  async rewards() {
    if (!this.cosmosAddress) return "0";
    const body = await fetchJson(`${this.config.cosmosRestUrl}/cosmos/distribution/v1beta1/delegators/${this.cosmosAddress}/rewards`).catch(() => ({ total: [] }));
    const amount = (body.total || []).filter((coin) => coin.denom === "akud").reduce((sum, coin) => sum + Number(coin.amount || 0), 0);
    return String(amount / 1e18);
  }

  async delegate(validatorAddress, amount) {
    const value = parseEther(String(amount));
    if (value <= 0n) throw new Error("Amount must be positive");
    if (this.isKeplr()) {
      return this.broadcastCosmos([{ typeUrl: "/cosmos.staking.v1beta1.MsgDelegate", value: encodeMsgDelegate(this.cosmosAddress, validatorAddress, value) }], "Kudora delegation");
    }
    return this.writeEvm({
      address: "0x0000000000000000000000000000000000000800",
      abi: stakingAbi,
      functionName: "delegate",
      args: [this.evmAccount.address, validatorAddress, value],
    });
  }

  async undelegate(validatorAddress, amount) {
    const value = parseEther(String(amount));
    if (value <= 0n) throw new Error("Amount must be positive");
    if (this.isKeplr()) {
      return this.broadcastCosmos([{ typeUrl: "/cosmos.staking.v1beta1.MsgUndelegate", value: encodeMsgUndelegate(this.cosmosAddress, validatorAddress, value) }], "Kudora undelegation");
    }
    return this.writeEvm({
      address: "0x0000000000000000000000000000000000000800",
      abi: stakingAbi,
      functionName: "undelegate",
      args: [this.evmAccount.address, validatorAddress, value],
    });
  }

  async networkStats(proposals = [], validatorCount) {
    const [status, txs] = await Promise.all([
      this.rpc("status"),
      this.rpc("tx_search", { query: "tx.height > 0", prove: false, page: "1", per_page: "1", order_by: "desc" }),
    ]);
    return {
      height: Number(status.sync_info?.latest_block_height || 0),
      transactions: Number(txs.total_count || 0),
      validators: validatorCount ?? (await this.validators()).length,
      completed: proposals.filter((proposal) => ["PROPOSAL_STATUS_PASSED", "PROPOSAL_STATUS_REJECTED", "PROPOSAL_STATUS_FAILED"].includes(proposal.status)).length,
      open: proposals.filter((proposal) => proposal.status === "PROPOSAL_STATUS_VOTING_PERIOD").length,
    };
  }

  async transactions() {
    if (!this.cosmosAddress) return [];
    const evmAddress = getAddress(this.evmAccount.address);
    const queries = [
      `message.sender='${this.cosmosAddress}'`,
      `transfer.recipient='${this.cosmosAddress}'`,
      `ethereum_tx.recipient='${evmAddress}'`,
    ];
    const results = await Promise.all(queries.map((query) => this.rpc("tx_search", { query, prove: false, page: "1", per_page: "100", order_by: "desc" }).catch(() => ({ txs: [] }))));
    const byHash = new Map();
    for (const result of results) for (const tx of result.txs || []) byHash.set(tx.hash, tx);

    const identities = new Map();
    for (const [name, addresses] of Object.entries(this.config.accounts || {})) {
      if (addresses.cosmosAddress) identities.set(addresses.cosmosAddress.toLowerCase(), name[0].toUpperCase() + name.slice(1));
      if (addresses.evmAddress) identities.set(addresses.evmAddress.toLowerCase(), name[0].toUpperCase() + name.slice(1));
    }
    for (const validator of this.config.validators || []) {
      if (validator.accountAddress) identities.set(validator.accountAddress.toLowerCase(), validator.name);
      if (validator.evmAddress) identities.set(validator.evmAddress.toLowerCase(), validator.name);
    }
    const validators = new Set((this.config.validators || []).flatMap((validator) => [validator.accountAddress, validator.evmAddress]).filter(Boolean).map((address) => address.toLowerCase()));
    const contractAddresses = new Set([
      this.config.discussionPrecompileAddress,
      this.config.governancePrecompileAddress,
      this.config.swap.mockUsdcAddress,
      this.config.swap.routerAddress,
      "0x0000000000000000000000000000000000000800",
    ].filter(Boolean).map((address) => address.toLowerCase()));
    const sameAddress = (left, right) => Boolean(left && right) && left.toLowerCase() === right.toLowerCase();
    const displayName = (address) => identities.get(address?.toLowerCase()) || "another account";
    const coinAmount = (raw = "") => [...raw.matchAll(/(?:^|,)([0-9]+)akud(?:,|$)/g)].reduce((total, match) => total + BigInt(match[1]), 0n);

    const orderedTransactions = [...byHash.values()].sort((left, right) => Number(right.height) - Number(left.height));
    const heights = [...new Set(orderedTransactions.map((tx) => String(tx.height)))];
    const blockTimes = new Map();
    for (let index = 0; index < heights.length; index += 12) {
      const times = await Promise.all(heights.slice(index, index + 12).map(async (height) => [height, await this.blockTime(height)]));
      times.forEach(([height, time]) => blockTimes.set(height, time));
    }
    const transactions = orderedTransactions.map((tx) => {
      const events = tx.tx_result?.events || [];
      const records = (type) => events.filter((event) => event.type === type).map((event) => Object.fromEntries((event.attributes || []).map((attribute) => [attribute.key, attribute.value])));
      const messages = records("message");
      const action = messages.find((record) => record.action)?.action || "Transaction";
      const transfers = records("transfer").filter((record) => record.msg_index !== undefined);
      let movement = 0n;
      for (const transfer of transfers) {
        const value = coinAmount(transfer.amount);
        if (sameAddress(transfer.recipient, this.cosmosAddress)) movement += value;
        if (sameAddress(transfer.sender, this.cosmosAddress)) movement -= value;
      }

      const evm = records("ethereum_tx").find((record) => record.amount !== undefined && record.recipient);
      const evmValue = BigInt(evm?.amount || 0);
      const evmIncoming = sameAddress(evm?.recipient, evmAddress);
      if (action === "/cosmos.evm.vm.v1.MsgEthereumTx") {
        movement = evmIncoming ? evmValue : -evmValue;
      }
      const amount = Number(formatEther(movement));

      const transfer = transfers.find((record) => sameAddress(record.sender, this.cosmosAddress) || sameAddress(record.recipient, this.cosmosAddress));
      const evmSender = messages.find((record) => record.module === "evm")?.sender;
      const counterparty = action === "/cosmos.evm.vm.v1.MsgEthereumTx"
        ? (evmIncoming ? evmSender : evm?.recipient)
        : (amount > 0 ? transfer?.sender : transfer?.recipient);
      const isValidatorFunding = action === "/cosmos.bank.v1beta1.MsgSend" && amount > 0 && validators.has(counterparty?.toLowerCase());
      const isMove = action === "/cosmos.evm.vm.v1.MsgEthereumTx" && sameAddress(evm?.recipient, this.config.swap.routerAddress);
      const isSelfTransfer = action === "/cosmos.bank.v1beta1.MsgSend"
        && sameAddress(transfer?.sender, this.cosmosAddress)
        && sameAddress(transfer?.recipient, this.cosmosAddress);
      const isEvmPayment = action === "/cosmos.evm.vm.v1.MsgEthereumTx"
        && evmValue > 0n
        && !contractAddresses.has(evm.recipient.toLowerCase());
      const isZap = action === "/kudora.discussion.v1.MsgZap";

      if (action === "/cosmos.evm.vm.v1.MsgEthereumTx" && !isMove && !isEvmPayment) return null;

      let details;
      if (isValidatorFunding) {
        details = ["Moved", "Funds added to Kudora", "＋"];
      } else if (isMove) {
        details = ["Moved", "KUD moved to Mock USDC", "⇄"];
      } else if (isSelfTransfer) {
        details = ["Moved", "KUD moved between your accounts", "⇄"];
      } else if (isEvmPayment) {
        details = [amount > 0 ? "Received" : "Sent", `Money ${amount > 0 ? "received from" : "sent to"} ${displayName(counterparty)}`, amount > 0 ? "↓" : "↑"];
      } else if (isZap) {
        details = ["Community", amount > 0 ? `Zap from ${displayName(counterparty)}` : `Zap sent to ${displayName(counterparty)}`, "ϟ"];
      } else {
        details = {
          "/cosmos.bank.v1beta1.MsgSend": [amount > 0 ? "Received" : "Sent", `Money ${amount > 0 ? "received from" : "sent to"} ${displayName(counterparty)}`, amount > 0 ? "↓" : "↑"],
          "/cosmos.gov.v1.MsgSubmitProposal": ["Activity", "Proposal published", "◇"],
          "/cosmos.gov.v1.MsgVote": ["Activity", "Governance vote", "✓"],
          "/cosmos.staking.v1beta1.MsgDelegate": ["Activity", "Delegated to a validator", "◎"],
          "/cosmos.staking.v1beta1.MsgUndelegate": ["Activity", "Undelegated from a validator", "◎"],
          "/kudora.discussion.v1.MsgPost": ["Activity", "Discussion contribution", "⌁"],
          "/kudora.discussion.v1.MsgReact": ["Activity", "Community reaction", "◇"],
        }[action] || ["Activity", action.split(".").at(-1).replace(/^Msg/, ""), "◆"];
      }
      const fee = coinAmount(records("tx").find((record) => record.fee)?.fee);
      const network = action === "/cosmos.evm.vm.v1.MsgEthereumTx" ? "EVM" : "Cosmos";
      return {
        id: tx.hash,
        hash: tx.hash,
        category: details[0],
        title: details[1],
        icon: details[2],
        note: `Confirmed on ${network}`,
        date: blockTimes.get(String(tx.height)) || "",
        network,
        reference: tx.hash,
        amount,
        fee: Number(formatEther(fee)),
        status: "Confirmed",
        validatorFunding: isValidatorFunding,
        fundingSourceName: isValidatorFunding ? displayName(counterparty) : undefined,
      };
    }).filter(Boolean);

    return Promise.all(transactions.map(async (transaction) => {
      if (!transaction.validatorFunding) return transaction;
      const result = await fetchJson(`${this.config.cosmosRestUrl}/cosmos/tx/v1beta1/txs/${transaction.hash}`).catch(() => null);
      const memo = result?.tx?.body?.memo || "";
      delete transaction.validatorFunding;
      if (/airdrop reward/i.test(memo)) {
        transaction.category = "Rewards";
        transaction.title = `Airdrop reward from ${transaction.fundingSourceName}`;
        transaction.icon = "★";
      }
      delete transaction.fundingSourceName;
      return transaction;
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
