import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const url = new URL(request.url);
  if (url.hostname === "stage.hmghadam.com" || url.hostname === "app.hmghadam.com") {
    return NextResponse.redirect("https://game.hmghadam.com/game" + url.search, 307);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/game", "/play/squirrel"] };
