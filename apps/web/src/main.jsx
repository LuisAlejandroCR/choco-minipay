import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.jsx";
import "./styles.css";

// Catches unhandled React render errors. Without this, any runtime throw inside
// a screen component blanks the UI silently. With it, the user sees a recoverable
// error message and can reload rather than staring at a blank screen.
class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: String(error?.message || "Unknown error") };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          background: "#050302",
          color: "#f6e8d4",
          fontFamily: "Inter, -apple-system, sans-serif",
          textAlign: "center",
        }}>
          <b style={{ fontSize: "18px" }}>Something went wrong</b>
          <p style={{ color: "#c4ad96", fontSize: "14px", maxWidth: "320px", lineHeight: 1.5 }}>
            Choco encountered an unexpected error. Reload the page to continue.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "12px 24px",
              borderRadius: "14px",
              border: "none",
              background: "#f6e8d4",
              color: "#100906",
              fontWeight: 900,
              fontSize: "14px",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {import.meta.env.DEV && (
            <pre style={{ color: "#6b4226", fontSize: "11px", maxWidth: "360px", whiteSpace: "pre-wrap", textAlign: "left" }}>
              {this.state.message}
            </pre>
          )}
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>,
);
