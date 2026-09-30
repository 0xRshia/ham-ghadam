"use client";
import { faContent, faMessages } from "@/locales/domain-fa";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import { Eye, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { AppLink } from "@/components/event/app-navigation";
import { useAuth } from "@/components/event/auth-context";
import { Blank, ErrorBox, Loading } from "@/components/event/shared";
import { AdminNav } from "@/components/content/admin-nav";
import styles from "@/components/content/admin-pages.module.css";
import { NumberedPagination } from "@/components/ui/numbered-pagination";
import { api } from "@/lib/client";
import { date, fa } from "@/lib/types";

type Article = { id: string; slug: string; title: string; excerpt: string; category: string; author_name: string; status: string; published_at: number | null; updated_at: number; media_id: string | null; body?: string };
type Result = { items: Article[]; total: number; page: number; totalPages: number };
type Draft = { slug: string; title: string; excerpt: string; body: string; category: string; author_name: string; status: "draft" | "published" };
const blank: Draft = { slug: "", title: "", excerpt: "", body: "", category: "", author_name: faContent.editorialTeam, status: "draft" };

export default function AdminArticles() {
  const { user, loading: authLoading } = useAuth();
  const [page, setPage] = useState(1), [filter, setFilter] = useState("all");
  const [result, setResult] = useState<Result | null>(null), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Article | null>(null), [editorOpen, setEditorOpen] = useState(false), [draft, setDraft] = useState<Draft>(blank);
  const [cover, setCover] = useState<File | null>(null), [coverPreview, setCoverPreview] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true); setError("");
    try { const query = new URLSearchParams({ page: String(page), ...(filter === "all" ? {} : { status: filter }) }); const response = await api<Result>(`/api/admin/articles?${query}`); if (version === requestVersion.current) setResult(response); }
    catch (cause) { if (version === requestVersion.current) setError((cause as Error).message); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [page, filter]);
  useEffect(() => { if (!user?.isAdmin) return; const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [user?.id, user?.isAdmin, authLoading, load]);
  useEffect(() => { const current = coverPreview.startsWith("blob:") ? coverPreview : ""; return () => { if (current) URL.revokeObjectURL(current); }; }, [coverPreview]);
  function setCoverFile(file: File | null) { setCover(file); setCoverPreview(file ? URL.createObjectURL(file) : selected?.media_id ? `/api/article-media/${encodeURIComponent(selected.media_id)}` : ""); }
  function reset() { setSelected(null); setEditorOpen(false); setDraft(blank); setCover(null); setCoverPreview(""); setNotice(""); setError(""); }
  function startNew() { setSelected(null); setEditorOpen(true); setDraft(blank); setCover(null); setCoverPreview(""); setNotice(""); setError(""); }
  async function edit(item: Article) {
    setError(""); setBusy(true);
    try { const full = await api<Article>(`/api/admin/articles/${encodeURIComponent(item.id)}`); setSelected(full); setEditorOpen(true); setDraft({ slug: full.slug, title: full.title, excerpt: full.excerpt, body: full.body ?? "", category: full.category, author_name: full.author_name, status: full.status === "published" ? "published" : "draft" }); setCover(null); setCoverPreview(full.media_id ? `/api/article-media/${encodeURIComponent(full.media_id)}` : ""); setNotice(""); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(""); setNotice("");
    try {
      const saved = await api<Article>(selected ? `/api/admin/articles/${encodeURIComponent(selected.id)}` : "/api/admin/articles", draft, selected ? "PUT" : "POST");
      setSelected({ ...saved, media_id: selected?.media_id ?? null });
      if (cover) {
        const data = new FormData(); data.append("data", JSON.stringify({})); data.append("cover", cover);
        try {
          const uploaded = await api<{ id: string }>(`/api/admin/articles/${encodeURIComponent(saved.id)}/cover`, data, "POST");
          setCoverPreview(`/api/article-media/${encodeURIComponent(uploaded.id)}`); setSelected({ ...saved, media_id: uploaded.id }); setCover(null);
        } catch (cause) {
          setNotice(draft.status === "published" ? faContent.articlePublished : faContent.draftSaved);
          setError(faMessages.articleCoverFailed(String((cause as Error).message)));
          await load();
          return;
        }
      }
      setNotice(draft.status === "published" ? faContent.articlePublished : faContent.draftSaved); await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function remove(item: Article) {
    if (!window.confirm(faMessages.deleteArticleConfirm(String(item.title)))) return;
    setBusy(true); setError("");
    try { await api(`/api/admin/articles/${encodeURIComponent(item.id)}`, undefined, "DELETE"); if (selected?.id === item.id) reset(); await load(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function removeCover() {
    if (!selected || busy) return; setBusy(true); setError("");
    try { await api(`/api/admin/articles/${encodeURIComponent(selected.id)}/cover`, undefined, "DELETE"); setCoverPreview(""); setSelected({ ...selected, media_id: null }); setNotice(faContent.coverRemoved); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  if (authLoading) return <main className="container subpage"><Loading variant="host" /></main>;
  if (!user?.isAdmin) return <main className="container subpage"><Blank title={faContent.adminAccessRequired} description={faContent.articlesAdminOnly}><AppLink className="button" href="/admin/login">{faContent.adminLogin}</AppLink></Blank></main>;
  if (loading && !result) return <main className="container subpage"><Loading variant="host" /></main>;
  const set = (key: keyof Draft, value: string) => setDraft((current) => ({ ...current, [key]: value }));
  return <main className={`container ${styles.adminPage}`}>
    <AdminNav active="/admin/articles" />
    <header className={styles.adminHeading}><div><span className="eyebrow">{faContent.magazineContent}</span><h1>{faContent.manageArticles}</h1><p>{faContent.initialDraftsHint}</p></div><button className="button" onClick={startNew}><Plus size={17} />{faContent.newArticle}</button></header>
    {error && <ErrorBox message={error} retry={() => void load()} />}{notice && <p className={styles.success} role="status">{notice}</p>}
    {editorOpen ? <section className={styles.adminCard}>
      <h2>{selected ? faContent.editArticle : faContent.newArticle}</h2>
      <form className={styles.editorGrid} onSubmit={(event) => void save(event)}>
        <div className={styles.editorFields}>
          <label className={styles.editorField}>{faContent.title}<input required maxLength={180} value={draft.title} onChange={(e) => set("title", e.target.value)} /></label>
          <label className={styles.editorField}>{faContent.slugHint}<input required maxLength={140} dir="ltr" value={draft.slug} onChange={(e) => set("slug", e.target.value)} /></label>
          <label className={styles.editorField}>{faContent.summary}<textarea rows={3} maxLength={400} value={draft.excerpt} onChange={(e) => set("excerpt", e.target.value)} /></label>
          <div className={styles.adminGrid}>
            <label className={styles.editorField}>{faContent.category}<input maxLength={80} value={draft.category} onChange={(e) => set("category", e.target.value)} /></label>
            <label className={styles.editorField}>{faContent.authorName}<input required maxLength={100} value={draft.author_name} onChange={(e) => set("author_name", e.target.value)} /></label>
          </div>
          <label className={styles.editorField}>{faContent.status}<select value={draft.status} onChange={(e) => set("status", e.target.value)}><option value="draft">{faContent.draft}</option><option value="published">{faContent.published}</option></select></label>
          <label className={styles.editorField}>{faContent.markdownBody}<textarea className={styles.articleText} required maxLength={50000} value={draft.body} onChange={(e) => set("body", e.target.value)} /></label>
          <label className={styles.editorField}>{faContent.coverUploadHint}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)} /></label>
          {coverPreview && <div><Image className={styles.coverPreview} src={coverPreview} alt={faContent.coverPreview} width={760} height={400} unoptimized />{selected && <button type="button" className="button outline" disabled={busy} onClick={() => void removeCover()}><Trash2 size={15} />{faContent.removeCover}</button>}</div>}
          <div className={styles.adminActions}><button className="button" disabled={busy} aria-busy={busy}><Upload size={16} />{busy ? faContent.saving : faContent.saveArticle}</button><button type="button" className="button outline" disabled={busy} onClick={reset}>{faContent.closeEditor}</button></div>
        </div>
        <div><strong>{faContent.textPreview}</strong><article className={styles.preview}><ReactMarkdown skipHtml disallowedElements={["img"]}>{draft.body || faContent.articlePreviewHint}</ReactMarkdown></article></div>
      </form>
    </section> : <>
      <div className={styles.adminControls}><label htmlFor="article-filter">{faContent.status}</label><select id="article-filter" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(1); }}><option value="all">{faContent.all}</option><option value="draft">{faContent.draft}</option><option value="published">{faContent.published}</option></select><span>{fa(result?.total ?? 0)} {" " + faContent.article}</span></div>
      {result?.items.length ? <section className={styles.adminTable}>{result.items.map((item) => <article className={styles.adminRow} key={item.id}><div><h2>{item.title}</h2><p>{item.status === "published" ? faMessages.articlePublishedDate(String(date(item.published_at ?? item.updated_at, true))) : faMessages.draftEditedDate(String(date(item.updated_at, true)))}</p></div><div className={styles.adminActions}>{item.status === "published" && <AppLink className="button outline" href={`/blog/${encodeURIComponent(item.slug)}`}><Eye size={15} />{faContent.show}</AppLink>}<button className="button outline" disabled={busy} onClick={() => void edit(item)}><Pencil size={15} />{faContent.edit}</button><button className="button outline" disabled={busy} onClick={() => void remove(item)}><Trash2 size={15} />{faContent.remove}</button></div></article>)}</section> : !loading && <Blank title={faContent.noArticles} description={faContent.newArticleHint} />}
      {result && <NumberedPagination page={result.page} totalPages={result.totalPages} onPageChange={setPage} disabled={loading} />}
    </>}
  </main>;
}
