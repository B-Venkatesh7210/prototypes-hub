// Creates throwaway Base Sepolia wallets for the buyer agent and the seller, and writes them to .env.local.
// Existing values are kept. Only addresses are printed; private keys stay in the file.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const file = new URL("../.env.local", import.meta.url);
let env = existsSync(file) ? readFileSync(file, "utf8") : "";
const has = (name) => new RegExp(`^${name}=.+`, "m").test(env);
const add = (name, value) => {
  env = env.replace(new RegExp(`^${name}=.*\\n?`, "m"), "");
  env += `${env && !env.endsWith("\n") ? "\n" : ""}${name}=${value}\n`;
};

if (!has("BUYER_PRIVATE_KEY")) add("BUYER_PRIVATE_KEY", generatePrivateKey());
if (!has("SELLER_PRIVATE_KEY")) add("SELLER_PRIVATE_KEY", generatePrivateKey());
const read = (name) => env.match(new RegExp(`^${name}=(.+)$`, "m"))[1].trim();
if (!has("SELLER_ADDRESS")) add("SELLER_ADDRESS", privateKeyToAccount(read("SELLER_PRIVATE_KEY")).address);

writeFileSync(file, env, { mode: 0o600 });
console.log("buyer  ", privateKeyToAccount(read("BUYER_PRIVATE_KEY")).address);
console.log("seller ", read("SELLER_ADDRESS"));
