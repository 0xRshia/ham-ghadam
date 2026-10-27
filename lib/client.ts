import { faContent } from "@/locales/domain-fa";
export class ClientError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

function responseError(status: number) {
  switch (status) {
    case 401: return faContent.requestUnauthorized;
    case 403: return faContent.requestForbidden;
    case 409: return faContent.requestConflict;
    case 413: return faContent.requestPayloadTooLarge;
    case 429: return faContent.rateLimit;
    case 408:
    case 504: return faContent.requestTimedOut;
    default: return faContent.serverResponseInvalid;
  }
}
export async function api<T>(url: string, data?: unknown,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = data === undefined ? "GET" : "POST",
): Promise<T> {
  let response: Response;
  const multipart = data instanceof FormData;
  try {
    response = await fetch(url, {
      method,
      headers:
        data === undefined || multipart ? {} : { "Content-Type": "application/json" },
      body: data === undefined ? undefined : multipart ? data : JSON.stringify(data),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ClientError(
      faContent.offline,
      0,
    );
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new ClientError(
      responseError(response.status),
      response.status,
    );
  }
  if (!response.ok) {
    const message = result && typeof result === "object" && "error" in result ? result.error : undefined;
    throw new ClientError(
      typeof message === "string" && message.trim() ? message : responseError(response.status),
      response.status,
    );
  }
  return result as T;
}
