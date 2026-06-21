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

## ✅ Status — verified
Compiles (Solc 0.8.24) and **4/4 Foundry tests pass** (mint commits dataHash+rootHash+
owner · owner-only update · transfer · fee/refund). Deploy is gated on a funded wallet.

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
