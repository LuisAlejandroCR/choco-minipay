# Choco Contracts

`ChocoScheduleRegistry` is a fund-less schedule and receipt registry.

It does not hold user funds. The user's wallet approves a settlement spender separately, and the registry records which router or keeper is allowed to execute the scheduled wallet action.

## Commands

```bash
npm install
npm test
KEEPER_ADDRESS=0x... npm run deploy:mainnet
```

## Mainnet Flow

1. User connects MiniPay or a Celo wallet.
2. Choco reads connected-wallet balances from chain state.
3. User chooses Now or Schedule.
4. Now: cKES can transfer directly wallet -> recipient; USDC can route through Mento into cKES.
5. Schedule: wallet approves the source asset to the settlement spender, then calls `createMonthlySchedule` on this registry.
6. Keeper executes due schedules later and writes `SettlementReceipt` events.

## Deployment Model

Deploy one shared `ChocoScheduleRegistry` for the app. The registry is keyed by `owner`, so each wallet has its own schedules without requiring a new contract deployment per user. Add a factory later only if Choco needs per-user automation modules with isolated logic.
