import type { Metadata } from "next";
import { Vitrine, metadadosVitrine, type PropsVitrine } from "@/components/Vitrine";

export async function generateMetadata({ searchParams }: PropsVitrine): Promise<Metadata> {
  return metadadosVitrine(null, searchParams);
}

/**
 * A home é a mesma tela de /sites e /automacoes — só que os dois cartões do
 * seletor são as vertentes, não peças. Abrir uma leva para a rota dela, onde a
 * mesma tela reaparece com as peças daquela vertente. Ver components/Vitrine.tsx.
 */
export default function Home({ searchParams }: PropsVitrine) {
  return <Vitrine escopo={null} searchParams={searchParams} />;
}
