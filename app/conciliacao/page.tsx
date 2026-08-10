import type { Metadata } from "next";
import Link from "next/link";
import { MARCA } from "@/site.config";
import { pecaPorSlug } from "@/lib/manifesto";
import { Conciliacao } from "@/components/Conciliacao";

/**
 * Quarta rota de ferramenta do hub — brief-11, construída em 10/08.
 *
 * Mesmo padrão das três anteriores, sem uma linha nova: server component fino
 * com metadata e moldura, client component com o miolo, e a cor do fundo saindo
 * do próprio manifesto antes do primeiro quadro.
 *
 * Largura: a `ferramenta-larga` de 74rem. São dois mapeadores com prévia de
 * arquivo e quatro listas — é a rota de conteúdo mais largo do hub até aqui.
 *
 * **Nenhuma variável de ambiente.** Não há chave, não há rota de API e não há
 * custo por uso. Junto com a /cobranca, é uma das duas peças que sobem
 * idênticas em qualquer ambiente.
 */

const PECA = pecaPorSlug("conciliacao-extrato-planilha")!;
const URL_PAGINA = new URL("/conciliacao", MARCA.url).toString();

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

export default function PaginaConciliacao() {
  return (
    <>
      <style>{`:root:root{--bg-inner:${PECA.cor.inner};--bg-mid:${PECA.cor.mid};--bg-outer:${PECA.cor.outer}}`}</style>

      <main className="ferramenta ferramenta-larga" id="conteudo">
        <div className="ferramenta-cabeca">
          <p className="ferramenta-grupo">Confere o que não bate</p>
          <h1 className="ferramenta-titulo">{PECA.nome}</h1>
          <p className="ferramenta-linha">
            Arraste o extrato do banco de um lado e a planilha de lançamentos do outro. Saem
            quatro listas: o que casou, o que <strong>quase</strong> casou e por quê, e o que
            só existe de um lado.
          </p>
        </div>

        <Conciliacao />

        <div className="ferramenta-pe">
          <p>
            Quem controla o financeiro em planilha gasta cerca de <strong>8 horas por mês</strong>{" "}
            só conciliando — três telas abertas e o dedo descendo linha por linha, toda sexta
            à tarde. O trabalho não é achar o que bate. É achar as quatro linhas que não
            batem, no meio das cento e quarenta que batem.
          </p>
          <p>
            Por isso a lista de quem casou nasce recolhida aqui, e por isso a primeira coisa
            da tela é a aritmética. Uma ferramenta que confere precisa provar que ela mesma
            não perdeu nada — senão é só mais uma tabela, e tabela quem lê já tem.
          </p>
          <Link className="btn-secundario" href="/automacoes">
            ← Ver as automações no ar
          </Link>
        </div>
      </main>
    </>
  );
}
