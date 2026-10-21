export const SCENARIOS = {
  research: { title: "Normal research", blurb: "Buys two cheap datasets and answers. Every payment allowed.", side: "agent", expect: "allow" },
  injection: { title: "Prompt injection", blurb: "A third-party feed tells the agent to buy a $900 report.", side: "agent", expect: "deny_limit" },
  runaway: { title: "Runaway loop", blurb: "12 purchases in seconds. The 11th hits the frequency rule.", side: "agent", expect: "deny_velocity" },
  review: { title: "Human review", blurb: "A $0.30 purchase is above review_above. You approve it.", side: "agent", expect: "review" },
  category: { title: "Wrong category", blurb: "The agent tries to buy GPU compute on a data-only mandate.", side: "agent", expect: "deny_category" },
  revoke: { title: "Revoke mid-run", blurb: "Revoke the mandate; the next request is denied.", side: "agent", expect: "deny_revoked" },
  replay: { title: "Replay", blurb: "Resend an approval the seller already accepted.", side: "seller", expect: "step 12" },
  tamper: { title: "Tamper", blurb: "Change an approved amount from 0.001 to 900, keep the signature.", side: "seller", expect: "step 5" },
  swap: { title: "Swap", blurb: "Present a fresh $0.001 approval for the $0.30 dataset.", side: "seller", expect: "step 9" },
} as const;

export type ScenarioId = keyof typeof SCENARIOS;
