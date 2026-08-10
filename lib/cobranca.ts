/**
 * A lista de quem deve vira as mensagens prontas (brief-15).
 *
 * Módulo puro: tipos, leitura de CSV sujo, mapeamento de colunas, crivo de
 * telefone, agrupamento e geração de texto. Nenhuma importação de React,
 * nenhum acesso a rede, nenhum `window`. Serve ao componente de cliente e às
 * conferências do mesmo jeito.
 *
 * Duas regras atravessam o arquivo inteiro:
 *
 * 1. **Campo que o arquivo não traz sai `null`, nunca zero.** Zero é um número
 *    que alguém soma sem perceber; `null` obriga a decidir. Herdado do
 *    `nota-fiscal.ts`, e pelo mesmo motivo.
 * 2. **Nada é consertado em silêncio.** Telefone que não passa no crivo não
 *    vira link; vira uma linha na lista de quem não dá para contatar, com o
 *    motivo escrito e o valor original ao lado. Consertar calado é exatamente
 *    o que o modelo fez com a chave de 45 dígitos em 07/08.
 */

/* ------------------------------------------------------------------- tipos */

/** Os cinco campos que a peça precisa achar no CSV de quem chegou. */
export type Campo = "devedor" | "telefone" | "vencimento" | "valor" | "referencia";

export const CAMPOS: Campo[] = ["devedor", "telefone", "vencimento", "valor", "referencia"];

export const CAMPO_ROTULO: Record<Campo, string> = {
  devedor: "Quem deve",
  telefone: "Telefone",
  vencimento: "Vencimento",
  valor: "Valor",
  // Sem "(opcional)" aqui: quem desenha o menu já acrescenta o sufixo a partir
  // de CAMPO_OBRIGATORIO, e o rótulo saía "Documento (opcional) · opcional".
  // O rótulo diz o que o campo é; a obrigatoriedade é outro dado.
  referencia: "Documento",
};

/** `referencia` é o único que pode ficar sem coluna — o resto trava a leitura. */
export const CAMPO_OBRIGATORIO: Record<Campo, boolean> = {
  devedor: true,
  telefone: true,
  vencimento: true,
  valor: true,
  referencia: false,
};

/** Índice da coluna escolhida para cada campo. `-1` é "nenhuma". */
export type Mapa = Record<Campo, number>;

export type Faixa = "a-vencer" | "1-7" | "8-30" | "31-60" | "60+";

export const FAIXAS: Faixa[] = ["a-vencer", "1-7", "8-30", "31-60", "60+"];

export const FAIXA_ROTULO: Record<Faixa, string> = {
  "a-vencer": "A vencer",
  "1-7": "1 a 7 dias",
  "8-30": "8 a 30 dias",
  "31-60": "31 a 60 dias",
  "60+": "mais de 60 dias",
};

/**
 * Resultado do crivo do telefone.
 *
 * `valido` decide se existe link. `aviso` não impede nada — é o caso do fixo,
 * que é um telefone legítimo e provavelmente não tem WhatsApp. Reprovar um
 * fixo seria esconder o devedor; anunciar um link de fixo como se fosse
 * celular seria mentir. As duas coisas cabem porque são campos separados.
 */
export type Telefone = {
  original: string;
  /** Só dígitos, sem o 55 e sem o 0 de operadora. 10 ou 11 posições. */
  digitos: string | null;
  valido: boolean;
  motivo: string | null;
  aviso: string | null;
};

export type Titulo = {
  referencia: string | null;
  /** AAAA-MM-DD, sempre. Qualquer formato de entrada termina aqui. */
  vencimento: string;
  valor: number;
  /** Negativo é "vence daqui a N dias". Vence hoje é 0. */
  diasAtraso: number;
};

export type Devedor = {
  id: string;
  nome: string;
  telefone: Telefone;
  titulos: Titulo[];
  total: number;
  /** A faixa do título mais atrasado — é ela que escolhe o tom da mensagem. */
  faixa: Faixa;
  diasMaiorAtraso: number;
  /**
   * Quando o mesmo nome aparece com telefones diferentes no arquivo. Não é
   * erro do arquivo nem desta peça: é informação que quem cobra precisa ver
   * antes de mandar.
   */
  telefonesConflitantes: string[];
};

export type Descartada = {
  linha: number;
  motivo: string;
  /** O que estava escrito na célula, para a pessoa achar e corrigir na origem. */
  original: string;
};

export type Leitura = {
  devedores: Devedor[];
  /** Devedores cujo telefone reprovou no crivo. Nunca ganham link. */
  semContato: Devedor[];
  /** Linhas que nem chegaram a virar título — data ou valor ilegíveis. */
  descartadas: Descartada[];
  totalArquivo: number;
  linhasLidas: number;
  /** Soma dos devedores + sem contato bate com o total do arquivo. */
  somaConfere: boolean;
};

