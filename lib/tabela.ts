/**
 * O leitor de tabela suja — o que a `/cobranca` pagou e a `/conciliacao` levanta.
 *
 * Extraído de `lib/cobranca.ts` em 10/08/2026, sem uma vírgula de mudança de
 * comportamento. Tudo que está aqui já rodava em produção na N5; a única coisa
 * nova é o `chutarColunas`, que é o `chutarMapa` dela com o dicionário virando
 * parâmetro em vez de constante.
 *
 * **Por que existe:** o `brief-11` prometeu que a N3 herdaria o leitor pronto, e
 * a única forma honesta de herdar é esta. Copiar o arquivo faria duas cópias
 * divergirem no primeiro conserto — e conserto de parser sempre vem depois do
 * primeiro arquivo real que ninguém previu.
 *
 * **Onde é a fronteira:** aqui mora o que não sabe de que peça está falando.
 * `Campo`, `Faixa`, `devedor`, `extrato` — nada disso entra. O teste é simples:
 * se um nome deste arquivo cita o domínio de alguma peça, ele está no arquivo
 * errado.
 *
 * A regra que atravessa tudo: **campo que o arquivo não traz sai `null`, nunca
 * zero.** Zero é um número que alguém soma sem perceber; `null` obriga a
 * decidir. Herdada do `nota-fiscal.ts`, e pelo mesmo motivo.
 */

/* --------------------------------------------------------------- decodificar */

/**
 * CSV de sistema brasileiro ainda sai em `windows-1252` com frequência
 * desconfortável. Ler como UTF-8 transforma `Transferência` em `Transferï¿½ncia`,
 * e qualquer casamento por descrição morre junto.
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
 * A sutileza que custou uma conferência na N5: **aspas só delimitam quando abrem
 * a célula.** `CONSTRUTORA "PONTE NOVA" LTDA` numa coluna sem aspas é nome de
 * empresa, não citação — tratar aquele `"` como delimitador comia as aspas e
 * entregava um nome adulterado. É o que o Excel faz, e é o certo: fora do começo
 * da célula, aspas são texto.
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
 * Relatório de sistema começa com "Extrato de conta corrente / Período 01/07 a
 * 31/07 / Titular" antes da tabela. A regra que funciona sem adivinhar o
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
    no meio do arquivo é dado ruim, não rodapé — e essa tem que sobreviver para
    virar uma linha explicada em vez de sumir aqui sem ninguém saber.
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
export function achatar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Chuta qual coluna é qual pelo nome do cabeçalho — e o chute é mostrado, não
 * aplicado em silêncio.
 *
 * É o ativo que a N5 produziu e a razão de ele existir vale para as duas peças:
 * **relatório de sistema não tem formato.** NF-e tem schema; export de ERP não
 * tem nada, e o mesmo dado chega como `Cliente`, `Sacado` ou `RAZAO_SOCIAL`.
 * Não existe parser possível — existe chute com conferência humana barata.
 *
 * **`campos` e `ordem` são coisas diferentes de propósito.** `campos` é a ordem
 * canônica do domínio — é ela que define a ordem das chaves do objeto devolvido,
 * e portanto o que sai de um `JSON.stringify`. `ordem` é a precedência de
 * consulta, que decide empates: na N5, `vencimento` e `valor` são consultados
 * antes porque "saldo devedor" contém "devedor" e "data de vencimento" contém
 * "data". Misturar as duas faz a forma pública do objeto mudar quando alguém
 * mexe num desempate, que é acoplamento silencioso.
 *
 * Coluna já tomada não é oferecida de novo. Duas passadas por campo: igualdade
 * exata primeiro, "contém" depois — sem isso, uma coluna chamada `Valor` perde
 * para `Valor do desconto` só por posição.
 */
export function chutarColunas<C extends string>(
  cabecalho: string[],
  pistas: Record<C, string[]>,
  campos: readonly C[],
  ordem: readonly C[] = campos,
): Record<C, number> {
  const achatado = cabecalho.map(achatar);
  const mapa = {} as Record<C, number>;
  for (const campo of campos) mapa[campo] = -1;
  const tomadas = new Set<number>();

  for (const campo of ordem) {
    for (const exato of [true, false]) {
      if (mapa[campo] !== -1) break;
      for (const pista of pistas[campo]) {
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

/* --------------------------------------------------------------- normalizar */

/**
 * Valor em dinheiro, no formato que vier.
 *
 * A armadilha silenciosa: `Number.parseFloat("1.234,56")` devolve `1.234` sem
 * reclamar. Mil e duzentos reais viram um e vinte e três, e nada no caminho
 * acusa.
 *
 * A regra que resolve sem adivinhação: **o último separador é o decimal** —
 * exceto quando há um só ponto seguido de exatamente três dígitos e nenhuma
 * vírgula, que é milhar brasileiro (`1.234`). "10.50" continua sendo dez e
 * cinquenta, e `1.234` continua sendo mil duzentos e trinta e quatro.
 */
export function normalizarValor(bruto: string): number | null {
  if (!bruto) return null;
  //   explícito: espaço fino, o que o `toLocaleString` produz, e o que
  // volta colado no valor quando alguém copia de uma página para a planilha.
  let s = bruto.replace(/ /g, " ").trim();
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
 * Sheets, `AAAAMMDD` em quem copiou layout de arquivo bancário. Ano de dois
 * dígitos vira 20xx até 69 e 19xx daí em diante — a convenção do próprio Excel.
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

/** Distância em dias corridos entre duas datas ISO. Positivo = `b` depois de `a`. */
export function diasEntre(a: string, b: string): number {
  const ms = Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z");
  return Math.round(ms / 86400000);
}

/* ---------------------------------------------------------------- o dinheiro */

export function reais(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Centavos inteiros a partir de um valor em reais.
 *
 * Existe por causa do crivo da soma do `brief-11`: somar float em ponto
 * flutuante e comparar com `===` acusa diferença onde não há. `0.1 + 0.2` é o
 * exemplo de manual, e uma conciliação de 200 linhas o encontra sozinha. Toda
 * comparação de igualdade de dinheiro nesta base passa por aqui.
 */
export function centavos(n: number): number {
  return Math.round(n * 100);
}

/* ------------------------------------------------------------------ o export */

/** Escapa uma célula para CSV de `;`. */
export function escaparCsv(v: string): string {
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Dinheiro com vírgula decimal, que é o que o Excel em português espera ler. */
export function dinheiroCsv(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

/**
 * CSV com `;`, BOM e CRLF.
 *
 * `;` porque o Excel em português trata vírgula como decimal e joga a linha
 * inteira numa célula só. BOM porque sem ele o mesmo Excel lê como ANSI e o
 * acento morre. As duas coisas são o que faz o arquivo **abrir**, em vez de
 * pedir um passo de importação — mesma decisão já tomada na `/nota-fiscal`.
 */
export function montarCsv(cabecalho: string[], linhas: string[][]): string {
  const linha = (celulas: string[]) => celulas.map(escaparCsv).join(";");
  return "﻿" + [linha(cabecalho), ...linhas.map(linha)].join("\r\n") + "\r\n";
}
