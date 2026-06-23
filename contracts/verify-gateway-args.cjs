// Constructor args for ChocoGateway @ 0x8271442a1a902c69415657926FDe8ae277dD2255
// (order matches ChocoGateway.sol constructor; the audit-hardened pair deployed via deploy-all.mjs).
// Usage: npx hardhat verify --network celo --constructor-args verify-gateway-args.cjs 0x8271442a1a902c69415657926FDe8ae277dD2255
module.exports = [
  "0x777A8255cA72412f0d706dc03C9D1987306B4CaD",                          // broker (Mento)
  "0x22d9db95E6Ae61c104A7B6F6C78D7993B94ec901",                          // exchangeProvider
  "0xacc988382b66ee5456086643dcfd9a5ca43dd8f428f6ef22503d8b8013bcffd7",  // usdcToUsdmId (bytes32)
  "0x5615CDAb10dc425a742d643d949a7F474C01abc4",                          // router (UniV3 SwapRouter02)
  "0x95faa9a91cD6c1C018e4B1a6fC4c89D4F1695e5D",                          // pool (USDm/KESm)
  100,                                                                   // poolFee
  "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",                          // usdc
  "0x765DE816845861e75A25fCA122bb6898B8B1282a",                          // usdm
  "0x456a3D042C0DbD3db53D5489e98dFb038553B0d0",                          // ckes (KESm)
  "0xB2f969dAbaC42A146dE231F241990a94b21e9789",                          // ledger (ChocoLedger)
  "0xC7203b6F0313Ed490e2B68156aeb3380fe274B66",                          // feeRecipient
  25,                                                                    // feeBps
];