export type Encargos = {
  ligado: boolean;
  /** Multa única sobre o título, em %. */
  multaPercent: number;
  /** Juros de mora ao mês, em %. Rateados por dia. */
  jurosMesPercent: number;
};

export const ENCARGOS_DESLIGADOS: Encargos = {
  ligado: false,
  multaPercent: 0,
  jurosMesPercent: 0,
};

/**
 * Tetos usuais em venda para consumidor: multa de 2% e juros de 1% ao mês.
 * A peça não impede nada acima disso — ela avisa e manda conferir com quem
 * cuida do contrato, porque ela não conhece o contrato de ninguém. Isso não é
 * parecer jurídico, e a página diz isso com essas palavras.
 */
export const TETO_MULTA = 2;
export const TETO_JUROS_MES = 1;

/* --------------------------------------------------------------- decodificar */

/**
 * CSV de sistema brasileiro ainda sai em `windows-1252` com frequência
 * desconfortável. Ler como UTF-8 transforma `Cobrança` em `Cobranï¿½a`, e o
 * nome do devedor — que vai dentro da mensagem — sai quebrado.
 *
 * O teste é o próprio decodificador: `fatal: true` faz o UTF-8 lançar diante de
 * uma sequência inválida, e é exatamente essa a diferença entre os dois. Sem
 * `fatal`, o UTF-8 aceita qualquer coisa e devolve U+FFFD calado.
 */
export function decodificar(bytes: ArrayBuffer): string {
  try {
    const texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return texto.replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes).replace(/^﻿/, "");
  }
}

/* ------------------------------------------------------------------- ler CSV */

/**
 * Separador, descoberto e não presumido.
 *
 * Excel em português salva CSV com `;` porque a vírgula já é o decimal. Sheets
 * e sistemas exportam com `,`. Alguns ERPs cospem TAB. Contar fora das aspas é
 * o que impede `"Silva, João"` de eleger a vírgula num arquivo de `;`.
 */
function acharSeparador(linhas: string[]): string {
  const candidatos = [";", ",", "\t", "|"];
  let melhor = ";";
  let melhorNota = -1;

  for (const sep of candidatos) {
    let nota = 0;
    for (const linha of linhas.slice(0, 20)) {
      let dentro = false;
      let conta = 0;
      for (let i = 0; i < linha.length; i++) {
        const c = linha[i];
        if (c === '"') dentro = !dentro;
        else if (c === sep && !dentro) conta++;
      }
      nota += conta;
    }
    if (nota > melhorNota) {
      melhorNota = nota;
      melhor = sep;
    }
  }
  return melhor;
}

/**
 * Uma linha de CSV, respeitando aspas e o `""` que escapa aspas dentro delas.
 *
 * A sutileza que custou uma conferência: **aspas só delimitam quando abrem a
 * célula.** `CONSTRUTORA "PONTE NOVA" LTDA` numa coluna sem aspas é nome de
 * empresa, não citação — tratar aquele `"` como delimitador comia as aspas e
 * entregava um nome adulterado dentro da mensagem de cobrança. É o que o Excel
 * faz, e é o certo: fora do começo da célula, aspas são texto.
 */
function partirLinha(linha: string, sep: string): string[] {
  const celulas: string[] = [];
  let atual = "";
  let dentro = false;
  let comecouComAspas = false;

  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (c === '"') {
      if (dentro) {
        if (linha[i + 1] === '"') {
          atual += '"';
          i++;
        } else {
          dentro = false;
        }
      } else if (atual === "" && !comecouComAspas) {
        dentro = true;
        comecouComAspas = true;
      } else {
        atual += c;
      }
    } else if (c === sep && !dentro) {
      celulas.push(atual.trim());
      atual = "";
      comecouComAspas = false;
    } else {
      atual += c;
    }
  }
  celulas.push(atual.trim());
  return celulas;
}

export type Tabela = {
  cabecalho: string[];
  linhas: string[][];
  separador: string;
  /**
   * Número da linha **no arquivo original**, 1-based, de cada linha de
   * `linhas`. Existe porque quem vai corrigir o dado abre o arquivo no Excel,
   * e lá a contagem inclui o preâmbulo e as linhas em branco. Um número de
   * linha que não bate com o do editor é pior que nenhum.
   */
  numeros: number[];
  /** Linha do cabeçalho no arquivo original, 1-based. */
  linhaCabecalho: number;
  /** Linhas de rodapé de relatório cortadas do fim. */
  rodapeCortado: number;
};

/**
 * Acha o cabeçalho, que quase nunca está na primeira linha.
 *
 * Relatório de sistema começa com "Contas a receber / Empresa X / Período
 * 01/07 a 31/07" antes da tabela. A regra que funciona sem adivinhar o
 * conteúdo: **o cabeçalho é a primeira linha cujo número de colunas se repete
 * na linha seguinte.** Preâmbulo tem uma coluna só, ou um número que não se
 * repete; tabela é regular por definição.
 */
