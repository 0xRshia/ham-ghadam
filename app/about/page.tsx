import { faContent } from "@/locales/domain-fa";
import { AboutPage } from "@/components/evenline/content-pages";
import { getSiteContent } from "@/lib/site-content";
import type { AboutContent } from "@/lib/content-shapes";
export const metadata = { title: faContent.aboutHamghadam };
export default async function Page() { return <AboutPage content={await getSiteContent<AboutContent>("about")}/>; }
