import { boundary, sameOrigin } from "./server";
import { squirrelMovementVersionHeader } from "./squirrel-ar-game";
import { squirrelRewardCreditHeader } from "./squirrel-reward-credit";
import { squirrelAccountOrigin, squirrelGameOrigin } from "./squirrel-reward-receive";

export function publicSquirrelPlayRequest(req: Request) {
  return new URL(req.url).origin === squirrelAccountOrigin && req.headers.get("Origin") === squirrelGameOrigin;
}

export async function squirrelPlayResponse(req: Request, work: () => Promise<Response>) {
  if (!publicSquirrelPlayRequest(req)) return boundary(() => {
    sameOrigin(req);
    return work();
  });
  const response = await boundary(work);
  response.headers.set("Vary", "Origin");
  response.headers.set("Access-Control-Allow-Origin", squirrelGameOrigin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  return response;
}

export function squirrelPlayPreflight(req: Request) {
  const headers = new Headers({ Vary: "Origin", "Cache-Control": "no-store" });
  if (!publicSquirrelPlayRequest(req) || req.headers.get("Access-Control-Request-Method") !== "POST") {
    return new Response(null, { status: 403, headers });
  }
  headers.set("Access-Control-Allow-Origin", squirrelGameOrigin);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.set("Access-Control-Allow-Methods", "POST");
  headers.set("Access-Control-Allow-Headers", ["Content-Type", squirrelMovementVersionHeader, squirrelRewardCreditHeader].join(", "));
  return new Response(null, { status: 204, headers });
}
