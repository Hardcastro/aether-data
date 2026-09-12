import type { Metadata } from "next";
import type { Tipo } from "@/lib/manifesto";
import { PECAS, TIPOS, pecaPorSlug, pecasPorTipo } from "@/lib/manifesto";
import type { ItemVitrine } from "@/lib/vitrine";
import { itensDaHome, itensDoTipo, linhasSemJs } from "@/lib/vitrine";
import { MARCA } from "@/site.config";
import { Hero } from "@/components/Hero";

export type PropsVitrine = {
  searchParams: Promise<{ peca?: string }>;
};

/**
 * UMA tela, usada três vezes — decisão dele, 07/08.
 *
 *   /            → os cartões são as vertentes; abrir uma leva para a rota dela
 *   /sites       → os cartões são as 4 peças de site
 *   /automacoes  → os cartões são as peças de automação
 *
 * Rigorosamente o mesmo Hero nas três: painel que gira, esferas à direita,
 * fundo que troca de cor. Só o conteúdo muda. Este arquivo é o único lugar que
 * sabe qual das três está sendo servida, e existe para que essa diferença não
 * se espalhe por três páginas quase iguais que depois divergem sozinhas.
 *
 * `?peca=slug` continua sendo a fonte de verdade em todas — na home o slug é a
 * vertente ("site", "automacao"), nas vitrines é a peça. Link frio, botão
 * voltar e preview por item seguem funcionando de graça, como antes.
 */
type Config = {
  base: string;
  itens: ItemVitrine[];
  titulo: { linha1: string; linha2?: string };
  descricao: string;
  selo: { titulo: string; subtitulo: string };
  semJs: string[];
};

/*
  O selo está na primeira dobra, colado no número. Ele existe para qualificar
  esse número para quem chegou de fora — e "Cresce por commit, sem vaga vazia",
  que morava aqui, é invariante de código: descreve o gerador, não o acervo.
  "Commit" e "vaga vazia" são duas palavras nossas gastas no lugar mais caro do
  site. No lugar entra a credencial que o visitante confere num clique.
*/
/*
  Contado, nunca escrito. Se amanhã entrar uma peça sem repositório, o selo
  deixa de dizer "todas" sozinho, em vez de continuar afirmando o que deixou de
  ser verdade. A afirmação mora aqui, e não na frase de abertura, desde que
  aquela virou boas-vindas: número conferido pertence ao lugar que já mostra
  número.
*/
const COM_CODIGO = PECAS.filter((p) => p.repo).length;

const SUBTITULO_SELO =
  COM_CODIGO === PECAS.length ? "Código aberto em todas" : `Código aberto em ${COM_CODIGO}`;

function configurar(escopo: Tipo | null): Config {
  if (escopo === null) {
    return {
      base: "/",
      itens: itensDaHome(),
      titulo: { linha1: "AEther", linha2: "Data" },
      /*
        Boas-vindas, e não descrição de acervo — pedido dele, com as palavras
        dele. Cinco versões passaram por aqui: vocabulário de dentro de casa,
        posicionamento profissional, uma promessa que cobria metade das peças,
        um verbete de catálogo correto e frio, e uma oferta que ainda listava.
        Esta recebe.

        As duas origens são verdadeiras e não pretendem ser taxonomia: os três
        sites de negócio inventado não nasceram nem de curiosidade nem do
        trabalho — nasceram para dar problema real a uma peça. "Alguns… outros…"
        aceita isso; uma lista fechada não aceitaria.

        A afirmação que se confere saiu daqui e foi para o selo, logo abaixo, que
        já mostra o número. Nenhuma frase da primeira dobra afirma resultado.
      */
      descricao:
        "Seja bem-vindo ao meu hub de projetos. Alguns nasceram de curiosidade, outros de um problema do meu trabalho — todos abertos ao público, e os que rodam aqui dentro você usa sem cadastro. Aproveite.",
      selo: { titulo: `${PECAS.length} PEÇAS NO AR`, subtitulo: SUBTITULO_SELO },
      semJs: linhasSemJs(null),
    };
  }

  const tipo = TIPOS[escopo];
  const total = pecasPorTipo(escopo).length;
  return {
    base: tipo.rota,
    itens: itensDoTipo(escopo),
    titulo: { linha1: tipo.titulo },
    descricao: tipo.chamada,
    selo: {
      titulo: `${total} ${total === 1 ? "PEÇA NO AR" : "PEÇAS NO AR"}`,
      subtitulo: SUBTITULO_SELO,
    },
    semJs: linhasSemJs(escopo),
  };
}

/** O item pedido pela URL, se ele pertencer a esta tela. Senão, o primeiro. */
function resolverAberto(cfg: Config, slug: string | undefined): ItemVitrine {
  /*
    Slug estranho ao escopo cai no primeiro item em vez de abrir errado. Sem
    isso, /sites?peca=nota-fiscal-planilha mostraria uma automação com o seletor
    ao lado listando outras quatro peças e as setas percorrendo uma lista onde
    a peça aberta não existe.
  */
  return cfg.itens.find((i) => i.slug === slug) ?? cfg.itens[0];
}

