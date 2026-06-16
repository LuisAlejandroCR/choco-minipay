require("@nomicfoundation/hardhat-verify");
require("dotenv").config();

const PK = process.env.DEPLOYER_PRIVATE_KEY;

/** @type {import('hardhat/config').HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: { sources: "./src" },
  networks: {
    celo: {
      url: process.env.CELO_RPC_URL || "https://forno.celo.org",
      chainId: 42220,
      accounts: PK ? [PK] : [],
    },
  },
  etherscan: {
    apiKey: {
      celo: process.env.CELOSCAN_API_KEY || "",
    },
    customChains: [
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://api.celoscan.io/api",
          browserURL: "https://celoscan.io",
        },
      },
    ],
  },
};
