import { faContent } from "@/locales/domain-fa";
import { ApiError, body } from "@/lib/server";
import { deleteMedia, writeMedia } from "@/lib/media-storage";
import {
  MAX_EVENT_IMAGE_BYTES,
  MAX_EVENT_REQUEST_BYTES,
  MAX_GALLERY_IMAGES,
  MAX_IMAGE_BYTES,
  type ImageMimeType,
} from "@/lib/media-policy";

export type ValidatedImage = {
  role: "cover" | "gallery";
  position: number;
  bytes: Uint8Array;
  contentType: ImageMimeType;
};

export type EventMediaRow = {
  id: string;
  event_id: string;
  role: "cover" | "gallery";
  position: number;
  storage_key: string;
  content_type: ImageMimeType;
  byte_size: number;
  created_at: number;
};

export async function discardEventRequest(req: Request, byteLimit = MAX_EVENT_REQUEST_BYTES) {
  if (!req.body || req.body.locked || req.bodyUsed) return;
  const reader = req.body.getReader();
  const timer = setTimeout(() => { void reader.cancel().catch(() => {}); }, 5000);
  let size = 0;
  try {
    // Workerd can corrupt the following request if an early rejection leaves an
    // upload unread. Discard bounded chunks without parsing or retaining files.
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > byteLimit) {
        await reader.cancel();
        break;
      }
    }
  } catch {
    // Preserve the original authorization/validation response on disconnect.
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

function invalidImage(): never {
  throw new ApiError(400, faContent.invalidImageFile);
}

function dimensions(width: number, height: number) {
  if (!width || !height || width > 12000 || height > 12000 || width * height > 40000000) {
    throw new ApiError(400, faContent.imageDimensionsInvalid);
  }
}

function textAt(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function validatePng(bytes: Uint8Array, view: DataView) {
  let offset = 8;
  let header = false;
  let imageData = false;
  let palette = false;
  let indexed = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = textAt(bytes, offset + 4, 4);
    const end = offset + 12 + length;
    if (end > bytes.length || !/^[a-zA-Z]{4}$/.test(type)) invalidImage();
    if (!header && type !== "IHDR") invalidImage();
    if (type === "IHDR") {
      if (header || length !== 13) invalidImage();
      dimensions(view.getUint32(offset + 8), view.getUint32(offset + 12));
      const depth = bytes[offset + 16];
      const color = bytes[offset + 17];
      const depths: Record<number, number[]> = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!depths[color]?.includes(depth) || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] > 1) invalidImage();
      indexed = color === 3;
      header = true;
    } else if (type === "PLTE") {
      if (imageData || !length || length > 768 || length % 3) invalidImage();
      palette = true;
    } else if (type === "IDAT") {
      if (indexed && !palette) invalidImage();
      imageData ||= length > 0;
    } else if (type === "IEND") {
      if (!imageData || length !== 0 || end !== bytes.length) invalidImage();
      return;
    } else if (type[0] === type[0].toUpperCase()) {
      invalidImage();
    }
    offset = end;
  }
  invalidImage();
}

function validateJpeg(bytes: Uint8Array, view: DataView) {
  let offset = 2;
  let frame = false;
  let scan = false;
  const frames = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) invalidImage();
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (!frame || !scan || offset !== bytes.length) invalidImage();
      return;
    }
    if (marker === 0x01) continue;
    if (!marker || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || offset + 2 > bytes.length) invalidImage();
    const length = view.getUint16(offset);
    if (length < 2 || offset + length > bytes.length) invalidImage();
    if (frames.has(marker)) {
      if (frame || length < 11 || length !== 8 + 3 * bytes[offset + 7]) invalidImage();
      dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      frame = true;
    }
    offset += length;
    if (marker === 0xda) {
      if (!frame || length < 6) invalidImage();
      const start = offset;
      while (offset < bytes.length) {
        if (bytes[offset] !== 0xff) { offset++; continue; }
        const next = bytes[offset + 1];
        if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) { offset += 2; continue; }
        break;
      }
      if (offset === start) invalidImage();
      scan = true;
    }
  }
  invalidImage();
}

function validateWebp(bytes: Uint8Array, view: DataView) {
  if (view.getUint32(4, true) + 8 !== bytes.length) invalidImage();
  let offset = 12;
  let image = false;
  let extended: [number, number] | undefined;
  while (offset + 8 <= bytes.length) {
    const type = textAt(bytes, offset, 4);
    const length = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + length;
    if (end + (length % 2) > bytes.length || (length % 2 && bytes[end] !== 0)) invalidImage();
    if (type === "VP8X") {
      if (offset !== 12 || length !== 10 || (bytes[start] & 0x02)) invalidImage();
      const width = 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16);
      const height = 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16);
      dimensions(width, height);
      extended = [width, height];
    } else if (type === "VP8 " || type === "VP8L") {
      if (image) invalidImage();
      let width: number;
      let height: number;
      if (type === "VP8 ") {
        if (length < 10 || (bytes[start] & 1) || bytes[start + 3] !== 0x9d || bytes[start + 4] !== 0x01 || bytes[start + 5] !== 0x2a) invalidImage();
        width = view.getUint16(start + 6, true) & 0x3fff;
        height = view.getUint16(start + 8, true) & 0x3fff;
      } else {
        if (length < 5 || bytes[start] !== 0x2f || bytes[start + 4] >> 5) invalidImage();
        width = 1 + bytes[start + 1] + ((bytes[start + 2] & 0x3f) << 8);
        height = 1 + (bytes[start + 2] >> 6) + (bytes[start + 3] << 2) + ((bytes[start + 4] & 0x0f) << 10);
      }
      dimensions(width, height);
      if (extended && (width !== extended[0] || height !== extended[1])) invalidImage();
      image = true;
    } else if (type === "ANIM" || type === "ANMF") {
      invalidImage();
    }
    offset = end + (length % 2);
  }
  if (!image || offset !== bytes.length) invalidImage();
}