export async function Vitrine({
  escopo,
  searchParams,
}: { escopo: Tipo | null } & PropsVitrine) {
  const cfg = configurar(escopo);
  const sp = await searchParams;
  const aberto = resolverAberto(cfg, sp.peca);

  const caminho = sp.peca && aberto.slug === sp.peca ? `${cfg.base}?peca=${aberto.slug}` : cfg.base;
  const urlPagina = new URL(caminho, MARCA.url).toString();

  return (
    <>
      <link rel="canonical" href={urlPagina} />
      <meta property="og:url" content={urlPagina} />
      {/*
        A cor inicial do gradiente vem do servidor, junto com o HTML. Sem isto
        a página abriria sempre na cor do primeiro item e daria um salto no
        primeiro quadro, quando o cliente lesse o item de fato aberto.

        O seletor é `:root:root` de propósito. O React 19 iça <style> para o
        <head>, e não há garantia de que ele caia depois do globals.css — se
        caísse antes, um `:root` simples perderia o desempate por ordem e a cor
        do servidor seria ignorada. Repetir o seletor dobra a especificidade e
        torna a regra imune à ordem.
      */}
      <style>{`:root:root{--bg-inner:${aberto.cor.inner};--bg-mid:${aberto.cor.mid};--bg-outer:${aberto.cor.outer}}`}</style>
      <Hero
        itens={cfg.itens}
        aberto={aberto}
        base={cfg.base}
        titulo={cfg.titulo}
        descricao={cfg.descricao}
        selo={cfg.selo}
        semJs={cfg.semJs}
        contato={{ email: MARCA.email, whatsapp: MARCA.whatsapp }}
      />
    </>
  );
}

/** Metadados das três telas, pela mesma regra. */
export async function metadadosVitrine(
  escopo: Tipo | null,
  searchParams: PropsVitrine["searchParams"]
): Promise<Metadata> {
  const cfg = configurar(escopo);
  const sp = await searchParams;
  const pedido = sp.peca ? cfg.itens.find((i) => i.slug === sp.peca) : undefined;

  if (!pedido) {
    const nome = escopo === null ? MARCA.nome : `${TIPOS[escopo].titulo} — ${MARCA.nome}`;
    /*
      Título de aba e título de compartilhamento não são a mesma coisa, e a home
      pagava por confundir os dois. O layout já montava
      "AEther Data — <promessa>"; esta função sobrescrevia com "AEther Data"
      seco. Resultado: a página mais valiosa do site era a única cujo título não
      dizia o que o site faz, num nome que ninguém procura.

      No card compartilhado o nome sozinho continua certo — ali a descrição vem
      logo abaixo, e repetir a promessa nas duas linhas é eco.
    */
    const tituloDocumento = escopo === null ? `${MARCA.nome} — ${MARCA.promessa}` : nome;
    return {
      title: tituloDocumento,
      description: cfg.descricao,
      alternates: { canonical: cfg.base },
      openGraph: { title: nome, description: cfg.descricao, images: [`${MARCA.url}/opengraph-image`] },
      // Sem isto o twitter herdava só o card:"summary" do layout — sem imagem
      // nenhuma. Era a única URL do site sem preview grande: quem compartilha
      // justamente o link nu (o mais comum) caía no card pequeno. SEO, 03/08.
      twitter: { card: "summary_large_image", images: [`${MARCA.url}/opengraph-image`] },
    };
  }

  const titulo = `${pedido.nome} — ${MARCA.nome}`;
  /*
    A imagem por item só existe para peça — /og/peca desenha a partir do
    manifesto. Vertente cai na og padrão do site: inventar uma rota de og para
    dois itens que não têm print seria custo sem retorno.
  */
  const imagem = pecaPorSlug(pedido.slug)
    ? new URL(`/og/peca?slug=${pedido.slug}`, MARCA.url).toString()
    : `${MARCA.url}/opengraph-image`;

  return {
    title: titulo,
    description: pedido.capacidade,
    // alternates.canonical e openGraph.url ficam de fora aqui de propósito: o
    // resolvedor de metadados do Next 15 derruba a query string desses dois
    // campos ao resolvê-los contra metadataBase (bug conhecido,
    // vercel/next.js#72810). A <link rel="canonical"> e o <meta og:url> reais
    // são renderizados à mão no JSX acima, que o React 19 iça para o <head>
    // sem passar pelo resolvedor com bug. og:image não é afetado — segue aqui.
    openGraph: { title: titulo, description: pedido.capacidade, images: [imagem] },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: pedido.capacidade,
      images: [imagem],
    },
  };
}
