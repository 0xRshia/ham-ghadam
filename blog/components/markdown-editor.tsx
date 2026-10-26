"use client";

import { useId, useRef, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";

export function MarkdownPreview({ body }: { body: string }) {
  return <div className="admin-markdown prose"><ReactMarkdown skipHtml
    urlTransform={(url, key) => key === "src" ? (/^\/media\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.webp$/.test(url) ? url : "") : defaultUrlTransform(url)}
    components={{ h1: "h2" }}>{body}</ReactMarkdown></div>;
}

export function MarkdownEditor({ value, onChange, uploadImage, label = "متن", required = false, disabled = false, maxLength = 100000 }: {
  value: string;
  onChange: (value: string) => void;
  uploadImage: (file: File) => Promise<string>;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
}) {
  const id = useId();
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);

  function insert(before: string, after = "", defaultText = "") {
    const textarea = input.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || defaultText;
    onChange(value.slice(0, start) + before + selected + after + value.slice(end));
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  async function upload(file: File) {
    setUploadError("");
    setUploading(true);
    try {
      const url = await uploadImage(file);
      insert("\n![", `](${url})\n`, "توضیح تصویر");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "بارگذاری تصویر انجام نشد.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return <div className="admin-markdown-editor">
    <div className="admin-field-heading"><label htmlFor={id}>{label}{required ? " *" : ""}</label>
      <button type="button" className="admin-text-button" onClick={() => setPreview(!preview)} aria-pressed={preview}>
        {preview ? "بازگشت به نوشتن" : "پیش‌نمایش متن"}
      </button>
    </div>
    {!preview && <div className="admin-toolbar" aria-label="قالب‌بندی متن">
      <button type="button" disabled={disabled || uploading} onClick={() => insert("\n## ", "\n", "عنوان بخش")}>عنوان بخش</button>
      <button type="button" disabled={disabled || uploading} onClick={() => insert("**", "**", "متن پررنگ")}><strong>پررنگ</strong></button>
      <button type="button" disabled={disabled || uploading} onClick={() => insert("[", "](https://)", "متن پیوند")}>پیوند</button>
      <button type="button" disabled={disabled || uploading} onClick={() => insert("\n- ", "\n", "آیتم فهرست")}>فهرست</button>
      <button type="button" disabled={disabled || uploading} onClick={() => fileInput.current?.click()}>{uploading ? "در حال بارگذاری…" : "افزودن تصویر"}</button>
    </div>}
    {preview ? <section className="admin-live-preview" aria-label="پیش‌نمایش متن">{value ? <MarkdownPreview body={value} /> : <p className="admin-muted">هنوز متنی نوشته نشده است.</p>}</section>
      : <textarea id={id} ref={input} value={value} required={required} maxLength={maxLength} rows={16} disabled={disabled || uploading}
        onChange={(event) => onChange(event.target.value)} className="admin-body-input" aria-describedby={`${id}-hint`} />}
    <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="admin-hidden-input" tabIndex={-1}
      aria-label="بارگذاری تصویر در متن" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
    <small id={`${id}-hint`}>از عنوان بخش، فهرست و پیوند برای خوانایی متن استفاده کنید. متن جایگزین تصویر را پس از بارگذاری ویرایش کنید.</small>
    {uploadError && <p role="alert" className="admin-error">{uploadError}</p>}
  </div>;
}