export function lerCsv(texto: string): Tabela | { erro: string } {
  // O número da linha no arquivo original viaja junto desde aqui. Perdê-lo e
  // recalculá-lo depois foi o primeiro jeito, e ele errava por uma linha em
  // todo arquivo com branco no meio do preâmbulo.
  const cheias = texto
    .split(/\r\n|\n|\r/)
    .map((texto, i) => ({ texto, numero: i + 1 }))
    .filter((l) => l.texto.trim() !== "");

  if (cheias.length < 2) return { erro: "O arquivo tem menos de duas linhas com conteúdo." };

  const separador = acharSeparador(cheias.map((l) => l.texto));

  let inicio = -1;
  for (let i = 0; i < Math.min(cheias.length - 1, 20); i++) {
    const cols = partirLinha(cheias[i].texto, separador).length;
    if (cols < 3) continue;
    if (partirLinha(cheias[i + 1].texto, separador).length === cols) {
      inicio = i;
      break;
    }
  }

  if (inicio === -1) {
    return {
      erro: `Não achei uma tabela aqui: nenhuma das 20 primeiras linhas tem 3 ou mais colunas separadas por "${separador}" que se repitam na linha seguinte.`,
    };
  }

  const cabecalho = partirLinha(cheias[inicio].texto, separador);
  const corpo = cheias
    .slice(inicio + 1)
    .map((l) => ({ celulas: partirLinha(l.texto, separador), numero: l.numero }))
    .filter((l) => l.celulas.some((v) => v !== ""));

  /*
    Rodapé de relatório — "Total geral;;;;13.964,56" — tem o mesmo número de
    colunas da tabela, então cortar por largura não pega. O que o distingue é a
    densidade: ele preenche duas células de cinco, e uma linha de dado de
    verdade preenche quase todas.

    Corta só do fim para cima, e por isso: rodapé mora embaixo. Uma linha rala
    no meio do arquivo é dado ruim, não rodapé — e essa tem que sobreviver até
    o `agrupar` para virar uma linha explicada na lista de descartadas, em vez
    de sumir aqui sem ninguém saber.
  */
  const minimo = Math.ceil(cabecalho.length / 2);
  let fim = corpo.length;
  while (fim > 0 && corpo[fim - 1].celulas.filter((v) => v !== "").length < minimo) fim--;

  return {
    cabecalho,
    linhas: corpo.slice(0, fim).map((l) => l.celulas),
    numeros: corpo.slice(0, fim).map((l) => l.numero),
    separador,
    linhaCabecalho: cheias[inicio].numero,
    rodapeCortado: corpo.length - fim,
  };
}

/* ---------------------------------------------------------------- o mapeador */

/** Sem acento, minúsculo, sem pontuação — para comparar cabeçalho com palavra-chave. */
function achatar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * As palavras que puxam o chute de cada campo, em ordem de força.
 *
 * A ordem importa: `data de vencimento` tem que ganhar de `data`, e `saldo
 * devedor` tem que ir para `valor` e não para `devedor` — por isso o casamento
 * é por palavra inteira e a lista de `valor` é consultada antes.
 */
const PISTAS: Record<Campo, string[]> = {
  vencimento: ["vencimento", "vence", "venc", "dt venc", "data venc", "data de vencimento", "due", "due date"],
  valor: ["valor", "vlr", "saldo devedor", "saldo", "valor devido", "valor em aberto", "total", "debito", "montante", "amount"],
  telefone: ["telefone", "celular", "fone", "whatsapp", "whats", "tel", "contato", "phone"],
  devedor: ["cliente", "sacado", "devedor", "nome", "razao social", "razao", "nome do cliente", "pagador", "customer"],
  referencia: ["documento", "doc", "nf", "nota", "titulo", "numero do titulo", "parcela", "pedido", "fatura", "referencia"],
};

/**
 * Chuta as cinco colunas pelo nome do cabeçalho — e o chute é mostrado, não
 * aplicado em silêncio.
 *
 * É aqui que esta peça se separa das duas anteriores. NF-e tem schema, OFX tem
 * especificação; **relatório de contas a receber não tem formato nenhum**, e o
 * mesmo dado chega como `Cliente`, `Sacado` ou `RAZAO_SOCIAL`. Não existe
 * parser possível — existe chute com conferência humana barata.
 *
 * Ordem de consulta deliberada: `vencimento` e `valor` primeiro, porque
 * "saldo devedor" contém "devedor" e "data de vencimento" contém "data".
 * Coluna já tomada não é oferecida de novo.
 */
