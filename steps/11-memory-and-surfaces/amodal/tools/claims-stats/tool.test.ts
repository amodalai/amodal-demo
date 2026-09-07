import { test } from "node:test";
import assert from "node:assert/strict";
import tool, { type ClaimInput } from "./tool.js";

const stats = (claims: ClaimInput[]) => tool.handle({
  input: { claims },
  signal: new AbortController().signal,
  log: () => {},
});

test("an empty claims history returns zero totals", async () => {
  assert.deepEqual(await stats([]), {
    as_of_year: new Date().getFullYear(),
    total_claims: 0,
    claims_in_last_3_years: 0,
    open_claims: 0,
    largest_claim_usd: 0,
    total_incurred_usd: 0,
    claim_years: [],
  });
});

test("monetary totals include every claim and preserve cents", async () => {
  const result = await stats([0.1, 2500.25, 18.04, 0.2].map((amount_usd) => ({
    year: 2020,
    description: "Property damage",
    amount_usd,
  })));
  assert.equal(result.total_claims, 4);
  assert.equal(result.largest_claim_usd, 2500.25);
  assert.equal(result.total_incurred_usd, 2518.59);
});

test("the three-year window includes both boundaries and excludes future claims", async () => {
  const year = new Date().getFullYear();
  for (const [claimYear, expected] of [
    [year - 3, 0],
    [year - 2, 1],
    [year - 1, 1],
    [year, 1],
    [year + 1, 0],
  ]) {
    const result = await stats([{ year: claimYear, description: "Water damage", amount_usd: 100 }]);
    assert.equal(result.claims_in_last_3_years, expected, `claim year ${claimYear}`);
  }
});

test("the reporting year comes from the clock rather than the claims", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2035-06-01T12:00:00.000Z") });
  const result = await stats([{ year: 2020, description: "Fire damage", amount_usd: 100 }]);
  assert.equal(result.as_of_year, 2035);
  assert.equal(result.claims_in_last_3_years, 0);
});

test("claim years are distinct and sorted numerically", async () => {
  const result = await stats([2026, 2023, 2025, 2023, 2026].map((year) => ({
    year,
    description: "Property damage",
    amount_usd: 100,
  })));
  assert.deepEqual(result.claim_years, [2023, 2025, 2026]);
});

test("only open claims contribute to the open count", async () => {
  const result = await stats([true, false, undefined, true].map((open) => ({
    year: 2020,
    description: "Property damage",
    amount_usd: 100,
    open,
  })));
  assert.equal(result.open_claims, 2);
  assert.equal(result.total_claims, 4);
});
