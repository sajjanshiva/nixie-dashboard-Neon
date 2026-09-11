import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App.jsx";
import { AuthProvider } from "./lib/AuthContext.jsx";
import { ThemeProvider } from "./lib/ThemeContext.jsx";
import { registerServiceWorker } from "./lib/push.js";
import "./index.css";

// Registering doesn't ask for notification permission — that only
// happens when the user clicks "Enable notifications" in the bell
// dropdown (see NotificationBell.jsx). This just makes the service
// worker ready ahead of time so that click can subscribe instantly.
registerServiceWorker();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                borderRadius: "12px",
                fontSize: "13.5px",
                fontWeight: "500",
              },
              success: {
                style: { background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" },
                iconTheme: { primary: "#22c55e", secondary: "#fff" },
              },
              error: {
                style: { background: "#fff1f0", color: "#b91c1c", border: "1px solid #fecaca" },
                iconTheme: { primary: "#FF6B5E", secondary: "#fff" },
              },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);