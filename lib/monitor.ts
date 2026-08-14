/**
 * O motor da N4 — `/monitor`, brief-14, lapidado em 11/08 em duas leituras.
 *
 * Nada aqui toca rede, armazenamento ou DOM. É função pura sobre números e
 * datas, para poder ser conferido por `node --experimental-strip-types` sem
 * subir nada — mesmo padrão de `lib/conciliacao.ts` e `lib/cobranca.ts`.
 *
 * As quatro coisas que este arquivo carrega, e por que cada uma existe:
 *
 * 1. `avaliar` — a regra é verdadeira agora? Três condições, nenhuma
 *    linguagem natural, nenhum modelo. A condição "variar mais de" compara a
 *    última publicação com a anterior DA MESMA SÉRIE, então IPCA é mês contra
 *    mês e Selic é dia contra dia. A base viaja no resultado para a tela poder
 *    escrevê-la ao lado do campo.
 *
 * 2. `decidirEnvio` — dispara na TRAVESSIA, não no estado. Sem isto, uma Selic
 *    que passa de 14% e fica acima manda o mesmo e-mail todo dia, para sempre,
 *    com o domínio dele no remetente. Era o furo mais caro do brief original.
 *
 * 3. `contarTravessias` — o contrafactual. Quantas vezes esta regra teria
 *    disparado nos 2 anos que a S4 já busca. Uma regra que teria disparado
 *    zero vezes é dita como tal, com sugestão do valor que dispararia: a peça
 *    se recusando a vender uma inscrição inútil.
 *
 * 4. `conferirCalendario` — o crivo determinístico. Quarto da linhagem, depois
 *    do módulo 11 da chave (N2), do DDD (N5) e da soma que fecha (N3). O
 *    registro de execuções prova por acúmulo, e ninguém lê trinta linhas
 *    contando dias de cabeça. Aqui a peça conta sozinha e acusa o buraco.
 */

/* ─────────────────────────────  vocabulário  ───────────────────────────── */

export type Condicao = "subir-acima" | "cair-abaixo" | "variar-mais";

export type Regra = {
  /** id da série na S4: "selic" | "cambio-usd" | "ipca-mensal" | ... */
  serie: string;
  condicao: Condicao;
  /** Em pontos para série em %, em reais para série em R$ */
  valor: number;
};

export type PontoSerie = { data: string; valor: number };

export type SerieResumo = {
  id: string;
  nome: string;
  unidade: "%" | "R$";
  fonte: string;
  referencia: string;
  periodicidade: string;
  atualizadoEm: string;
  degradado: boolean;
  ultimo: PontoSerie | null;
  anterior: PontoSerie | null;
  historico?: PontoSerie[];
};

export const CONDICOES: { id: Condicao; rotulo: string; precisaBase: boolean }[] = [
  { id: "subir-acima", rotulo: "subir acima de", precisaBase: false },
  { id: "cair-abaixo", rotulo: "cair abaixo de", precisaBase: false },
  { id: "variar-mais", rotulo: "variar mais de", precisaBase: true },
];

export function rotuloCondicao(c: Condicao): string {
  return CONDICOES.find((x) => x.id === c)?.rotulo ?? c;
}

/* ─────────────────────────────  formatação  ───────────────────────────── */

export function numeroBr(v: number, casas = 2): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

export function comUnidade(v: number, unidade: "%" | "R$"): string {
  return unidade === "R$" ? `R$ ${numeroBr(v)}` : `${numeroBr(v)}%`;
}

/** "2026-08-11" -> "11/08/2026". Sem biblioteca de data, sem fuso. */
export function dataBr(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split("-");
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

/** "2026-08-11T09:47:03Z" -> "11/08, 06h47" no fuso de São Paulo. */
export function momentoBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "00";
  return `${p("day")}/${p("month")}, ${p("hour")}h${p("minute")}`;
}

/* ─────────────────────────  1. avaliar a regra  ────────────────────────── */

