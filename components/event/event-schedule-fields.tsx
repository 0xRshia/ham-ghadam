"use client";
import { Plus, Trash2 } from "lucide-react";
import { EventDateTimeField } from "./event-date-time-field";
import { MAX_MANUAL_SESSIONS, TIMED_AGENDA_SCHEDULE_ERROR, scheduleWeekdays, type ManualScheduleDraft } from "@/lib/manual-event-schedule";
import styles from "./event-schedule-fields.module.css";

export function EventScheduleFields({ value, onChange, disabled = false, hasTimedAgenda = false }: {
  value: ManualScheduleDraft; onChange: (value: ManualScheduleDraft) => void; disabled?: boolean; hasTimedAgenda?: boolean;
}) {
  const set = (patch: Partial<ManualScheduleDraft>) => onChange({ ...value, ...patch });
  function calendar(label: string, dateKey: "date" | "endDate" | "until", timeKey: "time" | "endTime", dateOnly = false) {
    return <div className={styles.calendar}><EventDateTimeField label={label} dateValue={value[dateKey] ?? ""} time={value[timeKey]}
      onDateChange={date => set({ [dateKey]: date })} onTimeChange={time => set({ [timeKey]: time })} disabled={disabled} dateOnly={dateOnly} /></div>;
  }
  return <fieldset className={styles.root} disabled={disabled}>
    <label className={styles.mode}>نحوهٔ برگزاری<select aria-label="نحوهٔ برگزاری" value={value.mode} onChange={event => set({ mode: event.target.value as ManualScheduleDraft["mode"] })}>
      <option value="single">یک‌بار، با شروع و پایان مشخص</option>
      <option value="sessions" disabled={hasTimedAgenda}>چند سانس در یک روز</option>
      <option value="weekly" disabled={hasTimedAgenda}>تکرار هفتگی</option>
    </select></label>
    <p className={styles.hint}>تاریخ‌ها شمسی و ساعت‌ها به وقت تهران هستند.</p>
    {hasTimedAgenda && <p className={styles.hint}>{TIMED_AGENDA_SCHEDULE_ERROR}</p>}
    {value.mode === "single" ? <div className={styles.dates}>
      {calendar("شروع رویداد", "date", "time")}{calendar("پایان رویداد", "endDate", "endTime")}
    </div> : <>
      {value.mode === "weekly" && <fieldset className={styles.weekdays}><legend>روزهای برگزاری در هر هفته</legend>
        {[6, 0, 1, 2, 3, 4, 5].map(day => <label className={styles.check} key={day}><input type="checkbox" checked={value.weekdays.includes(day)} onChange={event => set({ weekdays: event.target.checked ? [...value.weekdays, day] : value.weekdays.filter(d => d !== day) })} />{scheduleWeekdays[day]}</label>)}
      </fieldset>}
      <div className={styles.dates}>
        {calendar(value.mode === "weekly" ? "شروع تکرار" : "تاریخ برگزاری", "date", "time", true)}
        {value.mode === "weekly" && <div>
          <label className={styles.check}><input type="checkbox" checked={value.until !== null} onChange={event => set({ until: event.target.checked ? value.date : null })} />تعیین تاریخ پایان تکرار</label>
          {value.until !== null ? calendar("پایان تکرار (شامل این روز)", "until", "endTime", true) : <p className={styles.hint}>تکرار تا زمانی که رویداد را از انتشار خارج کنید ادامه دارد.</p>}
        </div>}
      </div>
      <div className={styles.sessions}>
        <h3>سانس‌ها</h3><p className={styles.hint}>{value.mode === "weekly" ? "این سانس‌ها در همهٔ روزهای انتخاب‌شده تکرار می‌شوند. " : ""}پایان هر سانس در همان روز است؛ سانس‌ها نباید هم‌پوشانی داشته باشند.</p>
        {value.sessions.map((session, index) => <div className={styles.slot} key={index}>
          <span className={styles.number}>{(index + 1).toLocaleString("fa-IR")}</span>
          {(["start", "end"] as const).map(key => <label key={key}>{key === "start" ? "شروع" : "پایان"} سانس {(index + 1).toLocaleString("fa-IR")}
            <input ref={input => input?.setCustomValidity("")} type="time" step={300} dir="ltr" required value={session[key]} onInvalid={event => event.currentTarget.setCustomValidity(`ساعت ${key === "start" ? "شروع" : "پایان"} سانس ${(index + 1).toLocaleString("fa-IR")} را کامل و با دقیقهٔ مضرب پنج وارد کنید.`)} onChange={event => { event.target.setCustomValidity(""); set({ sessions: value.sessions.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item) }); }} />
          </label>)}
          <button type="button" className={styles.remove} disabled={value.sessions.length === 1} aria-label={`حذف سانس ${index + 1}`} onClick={() => set({ sessions: value.sessions.filter((_, i) => i !== index) })}><Trash2 size={18} /></button>
        </div>)}
        <button type="button" className="button outline" disabled={value.sessions.length >= MAX_MANUAL_SESSIONS} onClick={() => set({ sessions: [...value.sessions, { start: "", end: "" }] })}><Plus size={18} />افزودن سانس</button>
      </div>
    </>}
  </fieldset>;
}
