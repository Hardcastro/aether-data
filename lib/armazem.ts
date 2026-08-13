import type { Condicao, Rodada } from "./monitor";
import { chaveRegra } from "./monitor";

/**
 * O armazenamento da N4 — Upstash Redis pela API REST, `fetch` puro, sem SDK.
 *
 * **É a primeira peça do portfólio que escreve estado**, e isso fura o "sem
 * CMS, sem banco" que o `brief-04` fixou. O furo é assumido e está escrito na
 * própria página `/monitor`, não só aqui. A alternativa que o `brief-14`
 * carregava — JSON commitado pelo cron — caiu por dois motivos: e-mail de
 * terceiro não vai para repositório público, e todo commit dispararia um
 * redeploy do site.
 *
 * `Vercel KV` não é opção: foi descontinuado e migrou para Upstash via
 * Marketplace. A escolha aqui é o produto que sobrou, acessado do jeito mais
 * fino possível.
 *
 * **Regra do vazio, aplicada em todas as funções.** Sem `UPSTASH_REDIS_REST_URL`
 * e `UPSTASH_REDIS_REST_TOKEN`, nada aqui lança: `ligado()` devolve false, as
 * leituras devolvem vazio e as escritas devolvem false. A rota `/monitor`
 * continua servindo a avaliação em sessão e o contrafactual, que não dependem
 * de estado nenhum — só o registro e a inscrição somem da tela. É o mesmo
 * padrão da via de foto da N2 sem `GEMINI_API_KEY`.
 */

const URL_BASE = process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const CHAVE_REGRAS = "monitor:regras";
const CHAVE_REGISTRO = "monitor:registro";

/** Quantas rodadas o registro guarda. 180 dias cobre a vida útil da peça como
 *  portfólio com folga, e mantém a leitura da página barata. */
const TETO_REGISTRO = 180;

const TIMEOUT_MS = 4000;

export function ligado(): boolean {
  return Boolean(URL_BASE && TOKEN);
}

export type RegraGuardada = {
  email: string;
  serie: string;
  condicao: Condicao;
  valor: number;
  /** ISO do momento em que foi confirmada */
  desde: string;
  /**
   * O estado da última avaliação. `null` = nunca avaliada.
   * É o campo que faz o disparo ser na travessia e não no estado — sem ele a
   * peça manda o mesmo e-mail todo dia enquanto a regra continuar verdadeira.
   */
  ultimoEstado: boolean | null;
  /** ISO do último envio, para o registro e para depuração */
  ultimoEnvio?: string;
};

/* ─────────────────────────  o transporte  ──────────────────────────────── */

/**
 * Um comando do Redis, na forma que o REST do Upstash aceita: um array em que
 * a primeira posição é o verbo. Devolve `null` em qualquer falha — rede,
 * timeout, erro do servidor, JSON estranho.
 *
 * Nunca lança. Quem chama decide o que fazer com o vazio, e no caso do cron o
 * que ele faz é registrar a rodada como quebrada, que é o comportamento que o
 * brief exige do registro.
 */
async function comando<T>(partes: (string | number)[]): Promise<T | null> {
  if (!ligado()) return null;

  const controle = new AbortController();
  const t = setTimeout(() => controle.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(URL_BASE!, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(partes),
      cache: "no-store",
      signal: controle.signal,
    });

    if (!resposta.ok) return null;
    const dado = (await resposta.json()) as { result?: T; error?: string };
    if (dado.error) return null;
    return (dado.result ?? null) as T | null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/* ─────────────────────────────  regras  ────────────────────────────────── */

/**
 * Hash com um campo por regra, e não um blob JSON único, por um motivo só:
 * duas pessoas confirmando ao mesmo tempo. Com blob, a segunda escrita apaga a
 * primeira; com campo, cada `HSET` é independente. É improvável num portfólio,
 * e custa a mesma linha de código evitar.
 */
export async function guardarRegra(regra: RegraGuardada): Promise<boolean> {
  const r = await comando<string>([
    "HSET",
    CHAVE_REGRAS,
    chaveRegra(regra.email, regra.serie),
    JSON.stringify(regra),
  ]);
  return r !== null;
}

export async function apagarRegra(email: string, serie: string): Promise<boolean> {
  const r = await comando<number>(["HDEL", CHAVE_REGRAS, chaveRegra(email, serie)]);
  return r !== null;
}

export async function lerRegras(): Promise<RegraGuardada[]> {
  const bruto = await comando<Record<string, string> | string[]>(["HGETALL", CHAVE_REGRAS]);
  if (!bruto) return [];

  // O REST do Upstash devolve HGETALL como lista plana [campo, valor, ...].
  // Aceitar as duas formas evita depender de um detalhe de serialização.
  const valores: string[] = Array.isArray(bruto)
    ? bruto.filter((_, i) => i % 2 === 1)
    : Object.values(bruto);

  const regras: RegraGuardada[] = [];
  for (const v of valores) {
    try {
      const r = JSON.parse(v) as RegraGuardada;
      if (r && typeof r.email === "string" && typeof r.serie === "string") regras.push(r);
    } catch {
      // Campo corrompido é ignorado, não derruba a rodada inteira.
    }
  }
  return regras;
}

export async function contarRegrasDoEmail(email: string): Promise<number> {
  const todas = await lerRegras();
  const alvo = email.trim().toLowerCase();
  return todas.filter((r) => r.email.trim().toLowerCase() === alvo).length;
}

/* ────────────────────────────  registro  ───────────────────────────────── */

/**
 * Lista com `LPUSH` + `LTRIM`: a rodada mais nova entra na cabeça e o rabo é
 * podado no mesmo par de comandos. Ler é `LRANGE 0 -1`, que já vem na ordem do
 * mais recente para o mais antigo — que é a ordem em que a página desenha.
 */
export async function registrarRodada(rodada: Rodada): Promise<boolean> {
  const posto = await comando<number>(["LPUSH", CHAVE_REGISTRO, JSON.stringify(rodada)]);
  if (posto === null) return false;
  await comando<string>(["LTRIM", CHAVE_REGISTRO, 0, TETO_REGISTRO - 1]);
  return true;
}

export async function lerRegistro(): Promise<Rodada[]> {
  const bruto = await comando<string[]>(["LRANGE", CHAVE_REGISTRO, 0, TETO_REGISTRO - 1]);
  if (!bruto || !Array.isArray(bruto)) return [];

  const rodadas: Rodada[] = [];
  for (const v of bruto) {
    try {
      const r = JSON.parse(v) as Rodada;
      if (r && typeof r.em === "string") rodadas.push(r);
    } catch {
      // idem
    }
  }
  return rodadas;
}
