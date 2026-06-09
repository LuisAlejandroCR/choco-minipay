export const DEMO_STEP_MS = 5000;

export const demoSteps = [
  {
    title: "Home starts the transfer",
    copy: "One entry point keeps the app simple. Voice or text can send now or schedule.",
  },
  {
    title: "Choose timing",
    copy: "Pick send now or schedule. Choco uses the same command box for both.",
  },
  {
    title: "Choco checks repeats",
    copy: "If a similar plan or send already exists, Choco asks before continuing.",
  },
  {
    title: "Plans stay light",
    copy: "Details show the essentials: amount, timing, route, retries, and actions.",
  },
  {
    title: "Movements verify proof",
    copy: "Receipts start short, then expand into QR, from, to, date, and hash.",
  },
  {
    title: "Share when needed",
    copy: "Share the receipt or open the explorer link when family asks for proof.",
  },
];

export const DEMO_TOTAL_SECONDS = Math.round((demoSteps.length * DEMO_STEP_MS) / 1000);

export const demoPromptContent = {
  title: `Try Choco in ${DEMO_TOTAL_SECONDS} seconds`,
  copy: "A guided tour shows transfers, schedules, receipts, and sharing. Skip anytime.",
  liveDemoLabel: "Open live demo",
};

export const pitchContent = {
  visualLabel: "USA to Kenya remittance",
  mapLabel: "World map with USA and Kenya highlighted",
  kicker: "Voice remittance",
  originLabel: "USA",
  destinationLabel: "Kenya",
  headlinePrefix: "Send USA to Kenya by",
  headlineEmphasis: "voice",
  memory: "Plan once. Send now or on schedule.",
  support: "Choco handles the rest",
  cta: "Continue",
};