export function chutarMapa(cabecalho: string[]): Mapa {
  const achatado = cabecalho.map(achatar);
  const mapa: Mapa = { devedor: -1, telefone: -1, vencimento: -1, valor: -1, referencia: -1 };
  const tomadas = new Set<number>();

  const ordem: Campo[] = ["vencimento", "valor", "telefone", "devedor", "referencia"];

  for (const campo of ordem) {
    // Duas passadas: igualdade exata primeiro, "contém" depois. Sem isso, uma
    // coluna chamada "Valor" perde para "Valor do desconto" só por posição.
    for (const exato of [true, false]) {
      if (mapa[campo] !== -1) break;
      for (const pista of PISTAS[campo]) {
        const i = achatado.findIndex(
          (h, idx) => !tomadas.has(idx) && (exato ? h === pista : h.includes(pista)),
        );
        if (i !== -1) {
          mapa[campo] = i;
          tomadas.add(i);
          break;
        }
      }
    }
  }

  return mapa;
}

export function mapaCompleto(mapa: Mapa): boolean {
  return CAMPOS.every((c) => !CAMPO_OBRIGATORIO[c] || mapa[c] !== -1);
}

/* --------------------------------------------------------------- normalizar */

/**
 * Valor em dinheiro, no formato que vier.
 *
 * A armadilha silenciosa: `Number.parseFloat("1.234,56")` devolve `1.234` sem
 * reclamar. Uma cobrança de mil e duzentos reais vira uma de um real e vinte e
 * três centavos, e nada no caminho acusa.
 *
 * A regra que resolve sem adivinhação: **o último separador é o decimal** —
 * exceto quando há um só ponto seguido de exatamente três dígitos e nenhuma
 * vírgula, que é milhar brasileiro (`1.234`). "10.50" continua sendo dez e
 * cinquenta, e `1.234` continua sendo mil duzentos e trinta e quatro.
 */
export function normalizarValor(bruto: string): number | null {
  if (!bruto) return null;
  // \u00A0 explicito: espaco fino e o que o `toLocaleString` produz, e o que
  // volta colado no valor quando alguem copia de uma pagina para a planilha.
  let s = bruto.replace(/\u00A0/g, " ").trim();
  if (!s) return null;

  // Contábil: parênteses são o sinal negativo.
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  }

  s = s.replace(/[R$\s]/gi, "");
  if (!/[0-9]/.test(s)) return null;
  if (/[^0-9.,]/.test(s)) return null;

  const ultimoPonto = s.lastIndexOf(".");
  const ultimaVirgula = s.lastIndexOf(",");

  if (ultimoPonto === -1 && ultimaVirgula === -1) {
    const n = Number(s);
    return Number.isFinite(n) ? (negativo ? -n : n) : null;
  }

  const decimal = ultimoPonto > ultimaVirgula ? "." : ",";
  const casas = s.length - s.lastIndexOf(decimal) - 1;

  // Milhar brasileiro sem centavos: um ponto, três dígitos depois, sem vírgula.
  const milharSeco = decimal === "." && ultimaVirgula === -1 && casas === 3 && s.indexOf(".") === ultimoPonto;

  const limpo = milharSeco
    ? s.replace(/\./g, "")
    : s
        .split(decimal)
        .map((parte, i) => (i === 0 ? parte.replace(/[.,]/g, "") : parte))
        .join(".");

  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/**
 * Data em qualquer um dos formatos que aparecem no mesmo país, para AAAA-MM-DD.
 *
 * `DD/MM/AAAA` no relatório do sistema, `AAAA-MM-DD` na planilha exportada do
 * Sheets, `AAAAMMDD` em quem copiou do layout de OFX. Ano de dois dígitos vira
 * 20xx até 69 e 19xx daí em diante — a convenção do próprio Excel.
 *
 * **Valida o dia contra o mês.** `31/02/2026` não é uma data e não pode virar
 * 03/03 por rolagem do `Date`, que é o que o construtor faz sozinho.
 */
export function normalizarData(bruto: string): string | null {
  if (!bruto) return null;
  const s = bruto.trim().split(/[\sT]/)[0];
  if (!s) return null;

  let ano: number, mes: number, dia: number;

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    ano = +m[1];
    mes = +m[2];
    dia = +m[3];
  } else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s))) {
    dia = +m[1];
    mes = +m[2];
    ano = +m[3];
    if (m[3].length === 2) ano += ano <= 69 ? 2000 : 1900;
  } else if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) {
    ano = +m[1];
    mes = +m[2];
    dia = +m[3];
  } else {
    return null;
  }

  if (mes < 1 || mes > 12) return null;
  if (dia < 1 || dia > diasNoMes(ano, mes)) return null;
  if (ano < 1900 || ano > 2200) return null;

  return `${ano}`.padStart(4, "0") + "-" + `${mes}`.padStart(2, "0") + "-" + `${dia}`.padStart(2, "0");
}

/** AAAA-MM-DD de uma Date, em data local — nunca `toISOString`, que é UTC. */
export function hojeISO(d: Date = new Date()): string {
  return (
    `${d.getFullYear()}`.padStart(4, "0") +
    "-" +
    `${d.getMonth() + 1}`.padStart(2, "0") +
    "-" +
    `${d.getDate()}`.padStart(2, "0")
  );
}

