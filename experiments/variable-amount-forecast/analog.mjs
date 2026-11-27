import { calendar, checkAmounts, HORIZON, PLAN, REMAINING } from './forecast.mjs';

// The query and library use the same features. Dates enter only through the calendar.
export function historyFeatures(startDate, history) {
  checkAmounts(history, 'history');
  const dates = calendar(startDate);
  if (history.at(-1) === null) return null;
  const groups = Array.from({ length: 2 }, () => ({ known: 0, done: 0, amount: 0 }));
  const transitions = Array.from({ length: 2 }, () => ({ known: 0, done: 0 }));
  let sumSquares = 0;
  for (const [day, minutes] of history.entries()) {
    if (minutes === null) continue;
    const group = groups[Number(dates.weekend(day))];
    const done = Number(minutes > 0);
    const amount = Math.log1p(minutes / PLAN);
    group.known++;
    group.done += done;
    group.amount += amount;
    sumSquares += amount * amount;
    if (day > 0 && history[day - 1] !== null) {
      const transition = transitions[Number(history[day - 1] > 0)];
      transition.known++;
      transition.done += done;
    }
  }
  const [weekday, weekend] = groups;
  const positives = weekday.done + weekend.done;
  if (positives === 0) return null;
  const rate = (positives + 1) / (weekday.known + weekend.known + 2);
  const mean = (weekday.amount + weekend.amount) / positives;
  const spread = Math.sqrt(Math.max(0, sumSquares / positives - mean * mean));
  // A group with no observations inherits the person's overall rate or amount.
  const rateIn = g => (g.done + 2 * rate) / (g.known + 2);
  const amountIn = g => (g.amount + 2 * mean) / (g.done + 2);
  const lastDate = new Date(dates.date(history.length - 1) + 'T00:00:00Z');
  const phase = 2 * Math.PI * lastDate.getUTCDay() / 7;
  return [
    rate, ...transitions.map(t => (t.done + 1) / (t.known + 2)), mean, spread,
    rateIn(weekend) - rateIn(weekday), amountIn(weekend) - amountIn(weekday),
    Number(history.at(-1) > 0), Math.sin(phase), Math.cos(phase),
  ];
}

// The library contains complete follow-up, including the outcome "later than 14 days".
// Outcomes label the neighbors only after distance is calculated from historical features.
export function trainAnalog(windows, historyDays, k = 64) {
  if (!Number.isInteger(k) || k < 1) throw new Error('k must be a positive integer');
  const library = [];
  for (const { startDate, history, future } of windows) {
    if (history.length !== historyDays) throw new Error('Mismatched library history length');
    checkAmounts(future, 'training future');
    if (future.length !== HORIZON || future.includes(null)) throw new Error('Complete training follow-up required');
    const features = historyFeatures(startDate, history);
    if (!features) continue;
    let sum = 0;
    const crossing = future.findIndex(minutes => (sum += minutes) >= REMAINING);
    library.push({ features, arrival: crossing < 0 ? HORIZON + 1 : crossing + 1 });
  }
  if (library.length < k) throw new Error('Too few eligible training diaries for k');
  const scale = library[0].features.map((_, j) => {
    const mean = library.reduce((s, row) => s + row.features[j], 0) / library.length;
    const variance = library.reduce((s, row) => s + (row.features[j] - mean) ** 2, 0) / library.length;
    return variance > 1e-12 ? 1 / Math.sqrt(variance) : 0;
  });
  const scaled = features => features.map((value, j) => value * scale[j]);
  for (const row of library) row.features = scaled(row.features);

  function predict(startDate, history) {
    if (history.length !== historyDays) throw new Error('Mismatched prediction history length');
    const features = historyFeatures(startDate, history);
    if (!features) throw new Error('Known origin and positive historical minutes required');
    const query = scaled(features);
    const ranked = library.map(({ features: neighbor, arrival }) => {
      let distance = 0;
      for (let j = 0; j < query.length; j++) distance += (query[j] - neighbor[j]) ** 2;
      return { distance, arrival };
    }).sort((a, b) => a.distance - b.distance);
    const cutoff = ranked[k - 1].distance;
    let closer = 0;
    while (closer < k && ranked[closer].distance < cutoff) closer++;
    let end = k;
    while (end < ranked.length && ranked[end].distance === cutoff) end++;
    // Share the boundary weight across all ties so training input order cannot pick a winner.
    const tieWeight = (k - closer) / (end - closer);
    const counts = Array(HORIZON + 2).fill(0);
    for (let i = 0; i < end; i++) counts[ranked[i].arrival] += i < closer ? 1 : tieWeight;
    let cumulative = 0;
    return Array.from({ length: HORIZON }, (_, i) => (cumulative += counts[i + 1]) / k);
  }
  return { predict, eligible: library.length };
}
