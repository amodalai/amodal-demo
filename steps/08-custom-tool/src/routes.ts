export const ROLES = ["underwriter", "broker"] as const;

export type Role = (typeof ROLES)[number];

export type TabName = "pipeline" | "history" | "guide" | "new" | "mine";

export type Route = { name: TabName } | { name: "submission"; submission_id: string };

/** The tabs each role's rail shows, in order. The first one is that role's home. */
export const TABS: Record<Role, Array<{ name: TabName; label: string }>> = {
  underwriter: [
    { name: "pipeline", label: "Pipeline" },
    { name: "history", label: "History" },
    { name: "guide", label: "Guide" },
  ],
  broker: [
    { name: "new", label: "New submission" },
    { name: "mine", label: "My submissions" },
  ],
};

export const homeRoute = (role: Role): Route => ({ name: TABS[role][0].name });

export function hashOf(route: Route): string {
  return route.name === "submission"
    ? `#/submission/${encodeURIComponent(route.submission_id)}`
    : `#/${route.name}`;
}

const HASH = /^#\/([a-z-]+)(?:\/([^/]+))?$/;
const TAB_NAMES = new Set(Object.values(TABS).flatMap((tabs) => tabs.map((t) => t.name)));

export function parseHash(hash: string): Route | undefined {
  const m = HASH.exec(hash);
  if (!m) return undefined;
  const [, name, arg] = m;
  if (name === "submission") {
    return arg ? { name: "submission", submission_id: decodeURIComponent(arg) } : undefined;
  }
  if (arg || !TAB_NAMES.has(name as TabName)) return undefined;
  return { name: name as TabName };
}

/** Both roles reach a submission; every tab belongs to exactly one of them. */
export function ownsRoute(role: Role, route: Route): boolean {
  return route.name === "submission" || TABS[role].some((t) => t.name === route.name);
}

/**
 * The route to render, plus the hash to rewrite when the URL asked for
 * something this role does not own. A broker who bookmarks #/pipeline lands on
 * their own home rather than an empty screen.
 */
export function resolveRoute(role: Role, hash: string): { route: Route; redirect?: string } {
  const route = parseHash(hash);
  if (route && ownsRoute(role, route)) return { route };
  const home = homeRoute(role);
  return { route: home, redirect: hashOf(home) };
}
