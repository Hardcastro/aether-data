import { lerFonte, acharSerie } from "@/lib/fonte";
import { avaliar, contarTravessias, descreverBase, CONDICOES, type Condicao } from "@/lib/monitor";

/**
 * A avaliação em sessão — decisão de 11/08, e é o que impede esta rota de ser
 * um formulário de espera.
 *
 * As outras três automações do portfólio dão resultado em três segundos com o
 * arquivo de quem visita. Esta pedia inscrição, confirmação e até 24h de
 * espera antes de mostrar qualquer coisa — e o cético fecha a aba muito antes.
 * Aqui a regra é avaliada contra o valor de hoje no instante em que ele
 * termina de escrever, **antes de pedir e-mail nenhum.**
 *
 * Devolve duas coisas na mesma resposta:
 *
 * - a avaliação de hoje, com a frase pronta e a base do "variar mais de";
 * - o **contrafactual**: quantas vezes essa regra teria disparado nos 2 anos
 *   de histórico que a S4 já busca. Zero é dito como zero, com sugestão do
 *   valor que dispararia. É a peça se recusando a vender uma inscrição inútil.
 *
 * Não escreve nada, não precisa de chave nenhuma e funciona com o armazém
 * desligado. É a parte da peça que sobe funcional em qualquer ambiente.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TETO_VALOR = 1_000_000;

export async function POST(req: Request) {
  let corpo: { serie?: unknown; condicao?: unknown; valor?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return Response.json({ erro: "corpo ilegível" }, { status: 400 });
  }

  const serieId = typeof corpo.serie === "string" ? corpo.serie : "";
  const condicao = corpo.condicao as Condicao;
  const valor = typeof corpo.valor === "number" ? corpo.valor : Number.NaN;

  if (!serieId) return Response.json({ erro: "indicador não informado" }, { status: 400 });
  if (!CONDICOES.some((c) => c.id === condicao)) {
    return Response.json({ erro: "condição desconhecida" }, { status: 400 });
  }
  if (!Number.isFinite(valor) || Math.abs(valor) > TETO_VALOR) {
    return Response.json({ erro: "valor fora da faixa" }, { status: 400 });
  }

  const leitura = await lerFonte(true);
  if (!leitura.ok) {
    // Falha honesta: a peça diz que não conseguiu ler, em vez de mostrar um
    // resultado que ela não tem. Mesma regra da S1 e da S4.
    return Response.json({ erro: `não consegui ler a fonte agora — ${leitura.erro}` }, { status: 503 });
  }

  const serie = acharSerie(leitura.series, serieId);
  if (!serie) return Response.json({ erro: "indicador desconhecido" }, { status: 400 });

  const regra = { serie: serieId, condicao, valor };
  const avaliacao = avaliar(regra, serie);
  const contrafactual = contarTravessias(regra, serie.historico ?? [], serie.unidade);

  return Response.json({
    serie: {
      id: serie.id,
      nome: serie.nome,
      unidade: serie.unidade,
      fonte: serie.fonte,
      referencia: serie.referencia,
      periodicidade: serie.periodicidade,
      degradado: serie.degradado,
      ultimo: serie.ultimo,
      anterior: serie.anterior,
    },
    avaliacao,
    base: descreverBase(regra, serie),
    contrafactual,
  });
}
