// Runtime fail-safe for public LIST endpoints: map each row through its mapper
// independently so one corrupt/unmappable record (e.g. a missing translation)
// LOGS + is SKIPPED instead of 500-ing the whole feed. A visitor sees the rest;
// the problem is recorded for the DEVELOPER (not the club admin) to review.

// In-memory record of recently skipped records (developer diagnostics). Bounded
// so it can't grow unbounded. Reset on restart — that's fine; it's a live signal,
// not durable storage.
export type SkippedRecord = { source: string; id: string; reason: string; at: string };
const skipped: SkippedRecord[] = [];
const MAX_SKIPPED = 200;

export function recentSkipped(): SkippedRecord[] {
	return [...skipped];
}

function recordSkip(source: string, id: string, reason: string): void {
	const entry = { source, id, reason, at: new Date().toISOString() };
	console.error(`[safe-map] skipped ${source} id=${id}: ${reason}`);
	skipped.push(entry);
	if (skipped.length > MAX_SKIPPED) skipped.shift();
}

// Map an array of rows; drop (log) any that throw. `label` names the source for
// logs/diagnostics; `idOf` extracts a stable id for the log line.
export function safeMapList<TRow, TOut>(
	rows: TRow[],
	mapper: (row: TRow) => TOut,
	label: string,
	idOf: (row: TRow) => string,
): TOut[] {
	const out: TOut[] = [];
	for (const row of rows) {
		try {
			out.push(mapper(row));
		} catch (err) {
			recordSkip(label, idOf(row), err instanceof Error ? err.message : String(err));
		}
	}
	return out;
}
