"use client";

import { use, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { browser } from "react-dom";
import {
  fromBackup,
  localizeBackup,
  mergeBackup,
  saveImport,
  toBackup,
  type BackupData,
} from "@/lib/backup";
import { useMeetings } from "@/lib/meetings";
import { describeError } from "@/lib/remote-store";
import { useTags } from "@/lib/tags";
import { saveThemePreference, useThemePreference, type ThemePreference } from "@/lib/theme";
import { buttonSecondary, label, panel, panelHeader } from "./ui";

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

type Status = { kind: "success" | "error"; text: string };

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

const descriptionClass = "text-sm text-muted";

function statusClass(status: Status): string {
  return `mt-3 font-mono text-xs ${status.kind === "error" ? "text-danger" : "text-up"}`;
}

// Browser-only: settings, meetings, and tags are loaded from Supabase with the signed-in user's
// session. Render inside a <Suspense> boundary.
export function Settings() {
  use(browser("Settings are loaded from Supabase in the browser."));

  return (
    <div className="space-y-4">
      <AppearanceSettings />
      <BackupSettings />
    </div>
  );
}

function AppearanceSettings() {
  const savedTheme = useThemePreference();
  // The choice being saved, so the switch moves right away.
  const [pendingTheme, setPendingTheme] = useState<ThemePreference | null>(null);
  const [error, setError] = useState<string | null>(null);
  const theme = pendingTheme ?? savedTheme;

  async function chooseTheme(preference: ThemePreference) {
    setPendingTheme(preference);
    setError(null);
    try {
      await saveThemePreference(preference);
    } catch (e) {
      setError(`Couldn't save your choice; it applies until you reload. ${describeError(e)}`);
    }
    setPendingTheme(null);
  }

  return (
    <section className={panel}>
      <div className={panelHeader}>
        <h2 className={label}>Appearance</h2>
      </div>
      <div className="p-4">
        <p className={descriptionClass}>
          System matches your device&apos;s light or dark setting.
        </p>
        <fieldset className="mt-4">
          <legend className="sr-only">Theme</legend>
          <div className="inline-flex rounded-sm border border-line-strong bg-bg p-0.5">
            {THEME_OPTIONS.map((option) => (
              <label
                key={option.value}
                className="cursor-pointer rounded-[2px] px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-muted transition-colors hover:text-fg has-checked:bg-accent has-checked:font-semibold has-checked:text-on-accent has-focus-visible:ring-2 has-focus-visible:ring-accent/60"
              >
                <input
                  type="radio"
                  name="theme"
                  value={option.value}
                  checked={theme === option.value}
                  onChange={() => chooseTheme(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="mt-3 font-mono text-xs text-danger">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

function BackupSettings() {
  const meetings = useMeetings();
  const tags = useTags();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [importing, setImporting] = useState(false);

  // Next.js keeps this page alive (hidden) after navigating away; don't show an old
  // result message when coming back.
  useLayoutEffect(() => () => setStatus(null), []);

  function exportMeetings() {
    const blob = new Blob([toBackup({ meetings, tags })], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `meetings-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus({
      kind: "success",
      text: `Downloaded a backup of ${plural(meetings.length, "meeting")} and ${plural(tags.length, "tag")}.`,
    });
  }

  async function importMeetings(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear the input so choosing the same file again still triggers a change.
    event.target.value = "";
    if (!file) return;

    const imported = fromBackup(await file.text());
    if (imported === null) {
      setStatus({ kind: "error", text: `"${file.name}" isn't a meetings backup file.` });
      return;
    }
    if (imported.meetings.length === 0 && imported.tags.length === 0) {
      setStatus({ kind: "error", text: `"${file.name}" doesn't contain any meetings or tags.` });
      return;
    }

    let localized: BackupData;
    try {
      localized = await localizeBackup({ meetings, tags }, imported);
    } catch (e) {
      setStatus({ kind: "error", text: `Couldn't import. ${describeError(e)}` });
      return;
    }
    const merged = mergeBackup({ meetings, tags }, localized);
    const question =
      `Import ${plural(imported.meetings.length, "meeting")} and ${plural(imported.tags.length, "tag")}?` +
      (merged.updatedMeetings > 0
        ? ` ${plural(merged.updatedMeetings, "meeting")} already ${merged.updatedMeetings === 1 ? "exists" : "exist"} here and will be replaced by the version in the file.`
        : "") +
      " Everything else you have is kept.";
    if (!window.confirm(question)) return;

    setImporting(true);
    setStatus(null);
    try {
      await saveImport({ meetings, tags }, merged);
      setStatus({
        kind: "success",
        text: `Imported ${plural(merged.newMeetings, "new meeting")}, updated ${merged.updatedMeetings}, and added ${plural(merged.newTags, "new tag")}.`,
      });
    } catch (e) {
      setStatus({
        kind: "error",
        text: `Couldn't finish the import; some items may have been saved. ${describeError(e)}`,
      });
    }
    setImporting(false);
  }

  return (
    <section className={panel}>
      <div className={panelHeader}>
        <h2 className={label}>Backup</h2>
      </div>
      <div className="p-4">
        <p className={descriptionClass}>
          Your meetings and tags are saved to your account. Download a backup to keep your own
          copy, or import one, including a backup from the earlier browser-only version of this
          app.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={exportMeetings}
            disabled={meetings.length === 0}
            className={buttonSecondary}
          >
            Export meetings ({meetings.length})
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className={buttonSecondary}
          >
            {importing ? "Importing…" : "Import from file…"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={importMeetings}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
        {status && (
          <p
            role={status.kind === "error" ? "alert" : "status"}
            className={statusClass(status)}
          >
            {status.text}
          </p>
        )}
      </div>
    </section>
  );
}
