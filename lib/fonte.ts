import type { SerieResumo } from "./monitor";

/**
 * A única porta para o dado da N4 — o endpoint `/api/series` da S4
 * (`indicadores-brasil-tempo-real`), que por sua vez chama o mesmo
 * `getTodasSeries()` que desenha a página de lá.
 *
 * **Nenhuma segunda lógica de cálculo, e a cadeia é curta de propósito:**
 * BCB/IBGE → adaptadores da S4 → `getTodasSeries` → `/api/series` → aqui. Se
 * uma série mudar de origem, de fallback ou de forma, a página da S4 e o
 * monitor mudam juntos porque leem a mesma função. É a quinta ocorrência do
 * padrão "uma fonte, dois consumidores" no ecossistema.
 *
 * A URL é variável de ambiente com padrão embutido: o endereço de produção da
 * S4 já é público e está no manifesto, então o padrão não esconde nada e a
 * peça sobe sem configuração. `MONITOR_FONTE_URL` existe para o dia em que a
 * S4 mudar de endereço, ou para apontar a um servidor local durante um teste.
 */

const FONTE =
  process.env.MONITOR_FONTE_URL ?? "https://indicadores-brasil-tempo-real.vercel.app";

const TIMEOUT_MS = 8000;

export type LeituraFonte = {
  ok: boolean;
  series: SerieResumo[];
  lidasAoVivo: number;
  total: number;
  /** ids das séries que vieram do instantâneo versionado nesta leitura */
  degradadas: string[];
  /** Preenchido quando a leitura inteira falhou */
  erro?: string;
};

const VAZIO = (erro: string): LeituraFonte => ({
  ok: false,
  series: [],
  lidasAoVivo: 0,
  total: 0,
  degradadas: [],
  erro,
});

/**
 * Nunca lança. Uma fonte fora do ar não pode derrubar a rodada do cron — ela
 * tem que virar uma linha honesta no registro de execuções, e para isso o erro
 * precisa voltar como dado.
 *
 * `comHistorico` só é pedido pelo contrafactual: são ~3.600 pontos, e o cron
 * não precisa de nenhum deles.
 */
export async function lerFonte(comHistorico = false): Promise<LeituraFonte> {
  const controle = new AbortController();
  const t = setTimeout(() => controle.abort(), TIMEOUT_MS);

  try {
    const alvo = `${FONTE}/api/series${comHistorico ? "?historico=1" : ""}`;
    const resposta = await fetch(alvo, { cache: "no-store", signal: controle.signal });

    if (!resposta.ok) return VAZIO(`a fonte respondeu ${resposta.status}`);

    const dado = (await resposta.json()) as {
      series?: SerieResumo[];
      lidasAoVivo?: number;
      total?: number;
    };

    if (!Array.isArray(dado.series) || dado.series.length === 0) {
      return VAZIO("a fonte respondeu sem nenhuma série");
    }

    return {
      ok: true,
      series: dado.series,
      lidasAoVivo: dado.lidasAoVivo ?? dado.series.filter((s) => !s.degradado).length,
      total: dado.total ?? dado.series.length,
      degradadas: dado.series.filter((s) => s.degradado).map((s) => s.id),
    };
  } catch (e) {
    const nome = e instanceof Error && e.name === "AbortError" ? "a fonte não respondeu a tempo" : "a fonte não respondeu";
    return VAZIO(nome);
  } finally {
    clearTimeout(t);
  }
}

export function acharSerie(series: SerieResumo[], id: string): SerieResumo | null {
  return series.find((s) => s.id === id) ?? null;
}
