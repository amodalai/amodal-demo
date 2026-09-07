// preToolUse covers model-selected calls. Authored composite store calls
// bypass this hook and must enforce their own workflow rules.
export function createHook() {
  return {
    run(point, payload) {
      if (point === "preToolUse" && /^store__.+__(?:set|remove)$/.test(payload?.toolName ?? "")) {
        return {
          action: "block",
          reason: "Direct store changes are disabled. Use analyze_submission for a review; record decisions and filings through the app.",
        };
      }
      return { action: "allow" };
    },
  };
}
