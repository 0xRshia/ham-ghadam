/** Shared SQL availability for counts and follower alerts; timed reminders still require an exact start. */
export function eventNotEndedSql(now: string) {
  return `(CASE WHEN e.schedule_json IS NULL THEN e.ends_at>${now} ELSE
    (e.ends_at IS NULL OR e.ends_at>${now})
    AND (json_extract(e.schedule_json,'$.range_end') IS NULL OR json_extract(e.schedule_json,'$.range_end')+86400000>${now})
    AND (json_array_length(e.schedule_json,'$.dates')=0 OR EXISTS(SELECT 1 FROM json_each(e.schedule_json,'$.dates') d WHERE d.value+86400000>${now})) END)`;
}
