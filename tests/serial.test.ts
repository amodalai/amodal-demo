import { test } from "node:test";
import assert from "node:assert/strict";
import { serial } from "../src/serial.js";

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("tasks run in submitted order and never overlap", async () => {
  const queue = serial();
  const log: string[] = [];
  const task = (name: string, ms: number) => async () => {
    log.push(`${name}:start`);
    await tick(ms);
    log.push(`${name}:end`);
  };
  queue(task("a", 20));
  queue(task("b", 1));
  await queue(task("c", 1));
  assert.deepEqual(log, ["a:start", "a:end", "b:start", "b:end", "c:start", "c:end"]);
});

test("one rejection does not stop the queue", async () => {
  const queue = serial();
  const log: string[] = [];
  queue(async () => {
    throw new Error("boom");
  });
  await queue(async () => {
    log.push("ran");
  });
  assert.deepEqual(log, ["ran"]);
});