export type Avaliacao = {
  verdadeira: boolean;
  /** null quando a série não tem dado suficiente para decidir */
  indefinida: boolean;
  /** O valor que foi comparado */
  atual: number | null;
  /** Só em "variar mais de": o valor anterior, que é a base */
  base: number | null;
  /** Só em "variar mais de": atual − base, com sinal */
  variacao: number | null;
  /** Frase pronta em português, para tela e e-mail. Uma fonte, dois consumidores */
  explicacao: string;
};

/**
 * A condição "variar mais de" olha o módulo da diferença: subir 0,6 e cair
 * 0,6 são as duas uma variação maior que 0,5. Quem quer direção usa uma das
 * outras duas condições — foi decidido assim para a regra caber em três
 * campos sem um quarto seletor de sinal.
 */
export function avaliar(regra: Regra, serie: SerieResumo): Avaliacao {
  const vazio = (motivo: string): Avaliacao => ({
    verdadeira: false,
    indefinida: true,
    atual: null,
    base: null,
    variacao: null,
    explicacao: motivo,
  });

  if (!serie.ultimo) return vazio("A fonte não devolveu nenhum valor utilizável para esta série.");

  const atual = serie.ultimo.valor;
  const u = serie.unidade;

  if (regra.condicao === "subir-acima") {
    const verdadeira = atual > regra.valor;
    return {
      verdadeira,
      indefinida: false,
      atual,
      base: null,
      variacao: null,
      explicacao: `${serie.nome} está em ${comUnidade(atual, u)}, ${
        verdadeira ? "acima" : "não acima"
      } de ${comUnidade(regra.valor, u)}.`,
    };
  }

  if (regra.condicao === "cair-abaixo") {
    const verdadeira = atual < regra.valor;
    return {
      verdadeira,
      indefinida: false,
      atual,
      base: null,
      variacao: null,
      explicacao: `${serie.nome} está em ${comUnidade(atual, u)}, ${
        verdadeira ? "abaixo" : "não abaixo"
      } de ${comUnidade(regra.valor, u)}.`,
    };
  }

  // variar-mais: precisa da publicação anterior, e é ela que define a base.
  if (!serie.anterior) {
    return vazio("Esta série ainda não tem duas publicações — sem base, não há variação a medir.");
  }

  const base = serie.anterior.valor;
  const variacao = atual - base;
  const verdadeira = Math.abs(variacao) > regra.valor;

  return {
    verdadeira,
    indefinida: false,
    atual,
    base,
    variacao,
    explicacao: `${serie.nome} foi de ${comUnidade(base, u)} (${dataBr(
      serie.anterior.data,
    )}) para ${comUnidade(atual, u)} (${dataBr(serie.ultimo.data)}) — variação de ${
      variacao >= 0 ? "+" : "−"
    }${numeroBr(Math.abs(variacao))}, ${verdadeira ? "maior" : "não maior"} que ${numeroBr(
      regra.valor,
    )}.`,
  };
}

/**
 * A frase que a tela escreve ao lado do campo, para o "variar mais de" não
 * ficar ambíguo. IPCA é mensal e Selic é diária — sem isto, "variar mais de
 * 0,5" quer dizer coisas diferentes e ninguém sabe qual.
 */
export function descreverBase(regra: Regra, serie: SerieResumo): string | null {
  if (regra.condicao !== "variar-mais") return null;
  const cadencia = serie.periodicidade === "mensal" ? "mês contra mês" : "dia contra dia";
  return `Compara a última publicação com a anterior — ${cadencia}, como a fonte publica.`;
}

/* ───────────────────  2. disparar na travessia, não no estado  ──────────── */

export type DecisaoEnvio = {
  enviar: boolean;
  /** Para o registro de execuções e para o log */
  motivo: "travessia" | "ja-estava-verdadeira" | "falsa" | "indefinida";
};

