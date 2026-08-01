import type { Metadata } from "next";
import { GRUPOS_COM_PECAS, PECAS, pecaPorSlug } from "@/lib/manifesto";
import { MARCA } from "@/site.config";
import { Identificacao } from "@/components/Identificacao";
import { Plano } from "@/components/Plano";

type Props = {
  searchParams: Promise<{ peca?: string }>;
};

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const peca = sp.peca ? pecaPorSlug(sp.peca) : undefined;

  if (!peca) {
    return {
      openGraph: { images: [`${MARCA.url}/opengraph-image`] },
    };
  }

  const titulo = `${peca.nome} — ${MARCA.nome}`;
  const imagemUrl = `${MARCA.url}/og/peca?slug=${peca.slug}`;

  return {
    title: titulo,
    description: peca.capacidade,
    alternates: { canonical: `${MARCA.url}/?peca=${peca.slug}` },
    openGraph: {
      title: titulo,
      description: peca.capacidade,
      url: `${MARCA.url}/?peca=${peca.slug}`,
      images: [imagemUrl],
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: peca.capacidade,
      images: [imagemUrl],
    },
  };
}

export default async function Home({ searchParams }: Props) {
  const sp = await searchParams;
  const pecaAberta = sp.peca ? pecaPorSlug(sp.peca) ?? null : null;

  return (
    <>
      <Identificacao />
      <Plano
        pecas={PECAS}
        grupos={GRUPOS_COM_PECAS}
        pecaAberta={pecaAberta}
        contato={{ email: MARCA.email, whatsapp: MARCA.whatsapp }}
      />
    </>
  );
}
