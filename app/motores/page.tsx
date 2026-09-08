import type { Metadata } from "next";
import { Vitrine, metadadosVitrine, type PropsVitrine } from "@/components/Vitrine";

/**
 * Terceira vertente, de 08/09/2026. A rota existe pelo mesmo motivo que
 * /sites e /automacoes existem: o cartão da vertente na home aponta para
 * `TIPOS[chave].rota`, e o sitemap percorre `Object.values(TIPOS)` — sem este
 * arquivo, a vertente nova sairia publicada no sitemap apontando para 404.
 */
export async function generateMetadata({ searchParams }: PropsVitrine): Promise<Metadata> {
  return metadadosVitrine("motor", searchParams);
}

export default function PaginaMotores({ searchParams }: PropsVitrine) {
  return <Vitrine escopo="motor" searchParams={searchParams} />;
}
