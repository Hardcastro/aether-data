import type { Metadata } from "next";
import Link from "next/link";
import { MARCA } from "@/site.config";
import { pecaPorSlug } from "@/lib/manifesto";
import { NotaFiscal } from "@/components/NotaFiscal";

/**
 * Segunda rota de ferramenta do hub — brief-12, construída em 07/08.
 *
 * Copia o padrão que a /calculadora estabeleceu em 06/08 sem mudar nada dele:
 * server component fino com metadata e moldura, client component com o miolo,
 * e a cor do fundo saindo do próprio manifesto antes do primeiro quadro. A
 * única diferença é a largura — esta rota mostra tabela, e 46rem espremeria a
 * planilha que a peça existe para produzir.
 */

const PECA = pecaPorSlug("nota-fiscal-planilha")!;
const URL_PAGINA = new URL("/nota-fiscal", MARCA.url).toString();

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

export default function PaginaNotaFiscal() {
  return (
    <>
      <style>{`:root:root{--bg-inner:${PECA.cor.inner};--bg-mid:${PECA.cor.mid};--bg-outer:${PECA.cor.outer}}`}</style>

      <main className="ferramenta ferramenta-larga" id="conteudo">
        <div className="ferramenta-cabeca">
          <p className="ferramenta-grupo">Puxa dado de onde ele está</p>
          <h1 className="ferramenta-titulo">{PECA.nome}</h1>
          <p className="ferramenta-linha">
            Arraste os arquivos das suas notas e leve a planilha pronta. O XML é lido aqui
            mesmo, sem sair do seu navegador; a foto sobe para ser transcrita — e cada linha
            diz de onde veio.
          </p>
        </div>

        <NotaFiscal />

        <div className="ferramenta-pe">
          <p>
            Digitar chave de 44 dígitos e mais uma dúzia de campos, nota a nota, é o
            processo manual mais caro que existe num escritório contábil — e é caro duas
            vezes, porque cada digitação é uma chance de errar um número que ninguém confere
            depois.
          </p>
          <p>
            <Link className="btn-secundario" href="/calculadora">
              Quanto isso custa por mês →
            </Link>
          </p>
          <Link className="btn-secundario" href="/automacoes">
            ← Ver as automações no ar
          </Link>
        </div>
      </main>
    </>
  );
}
