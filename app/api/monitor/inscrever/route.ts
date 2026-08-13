import { MARCA } from "@/site.config";
import { lerFonte, acharSerie } from "@/lib/fonte";
import { ligado as armazemLigado, lerRegistro, contarRegrasDoEmail } from "@/lib/armazem";
import { ligado as correioLigado, enviarConfirmacao } from "@/lib/correio";
import {
  assinar,
  emailValido,
  CONDICOES,
  TETO_REGRAS_POR_EMAIL,
  type Carga,
  type Condicao,
} from "@/lib/monitor";

/**
 * A inscrição — e o que ela **não** faz é o mais importante deste arquivo.
 *
 * **Não escreve nada.** A regra viaja num token assinado dentro do link de
 * confirmação e só é gravada quando alguém clica. Uma regra não confirmada não
 * existe em armazenamento nenhum: sem tabela de pendentes, sem TTL, sem
 * faxina. É o crivo determinístico aplicado à autorização — não se guarda
 * estado para desconfiar depois, a assinatura fecha ou não fecha.
 *
 * **Manda exatamente um e-mail para um endereço não confirmado**, e ele é o
 * que pergunta. Dois e-mails dariam duas chances de incomodar quem nunca pediu
 * nada — e o primeiro seria não solicitado, que é o vetor de abuso que o
 * `brief-14` se comprometeu a fechar.
 *
 * Teto por IP em memória, igual à rota de transcrição da N2: contenção barata
 * contra o caso trivial, e ela some a cada frio do processo — o que é honesto
 * dizer, porque a contenção que importa de verdade é a confirmação.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEGREDO = process.env.SEGREDO_ASSINATURA;

const JANELA_MS = 60 * 60 * 1000;
const TETO_POR_IP = 5;
const porIp = new Map<string, { n: number; ate: number }>();

function passouNoTetoDeIp(ip: string): boolean {
  const agora = Date.now();
  const atual = porIp.get(ip);
  if (!atual || agora > atual.ate) {
    porIp.set(ip, { n: 1, ate: agora + JANELA_MS });
    return true;
  }
  if (atual.n >= TETO_POR_IP) return false;
  atual.n++;
  return true;
}

/**
 * A regra do vazio desta rota, e ela é dupla. Sem `RESEND_API_KEY` não há como
 * mandar o e-mail; sem Upstash não há onde guardar a regra depois do clique;
 * sem `SEGREDO_ASSINATURA` o token não pode ser assinado. Faltando qualquer
 * um, a inscrição **não é anunciada na tela** em vez de existir quebrada — o
 * GET abaixo é o que a tela consulta para saber disso.
 */
export function GET() {
  return Response.json({
    ligado: Boolean(SEGREDO) && correioLigado() && armazemLigado(),
  });
}

export async function POST(req: Request) {
  if (!SEGREDO || !correioLigado() || !armazemLigado()) {
    return Response.json(
      { erro: "a inscrição não está ligada neste ambiente" },
      { status: 503 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
  if (!passouNoTetoDeIp(ip)) {
    return Response.json({ erro: "muitas inscrições deste endereço. Tente daqui a pouco." }, { status: 429 });
  }

  let corpo: { email?: unknown; serie?: unknown; condicao?: unknown; valor?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return Response.json({ erro: "corpo ilegível" }, { status: 400 });
  }

  const email = typeof corpo.email === "string" ? corpo.email.trim() : "";
  const serieId = typeof corpo.serie === "string" ? corpo.serie : "";
  const condicao = corpo.condicao as Condicao;
  const valor = typeof corpo.valor === "number" ? corpo.valor : Number.NaN;

  if (!emailValido(email)) return Response.json({ erro: "esse e-mail não parece um e-mail" }, { status: 400 });
  if (!CONDICOES.some((c) => c.id === condicao)) return Response.json({ erro: "condição desconhecida" }, { status: 400 });
  if (!Number.isFinite(valor)) return Response.json({ erro: "valor inválido" }, { status: 400 });

  const leitura = await lerFonte(false);
  const serie = leitura.ok ? acharSerie(leitura.series, serieId) : null;
  if (!serie) return Response.json({ erro: "indicador desconhecido" }, { status: 400 });

  // Teto de regras por e-mail. Conta só as já confirmadas — as pendentes não
  // existem, que é o ponto do token assinado.
  if ((await contarRegrasDoEmail(email)) >= TETO_REGRAS_POR_EMAIL) {
    return Response.json(
      { erro: `esse e-mail já tem ${TETO_REGRAS_POR_EMAIL} regras, que é o teto. Saia de uma antes de criar outra.` },
      { status: 409 },
    );
  }

  const agora = Math.floor(Date.now() / 1000);
  const base: Omit<Carga, "acao"> = { email, serie: serieId, condicao, valor, em: agora };

  const tokenConfirmar = await assinar({ ...base, acao: "c" }, SEGREDO);
  const tokenSair = await assinar({ ...base, acao: "s" }, SEGREDO);

  const registro = await lerRegistro();

  const enviado = await enviarConfirmacao({
    para: email,
    nomeSerie: serie.nome,
    unidade: serie.unidade,
    condicao,
    valor,
    linkConfirmar: `${MARCA.url}/monitor/confirmar?t=${encodeURIComponent(tokenConfirmar)}`,
    linkSair: `${MARCA.url}/monitor/sair?t=${encodeURIComponent(tokenSair)}`,
    ultimaRodada: registro[0] ?? null,
  });

  if (!enviado) {
    // Falha honesta: não fingir que saiu.
    return Response.json({ erro: "não consegui enviar o e-mail agora. Tente daqui a pouco." }, { status: 502 });
  }

  return Response.json({ ok: true, para: email });
}
