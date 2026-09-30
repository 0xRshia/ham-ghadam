"use client";

import { faContent, faMessages } from "@/locales/domain-fa";
import { ButtonLabel } from "@/components/ui/button-label";
import { useEffect, useRef, useState } from "react";
import { DayPicker } from "@daypicker/persian";
import { TZDate } from "react-day-picker";
import calendarClassNames from "react-day-picker/style.module.css";
import { ArrowDown, ArrowUp, ImagePlus, MapPin, Trash2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Choice, ErrorBox } from "@/components/event/shared";
import { api } from "@/lib/client";
import { LOCATION_URL_ERROR, parseLocationUrl } from "@/lib/location-url";
import {
  IMAGE_MIME_TYPES,
  MAX_EVENT_IMAGE_BYTES,
  MAX_GALLERY_IMAGES,
  MAX_IMAGE_BYTES,
} from "@/lib/media-policy";
import { parsePersianDate, persianInput } from "@/lib/persian-date";
import { defaultRegistrationDeadline, validRegistrationDeadline } from "@/lib/registration";
import { useDeadlineClock } from "@/hooks/use-deadline-clock";
import { categories, date, digits, fa } from "@/lib/types";
import styles from "./event-form.module.css";

const TIME_ZONE = "Asia/Tehran";
const DAY = 86400000;

type SelectedImage = { id: string; file: File; url: string };

