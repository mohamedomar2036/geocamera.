import { Component, type ErrorInfo, type ReactNode } from "react";

declare global {
  interface Window {
    GeoCameraStartup?: {
      ready: () => void;
      fail: (error: unknown) => void;
      update: () => void;
    };
  }
}
export function StartupRecovery() {
  return (
    <section className="startup-recovery" role="alert">
      <img src="/geocamera-full-logo.png" alt="GeoCamera — GIS Field Tools" />
      <h1>GeoCamera could not start</h1>
      <p>Your saved photos, videos and settings have not been cleared.</p>
      <p>
        Retry startup, or check for an application update. Keep this browser
        profile to access its existing records.
      </p>
      <button onClick={() => window.location.reload()}>Retry Startup</button>
      <button onClick={() => window.GeoCameraStartup?.update()}>
        Check for Update
      </button>
    </section>
  );
}
export class StartupBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    window.GeoCameraStartup?.ready();
    console.error("GeoCamera render failed", error, info.componentStack);
  }
  render() {
    return this.state.failed ? <StartupRecovery /> : this.props.children;
  }
}
