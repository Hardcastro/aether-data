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
  const imagemUrl = new URL(`/og/peca?slug=${peca.slug}`, MARCA.url);

  return {
    title: titulo,
    description: peca.capacidade,
    // alternates.canonical e openGraph.url ficam de fora aqui de propósito:
    // o resolvedor de metadados do Next 15 derruba a query string desses dois
    // campos ao resolvê-los contra metadataBase (bug conhecido, vercel/next.js#72810).
    // A tag <link rel="canonical"> e o <meta property="og:url"> reais são
    // renderizados à mão no JSX abaixo, que o React 19 já hasteia pro <head>
    // sem passar pelo resolvedor com bug. og:image não é afetado — segue aqui.
    openGraph: {
      title: titulo,
      description: peca.capacidade,
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
  const urlPagina = pecaAberta ? new URL(`/?peca=${pecaAberta.slug}`, MARCA.url).toString() : null;

  return (
    <>
      {urlPagina && (
        <>
          <link rel="canonical" href={urlPagina} />
          <meta property="og:url" content={urlPagina} />
        </>
      )}
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
