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

Save this outside the README:

- network,
- chain ID,
- agent ID,
- owner wallet,
- agent metadata URI,
- registry address,
- transaction hash,
- 8004scan URL,
- date registered.

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