/**
 * `estadoAnterior` é o que ficou guardado na última rodada:
 *   true  = a regra já estava verdadeira ontem
 *   false = estava falsa ontem
 *   null  = nunca foi avaliada (regra recém-confirmada)
 *
 * Regra nova que já nasce verdadeira **dispara**: a pessoa acabou de pedir
 * para ser avisada quando aquilo for verdade, e é verdade agora. O que ela
 * não faz é disparar de novo amanhã.
 */
export function decidirEnvio(avaliacao: Avaliacao, estadoAnterior: boolean | null): DecisaoEnvio {
  if (avaliacao.indefinida) return { enviar: false, motivo: "indefinida" };
  if (!avaliacao.verdadeira) return { enviar: false, motivo: "falsa" };
  if (estadoAnterior === true) return { enviar: false, motivo: "ja-estava-verdadeira" };
  return { enviar: true, motivo: "travessia" };
}

/* ────────────────────────  3. o contrafactual  ─────────────────────────── */

export type Contrafactual = {
  /** Quantas vezes a regra teria ido de falsa para verdadeira no histórico */
  travessias: number;
  /** Quantos pontos foram examinados */
  pontos: number;
  /** Primeira e última data examinadas */
  de: string | null;
  ate: string | null;
  /**
   * Só quando travessias === 0 e a condição é de limiar: o valor mais próximo
   * que teria disparado ao menos uma vez. null quando não há sugestão honesta.
   */
  sugestao: number | null;
  frase: string;
};

function verdadeiraEm(condicao: Condicao, valor: number, atual: number, anterior: number | null): boolean | null {
  if (condicao === "subir-acima") return atual > valor;
  if (condicao === "cair-abaixo") return atual < valor;
  if (anterior === null) return null;
  return Math.abs(atual - anterior) > valor;
}

/**
 * Percorre o histórico na ordem e conta as viradas falso→verdadeiro — a mesma
 * definição que o cron usa. Se contasse "dias em que era verdadeira", uma
 * Selic alta por 300 dias devolveria 300, e o número não teria relação nenhuma
 * com quantos e-mails a pessoa receberia. É o ponto inteiro do contrafactual:
 * **ele mede e-mails, não dias.**
 *
 * Por isso a primeira leitura, se já for verdadeira, **conta como disparo** —
 * exatamente como `decidirEnvio(avaliacao, null)` devolve "travessia" para uma
 * regra recém-confirmada que já nasce verdadeira. Quem se inscrevesse naquele
 * dia receberia um e-mail na primeira rodada, e o contrafactual mentiria se
 * fingisse que não. As duas funções precisam concordar; quando divergirem, é a
 * `decidirEnvio` que manda, porque é ela que gasta selo.
 */
