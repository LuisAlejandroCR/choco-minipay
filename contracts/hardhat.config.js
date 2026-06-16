import hardhatVerify from "@nomicfoundation/hardhat-verify";
import { config as dotenv } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv({ path: resolve(__dirname, ".env") });

const PK = (process.env.DEPLOYER_PRIVATE_KEY || "").length === 66
  ? process.env.DEPLOYER_PRIVATE_KEY
  : undefined;

export default {
  plugins: [hardhatVerify],
  solidity: {
    version: "0.8.26",
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  paths: { sources: "./src" },
  networks: {
    celo: {
      type: "http",
      url: process.env.CELO_RPC_URL || "https://forno.celo.org",
      chainId: 42220,
      accounts: PK ? [PK] : [],
    },
  },
  etherscan: {
    apiKey: {
      celo: (process.env.CELOSCAN_API_KEY || "").trim(),
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
