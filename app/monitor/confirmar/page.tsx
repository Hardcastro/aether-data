import type { Metadata } from "next";
import Link from "next/link";
import { pecaPorSlug } from "@/lib/manifesto";
import { lerFonte, acharSerie } from "@/lib/fonte";
import { guardarRegra, lerRegistro, ligado as armazemLigado } from "@/lib/armazem";
import {
  conferirToken,
  conferirCalendario,
  descreverRodada,
  comUnidade,
  rotuloCondicao,
  VALIDADE_CONFIRMACAO_SEGUNDOS,
} from "@/lib/monitor";

/**
 * A página de retorno depois do clique — decisão de 11/08.
 *
 * Ela existe para o e-mail imediato não precisar carregar tudo. Um e-mail
 * longo devolve a obrigação de ler; uma página não custa envio nenhum e pode
 * explicar à vontade para quem já demonstrou interesse clicando.
 *
 * **É aqui que a regra passa a existir.** Até este clique ela vivia só dentro
 * de um token assinado, dentro de um e-mail — nada foi gravado em lugar
 * nenhum. Se o token não fechar, nada acontece e a página diz o que houve.
 */

const PECA = pecaPorSlug("monitor-com-regra")!;

export const metadata: Metadata = {
  title: `Regra confirmada — ${PECA.nome}`,
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PaginaConfirmar({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;
  const segredo = process.env.SEGREDO_ASSINATURA;

  const carga =
    t && segredo ? await conferirToken(t, segredo, VALIDADE_CONFIRMACAO_SEGUNDOS) : null;

  let estado: "ok" | "invalido" | "desligado" | "falhou" = "invalido";
  let nomeSerie = "";
  let unidade: "%" | "R$" = "%";

  if (!armazemLigado() || !segredo) {
    estado = "desligado";
  } else if (carga && carga.acao === "c") {
    const leitura = await lerFonte(false);
    const serie = leitura.ok ? acharSerie(leitura.series, carga.serie) : null;
    nomeSerie = serie?.nome ?? carga.serie;
    unidade = serie?.unidade ?? "%";

    const guardou = await guardarRegra({
      email: carga.email,
      serie: carga.serie,
      condicao: carga.condicao,
      valor: carga.valor,
      desde: new Date().toISOString(),
      // Nunca avaliada. Se já nascer verdadeira, a primeira rodada dispara —
      // é o que `decidirEnvio(avaliacao, null)` decide, e é o que a pessoa
      // pediu ao se inscrever.
      ultimoEstado: null,
    });
    estado = guardou ? "ok" : "falhou";
  }

  const registro = estado === "ok" ? await lerRegistro() : [];
  const crivo = conferirCalendario(registro, new Date().toISOString());

  return (
    <>
      <style>{`:root:root{--bg-inner:${PECA.cor.inner};--bg-mid:${PECA.cor.mid};--bg-outer:${PECA.cor.outer}}`}</style>

      <main className="ferramenta" id="conteudo">
        <div className="ferramenta-cabeca">
          <p className="ferramenta-grupo">Responde sozinho</p>

          {estado === "ok" && carga && (
            <>
              <h1 className="ferramenta-titulo">Pronto. A regra existe.</h1>
              <p className="ferramenta-linha">
                A partir de amanhã de manhã, toda rodada avalia isto:{" "}
                <strong>
                  {nomeSerie} {rotuloCondicao(carga.condicao)} {comUnidade(carga.valor, unidade)}
                </strong>
                .
              </p>
            </>
          )}

          {estado === "invalido" && (
            <>
              <h1 className="ferramenta-titulo">Esse link não confere.</h1>
              <p className="ferramenta-linha">
                Ou ele foi alterado no caminho, ou passou de 48 horas — que é o prazo de um
                link de confirmação. Nada foi gravado, e nada precisa ser desfeito.
              </p>
            </>
          )}

          {estado === "desligado" && (
            <>
              <h1 className="ferramenta-titulo">A inscrição não está ligada aqui.</h1>
              <p className="ferramenta-linha">
                Este ambiente subiu sem o armazenamento configurado. A peça continua
                funcionando para avaliar regras na hora — só não guarda nenhuma.
              </p>
            </>
          )}

          {estado === "falhou" && (
            <>
              <h1 className="ferramenta-titulo">O link estava certo, e eu não consegui gravar.</h1>
              <p className="ferramenta-linha">
                O armazenamento não respondeu. Tente clicar no link do e-mail de novo daqui
                a pouco — ele continua válido.
              </p>
            </>
          )}
        </div>

        {estado === "ok" && (
          <section className="mn-retorno">
            <h2 className="mn-subtitulo">O que acontece agora — e o que não acontece</h2>

            <ul className="mn-lista-seca">
              <li>
                <strong>Uma vez por dia, de manhã</strong>, um agendamento lê os indicadores e
                avalia a sua regra. Não é quando você abre a página — é sozinho.
              </li>
              <li>
                <strong>Você só recebe e-mail quando a regra vira.</strong> Se ela ficar
                verdadeira e continuar verdadeira por trinta dias, é um e-mail, não trinta.
              </li>
              <li>
                <strong>Silêncio quer dizer que nada mudou</strong> — e não que parou de
                funcionar. Quem confere a diferença é o registro aqui embaixo.
              </li>
              <li>
                <strong>Sair leva um clique</strong>, pelo link no pé de qualquer e-mail que eu
                mandar. Não tem painel, senha nem cadastro.
              </li>
            </ul>

            <div className="mn-crivo mn-crivo-menor">
              <p className="mn-crivo-frase">{crivo.frase}</p>
              {registro[0] && (
                <p className="mn-crivo-apoio">Última rodada — {descreverRodada(registro[0])}</p>
              )}
            </div>
          </section>
        )}

        <div className="ferramenta-pe">
          <Link className="btn-secundario" href="/monitor">
            ← Ver o registro de todas as rodadas
          </Link>
        </div>
      </main>
    </>
  );
}
