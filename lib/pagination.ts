import { faContent } from "@/locales/domain-fa";
import { ApiError } from "./server";

export function readPage(url: URL, pageSize: number) {
  const value = url.searchParams.get("page") ?? "1";
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 100000) {
    throw new ApiError(400, faContent.invalidPageNumber);
  }
  const page = Number(value);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function pageResult<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
}
