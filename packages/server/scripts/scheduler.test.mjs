import assert from "node:assert/strict";
import test from "node:test";
import { FixedStepClock } from "../src/fixedStepClock.ts";
import { TICK_MS, TICK_HZ } from "@loose-cannon/shared";

test("47ms Windows callbacks still advance thirty fixed steps per wall second", () => {
  const clock = new FixedStepClock(TICK_MS, 0);
  const deltas = [];
  for (let now = 47; now <= 4700; now += 47) clock.advance(now, (dt) => deltas.push(dt));
  assert.equal(deltas.length, 141, "4.7 wall seconds must be 141 ticks, not 100 timer callbacks");
  assert.ok(deltas.every((dt) => dt === 1 / TICK_HZ), "combat always receives a fixed 1/30s step");
});

test("frequent jittery polling neither drops time nor runs simulation early", () => {
  const clock = new FixedStepClock(TICK_MS, 100);
  let ticks = 0;
  const step = () => ticks++;
  assert.equal(clock.advance(115, step), 0);
  assert.equal(clock.advance(131, step), 0);
  assert.equal(clock.advance(147, step), 1);
  assert.equal(clock.advance(163, step), 0);
  assert.equal(clock.advance(200, step), 2);
  assert.equal(ticks, 3);
  clock.advance(1100, step);
  assert.equal(ticks, 8, "an exceptional 900ms stall respects the catch-up cap");
});

test("long stalls are bounded and cannot create an endless catch-up backlog", () => {
  const clock = new FixedStepClock(TICK_MS, 0);
  let ticks = 0;
  const step = () => ticks++;
  assert.equal(clock.advance(10_000, step), 5, "at most five steps in one callback after sleep");
  assert.equal(clock.advance(10_000, step), 0);
  assert.equal(clock.advance(10_034, step), 1, "old backlog was discarded");
  assert.equal(clock.advance(10_067, step), 1);
  assert.equal(ticks, 7);
});

test("a backward clock sample does not double-credit elapsed time", () => {
  const clock = new FixedStepClock(TICK_MS, 100);
  let ticks = 0;
  const step = () => ticks++;
  clock.advance(147, step);
  assert.equal(clock.advance(120, step), 0);
  assert.equal(clock.advance(147, step), 0);
  clock.advance(200, step);
  assert.equal(ticks, 3);
});
