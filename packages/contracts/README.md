# @iworld/contracts — AgentNFT (Phase 2: the ownership moat)

`AgentNFT.sol` is the iWORLD agent ownership token, **ERC-7857-shaped**. An agent =
a token you own; its private brain (personality + memory) lives **encrypted on 0G**,
and the token commits to the agent's `dataHash` (the personality version `@kipr/core`
already computes) + the 0G brain `rootHash` on-chain. Provable ownership + identity,
transferable.

> Scope note (per the master plan, depth before breadth): this v1 is the ownership
> token + on-chain commitment. The deeper ERC-7857 **re-keyed transfer** (re-encrypting
> the brain to a buyer via a TEE oracle) reuses the canonical `0g-agent-nft` verifier
> stack and is the next step.

## ✅ Status — verified + DEPLOYED on 0G Galileo testnet
Compiles (Solc 0.8.24), **10/10 Foundry tests pass**, and both contracts are live:

| Contract | Address (chain 16602) |
|---|---|
| **AgentNFT** | `0xade8466d4c89940a7a653e15927407d5922433c0` |
| **AgentMarket** (escrow, 2.5% fee) | `0x86e7746cBa2C71C832B9904935E56B7aA6b39975` |
| **TransferRegistry** (re-key handoff) | `0xEBC2ac9286adc42560423703E48B4cE7af64799d` |
| **AgentMeta** (public listing cards) | `0x98968768d18ff5367ac566a7e45e8D0Fc0ADd4ae` |

`AgentMarket.sol` = list / buy / cancel an agent on-chain (ownership transfers, seller
paid minus fee). **TESTNET DEMO** of the economy — no real value, so the regulated
real-money concerns don't apply here; mainnet would need legal review. v1 moves the
ownership token; the ERC-7857 re-keyed brain transfer is the deeper step.

### Deploy gotcha (0G testnet)
0G rejects EIP-1559 txs with a low tip — use **`--legacy --with-gas-price 5000000000`**:
```bash
export ZG_PRIVATE_KEY=0x...      ZG_EVM_RPC=https://evmrpc-testnet.0g.ai
forge script script/Deploy.s.sol:Deploy --rpc-url $ZG_EVM_RPC --broadcast --legacy --with-gas-price 5000000000
AGENT_NFT_ADDRESS=0x... forge script script/DeployMarket.s.sol:DeployMarket --rpc-url $ZG_EVM_RPC --broadcast --legacy --with-gas-price 5000000000
```
Cost: AgentNFT ~0.0093 0G, AgentMarket ~0.0054 0G. Tiny.

## Verify (no gas)
```bash
cd packages/contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts   # forge 1.7+: no --no-commit
forge test -vv
```

### Installing Foundry on this machine
`forge` is already installed at `~/.foundry/bin/forge`. If you need to reinstall and
`foundryup`/`brew install foundry` fail with network errors (ghcr.io PROTOCOL_ERROR),
the direct download with HTTP/1.1 works:
```bash
curl --http1.1 -fsSL https://github.com/foundry-rs/foundry/releases/download/stable/foundry_stable_darwin_arm64.tar.gz -o /tmp/foundry.tar.gz
mkdir -p ~/.foundry/bin && tar -xzf /tmp/foundry.tar.gz -C ~/.foundry/bin forge cast anvil
export PATH="$HOME/.foundry/bin:$PATH"   # add to ~/.zshrc to persist
```

## Deploy to 0G Galileo (needs a funded deployer)
```bash
export ZG_PRIVATE_KEY=0x...        # a funded deployer wallet
export ZG_EVM_RPC=https://evmrpc-testnet.0g.ai
forge script script/Deploy.s.sol --rpc-url $ZG_EVM_RPC --private-key $ZG_PRIVATE_KEY --broadcast
# → prints "AgentNFT deployed at: 0x...."
```

## Wire it into the app
Set the deployed address in `apps/web/.env.local`:
```
VITE_AGENT_NFT_ADDRESS=0x...your-deployed-AgentNFT
```
Rebuild the web app — the "Mint agent token" step in the creator goes live (it was
shown as "soon" until the address is present; no faked ownership before then).

## Interface
- `mint((string dataDescription, bytes32 dataHash)[] iDatas, string rootHash, address to) payable → tokenId`
- `update(uint256 tokenId, IntelligentData[] newDatas, string rootHash)` — owner-only, opt-in version change
- `dataOf(tokenId) → IntelligentData[]` · `primaryDataHash(tokenId) → bytes32` · `brainRootHash(tokenId) → string`
- events `AgentMinted` / `AgentUpdated`
