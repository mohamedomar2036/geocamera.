import { useState } from "react";
import { INSPECTION_SETTINGS_KEY, readInspectionSettings } from "./data";
export default function InspectionSettings() {
  const [settings, setSettings] = useState(readInspectionSettings);
  const [error, setError] = useState("");
  function updateSettings(next: typeof settings) {
    setSettings(next);
    try {
      localStorage.setItem(INSPECTION_SETTINGS_KEY, JSON.stringify(next));
      setError("");
    } catch {
      setError(
        "Report settings could not be saved. Existing saved settings have not been cleared.",
      );
    }
  }

  return (
    <section className="card">
      <div className="section-heading">
        <h2>Inspection report settings</h2>
      </div>
      <p className="subtext">Preparer details for inspection reports.</p>
      {(
        [
          ["preparedBy", "Prepared By"],
          ["jobTitle", "Job Title"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            maxLength={120}
            value={settings[key]}
            onChange={(e) =>
              updateSettings({ ...settings, [key]: e.target.value })
            }
          />
        </label>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
