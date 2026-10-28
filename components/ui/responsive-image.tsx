import type { ImgHTMLAttributes } from "react";
import assets from "@/lib/static-image-manifest.json";
import { IMAGE_WIDTHS, IMAGE_VARIANT_VERSION } from "@/lib/image-policy";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "srcSet"> & { src: string; priority?: boolean };
const manifest: Record<string, { src: string; width: number }[]> = assets;
const localMedia = /^\/api\/(?:media|profile-media|organizer-media|article-media)\/[a-f0-9-]+$/;

export function ResponsiveImage({ src, alt, sizes = "100vw", priority = false, loading, decoding = "async", fetchPriority, ...props }: Props) {
  const variants = manifest[src] ?? (process.env.NEXT_PUBLIC_MEDIA_VARIANTS === "true" && localMedia.test(src)
    ? IMAGE_WIDTHS.map(width => ({ src: `${src}?w=${width}&v=${IMAGE_VARIANT_VERSION}`, width })) : undefined);
  // Native srcset uses our media routes; vinext’s Node next/image is a passthrough.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt} src={variants?.find(image => image.width >= 640)?.src ?? variants?.at(-1)?.src ?? src}
    srcSet={variants?.map(image => `${image.src} ${image.width}w`).join(", ")}
    sizes={variants ? sizes : undefined} loading={priority ? "eager" : loading ?? "lazy"}
    decoding={decoding} fetchPriority={priority ? "high" : fetchPriority} />;
}
