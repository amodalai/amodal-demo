/**
 * claims_stats: deterministic arithmetic over a submission's past claims.
 * The 3-year window is computed from the real clock, never taken from the
 * model. Returns numbers, never verdicts: the thresholds live in the
 * underwriting guide and the repeat-cause judgment stays with the
 * underwriting-reviewer subagent. A pure function of its input, hence
 * `exposure: open`.
 */
import type { ToolDefinition } from "../../_types/tool-context.js";

export interface ClaimInput {
  year: number;
  description: string;
  amount_usd: number;
  open?: boolean;
}

export interface ClaimsStatsInput {
  claims: ClaimInput[];
}

export interface ClaimsStatsOutput {
  /** The current year, from the real clock. */
  as_of_year: number;
  total_claims: number;
  /** Claims whose year falls in the 3-year window ending this year. */
  claims_in_last_3_years: number;
  open_claims: number;
  largest_claim_usd: number;
  total_incurred_usd: number;
  /** Distinct claim years, ascending. */
  claim_years: number[];
}

const tool: ToolDefinition<ClaimsStatsInput, ClaimsStatsOutput> = {
  id: "claims_stats",
  exposure: { kind: "open" },
  llm_callable: true,
  base: {
    name: "claims_stats",
    description:
      "Deterministic arithmetic over a submission's past claims: total count, " +
      "count in the last 3 years (relative to today's real date, which you do " +
      "not know), open-claim count, largest amount, total incurred, and the " +
      "distinct claim years. Call it once with the full claims array before " +
      "assessing claims history, and treat the numbers as fact. Do not count, " +
      "sum, or date claims yourself. It returns numbers only: judging repeat " +
      "causes and applying the underwriting guide's thresholds stays with you.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        claims: {
          type: "array",
          description:
            "The submission's past claims, exactly as given in your context.",
          items: {
            type: "object",
            properties: {
              year: { type: "number" },
              description: { type: "string" },
              amount_usd: { type: "number" },
              open: { type: "boolean" },
            },
            required: ["year", "description", "amount_usd"],
          },
        },
      },
      required: ["claims"],
    },
  },

  async handle(ctx) {
    const claims = ctx.input.claims ?? [];
    const as_of_year = new Date().getFullYear();
    const windowStart = as_of_year - 2; // 3-year window, inclusive

    let claimsInWindow = 0;
    let openClaims = 0;
    let largest = 0;
    let total = 0;
    const years = new Set<number>();

    for (const c of claims) {
      const amount = Number.isFinite(c.amount_usd) ? c.amount_usd : 0;
      if (c.year >= windowStart && c.year <= as_of_year) claimsInWindow += 1;
      if (c.open === true) openClaims += 1;
      if (amount > largest) largest = amount;
      total += amount;
      years.add(c.year);
    }

    return {
      as_of_year,
      total_claims: claims.length,
      claims_in_last_3_years: claimsInWindow,
      open_claims: openClaims,
      largest_claim_usd: largest,
      total_incurred_usd: total,
      claim_years: [...years].sort((a, b) => a - b),
    };
  },
};

export default tool;
