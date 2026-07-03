import { useState } from "react";
import { INITIAL_SCREEN } from "../../config/runtime.js";
import { resolveVisibleScreen } from "../../lib/access-control.js";

export function useAppRouter(walletHasAddress) {
  const [screen, setScreen] = useState(INITIAL_SCREEN);
  const visibleScreen = resolveVisibleScreen(screen, walletHasAddress);
  function goTo(next) { setScreen(resolveVisibleScreen(next, walletHasAddress)); }
  return { screen, setScreen, visibleScreen, goTo };
}
