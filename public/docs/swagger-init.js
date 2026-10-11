/* global SwaggerUIBundle */
window.addEventListener("DOMContentLoaded", () => {
  const status = document.getElementById("docs-status");
  if (typeof SwaggerUIBundle !== "function") {
    status.textContent = "بارگذاری Swagger ناموفق بود. صفحه را دوباره بارگذاری کنید یا فایل OpenAPI را دریافت کنید.";
    return;
  }
  SwaggerUIBundle({
    url: "/docs/openapi.json",
    dom_id: "#swagger-ui",
    deepLinking: true,
    docExpansion: "none",
    filter: true,
    displayRequestDuration: true,
    persistAuthorization: false,
    validatorUrl: null,
    // Origin is browser-controlled, but Swagger validates required inputs before sending.
    parameterMacro: (_operation, parameter) =>
      parameter.in === "header" && parameter.name === "Origin"
        ? window.location.origin
        : parameter.schema?.default,
    onComplete: () => { status.hidden = true; },
  });
});
