import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { AppWithPrivy } from "./AppWithPrivy.jsx";
import "./styles/base.css";
import "./styles/splash-pitch.css";
import "./styles/home.css";
import "./styles/nav-sheets.css";
import "./styles/history.css";
import "./styles/review-receipt.css";

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {PRIVY_APP_ID ? <AppWithPrivy /> : <App />}
  </React.StrictMode>,
);