export function validateImageBytes(bytes: Uint8Array): ImageMimeType {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) {
    throw new ApiError(413, faContent.imageByteLimit);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 33 && bytes[0] === 0x89 && textAt(bytes, 1, 7) === "PNG\r\n\x1a\n") {
    validatePng(bytes, view);
    return "image/png";
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    validateJpeg(bytes, view);
    return "image/jpeg";
  }
  if (bytes.length >= 20 && textAt(bytes, 0, 4) === "RIFF" && textAt(bytes, 8, 4) === "WEBP") {
    validateWebp(bytes, view);
    return "image/webp";
  }
  invalidImage();
}

export async function readEventSubmission(req: Request): Promise<{
  data: Record<string, unknown>;
  uploads: ValidatedImage[];
}> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!/^multipart\/form-data(?:;|$)/i.test(contentType)) {
    return { data: await body(req), uploads: [] };
  }
  if (!req.body) throw new ApiError(400, faContent.invalidRequestInformation);
  if (Number(req.headers.get("content-length")) > MAX_EVENT_REQUEST_BYTES) {
    // A full set of individually valid files can exceed the combined limit.
    // Drain that envelope without parsing it so Workerd can serve the next
    // request; cancellation mid-body can otherwise restart its local proxy.
    const rejectedEnvelope = (MAX_GALLERY_IMAGES + 1) * MAX_IMAGE_BYTES + 1024 * 1024;
    await discardEventRequest(req, rejectedEnvelope);
    throw new ApiError(413, faContent.requestTooLarge);
  }
  let count = 0;
  let exceeded = false;
  // Bound the actual stream before multipart parsing, including chunked requests.
  const stream = req.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      count += chunk.byteLength;
      if (count > MAX_EVENT_REQUEST_BYTES) {
        exceeded = true;
        throw new ApiError(413, faContent.requestTooLarge);
      }
      controller.enqueue(chunk);
    },
  }));
  let form: FormData;
  try {
    form = await new Response(stream, { headers: { "Content-Type": contentType } }).formData();
  } catch {
    throw new ApiError(exceeded ? 413 : 400, exceeded ? faContent.requestTooLarge : faContent.invalidFiles);
  }
  if ([...form.keys()].some((key) => !["data", "cover", "gallery"].includes(key))) {
    throw new ApiError(400, faContent.invalidRequestInformation);
  }
  const fields = form.getAll("data");
  if (fields.length !== 1 || typeof fields[0] !== "string" || new TextEncoder().encode(fields[0]).byteLength > 16000) {
    throw new ApiError(400, faContent.invalidEventInformation);
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(fields[0]);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid data");
  } catch {
    throw new ApiError(400, faContent.invalidEventInformation);
  }
  const covers = form.getAll("cover");
  const gallery = form.getAll("gallery");
  if (covers.length > 1 || gallery.length > MAX_GALLERY_IMAGES) {
    throw new ApiError(400, faContent.coverGalleryLimit);
  }
  const selected = [
    ...covers.map((file) => ({ file, role: "cover" as const, position: 0 })),
    ...gallery.map((file, position) => ({ file, role: "gallery" as const, position })),
  ];
  let total = 0;
  for (const { file } of selected) {
    if (typeof file === "string") invalidImage();
    if (!file.size || file.size > MAX_IMAGE_BYTES) {
      throw new ApiError(413, faContent.imageByteLimit);
    }
    total += file.size;
  }
  if (total > MAX_EVENT_IMAGE_BYTES) throw new ApiError(413, faContent.totalImagesLimit);
  const uploads: ValidatedImage[] = [];
  for (const { file, role, position } of selected) {
    if (typeof file === "string") invalidImage();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const verifiedType = validateImageBytes(bytes);
    if (file.type && file.type.toLowerCase() !== verifiedType) invalidImage();
    uploads.push({ bytes, role, position, contentType: verifiedType });
  }
  return { data, uploads };
}

export async function cleanupEventImages(rows: Pick<EventMediaRow, "storage_key">[]) {
  const results = await Promise.allSettled(rows.map((row) => deleteMedia(row.storage_key)));
  if (results.some((result) => result.status === "rejected")) {
    throw new Error("Event image cleanup failed");
  }
}

export async function saveEventImages(eventId: string, uploads: ValidatedImage[]) {
  const rows: EventMediaRow[] = [];
  try {
    for (const upload of uploads) {
      const id = crypto.randomUUID();
      const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[upload.contentType];
      const row: EventMediaRow = {
        id,
        event_id: eventId,
        role: upload.role,
        position: upload.position,
        storage_key: `${id}.${extension}`,
        content_type: upload.contentType,
        byte_size: upload.bytes.byteLength,
        created_at: Date.now(),
      };
      // Include the current key in compensation if a provider writes then fails.
      rows.push(row);
      try {
        await writeMedia(row.storage_key, upload.bytes, upload.contentType);
      } catch (error) {
        // An exclusive-write collision did not create this object; never delete it.
        if ((error as { code?: string }).code === "EEXIST") rows.pop();
        throw error;
      }
    }
  } catch (error) {
    try {
      await cleanupEventImages(rows);
    } catch {
      console.error("Event image cleanup failed", rows.map((row) => row.storage_key));
    }
    throw error;
  }
  const cover = rows.find((row) => row.role === "cover");
  return {
    rows,
    coverUrl: cover ? `/api/media/${cover.id}` : null,
    galleryUrls: rows.filter((row) => row.role === "gallery").sort((a, b) => a.position - b.position).map((row) => `/api/media/${row.id}`),
  };
}