/**
 * Dias entre vencimento e hoje, contados em dia de calendário.
 *
 * `Date.UTC` sobre as três partes, e não `new Date(a) - new Date(b)`: assim a
 * conta não depende de fuso nem de horário de verão, e **vence hoje é 0, não
 * 1**. Um dia a mais joga o devedor para a faixa seguinte e muda o tom da
 * mensagem — é erro visível para quem recebe.
 */
export function diasDeAtraso(vencimento: string, hoje: string): number {
  const [ay, am, ad] = vencimento.split("-").map(Number);
  const [by, bm, bd] = hoje.split("-").map(Number);
  const venc = Date.UTC(ay, am - 1, ad);
  const ref = Date.UTC(by, bm - 1, bd);
  return Math.round((ref - venc) / 86400000);
}

export type Limites = { curto: number; medio: number; longo: number };
export const LIMITES_PADRAO: Limites = { curto: 7, medio: 30, longo: 60 };

export function faixaDe(dias: number, limites: Limites = LIMITES_PADRAO): Faixa {
  if (dias <= 0) return "a-vencer";
  if (dias <= limites.curto) return "1-7";
  if (dias <= limites.medio) return "8-30";
  if (dias <= limites.longo) return "31-60";
  return "60+";
}

/* ----------------------------------------------------- o crivo do telefone */

/**
 * Os DDDs que existem no Brasil. Lista fechada, versionada, não inferida.
 *
 * É o equivalente do módulo 11 da chave de NF-e: um crivo que não pede nada a
 * ninguém e reprova sozinho. Sem ele, `(00) 9999-9999` vira um link que abre a
 * conversa de um desconhecido com um texto de cobrança já escrito — que é o
 * dano real desta categoria de ferramenta, e é pior que dado errado numa
 * planilha, porque é uma acusação de dívida entregue a quem não deve nada.
 *
 * Como todo crivo, é peneira e não garantia: um número com DDD válido pode ser
 * de outra pessoa. Ele elimina o erro grosseiro, não o azar.
 */
export const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export function avaliarTelefone(bruto: string): Telefone {
  const original = (bruto ?? "").trim();
  const reprovar = (motivo: string): Telefone => ({
    original,
    digitos: null,
    valido: false,
    motivo,
    aviso: null,
  });

  if (!original) return reprovar("campo vazio");

  let d = original.replace(/\D/g, "");
  if (!d) return reprovar("não tem nenhum dígito");

  /*
    Código do país e o 0 de operadora saem antes de qualquer medição — mas o 0
    só sai se o que vem logo atrás for um DDD que existe.

    Sem essa condição, `(00) 99999-8888` perdia o primeiro zero, virava dez
    dígitos e era reprovado por "DDD 09 não existe" — motivo errado para o
    número certo, e um motivo errado manda a pessoa procurar o defeito no lugar
    errado do arquivo dela. Nenhum DDD começa com zero, então a condição nunca
    engole um número legítimo.
  */
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if ((d.length === 11 || d.length === 12) && d.startsWith("0") && DDDS.has(Number(d.slice(1, 3)))) {
    d = d.slice(1);
  }

  if (d.length < 10) {
    return reprovar(
      d.length === 8 || d.length === 9
        ? `${d.length} dígitos — falta o DDD`
        : `só ${d.length} dígito${d.length > 1 ? "s" : ""}`,
    );
  }
  if (d.length > 11) return reprovar(`${d.length} dígitos — número longo demais`);

  const ddd = Number(d.slice(0, 2));
  if (!DDDS.has(ddd)) return reprovar(`DDD ${d.slice(0, 2)} não existe`);

  const assinante = d.slice(2);
  if (/^(\d)\1+$/.test(assinante)) return reprovar("todos os dígitos iguais — é preenchimento, não telefone");

  if (assinante.length === 9) {
    if (assinante[0] !== "9") return reprovar("celular de 9 dígitos que não começa com 9");
    return { original, digitos: d, valido: true, motivo: null, aviso: null };
  }

  // 8 dígitos: fixo. Continua sendo telefone de verdade, e pode não ter
  // WhatsApp — vira aviso no cartão, não reprovação. Reprovar esconderia o
  // devedor; anunciar como celular seria mentir.
  if (assinante[0] === "9") return reprovar("celular sem o nono dígito");
  return {
    original,
    digitos: d,
    valido: true,
    motivo: null,
    aviso: "parece telefone fixo — pode não ter WhatsApp",
  };
}

/* ------------------------------------------------------------- o agrupamento */

/** Chave de agrupamento: nome sem acento, sem caixa e sem espaço duplicado. */
function chaveDevedor(nome: string): string {
  return achatar(nome);
}

