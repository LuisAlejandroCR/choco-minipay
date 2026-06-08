const intervalMs = Number(process.env.WORKER_INTERVAL_MS || 30000);
const runOnce = process.env.WORKER_ONCE === "true";

async function runSchedulerTick() {
  const timestamp = new Date().toISOString();
  console.log(JSON.stringify({
    level: "info",
    service: "choco-worker",
    event: "scheduler_tick",
    timestamp,
    note: "Connect database-backed schedule runs in Stage 3.",
  }));
}

await runSchedulerTick();

if (!runOnce) {
  setInterval(runSchedulerTick, intervalMs);
}
