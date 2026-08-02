import type { Metadata } from "next";
import { PECAS, PECA_PADRAO, pecaPorSlug } from "@/lib/manifesto";
import { MARCA } from "@/site.config";
import { Hero } from "@/components/Hero";

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
  /*
    Diferente do plano, aqui SEMPRE existe uma peça selecionada — a hero não
    tem estado vazio. Sem ?peca= na URL abre a peça padrão; com ?peca= abre
    aquela, renderizada no servidor. É o que mantém o link frio e o preview por
    peça funcionando exatamente como antes, de graça.
  */
  const pecaAberta = (sp.peca ? pecaPorSlug(sp.peca) : undefined) ?? PECA_PADRAO;
  const urlPagina = sp.peca ? new URL(`/?peca=${pecaAberta.slug}`, MARCA.url).toString() : null;

  return (
    <>
      {urlPagina && (
        <>
          <link rel="canonical" href={urlPagina} />
          <meta property="og:url" content={urlPagina} />
        </>
      )}
      {/*
        A cor inicial do gradiente vem do servidor, junto com o HTML. Sem isto
        a página abriria sempre no verde da peça padrão e daria um salto de cor
        no primeiro quadro, quando o cliente lesse a peça de fato aberta.

        O seletor é `:root:root` de propósito. O React 19 iça <style> para o
        <head>, e não há garantia de que ele caia depois do globals.css — se
        caísse antes, um `:root` simples perderia o desempate por ordem e a cor
        do servidor seria ignorada. Repetir o seletor dobra a especificidade e
        torna a regra imune à ordem.
      */}
      <style>{`:root:root{--bg-inner:${pecaAberta.cor.inner};--bg-mid:${pecaAberta.cor.mid};--bg-outer:${pecaAberta.cor.outer}}`}</style>
      <Hero
        pecas={PECAS}
        pecaAberta={pecaAberta}
        contato={{ email: MARCA.email, whatsapp: MARCA.whatsapp }}
      />
    </>
  );
}
