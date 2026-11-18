/** Review dates come from the cited evidence, never from its indexing run. */
export function reviewedSourceDate(source) {
  for (const value of [source?.checked,source?.checkedOn,source?.checkedAt]) {
    if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) continue;
    const stamp=Date.parse(value);
    if (Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0,10)===value) return value;
  }
  return null;
}