/**
 * Do CSV mapeado para os cartões.
 *
 * O agrupamento por devedor não é refinamento — é a especificação. A Serasa
 * mediu, em 2026, **6,6 contas em atraso por micro e pequena empresa
 * inadimplente**: quem cobra não tem uma lista de pessoas, tem uma lista de
 * títulos, e o mesmo nome aparece nela várias vezes. Mandar seis mensagens
 * para a mesma pessoa é o que a mão faz quando cansa, e é o que queima o
 * cliente.
 *
 * A faixa do devedor é a do título **mais atrasado**, não a média nem a do
 * maior valor: é o atraso mais velho que define o tom com que se fala.
 */
export function agrupar(
  tabela: Tabela,
  mapa: Mapa,
  hoje: string,
  limites: Limites = LIMITES_PADRAO,
): Leitura {
  const porChave = new Map<string, Devedor>();
  const descartadas: Descartada[] = [];
  let totalArquivo = 0;

  const celula = (linha: string[], campo: Campo): string =>
    mapa[campo] === -1 ? "" : (linha[mapa[campo]] ?? "").trim();

  tabela.linhas.forEach((linha, i) => {
    const numeroLinha = tabela.numeros[i];

    const nome = celula(linha, "devedor");
    if (!nome) {
      descartadas.push({ linha: numeroLinha, motivo: "sem nome de quem deve", original: "" });
      return;
    }

    const brutoVenc = celula(linha, "vencimento");
    const vencimento = normalizarData(brutoVenc);
    if (!vencimento) {
      descartadas.push({
        linha: numeroLinha,
        motivo: "não entendi a data de vencimento",
        original: brutoVenc || "(vazio)",
      });
      return;
    }

    const brutoValor = celula(linha, "valor");
    const valor = normalizarValor(brutoValor);
    if (valor === null) {
      descartadas.push({
        linha: numeroLinha,
        motivo: "não entendi o valor",
        original: brutoValor || "(vazio)",
      });
      return;
    }
    if (valor <= 0) {
      descartadas.push({
        linha: numeroLinha,
        motivo: "valor zerado ou negativo — título quitado ou crédito",
        original: brutoValor,
      });
      return;
    }

    const titulo: Titulo = {
      referencia: celula(linha, "referencia") || null,
      vencimento,
      valor,
      diasAtraso: diasDeAtraso(vencimento, hoje),
    };

    totalArquivo += valor;

    const chave = chaveDevedor(nome);
    const existente = porChave.get(chave);
    const bruto = celula(linha, "telefone");

    if (existente) {
      existente.titulos.push(titulo);
      // Telefone diferente no mesmo nome não é escolhido em silêncio: o
      // primeiro que passou no crivo continua valendo, e o outro fica à vista.
      if (bruto && bruto !== existente.telefone.original) {
        const outro = avaliarTelefone(bruto);
        if (!existente.telefone.valido && outro.valido) existente.telefone = outro;
        else if (outro.valido && !existente.telefonesConflitantes.includes(bruto)) {
          existente.telefonesConflitantes.push(bruto);
        }
      }
    } else {
      porChave.set(chave, {
        id: chave,
        nome,
        telefone: avaliarTelefone(bruto),
        titulos: [titulo],
        total: 0,
        faixa: "a-vencer",
        diasMaiorAtraso: 0,
        telefonesConflitantes: [],
      });
    }
  });

  const todos = Array.from(porChave.values()).map((d) => {
    d.titulos.sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    d.total = d.titulos.reduce((s, t) => s + t.valor, 0);
    d.diasMaiorAtraso = Math.max(...d.titulos.map((t) => t.diasAtraso));
    d.faixa = faixaDe(d.diasMaiorAtraso, limites);
    return d;
  });

  // Mais atrasado primeiro; empate desce pelo valor. É a ordem em que alguém
  // que tem meia hora para cobrar quer atacar a lista.
  const ordenar = (a: Devedor, b: Devedor) =>
    b.diasMaiorAtraso - a.diasMaiorAtraso || b.total - a.total;

  const devedores = todos.filter((d) => d.telefone.valido).sort(ordenar);
  const semContato = todos.filter((d) => !d.telefone.valido).sort(ordenar);

  const somado = todos.reduce((s, d) => s + d.total, 0);

  return {
    devedores,
    semContato,
    descartadas,
    totalArquivo,
    linhasLidas: tabela.linhas.length,
    // Centavo de tolerância: soma de ponto flutuante não fecha na igualdade.
    somaConfere: Math.abs(somado - totalArquivo) < 0.01,
  };
}

/* ---------------------------------------------------------------- o dinheiro */

