/**
 * WSOLA time-stretch: changes speech duration without changing pitch.
 * `tempo` > 1 plays faster (shorter output), < 1 slower.
 */
export function timeStretch(input: Float32Array, sampleRate: number, tempo: number): Float32Array {
  if (Math.abs(tempo - 1) < 0.005 || input.length === 0) return input.slice();
  const frame = Math.max(64, Math.round(sampleRate * 0.04) & ~1);
  const hop = frame / 2;
  const search = Math.round(frame / 4);
  const window = new Float32Array(frame);
  for (let i = 0; i < frame; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frame);

  const outLength = Math.round(input.length / tempo);
  const out = new Float32Array(outLength + frame);
  const norm = new Float32Array(outLength + frame);
  const at = (i: number) => (i >= 0 && i < input.length ? input[i] : 0);

  let prev = 0;
  for (let k = 0; k * hop < outLength; k++) {
    const nominal = Math.round(k * hop * tempo);
    let best = nominal;
    if (k > 0) {
      const natural = prev + hop;
      let bestScore = -Infinity;
      for (let d = -search; d <= search; d++) {
        const cand = nominal + d;
        let score = 0;
        for (let i = 0; i < hop; i += 2) score += at(cand + i) * at(natural + i);
        if (score > bestScore) {
          bestScore = score;
          best = cand;
        }
      }
    }
    const base = k * hop;
    for (let i = 0; i < frame; i++) {
      out[base + i] += at(best + i) * window[i];
      norm[base + i] += window[i];
    }
    prev = best;
  }
  const result = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) result[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0;
  return result;
}

/** Index range of audible audio, ignoring leading and trailing silence. */
export function audibleRange(samples: Float32Array, threshold = 0.01): [number, number] {
  let a = 0;
  while (a < samples.length && Math.abs(samples[a]) < threshold) a++;
  let b = samples.length;
  while (b > a && Math.abs(samples[b - 1]) < threshold) b--;
  return [a, b];
}
