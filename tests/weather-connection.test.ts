import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { STEPS, stepsFrom } from "./helpers.js";

const files = [
  "evals/weather-alerts.md",
  "evals/weather-read-only.md",
  "agents/weather/agent.json",
  "agents/weather/AGENT.md",
  "amodal/connections/weather/spec.json",
  "amodal/connections/weather/policy.json",
  "amodal/connections/weather/openapi.json",
  "amodal/connections/weather/README.md",
  "src/components/WeatherAlerts.tsx",
  "src/components/WeatherAlerts.test.tsx",
];

test("the live weather lesson starts with connections and is complete in every later step", () => {
  for (const root of stepsFrom("07-gmail-connection")) {
    for (const file of files) {
      assert.equal(readFileSync(`${root}/${file}`, "utf8"), readFileSync(file, "utf8"), `${root}/${file}`);
    }
  }
  for (const step of STEPS.slice(0, STEPS.indexOf("07-gmail-connection"))) {
    assert.equal(existsSync(`steps/${step}/agents/weather`), false, step);
    assert.equal(existsSync(`steps/${step}/amodal/connections/weather`), false, step);
  }
});

test("the weather surface grants only its read-only native connection", () => {
  const agent = JSON.parse(readFileSync("agents/weather/agent.json", "utf8"));
  assert.deepEqual(agent.connections, ["weather"]);
  for (const key of ["tools", "skills", "subagents"]) assert.deepEqual(agent[key], [], key);
  assert.deepEqual(agent.stores, {});
  const spec = JSON.parse(readFileSync("amodal/connections/weather/spec.json", "utf8"));
  assert.equal(spec.baseUrl, "https://api.weather.gov");
  assert.equal(spec.openapi.source, "./openapi.json");
  assert.equal(spec.openapi.exposure, "discovery");
  assert.ok(spec.headers["User-Agent"]);
  assert.equal(spec.auth, undefined);
  const contract = JSON.parse(readFileSync("amodal/connections/weather/openapi.json", "utf8"));
  assert.deepEqual(Object.keys(contract.paths), ["/alerts/active/area/{area}"]);
  const path = contract.paths["/alerts/active/area/{area}"];
  assert.deepEqual(Object.keys(path).sort(), ["get", "parameters"]);
  assert.equal(path.get.operationId, "alerts_active_area");
  assert.equal(path.parameters[0].required, true);
  assert.equal(path.parameters[0].schema.type, "string");
});

test("weather views reset per submission and state, and per desk only at step 12", () => {
  for (const root of [".", ...stepsFrom("07-gmail-connection")]) {
    const app = readFileSync(`${root}/src/App.tsx`, "utf8");
    const weather = app.match(/<WeatherAlerts[\s\S]*?\/>/)?.[0];
    assert.ok(weather, root);
    assert.match(weather, /key=\{.*route.submission_id.*state/, root);
    if (root === ".") {
      assert.match(weather, /key=\{.*desk/, root);
      assert.match(weather, /scopeId=\{desk\}/, root);
    } else assert.doesNotMatch(weather, /scopeId/, root);
  }
});
