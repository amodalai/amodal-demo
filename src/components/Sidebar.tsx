import type { ReactNode } from "react";
import { ROLE_LABEL } from "../persona";
import { TABS, hashOf, type Role, type Route } from "../routes";

export function Sidebar({
  role,
  route,
  onPickRole,
  badges,
  onReset,
  children,
}: {
  role: Role;
  route: Route;
  onPickRole: (role: Role) => void;
  badges: Partial<Record<string, number>>;
  onReset: () => void;
  /** Desk, sync and automation controls, which exist only in the later steps. */
  children?: ReactNode;
}) {
  return (
    <nav className="rail">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          UR
        </span>
        <h1>Underwriting Review</h1>
      </div>

      <label className="field">
        <span>Acting as</span>
        <select value={role} onChange={(e) => onPickRole(e.target.value as Role)}>
          {(Object.keys(TABS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <p className="rail__note">
        A screen role, not a permission. Both roles talk to the same agent. What
        is enforced is that filing and deciding are tools no agent can call.
      </p>

      <ul className="rail__tabs">
        {TABS[role].map((tab) => (
          <li key={tab.name}>
            <a
              className={`rail__tab${route.name === tab.name ? " rail__tab--on" : ""}`}
              href={hashOf({ name: tab.name })}
            >
              {tab.label}
              {badges[tab.name] ? <span className="badge">{badges[tab.name]}</span> : null}
            </a>
          </li>
        ))}
      </ul>

      <div className="rail__controls">{children}</div>

      <div className="rail__foot">
        <button className="btn btn--ghost" onClick={onReset}>
          Reset demo data
        </button>
        <p className="rail__note">
          Fictional demo. Submissions, findings, and the underwriting guide are
          made up. The agent assists; a human decides.
        </p>
      </div>
    </nav>
  );
}