export function contarTravessias(regra: Regra, historico: PontoSerie[], unidade: "%" | "R$"): Contrafactual {
  const pontos = historico.filter((p) => Number.isFinite(p.valor));
  const vazio: Contrafactual = {
    travessias: 0,
    pontos: 0,
    de: null,
    ate: null,
    sugestao: null,
    frase: "Sem histórico suficiente para dizer quantas vezes esta regra teria disparado.",
  };
  if (pontos.length < 2) return vazio;

  const contar = (valor: number): number => {
    let anteriorEstado: boolean | null = null;
    let n = 0;
    for (let i = 0; i < pontos.length; i++) {
      const anterior = i > 0 ? pontos[i - 1].valor : null;
      const estado = verdadeiraEm(regra.condicao, valor, pontos[i].valor, anterior);
      if (estado === null) continue;
      // `anteriorEstado === null` é a primeira leitura avaliável. Verdadeira ali
      // conta, porque é o que a rodada faria com uma regra recém-confirmada.
      if (estado && anteriorEstado !== true) n++;
      anteriorEstado = estado;
    }
    return n;
  };

  const travessias = contar(regra.valor);
  const de = pontos[0].data;
  const ate = pontos[pontos.length - 1].data;

  /**
   * O período é dito pelas datas que existem no histórico, não convertido em
   * "últimos N anos". A conversão exigia adivinhar quantas publicações cabem
   * num ano — 252 dias úteis para série diária, 12 para mensal — e o chute
   * produzia "nos últimos 1 anos" com oito pontos na mão. Data que veio da
   * fonte não precisa de aritmética para ser dita.
   */
  const periodo = `De ${dataBr(de)} a ${dataBr(ate)}`;

  if (travessias > 0) {
    return {
      travessias,
      pontos: pontos.length,
      de,
      ate,
      sugestao: null,
      frase:
        travessias === 1
          ? `${periodo}, essa regra teria disparado **1 vez**.`
          : `${periodo}, essa regra teria disparado **${travessias} vezes**.`,
    };
  }

  const sugestao = sugerirValor(regra, pontos, contar);
  return {
    travessias: 0,
    pontos: pontos.length,
    de,
    ate,
    sugestao,
    frase:
      sugestao === null
        ? `${periodo}, essa regra **nunca teria disparado**. Ela continua valendo daqui para a frente — mas pode ser que o aviso não chegue nunca.`
        : `${periodo}, essa regra **nunca teria disparado**. Com ${comUnidade(
            sugestao,
            unidade,
          )} no lugar, teria disparado ao menos uma vez.`,
  };
}

/**
 * A sugestão é procurada nos valores que a série realmente teve, não numa
 * interpolação — um limiar que existiu é honesto, um que nunca existiu é
 * chute. Devolve o que exige o menor deslocamento em relação ao que a pessoa
 * escreveu.
 */
function sugerirValor(
  regra: Regra,
  pontos: PontoSerie[],
  contar: (v: number) => number,
): number | null {
  if (regra.condicao === "variar-mais") {
    const variacoes: number[] = [];
    for (let i = 1; i < pontos.length; i++) variacoes.push(Math.abs(pontos[i].valor - pontos[i - 1].valor));
    const maior = Math.max(...variacoes);
    if (!Number.isFinite(maior) || maior <= 0) return null;
    const alvo = Math.floor(maior * 100) / 100;
    return alvo < regra.valor && contar(alvo) > 0 ? alvo : null;
  }

  const valores = [...new Set(pontos.map((p) => p.valor))].sort((a, b) => a - b);
  const candidatos = regra.condicao === "subir-acima" ? valores : [...valores].reverse();

  let melhor: number | null = null;
  for (const v of candidatos) {
    // Um passo para dentro do valor observado, para a comparação estrita passar.
    const alvo = regra.condicao === "subir-acima" ? arredondar(v - 0.01) : arredondar(v + 0.01);
    if (contar(alvo) > 0) {
      if (melhor === null || Math.abs(alvo - regra.valor) < Math.abs(melhor - regra.valor)) melhor = alvo;
    }
  }
  return melhor;
}

function arredondar(v: number): number {
  return Math.round(v * 100) / 100;
}

/* ──────────────────  4. o crivo — as rodadas fecham  ───────────────────── */

export type Rodada = {
  /** ISO 8601 do momento em que a rodada começou */
  em: string;
  lidas: number;
  total: number;
  /** ids das séries que vieram do fallback nesta rodada */
  degradadas: string[];
  regras: number;
  dispararam: number;
  jaVerdadeiras: number;
  enviados: number;
  /** Preenchido quando a rodada quebrou inteira */
  erro?: string;
  /** true = veio de disparo manual, não do agendador. Nunca conta no crivo */
  manual?: boolean;
};

export type Crivo = {
  ligadaEm: string | null;
  /** Dias corridos entre a primeira rodada agendada e hoje, inclusive */
  diasCorridos: number;
  /** Quantas rodadas agendadas existem no registro */
  rodadas: number;
  /** diasCorridos − rodadas, nunca negativo */
  buracos: number;
  fecha: boolean;
  frase: string;
};

