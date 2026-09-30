import { faContent } from "@/locales/domain-fa";
export class ClientError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
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
  let result: { error?: string } & T;
  try {
    result = (await response.json()) as { error?: string } & T;
  } catch {
    throw new ClientError(
      faContent.serviceUnavailable,
      response.status,
    );
  }
  if (!response.ok)
    throw new ClientError(
      result.error ?? faContent.requestFailed,
      response.status,
    );
  return result;
}
