import { useEffect, useRef, useState } from "react";

// Touch-only pull-to-refresh for a scroll container. Conservative by design: it only engages when
// the container is already at the top (scrollTop <= 0) and only blocks the native scroll while the
// user is actively pulling DOWN — so ordinary scrolling is never affected. When the pull passes the
// threshold on release, it awaits `onRefresh()` and shows a refreshing state until it resolves.
export function usePullToRefresh(scrollRef, onRefresh, { enabled = true, threshold = 70, max = 110 } = {}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const g = useRef({ startY: 0, pulling: false, dist: 0, busy: false });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled) return undefined;
    const s = g.current;

    function start(e) {
      if (el.scrollTop <= 0 && !s.busy) {
        s.startY = e.touches[0].clientY;
        s.pulling = true;
        s.dist = 0;
      }
    }
    function move(e) {
      if (!s.pulling) return;
      const dy = e.touches[0].clientY - s.startY;
      if (dy > 0 && el.scrollTop <= 0) {
        s.dist = Math.min(max, dy * 0.5); // rubber-band resistance
        setPullDistance(s.dist);
        if (s.dist > 4 && e.cancelable) e.preventDefault(); // suppress native overscroll while pulling
      } else {
        s.pulling = false;
        s.dist = 0;
        setPullDistance(0);
      }
    }
    async function end() {
      if (!s.pulling) return;
      s.pulling = false;
      const fire = s.dist >= threshold;
      s.dist = 0;
      setPullDistance(0);
      if (fire) {
        s.busy = true;
        setRefreshing(true);
        try { await onRefresh(); } catch { /* surfaced elsewhere */ } finally { s.busy = false; setRefreshing(false); }
      }
    }

    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", end, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [scrollRef, onRefresh, enabled, threshold, max]);

  return { pullDistance, refreshing };
}
