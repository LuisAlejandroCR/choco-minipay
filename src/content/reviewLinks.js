export const infoPanels = {
  future: {
    eyebrow: "Notifications",
    title: "Plan alerts",
    copy: "Plan reminders and run alerts show here in the app, by default.",
    items: [],
    roadmap: {
      eyebrow: "Roadmap",
      title: "Coming soon",
      items: [
        "WhatsApp / SMS alerts — opt in with your MiniPay number",
        "More corridors (e.g. UK → NGN)",
      ],
    },
    icon: "future",
  },
  support: {
    eyebrow: "Support first",
    title: "Support and about",
    copy: "Start here for help, review pages, and the short Choco story.",
    items: [],
    icon: "support",
  },
  report: {
    eyebrow: "Report an issue",
    title: "Something wrong with this transfer?",
    copy: "Copy the transaction details and send them to support — we'll trace it on-chain.",
    items: [],
    icon: "support",
  },
};

export const supportAboutContent = {
  badge: "MiniPay agent - Celo Mainnet",
  label: "About Choco",
  title: "Choco helps MiniPay users send family transfers with review, schedules, and receipts.",
  copy: "Choco reads wallet balances, prepares USDC to cKES actions, and asks the wallet to sign. Funds stay in the user's wallet until they confirm.",
};

export const publicReviewLinks = [
  {
    id: "support",
    label: "Support",
    href: "/support.html",
    icon: "support",
  },
  {
    id: "privacy",
    label: "Privacy",
    href: "/privacy.html",
    icon: "privacy",
  },
  {
    id: "terms",
    label: "Terms",
    href: "/terms.html",
    icon: "terms",
  },
  {
    id: "stats",
    label: "Stats",
    href: "/stats.html",
    icon: "stats",
  },
  {
    id: "live-demo",
    label: "Live demo",
    href: "live-demo",
    icon: "external",
    external: true,
  },
];
