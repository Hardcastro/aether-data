import { MARCA } from "@/site.config";
import { comUnidade, descreverRodada, rotuloCondicao, type Condicao, type Rodada } from "./monitor";

/**
 * O correio da N4 — Resend por `fetch` direto, sem SDK, mesmo fornecedor já
 * provado na S1.
 *
 * **São dois e-mails e só dois**, e a separação é de 11/08:
 *
 * 1. O **imediato**, que é o de confirmação E o de boas-vindas ao mesmo tempo.
 *    Um endereço não confirmado recebe exatamente um e-mail na vida, e é este
 *    — senão alguém digita o endereço de um estranho e o estranho recebe boas-
 *    vindas que não pediu. O resto do texto vai para a página de retorno
 *    depois do clique, que não custa envio nenhum.
 *
 * 2. O de **alerta**, quando a regra atravessa.
 *
 * O imediato leva dentro a **linha da última rodada**: mostra o cron em vez de
 * descrevê-lo, que é a regra da casa nas outras três peças. E explica o
 * silêncio antes de ele acontecer — o modo de falhar mais provável desta peça
 * é a pessoa assinar, não receber nada por doze dias e concluir que quebrou.
 *
 * **Regra do vazio:** sem `RESEND_API_KEY`, `ligado()` é false e a inscrição
 * some da tela em vez de existir quebrada.
 *
 * **Sobre o remetente, e é um limite do fornecedor, não uma escolha:** sem
 * domínio verificado o Resend só entrega de `onboarding@resend.dev` para o
 * endereço da própria conta. `REMETENTE` existe para ser trocado no painel no
 * dia em que o domínio existir, sem tocar em código.
 */

const CHAVE = process.env.RESEND_API_KEY;
const REMETENTE = process.env.MONITOR_REMETENTE ?? "AEther Data <onboarding@resend.dev>";

/**
 * O endereço da API, com o de produção embutido. Existe pelo mesmo motivo que
 * `MONITOR_FONTE_URL` em `fonte.ts`: **poder exercitar o caminho inteiro do
 * envio sem gastar envio de verdade.** A conferência da peça precisa ler o
 * corpo do e-mail que sai — se ela só pudesse afirmar que uma função foi
 * chamada, o teste passaria com o texto errado dentro, que é justamente o que
 * este e-mail não pode ter.
 */
const API = process.env.RESEND_API_URL ?? "https://api.resend.com";

export function ligado(): boolean {
  return Boolean(CHAVE);
}

type Envio = { para: string; assunto: string; texto: string };

/**
 * Devolve false em qualquer falha, sem lançar. O cron precisa continuar a
 * rodada quando um envio falha — e precisa poder escrever no registro que
 * falhou, o que é impossível se a exceção subir.
 */
async function enviar({ para, assunto, texto }: Envio): Promise<boolean> {
  if (!ligado()) return false;

  try {
    const resposta = await fetch(`${API}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${CHAVE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: REMETENTE, to: [para], subject: assunto, text: texto }),
      cache: "no-store",
    });
    return resposta.ok;
  } catch {
    return false;
  }
}

/* ───────────────────────────  o rodapé  ────────────────────────────────── */

/**
 * O ponto de contato mais valioso do portfólio, e não é exagero: ele chega no
 * instante em que a coisa acabou de funcionar sozinha, que é a única vez em
 * que quem avalia sente o que estaria comprando. Uma linha, nunca um bloco de
 * venda.
 *
 * **Regra do vazio:** `MARCA.email` é `null` desde que o hub nasceu. Sem ele,
 * o convite não é desenhado — em vez de apontar para lugar nenhum.
 */
function rodape(linkSair: string): string {
  const convite = MARCA.email
    ? `\n\nIsto rodou sozinho, sem ninguém clicar em nada. Se você tem um número que alguém confere na mão toda semana, é o mesmo mecanismo — ${MARCA.email}\n`
    : "\n";

  return `${convite}
Não quer mais? Saia da lista em um clique: ${linkSair}
${MARCA.url}/monitor — o registro de todas as rodadas, inclusive as silenciosas.`;
}

/* ─────────────────  1. o imediato: confirma e dá boas-vindas  ──────────── */

export type DadosConfirmacao = {
  para: string;
  nomeSerie: string;
  unidade: "%" | "R$";
  condicao: Condicao;
  valor: number;
  linkConfirmar: string;
  linkSair: string;
  /** A rodada mais recente do registro. null = a peça ainda não rodou nenhuma vez */
  ultimaRodada: Rodada | null;
};

export async function enviarConfirmacao(d: DadosConfirmacao): Promise<boolean> {
  const regra = `${d.nomeSerie} ${rotuloCondicao(d.condicao)} ${comUnidade(d.valor, d.unidade)}`;

  const prova = d.ultimaRodada
    ? `A última rodada foi ${descreverRodada(d.ultimaRodada)}.

O horário oscila até 59 minutos dentro da hora marcada — é assim que o
agendador da Vercel funciona no plano em uso, e é também como se sabe que o
registro é de um agendador de verdade. Registro forjado sai redondo.`
    : `A primeira rodada acontece amanhã de manhã. A partir dela, toda rodada
aparece registrada na página, com horário — inclusive as em que nada
acontece.`;

  const texto = `Falta um clique.

Você pediu para ser avisado quando isto for verdade:

    ${regra}

Confirme aqui, e só então a regra passa a existir:
${d.linkConfirmar}

Enquanto você não clicar, nada é guardado em lugar nenhum — nem o seu
e-mail. É por isso que este é o único e-mail que um endereço não confirmado
recebe.

────────────────────────────────────────

Como isto funciona, e por que você provavelmente não vai receber nada

Uma vez por dia, de manhã, um agendamento lê os indicadores e avalia as
regras. Se a sua ficar verdadeira, você recebe um e-mail. Se não ficar,
você não recebe nada — e isso é o desenho, não defeito.

${prova}

E o aviso chega uma vez por travessia, não todo dia. Se a sua regra ficar
verdadeira e continuar verdadeira por trinta dias, você recebe um e-mail,
não trinta.
${rodape(d.linkSair)}`;

  return enviar({
    para: d.para,
    assunto: `Falta um clique — ${regra}`,
    texto,
  });
}

/* ────────────────────────────  2. o alerta  ────────────────────────────── */

export type DadosAlerta = {
  para: string;
  nomeSerie: string;
  explicacao: string;
  linkSair: string;
  linkPainel: string;
};

/**
 * Uma regra, um número, uma variação, e o link para o painel da S4. Nunca a
 * tabela inteira — quem quer a tabela abre o painel. O e-mail existe para
 * tirar a pessoa da obrigação de olhar, e um e-mail longo devolve a obrigação.
 */
export async function enviarAlerta(d: DadosAlerta): Promise<boolean> {
  const texto = `${d.explicacao}

A regra que você escreveu ficou verdadeira hoje. Você não vai receber este
aviso de novo enquanto ela continuar verdadeira — só na próxima vez que ela
virar.

A série inteira, com o histórico: ${d.linkPainel}
${rodape(d.linkSair)}`;

  return enviar({
    para: d.para,
    assunto: `${d.nomeSerie}: a sua regra ficou verdadeira`,
    texto,
  });
}
