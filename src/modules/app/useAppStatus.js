import { useState } from "react";

// Shared status + message surface for the whole app.
//
// Lifted out of useTransfer so that useContactResolution can write to the same surface
// without holding a reference to useTransfer. Previously App.jsx had to declare the contacts
// hook first and reference transfer.setMessage through a forward-declared closure (guarded by
// eslint-disable no-use-before-define). With this hook, App declares appStatus first and passes
// it to both feature hooks — no forward reference, no lint suppression.
//
// status values: "idle" | "pending" | "review" | "success" | "error"
export function useAppStatus(
  initialMessage = "Connect your wallet so Choco can check stablecoin funds.",
) {
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState(initialMessage);
  return { status, setStatus, message, setMessage };
}