/** Data no fuso de São Paulo, em AAAA-MM-DD. O cron é agendado em UTC, mas
 *  quem lê a página conta os dias no calendário dele. */
export function diaBrasilia(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "01";
  return `${p("year")}-${p("month")}-${p("day")}`;
}

function diferencaEmDias(deIso: string, ateIso: string): number {
  const de = Date.UTC(+deIso.slice(0, 4), +deIso.slice(5, 7) - 1, +deIso.slice(8, 10));
  const ate = Date.UTC(+ateIso.slice(0, 4), +ateIso.slice(5, 7) - 1, +ateIso.slice(8, 10));
  return Math.round((ate - de) / 86_400_000);
}

/**
 * A hora agendada em `vercel.json` (`"0 9 * * *"`, UTC) mais a folga do plano
 * Hobby, onde o disparo cai em qualquer minuto da hora marcada. Passadas essas
 * 10 horas do dia, a rodada daquele dia **era devida**.
 *
 * Se este número divergir do `vercel.json`, o crivo passa a acusar buraco que
 * não existe — ou a esconder buraco que existe. São o mesmo fato escrito em
 * dois lugares, e não há como o compilador ligar um ao outro.
 */
const HORA_DEVIDA_UTC = 9 + 1;

/**
 * O último dia cuja rodada já era devida.
 *
 * **Sem isto o crivo acusa um buraco falso toda madrugada.** O dia de hoje
 * entra em "dias corridos" à meia-noite, mas a rodada dele só acontece às 06h
 * — então entre 00h e 07h a conta sempre fecha com um buraco a mais, e a
 * moldura fica âmbar dizendo "faltou rodada" quando não faltou nada. Seis
 * horas por dia, um quarto do tempo, no número que é o argumento inteiro da
 * peça. Achado olhando a peça em produção, em 14/08, às 01h43.
 *
 * A conta é em UTC de propósito: o disparo é agendado em UTC, e uma rodada das
 * 09h UTC cai sempre no mesmo dia do calendário em São Paulo (09−3 = 06), então
 * os dois jeitos de datar concordam para toda rodada agendada.
 */
function ultimoDiaDevido(agoraIso: string): string {
  const agora = new Date(agoraIso);
  if (Number.isNaN(agora.getTime())) return agoraIso.slice(0, 10);
  const recuado = new Date(agora.getTime() - HORA_DEVIDA_UTC * 3_600_000);
  return recuado.toISOString().slice(0, 10);
}

/**
 * O crivo. Rodada manual não entra na conta dos dois lados — ela não prova
 * agendamento nenhum, e deixá-la contar permitiria "consertar" um buraco
 * clicando um botão, que é exatamente o que este número existe para impedir.
 *
 * Dois dias com duas rodadas agendadas contam como um dia coberto: o que se
 * confere é cobertura do calendário, não quantidade de execuções.
 */
