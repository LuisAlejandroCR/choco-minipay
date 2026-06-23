import { RefreshCw } from "lucide-react";

// Visual for the pull-to-refresh gesture: a strip that grows with the pull and spins while
// refreshing. Renders nothing when idle, so it has zero footprint on a normal screen.
export function PullToRefreshIndicator({ pullDistance = 0, refreshing = false, threshold = 70 }) {
  if (!refreshing && pullDistance <= 0) return null;
  const progress = refreshing ? 1 : Math.min(1, pullDistance / threshold);
  return (
    <div className="ptr-indicator" style={{ height: refreshing ? 40 : pullDistance }}>
      <RefreshCw
        size={20}
        className={refreshing ? "ptr-spin" : ""}
        style={{
          opacity: 0.45 + progress * 0.55,
          transform: refreshing ? undefined : `rotate(${progress * 260}deg)`,
        }}
      />
    </div>
  );
}
