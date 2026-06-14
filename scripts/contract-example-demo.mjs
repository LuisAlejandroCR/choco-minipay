import { ethers } from "ethers";

const RPC_URL = process.env.CELO_RPC_URL || "https://forno.celo.org";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = "0xA3E1C4FC10C47f5C2cd413C0451f06A73fCD0b94";
const ABI = [
  "function registrar()",
  "function contador(address) view returns (uint256)",
  "function ultimoUsuario() view returns (address)",
];

if (!PRIVATE_KEY) {
  throw new Error("Set PRIVATE_KEY in your shell before running this script.");
}

const provider = new ethers.JsonRpcProvider(RPC_URL, { chainId: 42220, name: "celo" });
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

console.log("Wallet", wallet.address);
console.log("Calling the sample contract register method on Celo Mainnet...");
const tx = await contract.registrar();
console.log("Tx", tx.hash);
await tx.wait();

const count = await contract.contador(wallet.address);
const lastUser = await contract.ultimoUsuario();
console.log("Counter", count.toString());
console.log("Last user", lastUser);
