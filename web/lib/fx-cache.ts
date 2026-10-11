import "server-only";

import { dbGet, dbRun } from "./db";

export type FxRateSnapshot = {
  rates: Record<string, number>;
  fetchedAt: number;
  rateTimestamp: string;
};

export async function getFxRateSnapshot(): Promise<FxRateSnapshot | null> {
  const row = await dbGet<{ rates_json: string; fetched_at: number; rate_timestamp: string }>(
    "SELECT rates_json, fetched_at, rate_timestamp FROM fx_rate_cache WHERE id = 1",
  );
  if (!row) return null;
  return {
    rates: JSON.parse(row.rates_json) as Record<string, number>,
    fetchedAt: Number(row.fetched_at),
    rateTimestamp: row.rate_timestamp,
  };
}

export async function saveFxRateSnapshot(snapshot: FxRateSnapshot): Promise<void> {
  await dbRun(
    `INSERT INTO fx_rate_cache (id, rates_json, fetched_at, rate_timestamp)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       rates_json = excluded.rates_json,
       fetched_at = excluded.fetched_at,
       rate_timestamp = excluded.rate_timestamp`,
    [JSON.stringify(snapshot.rates), snapshot.fetchedAt, snapshot.rateTimestamp],
  );
}