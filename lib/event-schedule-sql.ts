/** Shared SQL availability for counts and follower alerts; timed reminders still require an exact start. */
export function eventNotEndedSql(now: string) {
  const firstDay = `MAX(CAST((${now}+12600000)/86400000 AS INTEGER)*86400000-12600000,COALESCE(json_extract(e.schedule_json,'$.range_start'),json_extract(e.schedule_json,'$.dates[0]'),0))`;
  const day = `(${firstDay}+offset.value*86400000)`;
  return `(CASE WHEN e.schedule_json IS NULL THEN e.ends_at>${now}
    WHEN json_extract(e.schedule_json,'$.source')='manual' THEN EXISTS(
      SELECT 1 FROM json_each('[0,1,2,3,4,5,6,7]') offset,json_each(e.schedule_json,'$.sessions') session
      WHERE ${day}+json_extract(session.value,'$.end')*60000>${now}
      AND (json_array_length(e.schedule_json,'$.dates')=0 OR ${day}=json_extract(e.schedule_json,'$.dates[0]'))
      AND (json_extract(e.schedule_json,'$.range_end') IS NULL OR ${day}<=json_extract(e.schedule_json,'$.range_end'))
      AND (json_array_length(e.schedule_json,'$.weekdays')=0 OR CAST(strftime('%w',(${day}+12600000)/1000,'unixepoch') AS INTEGER) IN (SELECT value FROM json_each(e.schedule_json,'$.weekdays')))
    ) ELSE
    (e.ends_at IS NULL OR e.ends_at>${now})
    AND (json_extract(e.schedule_json,'$.range_end') IS NULL OR json_extract(e.schedule_json,'$.range_end')+86400000>${now})
    AND (json_array_length(e.schedule_json,'$.dates')=0 OR EXISTS(SELECT 1 FROM json_each(e.schedule_json,'$.dates') d WHERE d.value+86400000>${now})) END)`;
}
