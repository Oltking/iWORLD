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

## ⚠️ Status
The contract + tests + deploy script are written and reviewed, but were **not compiled
here** — the Foundry toolchain couldn't be installed in the build sandbox (blocked
binary download). Run `forge test` on any machine with Foundry to verify (one command),
then deploy when a wallet is funded.

## Verify (no gas)
```bash
# install Foundry once: https://getfoundry.sh   (curl -L https://foundry.paradigm.xyz | bash && foundryup)
cd packages/contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts --no-commit
forge test -vvv          # runs the unit tests in test/AgentNFT.t.sol
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
