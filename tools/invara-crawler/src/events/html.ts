import { load } from "cheerio";
import type { Data } from "../model.js";
import { object } from "../model.js";

export interface ParsedPage {
  title: string; heading: string; text: string; meta: Data; links: { url: string; text: string }[];
  images: { url: string; alt: string }[]; jsonld: Data[]; router: Data | null; flight: unknown[];
}

export function plainText(html: unknown): string {
  if (typeof html !== "string") return "";
  const $ = load(html, null, false);
  $("script,style,noscript").remove();
  $("br").replaceWith("\n");
  $("p,div,li,h1,h2,h3,h4,section").append("\n");
  return $.root().text().replace(/\r/g, "").replace(/[\t ]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function decodeRouterPool(pool: unknown[]): unknown {
  const cache = new Map<number, unknown>();
  const active = new Set<number>();
  const unpack = (index: number, depth = 0): unknown => {
    if (index < 0 || depth > 100 || active.has(index)) return null;
    if (cache.has(index)) return cache.get(index);
    if (index >= pool.length) throw new Error("Invalid public React Router reference");
    const value = pool[index];
    active.add(index);
    let result: unknown = value;
    if (Array.isArray(value)) {
      if (value[0] === "Date") result = value[1];
      else if (typeof value[0] === "string") result = { type: value[0], values: value.slice(1).map(item => typeof item === "number" ? unpack(item, depth + 1) : item) };
      else result = value.map(item => typeof item === "number" ? unpack(item, depth + 1) : item);
    } else if (value && typeof value === "object") {
      const resultObject: Data = Object.create(null);
      for (const [key, ref] of Object.entries(value)) {
        const decodedKey = /^_\d+$/.test(key) ? String(unpack(Number(key.slice(1)), depth + 1)) : key;
        resultObject[decodedKey] = typeof ref === "number" ? unpack(ref, depth + 1) : ref;
      }
      result = resultObject;
    }
    active.delete(index); cache.set(index, result); return result;
  };
  return unpack(0);
}

export function decodeFlight(wire: string): unknown[] {
  const buffer = Buffer.from(wire, "utf8");
  const records = new Map<string, unknown>();
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer[offset] === 10 || buffer[offset] === 13) { offset++; continue; }
    const colon = buffer.indexOf(58, offset);
    if (colon < 0) break;
    const id = buffer.subarray(offset, colon).toString();
    if (!/^[\da-f]+$/i.test(id)) {
      const next = buffer.indexOf(10, offset); if (next < 0) break; offset = next + 1; continue;
    }
    const start = colon + 1;
    if (buffer[start] === 84) {
      const comma = buffer.indexOf(44, start);
      if (comma < 0) break;
      const length = Number.parseInt(buffer.subarray(start + 1, comma).toString(), 16);
      if (!Number.isFinite(length) || length < 0 || comma + 1 + length > buffer.length) throw new Error("Incomplete public Flight text record");
      records.set(id, buffer.subarray(comma + 1, comma + 1 + length).toString("utf8"));
      offset = comma + 1 + length; continue;
    }
    const newline = buffer.indexOf(10, start);
    const end = newline < 0 ? buffer.length : newline;
    const value = buffer.subarray(start, end).toString();
    if (/^[\[{"\d-]|^(null|true|false)$/.test(value)) {
      try { records.set(id, JSON.parse(value)); } catch { /* Imports and binary records are not event data. */ }
    }
    offset = end + 1;
  }
  const cache = new Map<string, unknown>();
  const active = new Set<string>();
  const resolve = (value: unknown, depth = 0): unknown => {
    if (depth > 100) return null;
    if (typeof value === "string") {
      if (value === "$undefined") return null;
      if (value.startsWith("$$")) return value.slice(1);
      if (value.startsWith("$D")) return value.slice(2);
      const reference = value.match(/^\$(?:L|@)?([\da-f]+)$/i)?.[1];
      if (reference && records.has(reference)) {
        if (active.has(reference)) return null;
        if (cache.has(reference)) return cache.get(reference);
        active.add(reference);
        const result = resolve(records.get(reference), depth + 1);
        active.delete(reference); cache.set(reference, result); return result;
      }
      return value;
    }
    if (Array.isArray(value)) return value.map(item => resolve(item, depth + 1));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolve(item, depth + 1)]));
    return value;
  };
  return [...records.values()].filter(value => value !== null && typeof value === "object").map(value => resolve(value));
}

export function* walkObjects(value: unknown, seen = new Set<unknown>(), depth = 0): Generator<Data> {
  if (!value || typeof value !== "object" || depth > 80 || seen.has(value)) return;
  seen.add(value);
  if (!Array.isArray(value)) yield value as Data;
  for (const item of Object.values(value)) yield* walkObjects(item, seen, depth + 1);
}

export function parsePage(html: string, url: string): ParsedPage {
  const $ = load(html);
  const scripts = $("script").toArray().map(script => $(script).text());
  const jsonld: Data[] = [];
  $("script[type='application/ld+json']").each((_, script) => {
    try {
      const parsed = JSON.parse($(script).text());
      jsonld.push(...(Array.isArray(parsed) ? parsed : [parsed]).map(object));
    } catch { /* A malformed unrelated SEO block must not discard valid hydration data. */ }
  });
  let router: Data | null = null;
  const routerChunks = scripts.flatMap(script => [...script.matchAll(/streamController\.enqueue\(("(?:[^"\\]|\\.)*")\)/g)].map(match => JSON.parse(match[1]) as string));
  if (routerChunks.length) {
    const first = routerChunks.join("").split("\n")[0];
    const pool = JSON.parse(first);
    if (!Array.isArray(pool)) throw new Error("Unexpected public React Router transport");
    router = object(decodeRouterPool(pool));
  }
  const chunks = scripts.flatMap(script => [...script.matchAll(/self\.__next_f\.push\((\[1,"(?:[^"\\]|\\.)*"\])\)/g)]
    .map(match => (JSON.parse(match[1]) as [number, string])[1]));
  const flight = chunks.length ? decodeFlight(chunks.join("")) : [];
  const absolute = (value: string | undefined) => { try { return new URL(value ?? "", url).href; } catch { return ""; } };
  const links = $("a[href]").toArray().map(link => ({ url: absolute($(link).attr("href")), text: $(link).text().trim() }));
  const images = $("img[src]").toArray().map(image => ({ url: absolute($(image).attr("src")), alt: $(image).attr("alt") ?? "" }));
  const title = $("title").first().text().trim();
  const heading = $("h1").first().text().trim();
  const meta = Object.fromEntries($("meta[property],meta[name]").toArray().map(node => [$(node).attr("property") ?? $(node).attr("name") ?? "", $(node).attr("content") ?? ""]));
  $("script,style,noscript,header,footer,nav").remove();
  $("br").replaceWith("\n"); $("p,li,h1,h2,h3,section").append("\n");
  return { title, heading, text: ($("main").length ? $("main").text() : $("body").text()).replace(/\n{3,}/g, "\n\n").trim(), meta, links, images, jsonld, router, flight };
}
