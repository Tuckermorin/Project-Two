import { http } from "./http";

const FRED = "https://api.stlouisfed.org/fred/series/observations";
const key = process.env.FRED_API_KEY!;

export async function getSeries(
  seriesIds: string[],
  start?: string,
  end?: string
) {
  const out: Record<string, { date: string; value: number }[]> = {};

  for (const id of seriesIds) {
    try {
      const r = await http(FRED, {
        params: {
          series_id: id,
          file_type: "json",
          api_key: key,
          observation_start: start,
          observation_end: end,
        },
      });

      out[id] = ((r as any)?.observations ?? []).map((o: any) => ({
        date: o.date,
        value: Number(o.value),
      }));
    } catch (error) {
      console.error(`Error fetching FRED series ${id}:`, error);
      out[id] = [];
    }
  }

  return out;
}
