import type { Metadata } from "next";
import Link from "next/link";
import { MARCA } from "@/site.config";
import { pecaPorSlug } from "@/lib/manifesto";
import { Calculadora } from "@/components/Calculadora";

/**
 * Primeira rota de ferramenta do hub — brief-10, construída em 06/08.
 *
 * O padrão que nasce aqui é o que /chat, /leitura e /resumo-semanal copiam:
 * server component fino que só monta metadata + moldura, e um client component
 * com o miolo. A cor de fundo vem da própria peça no manifesto, pelo mesmo
 * mecanismo que a home usa — a rota se anuncia com a cor dela antes de o
 * visitante ler uma palavra.
 */

const PECA = pecaPorSlug("calculadora-custo")!;
const URL_PAGINA = new URL("/calculadora", MARCA.url).toString();

export const metadata: Metadata = {
  title: `${PECA.nome} — ${MARCA.nome}`,
  description: PECA.capacidade,
  alternates: { canonical: URL_PAGINA },
  openGraph: {
    title: PECA.nome,
    description: PECA.capacidade,
    url: URL_PAGINA,
    images: [`${MARCA.url}/og/peca?slug=${PECA.slug}`],
  },
  twitter: {
    card: "summary_large_image",
    title: PECA.nome,
    description: PECA.capacidade,
    images: [`${MARCA.url}/og/peca?slug=${PECA.slug}`],
  },
};

export default function PaginaCalculadora() {
  return (
    <>
      {/*
        Mesma técnica da home: a cor sai do servidor junto com o HTML, para a
        página não abrir no verde da peça padrão e dar um salto de cor no
        primeiro quadro. `:root:root` pelo mesmo motivo de lá — o React 19 iça
        <style> para o <head> sem garantir ordem contra o globals.css, e o
        seletor repetido vence por especificidade em vez de por ordem.
      */}
      <style>{`:root:root{--bg-inner:${PECA.cor.inner};--bg-mid:${PECA.cor.mid};--bg-outer:${PECA.cor.outer}}`}</style>

      <main className="ferramenta" id="conteudo">
        <div className="ferramenta-cabeca">
          <p className="ferramenta-grupo">Responde sozinho</p>
          <h1 className="ferramenta-titulo">{PECA.nome}</h1>
          <p className="ferramenta-linha">
            Três perguntas, e a conta fica na tela. Nada é enviado para lugar nenhum — o
            cálculo acontece no seu navegador.
          </p>
        </div>

        <Calculadora />

        <div className="ferramenta-pe">
          <p>
            Se o número acima incomodou, o processo provavelmente cabe numa automação. É
            exatamente esse tipo de rotina que as outras peças do portfólio resolvem.
          </p>
          {/*
            <Link> e não <a>: a volta para a vitrine é navegação interna, e o
            lint do Next trata <a> para rota própria como erro de build, não
            como aviso. Vale a regra — o <a> recarregaria a página inteira,
            incluindo o GSAP e o campo de partículas do hero.
          */}
          <Link className="btn-secundario" href="/">
            ← Ver as peças no ar
          </Link>
        </div>
      </main>
    </>
  );
}
