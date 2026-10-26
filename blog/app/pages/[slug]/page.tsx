import { getSettings } from "@/lib/store";
import { publicPost } from "@/lib/public-post";
import { postMetadata } from "@/lib/seo";
import { Article } from "@/components/public";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) { return postMetadata(publicPost("page", (await params).slug), getSettings()); }
export default async function Page({ params }: Props) { return <Article post={publicPost("page", (await params).slug)} settings={getSettings()} />; }
