import specification from "@/docs/openapi.json";

export function GET() {
  return Response.json(specification, {
    headers: {
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
