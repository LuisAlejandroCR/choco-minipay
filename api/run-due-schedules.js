import { runDueSchedules } from "../scripts/choco-keeper.mjs";

export const config = {
  maxDuration: 60,
};

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET || "";
  // Require the secret to be configured — an empty secret is NOT a pass-through.
  // Set CRON_SECRET in Vercel env; the GitHub Actions workflow reads it from secrets.CRON_SECRET.
  if (!secret) return false;
  const bearer = req.headers.authorization || "";
  const headerSecret = req.headers["x-cron-secret"] || "";
  return bearer === `Bearer ${secret}` || headerSecret === secret;
}

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method || "")) {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  if (!isAuthorized(req)) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  const logs = [];
  const logger = {
    log: (...args) => logs.push(args.map(String).join(" ")),
    warn: (...args) => logs.push(`WARN ${args.map(String).join(" ")}`),
    error: (...args) => logs.push(`ERROR ${args.map(String).join(" ")}`),
  };

  try {
    const result = await runDueSchedules({
      shouldSend: true,
      recordOnly: false,
      logger,
    });
    res.status(200).json({ ...result, logs });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      logs,
    });
  }
}
