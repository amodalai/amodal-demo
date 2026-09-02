import { useCallback, useState } from "react";
import { ROLES, type Role } from "./routes";

const KEY = "uw-persona";

/**
 * The demo's single broker identity. `requested_by` on a submission carries it,
 * so "My submissions" can filter honestly instead of showing every broker's
 * rows under a heading that says "my".
 */
export const BROKER = {
  name: "Dana Whitfield",
  firm: "Harbor Brokers",
  email: "dana@harborbrokers.example",
};

export const ROLE_LABEL: Record<Role, string> = {
  underwriter: "Underwriter",
  broker: `${BROKER.name}, ${BROKER.firm}`,
};

function storedRole(): Role {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored && (ROLES as readonly string[]).includes(stored)) return stored as Role;
  } catch {}
  return "underwriter";
}

/**
 * Which role the screen is dressed as. This is presentation, not
 * authorization: the runtime gives the custom UI no user identity, and both
 * roles talk to the same agent with the same permissions. What is actually
 * enforced is that submit_submission and decide_submission are in no agent's
 * tools list, so the model cannot take either step whoever is looking.
 */
export function usePersona(): [Role, (role: Role) => void] {
  const [role, setRole] = useState(storedRole);
  const pick = useCallback((next: Role) => {
    setRole(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {}
  }, []);
  return [role, pick];
}