function timeValue(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function timeLabel(minutes: number) {
  return timeValue(minutes).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

function validateImages(files: File[]) {
  if (files.some((file) => !IMAGE_MIME_TYPES.some((type) => type === file.type)))
    return faContent.imageTypeInvalid;
  if (files.some((file) => file.size === 0 || file.size > MAX_IMAGE_BYTES))
    return faContent.imageSizeInvalid;
  if (files.reduce((total, file) => total + file.size, 0) > MAX_EVENT_IMAGE_BYTES)
    return faContent.combinedImagesTooLarge;
  return "";
}

export function EventForm({
  saving,
  onSavingChange,
  onCreated,
  onCancel,
}: {
  saving: boolean;
  onSavingChange: (saving: boolean) => void;
  onCreated: () => Promise<void>;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState("coffee");
  const [bounds] = useState(() => {
    const now = Date.now();
    const today = new TZDate(now, TIME_ZONE);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new TZDate(+today + DAY, TIME_ZONE);
    const lastDay = new TZDate(now + 730 * DAY, TIME_ZONE);
    return { today, tomorrow, lastDay, now };
  });
  const [selectedDate, setSelectedDate] = useState<Date>(bounds.tomorrow);
  const [startTime, setStartTime] = useState(18 * 60);
  const [endTime, setEndTime] = useState(20 * 60);
  const [customRegistration, setCustomRegistration] = useState<{ date: Date; time: number } | null>(null);
  const eventStart = parsePersianDate(persianInput(+selectedDate), timeValue(startTime));
  const now = useDeadlineClock(eventStart - DAY) ?? bounds.now;
  const registrationDate = customRegistration?.date ?? new TZDate(defaultRegistrationDeadline(eventStart, now), TIME_ZONE);
  const registrationTime = customRegistration?.time ?? startTime;
  const registrationEnd = parsePersianDate(persianInput(+registrationDate), timeValue(registrationTime));
  const registrationValid = validRegistrationDeadline(registrationEnd, eventStart, now);
  const [cover, setCover] = useState<SelectedImage | null>(null);
  const [gallery, setGallery] = useState<SelectedImage[]>([]);
  const [saveError, setSaveError] = useState("");
  const [mediaError, setMediaError] = useState("");
  const [mapsError, setMapsError] = useState("");
  const imageUrls = useRef(new Set<string>());
  const submitting = useRef(false);
  const timesValid = endTime > startTime;

  useEffect(() => {
    const urls = imageUrls.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
      urls.clear();
    };
  }, []);

  function preview(file: File): SelectedImage {
    const url = URL.createObjectURL(file);
    imageUrls.current.add(url);
    return { id: crypto.randomUUID(), file, url };
  }

  function release(image: SelectedImage) {
    URL.revokeObjectURL(image.url);
    imageUrls.current.delete(image.url);
  }

  function chooseCover(file: File | undefined) {
    if (!file) return;
    const error = validateImages([file, ...gallery.map((image) => image.file)]);
    setMediaError(error);
    if (error) return;
    if (cover) release(cover);
    setCover(preview(file));
  }

  function addGallery(files: File[]) {
    if (!files.length) return;
    if (gallery.length + files.length > MAX_GALLERY_IMAGES) {
      setMediaError(faContent.galleryImageLimit);
      return;
    }
    const error = validateImages([
      ...(cover ? [cover.file] : []),
      ...gallery.map((image) => image.file),
      ...files,
    ]);
    setMediaError(error);
    if (error) return;
    setGallery([...gallery, ...files.map(preview)]);
  }

  function moveImage(index: number, direction: -1 | 1) {
    const images = [...gallery];
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    [images[index], images[target]] = [images[target], images[index]];
    setGallery(images);
  }

  async function save(form: HTMLFormElement) {
    if (submitting.current) return;
    setSaveError("");
    const values = Object.fromEntries(new FormData(form));
    const location = parseLocationUrl(values.maps_url);
    if (!location) {
      setMapsError(LOCATION_URL_ERROR);
      return;
    }
    const dateValue = persianInput(+selectedDate);
    const start = parsePersianDate(dateValue, timeValue(startTime));
    if (!timesValid || !Number.isFinite(start) || start <= Date.now() || start > Date.now() + 730 * DAY) {
      setSaveError(faContent.eventTimesInvalid);
      return;
    }
    if (!validRegistrationDeadline(registrationEnd, start, Date.now())) {
      setSaveError(faContent.registrationTimeInvalid);
      return;
    }
    const imageError = validateImages([
      ...(cover ? [cover.file] : []),
      ...gallery.map((image) => image.file),
    ]);
    if (imageError) {
      setMediaError(imageError);
      return;
    }
    for (const key of ["price", "capacity"])
      values[key] = digits(String(values[key] ?? ""));
    const multipart = new FormData();
    multipart.set("data", JSON.stringify({
      ...values,
      category,
      maps_url: location.url,
      date: dateValue,
      time: timeValue(startTime),
      endTime: timeValue(endTime),
      registrationDate: persianInput(+registrationDate),
      registrationTime: timeValue(registrationTime),
    }));
    if (cover) multipart.set("cover", cover.file);
    for (const image of gallery) multipart.append("gallery", image.file);
    submitting.current = true;
    onSavingChange(true);
    try {
      await api("/api/host", multipart);
      await onCreated();
    } catch (error) {
      setSaveError((error as Error).message);
    } finally {
      submitting.current = false;
      onSavingChange(false);
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void save(event.currentTarget);
      }}
      aria-busy={saving}
    >
      <fieldset className={styles.section} disabled={saving}>
        <legend><span className={styles.step}>۰۱</span>{faContent.aboutEvent}</legend>
        <div className={styles.fields}>
          <label className={styles.wide}>
            {faContent.eventTitle}<input name="title" required maxLength={120} placeholder={faContent.eventTitleExample} />
          </label>
          <label className={styles.wide}>
            {faContent.aboutEvent}<textarea name="description" required maxLength={4000} rows={3} placeholder={faContent.eventDescriptionHint} />
          </label>
          <div className={styles.field}>
            <span>{faContent.category}</span>
            <Choice label={faContent.eventCategory} value={category} onChange={setCategory} options={categories.filter((item) => item.id !== "all").map((item) => ({ value: item.id, label: item.label }))} />
          </div>
          <label>
            {faContent.venueName}<input name="venue" required maxLength={120} />
          </label>
          <label>
            {faContent.city}<input name="city" defaultValue={faContent.tehran} required maxLength={80} />
          </label>
          <label>
            {faContent.addressOptional}<input name="address" maxLength={300} />
          </label>
          <label className={styles.wide}>
            <span className={styles.iconLabel}><MapPin size={17} />{faContent.venueLink}</span>
            <input
              name="maps_url"
              type="url"
              dir="ltr"
              required
              maxLength={2048}
              placeholder={faContent.completeVenueLink}
              aria-describedby={mapsError ? "event-maps-help event-maps-error" : "event-maps-help"}
              aria-invalid={!!mapsError}
              onBlur={(event) => {
                const value = event.currentTarget.value;
                const error = value.trim() && !parseLocationUrl(value) ? LOCATION_URL_ERROR : "";
                event.currentTarget.setCustomValidity(error);
                setMapsError(error);
              }}
              onChange={(event) => {
                event.currentTarget.setCustomValidity("");
                setMapsError("");
              }}
            />
          </label>
          <p id="event-maps-help" className={`${styles.help} ${styles.wide}`}>
            {faContent.venueLinkHint}</p>
          {mapsError && <p id="event-maps-error" role="alert" className={`${styles.inlineError} ${styles.wide}`}>{mapsError}</p>}
        </div>
      </fieldset>

      <fieldset className={styles.section} disabled={saving}>
        <legend><span className={styles.step}>۰۲</span>{faContent.dateTime}</legend>
        <p id="event-time-help" className={styles.help}>{faContent.tehranFiveMinuteHint}</p>
        <div className={styles.schedule}>
          <div className={styles.calendarPanel}>
            <DayPicker
              mode="single"
              required
              selected={selectedDate}
              onSelect={setSelectedDate}
              defaultMonth={bounds.tomorrow}
              today={bounds.today}
              timeZone={TIME_ZONE}
              startMonth={bounds.today}
              endMonth={bounds.lastDay}
              disabled={[{ before: bounds.today }, { after: bounds.lastDay }]}
              captionLayout="dropdown"
              navLayout="around"
              classNames={calendarClassNames}
              className={styles.calendar}
              aria-label={faContent.chooseEventDate}
              footer={<p className={styles.selectedDate}>{date(+selectedDate, true)}</p>}
            />
          </div>
          <div className={styles.times}>
            <div className={styles.timeField}>
              <div className={styles.timeHeading}>
                <span id="event-start-label">{faContent.startTime}</span>
                <output htmlFor="event-start-time" dir="ltr">{timeLabel(startTime)}</output>
              </div>
              <Slider
                value={[startTime]}
                onValueChange={([value]) => setStartTime(value)}
                min={0}
                max={1430}
                step={5}
                dir="ltr"
                disabled={saving}
                className={styles.timeSlider}
                thumbProps={{ id: "event-start-time", "aria-labelledby": "event-start-label", "aria-describedby": "event-time-help", "aria-valuetext": timeLabel(startTime) }}
              />
              <div className={styles.timeScale} dir="ltr"><span>۰۰:۰۰</span><span>۲۳:۵۰</span></div>
            </div>
            <div className={styles.timeField}>
              <div className={styles.timeHeading}>
                <span id="event-end-label">{faContent.sameDayEndTime}</span>
                <output htmlFor="event-end-time" dir="ltr">{timeLabel(endTime)}</output>
              </div>
              <Slider
                value={[endTime]}
                onValueChange={([value]) => setEndTime(value)}
                min={5}
                max={1435}
                step={5}
                dir="ltr"
                disabled={saving}
                className={styles.timeSlider}
                thumbProps={{ id: "event-end-time", "aria-labelledby": "event-end-label", "aria-describedby": timesValid ? "event-time-help" : "event-time-help event-time-error", "aria-valuetext": timeLabel(endTime), "aria-invalid": !timesValid }}
              />
              <div className={styles.timeScale} dir="ltr"><span>۰۰:۰۵</span><span>۲۳:۵۵</span></div>
            </div>
            {!timesValid && <p id="event-time-error" role="alert" className={styles.inlineError}>{faContent.endAfterStart}</p>}
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.section} disabled={saving}>
        <legend><span className={styles.step}>۰۳</span>{faContent.registrationDeadline}</legend>
        <p id="registration-time-help" className={styles.help}>
          {faContent.registrationDefaultHint}</p>
        <div className={styles.schedule}>
          <div className={styles.calendarPanel}>
            <DayPicker
              key={customRegistration ? "custom-registration" : persianInput(+registrationDate)}
              mode="single"
              required
              selected={registrationDate}
              onSelect={(value) => setCustomRegistration({ date: value, time: registrationTime })}
              defaultMonth={registrationDate}
              today={bounds.today}
              timeZone={TIME_ZONE}
              startMonth={bounds.today}
              endMonth={selectedDate}
              disabled={[{ before: bounds.today }, { after: selectedDate }]}
              captionLayout="dropdown"
              navLayout="around"
              classNames={calendarClassNames}
              className={styles.calendar}
              aria-label={faContent.chooseRegistrationDate}
              footer={<p className={styles.selectedDate}>{date(+registrationDate, true)}</p>}
            />
          </div>
          <div className={styles.times}>
            <div className={styles.timeField}>
              <div className={styles.timeHeading}>
                <span id="registration-time-label">{faContent.registrationEndTime}</span>
                <output htmlFor="registration-time" dir="ltr">{timeLabel(registrationTime)}</output>
              </div>
              <Slider
                value={[registrationTime]}
                onValueChange={([value]) => setCustomRegistration({ date: registrationDate, time: value })}
                min={0}
                max={1435}
                step={5}
                dir="ltr"
                disabled={saving}
                className={styles.timeSlider}
                thumbProps={{ id: "registration-time", "aria-labelledby": "registration-time-label", "aria-describedby": registrationValid ? "registration-time-help" : "registration-time-help registration-time-error", "aria-valuetext": timeLabel(registrationTime), "aria-invalid": !registrationValid }}
              />
              <div className={styles.timeScale} dir="ltr"><span>۰۰:۰۰</span><span>۲۳:۵۵</span></div>
            </div>
            {!registrationValid && <p id="registration-time-error" role="alert" className={styles.inlineError}>{faContent.registrationTimeInvalid}</p>}
            {customRegistration && <button type="button" className="text-button" onClick={() => setCustomRegistration(null)}>{faContent.resetDeadline}</button>}
          </div>
        </div>
      </fieldset>

      <fieldset className={styles.section} disabled={saving}>
        <legend><span className={styles.step}>۰۴</span>{faContent.ticketsCapacity}</legend>
        <div className={styles.fields}>
          <label>
            {faContent.personPriceToman}<input name="price" inputMode="numeric" required defaultValue="۰" />
          </label>
          <label>
            {faContent.optionalCapacity}<input name="capacity" inputMode="numeric" />
          </label>
          <p className={`${styles.help} ${styles.wide}`}>{faContent.pricingHint}</p>
        </div>
      </fieldset>

      <fieldset className={styles.section} disabled={saving}>
        <legend className={styles.iconLabel}><span className={styles.step}>۰۵</span>{faContent.eventImagesOptional}</legend>
        <p id="event-images-help" className={styles.help}>{faContent.imageRequirements}</p>
        <div className={styles.uploads}>
          <label className={styles.uploadField}>
            {faContent.eventCover}<span className={styles.help}>{faContent.coverPlacementHint}</span>
            <span className={styles.uploadAction}><ImagePlus size={18} aria-hidden="true" />{faContent.selectCover}</span>
            <input type="file" accept={IMAGE_MIME_TYPES.join(",")} aria-describedby="event-images-help" onChange={(event) => {
              chooseCover(event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }} />
          </label>
          {cover && (
            <div className={styles.coverPreview}>
              {/* Local file previews use object URLs and do not pass through the image optimizer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cover.url} alt={faContent.eventCoverPreview} />
              <div className={styles.imageCaption}>
                <bdi title={cover.file.name}>{cover.file.name}</bdi>
                <button className={styles.imageButton} type="button" aria-label={faContent.removeCover} onClick={() => {
                  release(cover);
                  setCover(null);
                  setMediaError("");
                }}><Trash2 size={17} />{faContent.remove}</button>
              </div>
            </div>
          )}
          <label className={styles.uploadField}>
            {faContent.galleryPhotosOpenParenthesis}{fa(gallery.length)} {" " + faContent.from + " "}{fa(MAX_GALLERY_IMAGES)})
            <span className={styles.help}>{faContent.galleryHint}</span>
            <span className={styles.uploadAction}><ImagePlus size={18} aria-hidden="true" />{faContent.selectEventPhotos}</span>
            <input type="file" accept={IMAGE_MIME_TYPES.join(",")} multiple disabled={saving || gallery.length >= MAX_GALLERY_IMAGES} aria-describedby="event-images-help" onChange={(event) => {
              addGallery(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = "";
            }} />
          </label>
          {gallery.length > 0 && (
            <ol className={styles.gallery} aria-label={faContent.photosInOrder}>
              {gallery.map((image, index) => (
                <li key={image.id} className={styles.galleryItem}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={faMessages.previewPhoto(String(fa(index + 1)))} />
                  <div className={styles.galleryDetails}>
                    <span>{faContent.photo + " "}{fa(index + 1)}</span>
                    <bdi title={image.file.name}>{image.file.name}</bdi>
                    <div className={styles.imageActions}>
                      <button type="button" className={styles.imageButton} disabled={index === 0} aria-label={faMessages.movePhotoEarlier(String(fa(index + 1)))} onClick={() => moveImage(index, -1)}><ArrowUp size={17} /></button>
                      <button type="button" className={styles.imageButton} disabled={index === gallery.length - 1} aria-label={faMessages.movePhotoLater(String(fa(index + 1)))} onClick={() => moveImage(index, 1)}><ArrowDown size={17} /></button>
                      <button type="button" className={styles.imageButton} aria-label={faMessages.removePhoto(String(fa(index + 1)))} onClick={() => {
                        release(image);
                        setGallery(gallery.filter((item) => item.id !== image.id));
                        setMediaError("");
                      }}><Trash2 size={17} />{faContent.remove}</button>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
          {mediaError && <ErrorBox message={mediaError} />}
        </div>
      </fieldset>
      {saveError && <ErrorBox message={saveError} />}
      <div className={styles.actions}>
        <button className="button" disabled={saving} aria-busy={saving}><ButtonLabel busy={saving} pending={faContent.publishing}>{faContent.publishEvent}</ButtonLabel></button>
        <button className="button outline" type="button" onClick={onCancel} disabled={saving}>{faContent.cancel}</button>
      </div>
    </form>
  );
}
