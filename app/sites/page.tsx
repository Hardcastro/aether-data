import type { Metadata } from "next";
import { Vitrine, metadadosVitrine, type PropsVitrine } from "@/components/Vitrine";

export async function generateMetadata({ searchParams }: PropsVitrine): Promise<Metadata> {
  return metadadosVitrine("site", searchParams);
}

export default function PaginaSites({ searchParams }: PropsVitrine) {
  return <Vitrine escopo="site" searchParams={searchParams} />;
}
