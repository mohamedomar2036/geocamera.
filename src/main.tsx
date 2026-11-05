import React from "react";
import { createRoot } from "react-dom/client";
import { StartupBoundary, StartupRecovery } from "./startup";
import "./style.css";

// Keep browser API initialization out of this bootstrap and catch module-loading failures.
void import("./App")
  .then(({ default: App }) => {
    createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <StartupBoundary>
          <App />
        </StartupBoundary>
      </React.StrictMode>,
    );
  })
  .catch((error) => {
    console.error("GeoCamera module loading failed", error);
    if (window.GeoCameraStartup) window.GeoCameraStartup.fail(error);
    else
      createRoot(document.getElementById("root")!).render(<StartupRecovery />);
  });