export function conferirCalendario(registro: Rodada[], agoraIso: string): Crivo {
  const agendadas = registro.filter((r) => !r.manual);
  if (agendadas.length === 0) {
    return {
      ligadaEm: null,
      diasCorridos: 0,
      rodadas: 0,
      buracos: 0,
      fecha: true,
      frase: "Ainda não houve nenhuma rodada agendada. A primeira acontece amanhã de manhã.",
    };
  }

  /**
   * O corte não é "hoje", é **o último dia cuja rodada já era devida** — ver
   * `ultimoDiaDevido`. Usar "hoje" fazia a peça acusar buraco toda madrugada,
   * entre a virada do dia e a hora do disparo.
   */
  const hoje = ultimoDiaDevido(agoraIso);

  /**
   * Rodada com data posterior a hoje **não conta**. Em produção ela não
   * deveria existir — rodada é escrita quando acontece — mas o crivo é a única
   * alegação verificável desta peça, e ele não pode depender de nada estar
   * certo em outro lugar. Se contasse, um relógio adiantado ou um registro
   * adulterado tapariam um buraco de graça, que é exatamente o que este número
   * existe para impedir.
   *
   * O caso apareceu na conferência: o dublê semeava em UTC e o crivo conta em
   * São Paulo, então às 21h de Brasília nascia uma rodada "de amanhã" que
   * fechava a conta sozinha.
   */
  const dias = new Set(
    agendadas.map((r) => diaBrasilia(r.em)).filter((d) => d <= hoje),
  );
  if (dias.size === 0) {
    return {
      ligadaEm: null,
      diasCorridos: 0,
      rodadas: 0,
      buracos: 0,
      fecha: true,
      frase: "Ainda não houve nenhuma rodada agendada. A primeira acontece amanhã de manhã.",
    };
  }

  const ordenados = [...dias].sort();
  const ligadaEm = ordenados[0];

  const diasCorridos = diferencaEmDias(ligadaEm, hoje) + 1;
  const rodadas = dias.size;
  const buracos = Math.max(0, diasCorridos - rodadas);
  const fecha = buracos === 0;

  const plural = (n: number, um: string, muitos: string) => (n === 1 ? `1 ${um}` : `${n} ${muitos}`);

  return {
    ligadaEm,
    diasCorridos,
    rodadas,
    buracos,
    fecha,
    frase: fecha
      ? `Ligada em ${dataBr(ligadaEm)} · ${plural(diasCorridos, "dia corrido", "dias corridos")} · ${plural(
          rodadas,
          "rodada registrada",
          "rodadas registradas",
        )} · 0 buracos`
      : `Ligada em ${dataBr(ligadaEm)} · ${plural(diasCorridos, "dia corrido", "dias corridos")} · ${plural(
          rodadas,
          "rodada registrada",
          "rodadas registradas",
        )} · ${plural(buracos, "buraco", "buracos")}`,
  };
}

/** A linha de uma rodada, como aparece no registro e dentro do e-mail. */
export function descreverRodada(r: Rodada): string {
  if (r.erro) return `${momentoBr(r.em)} · a rodada falhou: ${r.erro}`;

  const partes: string[] = [`${momentoBr(r.em)}`];
  partes.push(`${r.lidas} de ${r.total} indicadores lidos`);
  if (r.degradadas.length > 0) partes.push(`${r.degradadas.join(", ")} veio do instantâneo`);
  partes.push(r.dispararam === 1 ? "1 regra disparou" : `${r.dispararam} regras dispararam`);
  if (r.jaVerdadeiras > 0) {
    partes.push(
      r.jaVerdadeiras === 1
        ? "1 já estava verdadeira, sem novo aviso"
        : `${r.jaVerdadeiras} já estavam verdadeiras, sem novo aviso`,
    );
  }
  if (r.enviados > 0) partes.push(r.enviados === 1 ? "1 e-mail enviado" : `${r.enviados} e-mails enviados`);
  if (r.manual) partes.push("disparo manual");
  return partes.join(" · ");
}

/* ─────────────────────  o token assinado, sem estado  ──────────────────── */

/**
 * A inscrição não escreve nada até alguém clicar no link do e-mail. O link
 * carrega a regra inteira assinada, então uma regra não confirmada não existe
 * em armazenamento nenhum: sem tabela de pendentes, sem TTL, sem faxina.
 *
 * O mesmo vale para o "sair da lista" — nenhuma tabela de tokens.
 *
 * É a família do crivo determinístico aplicada à autorização: não se pede boa
 * fé a ninguém e não se guarda estado para desconfiar depois. A assinatura
 * fecha ou não fecha.
 */

