# ERC-8004 Agent Registration Runbook

Use this runbook only after `public/agent.json` is public and has no placeholders.

## Safety

Never commit private keys or put them in screenshots, chat messages, README files, issue trackers, deployment logs, browser storage, or frontend environment variables.

## Generate Metadata

Set environment values in the current terminal session only, then run:

```bash
npm run agent:generate
```

This writes `public/agent.json`.

## Register

After `public/agent.json` is deployed publicly, set `AGENT_URI` to the public metadata URL and run:

```bash
npm run agent:register
```

## Save Evidence

Save this outside the README. Full record goes in `ops/agent-registry/agent.<network>.json`.

Required fields: network, chain ID, agent ID, owner wallet, agent metadata URI, registry address, transaction hash, 8004scan URL, date registered.

## Registered Evidence

### Celo Sepolia

Full record: `ops/agent-registry/agent.sepolia.json`.

| Field | Value |
| --- | --- |
| Agent ID | 309 |
| Owner | `0x282DD05E60fC7fd8DCBa184C2d5fF9d8d40974be` |
| Registry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Metadata URI | `https://choco-minipay.vercel.app/agent.json` |
| Transaction | `0x5af39c6473d818be68baded32892f9e171b0559ee676e6df16ff103714e19efc` |
| Block | 27333237 |
| Registered | 2026-06-05T01:27:37.000Z |
| 8004scan | `https://testnet.8004scan.io/agents/celo-sepolia/309` |

Open issue: tokenURI is not content-addressed (`https://`). Before mainnet registration: pin `public/agent.json` to IPFS, call `setAgentURI(309, "ipfs://...")` on the Sepolia registry, and record the new CID here.

## Celo Sepolia

- Chain ID: `11142220`
- RPC: `https://forno.celo-sepolia.celo-testnet.org`
- 8004scan: `https://testnet.8004scan.io`
- Identity Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`

## Celo Mainnet

Use only after production approval.

- Chain ID: `42220`
- RPC: `https://forno.celo.org`
- 8004scan: `https://8004scan.io`
- Identity Registry: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