export function reais(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export type Acrescimo = { multa: number; juros: number; total: number };

/**
 * Multa uma vez sobre o título, juros do mês rateados por dia corrido.
 *
 * Nasce desligado e os campos nascem vazios. **A peça não sabe o que está no
 * contrato de ninguém**, e multa e juros de mora só valem se estiverem
 * previstos em contrato ou na nota — por isso ela nunca preenche um número
 * aqui por conta própria. Título a vencer não acumula nada.
 */
export function acrescimoDe(titulo: Titulo, encargos: Encargos): Acrescimo {
  if (!encargos.ligado || titulo.diasAtraso <= 0) return { multa: 0, juros: 0, total: 0 };
  const multa = titulo.valor * (encargos.multaPercent / 100);
  const juros = titulo.valor * (encargos.jurosMesPercent / 100) * (titulo.diasAtraso / 30);
  return { multa, juros, total: multa + juros };
}

export function totalComEncargos(devedor: Devedor, encargos: Encargos): number {
  return devedor.titulos.reduce((s, t) => s + t.valor + acrescimoDe(t, encargos).total, 0);
}

/* ---------------------------------------------------------------- a mensagem */

export type Textos = Record<Faixa, { abertura: string; fecho: string }>;

/**
 * Os textos padrão, por faixa.
 *
 * Duas regras que não são de estilo: **a peça nunca escreve ameaça** — nem na
 * faixa de mais de 60 dias há menção a protesto, negativação ou nome sujo,
 * porque cobrança vexatória é ilegal e esta peça não vai ser o instrumento. E
 * toda faixa termina abrindo conversa, porque quem está atrasado geralmente
 * está atrasado com todo mundo, e quem responde primeiro recebe primeiro.
 *
 * São padrões, não sentenças: cada um é editável na tela.
 */
export const TEXTOS_PADRAO: Textos = {
  "a-vencer": {
    abertura: "Olá, {nome}! Tudo bem? Passando só para lembrar do que vence em breve:",
    fecho: "Se já tiver pago, pode desconsiderar — pode ser cruzamento de datas. Qualquer dúvida, é só me chamar por aqui.",
  },
  "1-7": {
    abertura: "Olá, {nome}! Tudo bem? Notei que ficou isto em aberto:",
    fecho: "Se você já pagou nos últimos dias, me avisa que eu confirmo e dou baixa. Se ainda não deu, sem problema — me diz quando fica melhor.",
  },
  "8-30": {
    abertura: "Olá, {nome}. Estou passando por causa de um valor que segue em aberto:",
    fecho: "Consegue me dizer uma data em que dá para acertar? Se ficar melhor dividir, a gente vê junto.",
  },
  "31-60": {
    abertura: "Olá, {nome}. Preciso resolver este saldo em aberto com você:",
    fecho: "Me diz o que dá para fazer que eu tento me organizar do meu lado. Prefiro combinar com você a deixar isso parado.",
  },
  "60+": {
    abertura: "Olá, {nome}. Este saldo está em aberto há um tempo e eu preciso encaminhar uma solução:",
    fecho: "Prefiro muito combinar direto com você. Me chama aqui para a gente encontrar um jeito que caiba.",
  },
};

/** Formas jurídicas que ninguém escreve numa mensagem de WhatsApp. */
const SUFIXOS_JURIDICOS = new Set([
  "ltda", "ltda me", "me", "epp", "eireli", "mei", "sa", "s a", "cia", "filial", "matriz", "eirl",
]);

/** Palavras que ficam minúsculas no meio de um nome próprio. */
const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e", "di", "du", "a", "o"]);

/**
 * Como a mensagem chama quem deve.
 *
 * A primeira versão usava só o primeiro nome, e o exemplo entregou o defeito
 * pronto: `MERCADO DA ESQUINA LTDA` virava **"Olá, Mercado."** — visivelmente
 * quebrado para quem recebe, e o tipo de detalhe que faz alguém desconfiar da
 * ferramenta inteira antes de olhar o valor.
 *
 * Separar pessoa de empresa sem CNPJ na mão é indecidível: "Cafeteria Grão
 * Fino" não tem sufixo nenhum e não é gente. Então a peça não tenta adivinhar —
 * **usa o nome inteiro, tirando só a forma jurídica.** "Olá, José da Silva" é
 * um pouco formal e está certo; "Olá, Mercado" está errado. Entre os dois, o
 * formal ganha sempre.
 *
 * Só reescreve a caixa quando o nome vem TODO EM MAIÚSCULA, que é como sistema
 * antigo guarda. Nome já digitado com caixa mista é respeitado como está — quem
 * cadastrou sabia o que estava escrevendo.
 */
export function tratamento(nome: string): string {
  let palavras = nome.trim().split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return nome;

  // Até dois sufixos no fim: "COMERCIAL X LTDA ME" acontece.
  for (let i = 0; i < 2; i++) {
    if (palavras.length <= 1) break;
    const ultima = achatar(palavras[palavras.length - 1]);
    if (SUFIXOS_JURIDICOS.has(ultima)) palavras = palavras.slice(0, -1);
    else break;
  }

  const juntas = palavras.join(" ");
  if (juntas !== juntas.toUpperCase()) return juntas;

  return palavras
    .map((p, i) => {
      const baixo = p.toLowerCase();
      if (i > 0 && PARTICULAS.has(achatar(p))) return baixo;
      // Preserva o que não é letra na frente: `"DOIS` vira `"Dois`.
      return baixo.replace(/\p{L}/u, (c) => c.toUpperCase());
    })
    .join(" ");
}

/**
 * O texto final de um devedor.
 *
 * Determinístico e sem modelo de linguagem — zero chave, zero custo por uso, e
 * sobretudo: texto de cobrança não pode sair de algo que às vezes inventa um
 * valor. A `/nota-fiscal` já mostrou um modelo normalizar 45 dígitos para 44
 * em silêncio; o mesmo erro aqui é um valor errado cobrado de um cliente.
 */
export function montarMensagem(
  devedor: Devedor,
  textos: Textos,
  encargos: Encargos,
): string {
  const t = textos[devedor.faixa];
  const abertura = t.abertura.replace(/\{nome\}/g, tratamento(devedor.nome));

  const linhas = devedor.titulos.map((titulo) => {
    const ref = titulo.referencia ? `${titulo.referencia} — ` : "";
    const quando =
      titulo.diasAtraso > 0
        ? `venceu em ${dataBR(titulo.vencimento)} (${titulo.diasAtraso} ${titulo.diasAtraso === 1 ? "dia" : "dias"})`
        : titulo.diasAtraso === 0
          ? `vence hoje, ${dataBR(titulo.vencimento)}`
          : `vence em ${dataBR(titulo.vencimento)}`;
    const acrescimo = acrescimoDe(titulo, encargos);
    const valor =
      acrescimo.total > 0
        ? `${reais(titulo.valor)} + ${reais(acrescimo.total)} de encargos`
        : reais(titulo.valor);
    return `• ${ref}${valor} — ${quando}`;
  });

  const total = totalComEncargos(devedor, encargos);
  const fecho = devedor.titulos.length > 1 ? `Total: ${reais(total)}\n\n${t.fecho}` : t.fecho;

  return `${abertura}\n\n${linhas.join("\n")}\n\n${fecho}`;
}

/**
 * O link, e só para quem passou no crivo.
 *
 * `wa.me` com o país na frente, e o texto por `encodeURIComponent` — quebra de
 * linha e acento passam intactos por aí, e é o que mantém a mensagem legível
 * do outro lado. Devolve `null` para telefone reprovado: o chamador não
 * precisa lembrar de checar, porque não há link para esconder.
 */
export function linkWhatsapp(devedor: Devedor, mensagem: string): string | null {
  if (!devedor.telefone.valido || !devedor.telefone.digitos) return null;
  return `https://wa.me/55${devedor.telefone.digitos}?text=${encodeURIComponent(mensagem)}`;
}

/* ------------------------------------------------------------------ o export */

/**
 * CSV de resumo, com `;` e BOM.
 *
 * `;` porque o Excel em português trata vírgula como decimal e joga a linha
 * inteira numa célula só. BOM porque sem ele o mesmo Excel lê como ANSI e o
 * acento morre. As duas coisas são o que faz o arquivo **abrir**, em vez de
 * pedir um passo de importação — mesma decisão já tomada na `/nota-fiscal`.
 */
export function csvResumo(leitura: Leitura, encargos: Encargos): string {
  const cabecalho = [
    "devedor",
    "telefone",
    "titulos",
    "total",
    "total_com_encargos",
    "faixa",
    "dias_maior_atraso",
    "da_para_enviar",
    "motivo",
  ];

  const escapar = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const dinheiro = (n: number) => n.toFixed(2).replace(".", ",");

  const linha = (d: Devedor) =>
    [
      escapar(d.nome),
      escapar(d.telefone.valido ? d.telefone.digitos! : d.telefone.original),
      String(d.titulos.length),
      dinheiro(d.total),
      dinheiro(totalComEncargos(d, encargos)),
      FAIXA_ROTULO[d.faixa],
      String(d.diasMaiorAtraso),
      d.telefone.valido ? "sim" : "não",
      escapar(d.telefone.motivo ?? d.telefone.aviso ?? ""),
    ].join(";");

  const corpo = [...leitura.devedores, ...leitura.semContato].map(linha);
  return "﻿" + [cabecalho.join(";"), ...corpo].join("\r\n") + "\r\n";
}

/** Total por faixa, na ordem declarada — para o resumo e para a conta que fecha. */
export function porFaixa(devedores: Devedor[]): { faixa: Faixa; quantos: number; total: number }[] {
  return FAIXAS.map((faixa) => {
    const dela = devedores.filter((d) => d.faixa === faixa);
    return {
      faixa,
      quantos: dela.length,
      total: dela.reduce((s, d) => s + d.total, 0),
    };
  }).filter((f) => f.quantos > 0);
}
