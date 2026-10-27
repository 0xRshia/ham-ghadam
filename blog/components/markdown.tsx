import ReactMarkdown, { defaultUrlTransform } from "react-markdown";

export function Markdown({ children }: { children: string }) {
  return <div className="prose"><ReactMarkdown skipHtml urlTransform={defaultUrlTransform} components={{
    h1: ({ children }) => <h2>{children}</h2>,
    a: ({ href, children }) => <a href={href} rel={href?.startsWith("https://") ? "noopener noreferrer" : undefined}>{children}</a>,
    img: ({ src, alt }) => typeof src === "string" && /^\/media\/[a-f0-9-]{36}\.webp$/.test(src)
      ? <img src={src} alt={alt || ""} loading="lazy" decoding="async" width={1200} height={800} /> : null,
  }}>{children}</ReactMarkdown></div>;
}
