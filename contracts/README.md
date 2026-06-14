# Choco Contracts - Celo Mainnet

Three contracts for Choco MiniPay remittances:

- **ChocoScheduleRegistry**: Fund-less registry for recurring transfers
- **ChocoAuditLog**: Append-only log of all transfer attempts
- **ChocoCkesSwap**: USDC→cKES swap wrapper (optional)

None hold user funds. Users approve tokens separately; contracts only coordinate execution.

## Quick Deploy to Mainnet

### 1. Setup

```bash
cd contracts
npm install
cp .env.example .env
```

Edit `.env`:
```bash
DEPLOYER_PRIVATE_KEY=0x...your_wallet_private_key...
KEEPER_ADDRESS=0x...your_erc8004_agent_address...
```

### 2. Deploy

**Registry + Audit:**
```bash
npm run deploy:mainnet
```

**Swap (optional):**
```bash
npm run deploy:swap
```

### 3. Update Frontend

Copy output addresses to `../.env`:
```bash
VITE_REGISTRY_ADDRESS=0x...
VITE_AUDIT_CONTRACT_ADDRESS=0x...
VITE_SETTLEMENT_SPENDER_ADDRESS=0x...
VITE_REGISTRY_DEPLOY_BLOCK=...
VITE_CKES_SWAP_CONTRACT_ADDRESS=0x...
```

## How It Works

1. **Send Now**: User connects wallet → Choco reads balances → USDC routes through Mento to cKES → Direct transfer
2. **Schedule**: User approves USDC to registry → Creates monthly schedule on-chain → Keeper executes + logs receipt

Registry is keyed by wallet address. Each user has isolated schedules without needing separate contract deployments.

## Security

⚠️ `.env` is gitignored - NEVER commit private keys
- Deploy cost: ~0.06 CELO (~$0.03)
- Verify on [Celoscan](https://celoscan.io/)
