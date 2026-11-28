import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";

export function Markdown({ children, headingIds }: { children: string; headingIds?: Map<number, string> }) {
  const heading: Components["h2"] = ({ node, children }) => {
    const id = headingIds?.get(node?.position?.start.line ?? 0);
    return <h2 id={id} tabIndex={id ? -1 : undefined}>{children}</h2>;
  };
  return <div className="prose"><ReactMarkdown skipHtml urlTransform={defaultUrlTransform} components={{
    h1: heading,
    h2: heading,
    a: ({ href, children }) => <a href={href} rel={href?.startsWith("https://") ? "noopener noreferrer" : undefined}>{children}</a>,
    img: ({ src, alt }) => typeof src === "string" && /^\/media\/[a-f0-9-]{36}\.webp$/.test(src)
      ? <img src={src} alt={alt || ""} loading="lazy" decoding="async" width={1200} height={800} /> : null,
  }}>{children}</ReactMarkdown></div>;
}
