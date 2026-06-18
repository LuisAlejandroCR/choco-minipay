import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles/base.css";
import "./styles/splash-pitch.css";
import "./styles/home.css";
import "./styles/nav-sheets.css";
import "./styles/history.css";
import "./styles/review-receipt.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
