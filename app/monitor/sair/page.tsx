import type { Metadata } from "next";
import Link from "next/link";
import { pecaPorSlug } from "@/lib/manifesto";
import { apagarRegra, ligado as armazemLigado } from "@/lib/armazem";
import { conferirToken } from "@/lib/monitor";

/**
 * Sair da lista. **Um clique, sem painel, sem senha, sem cadastro.**
 *
 * O token não vence — `conferirToken` é chamado com validade 0 de propósito.
 * Um link de saída precisa funcionar num e-mail de seis meses atrás; um que
 * expira transforma "quero sair" em "procure o suporte", e este portfólio não
 * tem suporte.
 *
 * Apagar é idempotente: clicar duas vezes dá o mesmo resultado, e um cliente
 * de e-mail que pré-carrega o link não quebra nada — só executa a intenção
 * mais cedo, que é uma intenção que ninguém lamenta ter executado.
 */

const PECA = pecaPorSlug("monitor-com-regra")!;

export const metadata: Metadata = {
  title: `Fora da lista — ${PECA.nome}`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PaginaSair({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const segredo = process.env.SEGREDO_ASSINATURA;

  const carga = t && segredo ? await conferirToken(t, segredo, 0) : null;

  let estado: "ok" | "invalido" | "desligado" = "invalido";

  if (!armazemLigado() || !segredo) {
    estado = "desligado";
  } else if (carga) {
    await apagarRegra(carga.email, carga.serie);
    estado = "ok";
  }

  return (
    <>
      <style>{`:root:root{--bg-inner:${PECA.cor.inner};--bg-mid:${PECA.cor.mid};--bg-outer:${PECA.cor.outer}}`}</style>

      <main className="ferramenta" id="conteudo">
        <div className="ferramenta-cabeca">
          <p className="ferramenta-grupo">Responde sozinho</p>

          {estado === "ok" && (
            <>
              <h1 className="ferramenta-titulo">Pronto. Você saiu.</h1>
              <p className="ferramenta-linha">
                A regra foi apagada e o seu e-mail não está mais guardado em lugar nenhum.
                Não vai chegar mais nada — nem confirmação disto.
              </p>
            </>
          )}

          {estado === "invalido" && (
            <>
              <h1 className="ferramenta-titulo">Esse link não confere.</h1>
              <p className="ferramenta-linha">
                Ele foi alterado no caminho. Use o link do pé de qualquer e-mail que eu tenha
                mandado — aquele não vence nunca, de propósito.
              </p>
            </>
          )}

          {estado === "desligado" && (
            <>
              <h1 className="ferramenta-titulo">Não há lista neste ambiente.</h1>
              <p className="ferramenta-linha">
                Este ambiente subiu sem o armazenamento configurado, então não existe nenhuma
                regra guardada aqui.
              </p>
            </>
          )}
        </div>

        <div className="ferramenta-pe">
          <Link className="btn-secundario" href="/monitor">
            ← Voltar para o monitor
          </Link>
        </div>
      </main>
    </>
  );
}
