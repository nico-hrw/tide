import { describe, expect, it } from 'vitest';
import { createSwipeGate } from '../swipeGate';

const make = () => createSwipeGate({ threshold: 80, lockMs: 400 });

describe('createSwipeGate', () => {
  it('stays at 0 below the threshold and fires once it is accumulated', () => {
    const gate = make();
    expect(gate.push(40, 0)).toBe(0);
    expect(gate.push(50, 10)).toBe(1); // accumulated 90
  });

  it('ignores input during the lock and fires again after it', () => {
    const gate = make();
    expect(gate.push(90, 0)).toBe(1);
    expect(gate.push(-100, 200)).toBe(0);
    expect(gate.push(-100, 500)).toBe(-1);
  });

  it('does not accumulate deltas that arrive during the lock', () => {
    const gate = make();
    gate.push(90, 0);
    expect(gate.push(70, 100)).toBe(0);
    expect(gate.push(30, 500)).toBe(0); // only 30 counts
  });

  it('is symmetric for the negative direction', () => {
    const gate = make();
    expect(gate.push(-40, 0)).toBe(0);
    expect(gate.push(-50, 10)).toBe(-1);
  });

  it('opposite deltas cancel out', () => {
    const gate = make();
    expect(gate.push(60, 0)).toBe(0);
    expect(gate.push(-60, 5)).toBe(0);
    expect(gate.push(60, 10)).toBe(0);
  });

  it('reset clears the accumulated sum and the lock', () => {
    const gate = make();
    gate.push(70, 0);
    gate.reset();
    expect(gate.push(70, 10)).toBe(0);
    expect(gate.push(90, 20)).toBe(1);
    gate.reset();
    expect(gate.push(90, 30)).toBe(1);
  });
});
