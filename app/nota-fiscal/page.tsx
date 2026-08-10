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
  /*
    Lido aqui, no servidor, e descido como booleano — nunca a chave. É o mesmo
    padrão que o layout já usa para MARCA.email: o valor fica no servidor, o
    cliente recebe só o "existe ou não".

    Fazer isso aqui em vez de perguntar por fetch no cliente conserta duas
    coisas de uma vez: some o piscar entre "carregando" e o estado real, e o
    **texto de cabeçalho passa a saber**. Sem isso a página se contradizia em
    produção — o subtítulo prometia "fotografe a pilha" e o único campo abaixo
    aceitava só .xml, sem uma palavra de explicação. Prometer na manchete e
    calar no controle é pior que não ter a via.
  */
  const fotoLigada = Boolean(process.env.GEMINI_API_KEY);

  return (
    <>
      <style>{`:root:root{--bg-inner:${PECA.cor.inner};--bg-mid:${PECA.cor.mid};--bg-outer:${PECA.cor.outer}}`}</style>

      <main className="ferramenta ferramenta-larga" id="conteudo">
        <div className="ferramenta-cabeca">
          <p className="ferramenta-grupo">Puxa dado de onde ele está</p>
          <h1 className="ferramenta-titulo">{PECA.nome}</h1>
          <p className="ferramenta-linha">
            {fotoLigada ? (
              <>
                Fotografe a pilha. Cada nota vira um XML e uma linha de planilha, e cada
                campo que o modelo não leu com clareza chega marcado — para você conferir
                com a foto do lado e corrigir ali mesmo.
              </>
            ) : (
              <>
                Arraste os XML das suas notas e leve a planilha pronta. A leitura de{" "}
                <strong>foto</strong> — que transforma a pilha de papel em XML antes de
                virar planilha — está pronta, mas não ligada neste ambiente.
              </>
            )}
          </p>
        </div>

        <NotaFiscal fotoLigada={fotoLigada} />

        <div className="ferramenta-pe">
          <p>
            O processo é sempre o mesmo: a pilha de papel chega, alguém digitaliza, alguém
            digita, alguém confere. Digitar chave de 44 dígitos e mais uma dúzia de campos,
            nota a nota, é caro duas vezes — pelo tempo, e porque cada digitação é uma chance
            de errar um número que ninguém confere depois. Isto aqui faz os dois primeiros
            passos e mostra exatamente onde o terceiro precisa acontecer.
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
