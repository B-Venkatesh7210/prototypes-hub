export { verifyVerdict, STEPS, type Check, type CheckStatus, type PaymentRecord, type VerifyOptions, type VerifyResult } from "./verify.ts";
export { remoteKeySource, staticKeySource, type Jwk, type JwkSet, type KeySource } from "./keys.ts";
export { memoryReplayStore, type ReplayStore, type ConsumeResult } from "./replay.ts";
export { decimalEquals, toUnits, fromUnits } from "./decimal.ts";

export const SAIFURO_ISSUER = "https://verdicts.saifuro.com";
export const SAIFURO_JWKS_URL = "https://verdicts.saifuro.com/.well-known/jwks.json";
