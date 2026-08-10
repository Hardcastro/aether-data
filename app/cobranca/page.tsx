import type { Metadata } from "next";
import Link from "next/link";
import { MARCA } from "@/site.config";
import { pecaPorSlug } from "@/lib/manifesto";
import { Cobranca } from "@/components/Cobranca";

/**
 * Terceira rota de ferramenta do hub — brief-15, construída em 10/08.
 *
 * Mesmo padrão das duas anteriores, sem uma linha nova: server component fino
 * com metadata e moldura, client component com o miolo, e a cor do fundo saindo
 * do próprio manifesto antes do primeiro quadro. O padrão nasceu na
 * /calculadora, que foi enterrada hoje — a rota morre, a forma fica.
 *
 * Largura: a `ferramenta-larga` de 74rem, porque a prévia do mapeador é uma
 * tabela com quantas colunas o arquivo de quem chegou tiver. A moldura estreita
 * de 46rem foi medida para três campos e um número grande.
 *
 * **Nenhuma variável de ambiente.** Não há chave, não há rota de API e não há
 * custo por uso: esta peça é 100% navegador, e por isso é a única do hub que
 * sobe idêntica em qualquer ambiente.
 */

const PECA = pecaPorSlug("cobranca-mensagens")!;
const URL_PAGINA = new URL("/cobranca", MARCA.url).toString();

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

export default function PaginaCobranca() {
  return (
    <>
      <style>{`:root:root{--bg-inner:${PECA.cor.inner};--bg-mid:${PECA.cor.mid};--bg-outer:${PECA.cor.outer}}`}</style>

      <main className="ferramenta ferramenta-larga" id="conteudo">
        <div className="ferramenta-cabeca">
          <p className="ferramenta-grupo">Entrega para alguém</p>
          <h1 className="ferramenta-titulo">{PECA.nome}</h1>
          <p className="ferramenta-linha">
            Arraste a sua lista de contas a receber. Cada devedor vira{" "}
            <strong>uma</strong> mensagem — com todos os títulos dele juntos, o tom certo
            para o tempo de atraso, e o link que abre a conversa já preenchida.
          </p>
        </div>

        <Cobranca />

        <div className="ferramenta-pe">
          <p>
            Quem cobra não tem uma lista de pessoas: tem uma lista de <em>títulos</em>, e o
            mesmo nome aparece nela várias vezes. A Serasa mediu, em 2026, uma média de{" "}
            <strong>6,6 contas em atraso</strong> por micro e pequena empresa inadimplente.
            Mandar seis mensagens para a mesma pessoa é o que a mão faz quando cansa — e é
            o que queima o cliente. Agrupar antes de escrever não é acabamento, é a peça.
          </p>
          <p>
            A outra metade é o que ela se recusa a fazer: não dispara sozinha, não preenche
            juros por conta própria e não guarda nada. Uma ferramenta de cobrança que
            economiza a <em>decisão</em>, e não só a digitação, é uma máquina de queimar
            cliente.
          </p>
          <Link className="btn-secundario" href="/automacoes">
            ← Ver as automações no ar
          </Link>
        </div>
      </main>
    </>
  );
}
