import { faContent } from "@/locales/domain-fa";
import { FaqPage } from "@/components/evenline/content-pages";
import { getSiteContent } from "@/lib/site-content";
import type { FaqContent } from "@/lib/content-shapes";
export const metadata = { title: faContent.faqPageTitle };
export default async function Page() { return <FaqPage content={await getSiteContent<FaqContent>("faq")}/>; }