export type Carga = {
  email: string;
  serie: string;
  condicao: Condicao;
  valor: number;
  /** "c" = confirmar inscrição, "s" = sair da lista */
  acao: "c" | "s";
  /** Emitido em, epoch em segundos. Confirmação vence; saída não */
  em: number;
};

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Devolve `Uint8Array<ArrayBuffer>`, não `Uint8Array<ArrayBufferLike>` — o
 * buffer é criado aqui de propósito. `crypto.subtle` pede `BufferSource`, e um
 * `Uint8Array` de origem indeterminada pode, pelo tipo, estar apoiado num
 * `SharedArrayBuffer`, que não serve. O `tsc` pega isso; as conferências, não,
 * porque `node --experimental-strip-types` tira o tipo e não confere nada.
 * Mesmo formato do achado do `export {} from` em 10/08.
 */
function deBase64url(txt: string): Uint8Array<ArrayBuffer> {
  const s = txt.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function chave(segredo: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function assinar(carga: Carga, segredo: string): Promise<string> {
  const corpo = base64url(new TextEncoder().encode(JSON.stringify(carga)));
  const mac = await crypto.subtle.sign("HMAC", await chave(segredo), new TextEncoder().encode(corpo));
  return `${corpo}.${base64url(new Uint8Array(mac))}`;
}

/**
 * Devolve null para qualquer forma de token inválido — assinatura errada,
 * corpo corrompido, formato estranho. Quem chama não precisa distinguir os
 * motivos, e distinguir na resposta HTTP contaria ao atacante onde ele errou.
 *
 * `validadeSegundos = 0` desliga a expiração (é o caso do link de saída, que
 * precisa funcionar num e-mail de seis meses atrás).
 */
export async function conferirToken(
  token: string,
  segredo: string,
  validadeSegundos = 0,
  agoraSegundos = Math.floor(Date.now() / 1000),
): Promise<Carga | null> {
  const partes = token.split(".");
  if (partes.length !== 2) return null;

  const [corpo, mac] = partes;
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      await chave(segredo),
      deBase64url(mac),
      new TextEncoder().encode(corpo),
    );
  } catch {
    return null;
  }
  if (!ok) return null;

  try {
    const carga = JSON.parse(new TextDecoder().decode(deBase64url(corpo))) as Carga;
    if (typeof carga?.email !== "string" || typeof carga?.serie !== "string") return null;
    if (validadeSegundos > 0 && agoraSegundos - carga.em > validadeSegundos) return null;
    return carga;
  } catch {
    return null;
  }
}

/* ────────────────────────────  higiene  ────────────────────────────────── */

/**
 * Crivo do e-mail, na mesma linhagem do DDD da N5: forma, tamanho, um @ só,
 * ponto no domínio. Não confere se o endereço existe — isso quem confere é o
 * clique no link, que é o ponto inteiro da dupla confirmação.
 *
 * **Espaço nas pontas é aparado, de propósito.** Colar de outro campo traz
 * espaço, e recusar por isso seria rigor contra o usuário sem ganho nenhum de
 * segurança. `chaveRegra` apara igual, então o que é aceito aqui é exatamente
 * o que vira chave — se as duas divergissem, dois cadastros do mesmo endereço
 * conviveriam sem ninguém notar.
 */
export function emailValido(email: string): boolean {
  const e = email.trim();
  if (e.length < 6 || e.length > 254) return false;
  if (/\s/.test(e)) return false;
  const partes = e.split("@");
  if (partes.length !== 2) return false;
  const [local, dominio] = partes;
  if (local.length === 0 || local.length > 64) return false;
  if (!dominio.includes(".")) return false;
  if (dominio.startsWith(".") || dominio.endsWith(".") || dominio.includes("..")) return false;
  return /^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$/.test(e);
}

/** Chave de armazenamento. Normaliza o e-mail para não criar duas regras
 *  iguais só porque alguém digitou com maiúscula. */
export function chaveRegra(email: string, serie: string): string {
  return `regra:${email.trim().toLowerCase()}:${serie}`;
}

export const TETO_REGRAS_POR_EMAIL = 3;
export const VALIDADE_CONFIRMACAO_SEGUNDOS = 60 * 60 * 48;
