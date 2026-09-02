import { useEffect, useState } from "react";
import { useAutomation } from "@amodalai/react";

// The management surface returns more; the toggle needs only these fields.
interface AutoSyncBinding {
  id: string;
  enabled: boolean;
  tool?: string;
}

/**
 * The step-10 control: a platform-managed automation binding that runs
 * `sync_submissions` on a daily cadence with no UI open and no human present.
 * `schedule` creates the binding; the checkbox then flips `enabled`. The
 * management surface (list/enable/disable) is wired in the cloud runtime;
 * locally it 404s, so the control degrades to a note instead of breaking.
 */
export function AutoSyncToggle() {
  const auto = useAutomation();
  const [binding, setBinding] = useState<AutoSyncBinding | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const all = (await auto.list()) as AutoSyncBinding[];
    setBinding(all.find((a) => a.tool === "sync_submissions") ?? null);
  }

  useEffect(() => {
    refresh()
      .then(() => setState("ready"))
      .catch(() => setState("unavailable"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "loading") return null;
  if (state === "unavailable") {
    return <span className="autosync muted">Auto-sync: cloud only</span>;
  }

  const on = binding?.enabled === true;

  async function toggle() {
    setBusy(true);
    try {
      if (!binding) {
        await auto.schedule("sync_submissions", {
          schedule: { every: "1d" },
          label: "Daily inbox sync",
        });
      } else if (on) {
        await auto.disable(binding.id);
      } else {
        await auto.enable(binding.id);
      }
      await refresh();
    } catch {
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="autosync" title="Sync the broker inbox once a day, with no UI open.">
      <input type="checkbox" checked={on} disabled={busy} onChange={() => void toggle()} />
      Auto-sync daily
    </label>
  );
}
