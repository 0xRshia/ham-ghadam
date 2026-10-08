import { config, database } from "@/db";

// The same published city set drives selection and server-side validation.
export async function profileCities() {
  const cities = await database().prepare(
    "SELECT DISTINCT city FROM events WHERE published=1 AND city<>'' AND (?=1 OR sample=0) ORDER BY city",
  ).bind(Number(config().SEED_SAMPLE_EVENTS === "true")).all<{ city: string }>();
  return cities.results.map(row => row.city);
}
