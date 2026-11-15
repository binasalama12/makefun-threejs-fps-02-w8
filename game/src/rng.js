// A tiny seeded random source. Screenshot mode and bot jitter both draw from one of
// these so a given seed always stages the same frame, while live play seeds it from
// the clock and gets a fresh match every time.
export function mulberry32(initial) {
  let a = initial | 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, low, high) {
  return low + rng() * (high - low);
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length) % list.length];
}
