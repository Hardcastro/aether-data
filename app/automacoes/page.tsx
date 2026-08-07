import type { Metadata } from "next";
import { Vitrine, metadadosVitrine, type PropsVitrine } from "@/components/Vitrine";

export async function generateMetadata({ searchParams }: PropsVitrine): Promise<Metadata> {
  return metadadosVitrine("automacao", searchParams);
}

export default function PaginaAutomacoes({ searchParams }: PropsVitrine) {
  return <Vitrine escopo="automacao" searchParams={searchParams} />;
}
