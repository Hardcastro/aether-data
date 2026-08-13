import { MARCA } from "@/site.config";
import { lerFonte, acharSerie } from "@/lib/fonte";
import { lerRegras, guardarRegra, registrarRodada, ligado as armazemLigado } from "@/lib/armazem";
import { enviarAlerta, ligado as correioLigado } from "@/lib/correio";
import { assinar, avaliar, decidirEnvio, type Rodada } from "@/lib/monitor";

/**
 * A rodada. **É a única coisa do portfólio inteiro que roda sem ninguém
 * clicar** — e é por isso que a N4 ocupa o grupo `responde`.
 *
 * Agendada em `vercel.json` para uma vez por dia. **O plano Hobby permite
 * exatamente isso**, com precisão por hora: uma expressão mais frequente falha
 * no deploy, e o disparo cai em qualquer minuto da hora marcada. A oscilação
 * do horário não é defeito — é a assinatura de um agendador de verdade, e o
 * registro a exibe de propósito.
 *
 * ── A regra que organiza este arquivo ────────────────────────────────────
 *
 * **A rodada SEMPRE termina escrevendo no registro.** Fonte fora do ar, envio
 * que falha, regra corrompida: tudo vira uma linha honesta. Uma automação
 * agendada tem um problema de prova que nenhuma outra peça tem — quando ela
 * funciona, nada acontece — e o e-mail que não chegou porque nada disparou é
 * indistinguível do e-mail que não chegou porque o cron morreu. O registro é
 * o que separa os dois, e um registro que só anota os dias bons não separa
 * nada.
 *
 * O único caso em que não há linha é o armazém estar fora do ar, porque é
 * nele que a linha seria escrita. Esse buraco aparece sozinho no crivo do
 * calendário, que é exatamente para isso que o crivo existe.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * A Vercel manda `Authorization: Bearer $CRON_SECRET` quando a variável
 * existe. Sem ela a rota fica aberta — e como a rodada é idempotente (só
 * dispara em travessia) e o disparo manual é marcado como manual no registro,
 * o estrago possível é pequeno. Ainda assim: definir `CRON_SECRET` fecha.
 */
function autorizado(req: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return true;
  return req.headers.get("authorization") === `Bearer ${segredo}`;
}

/** Disparo manual não conta no crivo do calendário — deixar contar permitiria
 *  "consertar" um buraco clicando um botão, que é o oposto do que ele mede. */
function ehManual(req: Request): boolean {
  return new URL(req.url).searchParams.get("manual") === "1";
}

export async function GET(req: Request) {
  if (!autorizado(req)) {
    return Response.json({ erro: "não autorizado" }, { status: 401 });
  }

  const inicio = new Date().toISOString();
  const manual = ehManual(req);

  if (!armazemLigado()) {
    return Response.json(
      { erro: "sem armazenamento: a rodada não teria onde ser registrada" },
      { status: 503 },
    );
  }

  const rodada: Rodada = {
    em: inicio,
    lidas: 0,
    total: 0,
    degradadas: [],
    regras: 0,
    dispararam: 0,
    jaVerdadeiras: 0,
    enviados: 0,
    ...(manual ? { manual: true } : {}),
  };

  try {
    const leitura = await lerFonte(false);
    rodada.lidas = leitura.lidasAoVivo;
    rodada.total = leitura.total;
    rodada.degradadas = leitura.degradadas;

    if (!leitura.ok) {
      rodada.erro = leitura.erro ?? "a fonte não respondeu";
      await registrarRodada(rodada);
      return Response.json({ ok: false, rodada }, { status: 200 });
    }

    const regras = await lerRegras();
    rodada.regras = regras.length;

    const segredo = process.env.SEGREDO_ASSINATURA;

    for (const regra of regras) {
      const serie = acharSerie(leitura.series, regra.serie);
      if (!serie) continue;

      const avaliacao = avaliar({ serie: regra.serie, condicao: regra.condicao, valor: regra.valor }, serie);
      const decisao = decidirEnvio(avaliacao, regra.ultimoEstado);

      if (decisao.motivo === "ja-estava-verdadeira") rodada.jaVerdadeiras++;
      if (decisao.enviar) rodada.dispararam++;

      let enviado = false;
      if (decisao.enviar && correioLigado() && segredo) {
        const tokenSair = await assinar(
          {
            email: regra.email,
            serie: regra.serie,
            condicao: regra.condicao,
            valor: regra.valor,
            acao: "s",
            em: Math.floor(Date.now() / 1000),
          },
          segredo,
        );

        enviado = await enviarAlerta({
          para: regra.email,
          nomeSerie: serie.nome,
          explicacao: avaliacao.explicacao,
          linkSair: `${MARCA.url}/monitor/sair?t=${encodeURIComponent(tokenSair)}`,
          linkPainel: "https://indicadores-brasil-tempo-real.vercel.app",
        });
        if (enviado) rodada.enviados++;
      }

      // O estado só é atualizado quando a avaliação foi conclusiva. Série sem
      // dado não pode "resetar" o estado — se resetasse, a fonte piscando
      // reenviaria o mesmo alerta no dia seguinte.
      if (!avaliacao.indefinida) {
        await guardarRegra({
          ...regra,
          ultimoEstado: avaliacao.verdadeira,
          ...(enviado ? { ultimoEnvio: new Date().toISOString() } : {}),
        });
      }
    }

    await registrarRodada(rodada);
    return Response.json({ ok: true, rodada });
  } catch (e) {
    rodada.erro = e instanceof Error ? e.message : "erro desconhecido";
    await registrarRodada(rodada);
    return Response.json({ ok: false, rodada }, { status: 200 });
  }
}
