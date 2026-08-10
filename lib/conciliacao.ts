/**
 * O que não bate entre o extrato e a planilha (brief-11).
 *
 * Módulo puro: tipos, normalização das duas fontes, motor de casamento, o crivo
 * da soma e o CSV de saída. Nenhuma importação de React, nenhum acesso a rede,
 * nenhum `window`. Serve ao componente de cliente e às conferências do mesmo
 * jeito — como em `cobranca.ts` e `nota-fiscal.ts`.
 *
 * **O leitor de arquivo não está aqui.** Ele mora em `lib/tabela.ts`, extraído
 * inteiro da `/cobranca` em 10/08/2026. Vírgula decimal, `windows-1252`,
 * cabeçalho fora da primeira linha, rodapé de relatório e separador descoberto
 * já vinham resolvidos e conferidos. O que este arquivo acrescenta é o diff.
 *
 * Três regras atravessam tudo:
 *
 * 1. **Aproximado nunca é declarado como casado.** Vira sugestão com o motivo
 *    escrito em português, e quem lê decide. É a diferença entre um conciliador
 *    e um `INNER JOIN` que mente com confiança.
 * 2. **Dinheiro se compara em centavos inteiros.** `0.1 + 0.2 !== 0.3` encontra
 *    sozinho uma conciliação de 200 linhas, e o crivo da soma acusaria uma
 *    diferença que não existe.
 * 3. **A soma tem que fechar.** Toda linha lida cai em exatamente uma lista, e a
 *    peça confere isso por conta própria antes de desenhar qualquer tabela.
 *    Motor de diff erra engolindo uma linha duas vezes ou perdendo uma, e as
 *    duas falhas são invisíveis numa tela bonita.
 */

import {
  achatar,
  centavos,
  chutarColunas,
  dataBR,
  diasEntre,
  dinheiroCsv,
  montarCsv,
  normalizarData,
  normalizarValor,
  reais,
  type Tabela,
} from "./tabela";

/* ------------------------------------------------------------------- tipos */

export type Lado = "extrato" | "planilha";

export const LADOS: Lado[] = ["extrato", "planilha"];

export const LADO_ROTULO: Record<Lado, string> = {
  extrato: "Extrato do banco",
  planilha: "Planilha de lançamentos",
};

/** A forma interna, e ela é a mesma para os dois arquivos — herdada da S3. */
export type Campo = "data" | "valor" | "descricao" | "documento";

export const CAMPOS: Campo[] = ["data", "valor", "descricao", "documento"];

export const CAMPO_ROTULO: Record<Campo, string> = {
  data: "Data",
  valor: "Valor",
  descricao: "Descrição",
  documento: "Documento",
};

/**
 * Só data e valor são obrigatórios — são os dois que o casamento usa.
 *
 * Descrição e documento entram porque são o que faz a linha ser reconhecível
 * por quem lê. Extrato sem descrição é uma lista de números, e ninguém confere
 * uma lista de números.
 */
export const CAMPO_OBRIGATORIO: Record<Campo, boolean> = {
  data: true,
  valor: true,
  descricao: false,
  documento: false,
};

export type Mapa = Record<Campo, number>;

export type Lancamento = {
  /** Lado de onde veio. Viaja junto porque o par carrega os dois. */
  lado: Lado;
  /** Número da linha no arquivo original, 1-based — o mesmo que o Excel mostra. */
  linha: number;
  /** AAAA-MM-DD. */
  data: string;
  /** Em reais, com sinal preservado como estava no arquivo. */
  valor: number;
  /** Em centavos inteiros e sem sinal — é por este que o casamento compara. */
  abs: number;
  descricao: string;
  documento: string | null;
  /** Identidade interna, única no lado. */
  chave: string;
};

/** Linha que não virou lançamento, com o motivo em português. */
export type Descartada = {
  linha: number;
  motivo: string;
  celulas: string[];
};

export type LeituraLado = {
  lado: Lado;
  lancamentos: Lancamento[];
  descartadas: Descartada[];
  /** Soma de `abs`, em centavos. É o número que o crivo persegue. */
  totalLido: number;
};

export type TipoPar = "exato" | "documento" | "deslocado" | "reduzido";

export type Par = {
  extrato: Lancamento;
  planilha: Lancamento;
  tipo: TipoPar;
  /** Dias entre as duas datas. Positivo = a planilha veio antes do extrato. */
  dias: number;
  /** Diferença em centavos, com sinal: negativo = caiu menos na conta. */
  delta: number;
  /** Em português, e nunca um score. */
  motivo: string;
};

export type Problema = { lado: Lado | "os dois"; texto: string };

export type Conferencia = {
  fecha: boolean;
  lados: Record<
    Lado,
    {
      lancamentos: number;
      classificados: number;
      totalLido: number;
      totalClassificado: number;
    }
  >;
  problemas: Problema[];
};

export type Resultado = {
  casados: Par[];
  provaveis: Par[];
  soExtrato: Lancamento[];
  soPlanilha: Lancamento[];
  conferencia: Conferencia;
};

/* ------------------------------------------------------------- o mapeador */

/**
 * As pistas de cabeçalho de cada campo, em ordem de força.
 *
 * Vale para os dois arquivos de propósito: o mesmo dicionário lê `Data;
 * Histórico; Valor` de um extrato e `Data da venda; Cliente; Total` de uma
 * planilha de vendas. **É o mesmo mapeador da N5, com outro dicionário** — e
 * usar o mesmo mecanismo em dois domínios diferentes é o que separa um ativo
 * de uma funcionalidade.
 */
const PISTAS: Record<Campo, string[]> = {
  data: [
    "data", "dt", "data lancamento", "data do lancamento", "data da venda",
    "data pagamento", "data de pagamento", "competencia", "emissao", "date",
  ],
  valor: [
    "valor", "vlr", "montante", "total", "valor total", "credito", "debito",
    "valor r", "quantia", "amount", "value",
  ],
  descricao: [
    "historico", "descricao", "lancamento", "detalhe", "memo", "cliente",
    "favorecido", "beneficiario", "observacao", "obs", "description",
  ],
  documento: [
    "documento", "doc", "numero do documento", "num doc", "nf", "nota",
    "nota fiscal", "pedido", "titulo", "identificador", "id", "autenticacao",
  ],
};

/**
 * Precedência de consulta — ela decide os empates, e a ordem não é arbitrária.
 *
 * `valor` antes de `descricao` porque "valor" aparece dentro de "descrição do
 * valor"; `documento` por último porque "id" e "doc" são curtos e casam com
 * muita coisa por "contém".
 */
const ORDEM_DO_CHUTE: Campo[] = ["data", "valor", "documento", "descricao"];

export function chutarMapa(cabecalho: string[]): Mapa {
  return chutarColunas(cabecalho, PISTAS, CAMPOS, ORDEM_DO_CHUTE);
}

export function mapaCompleto(mapa: Mapa): boolean {
  return CAMPOS.every((c) => !CAMPO_OBRIGATORIO[c] || mapa[c] !== -1);
}

/* ------------------------------------------------------------ normalizar */

/**
 * Acima disto a peça avisa em vez de congelar.
 *
 * O casamento aproximado compara cada linha que sobrou de um lado com cada uma
 * do outro, então o custo é o produto. Extrato de PME é da ordem de centenas de
 * linhas; 4.000 × 4.000 já são 16 milhões de comparações e uma aba travada. O
 * `brief-11` pede que o N seja medido e avisado, não descoberto pelo visitante.
 */
export const LIMITE_LINHAS = 4000;

/**
 * A tabela lida vira lançamentos, e o que não vira fica registrado com motivo.
 *
 * **Nada some em silêncio.** Uma linha sem data legível não é descartada e
 * esquecida: ela entra em `descartadas` com o número da linha do arquivo e a
 * razão, e a tela a mostra. É a mesma regra da lista de recusas da N5 — e é o
 * que permite dizer, na frente do visitante, quantas linhas o arquivo tinha e
 * quantas viraram dado.
 */
export function normalizar(tabela: Tabela, mapa: Mapa, lado: Lado): LeituraLado {
  const lancamentos: Lancamento[] = [];
  const descartadas: Descartada[] = [];

  const pega = (celulas: string[], campo: Campo): string => {
    const i = mapa[campo];
    return i === -1 ? "" : (celulas[i] ?? "").trim();
  };

  for (let i = 0; i < tabela.linhas.length; i++) {
    const celulas = tabela.linhas[i];
    const linha = tabela.numeros[i];

    const dataBruta = pega(celulas, "data");
    const valorBruto = pega(celulas, "valor");

    const data = normalizarData(dataBruta);
    const valor = normalizarValor(valorBruto);

    if (data === null && valor === null) {
      descartadas.push({
        linha,
        celulas,
        motivo: `não achei data nem valor (li "${dataBruta}" e "${valorBruto}")`,
      });
      continue;
    }
    if (data === null) {
      descartadas.push({ linha, celulas, motivo: `não entendi a data "${dataBruta}"` });
      continue;
    }
    if (valor === null) {
      descartadas.push({ linha, celulas, motivo: `não entendi o valor "${valorBruto}"` });
      continue;
    }
    if (valor === 0) {
      descartadas.push({ linha, celulas, motivo: "valor zerado — não há o que conciliar" });
      continue;
    }

    const documento = pega(celulas, "documento");

    lancamentos.push({
      lado,
      linha,
      data,
      valor,
      abs: Math.abs(centavos(valor)),
      descricao: pega(celulas, "descricao"),
      documento: documento === "" ? null : documento,
      chave: `${lado}:${linha}`,
    });
  }

  return {
    lado,
    lancamentos,
    descartadas,
    totalLido: lancamentos.reduce((s, l) => s + l.abs, 0),
  };
}

/* ------------------------------------------------------------ o casamento */

export type Parametros = {
  /** Janela de dias para o par deslocado e para o reduzido. */
  janelaDias: number;
  /** Tolerância em porcentagem do maior valor do par. */
  toleranciaPercent: number;
  /** Piso da tolerância, em reais. Vale o que for maior entre os dois. */
  toleranciaReais: number;
};

export const PARAMETROS_PADRAO: Parametros = {
  janelaDias: 3,
  toleranciaPercent: 5,
  toleranciaReais: 5,
};

/** A tolerância em centavos para um par — o maior entre o percentual e o piso. */
function toleranciaDe(a: Lancamento, b: Lancamento, p: Parametros): number {
  const maior = Math.max(a.abs, b.abs);
  const porPercent = Math.round((maior * p.toleranciaPercent) / 100);
  const piso = centavos(p.toleranciaReais);
  return Math.max(porPercent, piso);
}

function motivoDe(dias: number, delta: number, maior: number): string {
  const partes: string[] = [];

  if (delta !== 0) {
    const quanto = reais(Math.abs(delta) / 100);
    partes.push(delta < 0 ? `${quanto} a menos` : `${quanto} a mais`);
  } else {
    partes.push("mesmo valor");
  }

  if (dias !== 0) {
    partes.push(`${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"} de diferença`);
  }

  const base = partes.join(", ");

  /*
    O palpite de origem só sai quando a forma cabe: caiu menos, e a diferença é
    pequena *em relação ao valor* — que é o formato de uma taxa. O limite é
    relativo de propósito. Um teto fixo em reais chamaria R$ 20 de taxa num par
    de R$ 40 e não chamaria num par de R$ 4.000, que é o contrário do certo.

    Não é declaração, é o que a pessoa vai conferir. Com a tolerância aberta no
    painel, uma diferença de 40% deixa de receber este sufixo sozinha.
  */
  if (delta < 0 && Math.abs(delta) <= Math.round(maior * 0.05)) return `${base} — parece taxa`;
  return base;
}

function motivoDocumento(doc: string, dias: number, delta: number): string {
  const partes = [`mesmo documento ${doc}`];

  if (delta !== 0) {
    const quanto = reais(Math.abs(delta) / 100);
    partes.push(delta < 0 ? `${quanto} a menos` : `${quanto} a mais`);
  }
  if (dias !== 0) {
    partes.push(`${Math.abs(dias)} ${Math.abs(dias) === 1 ? "dia" : "dias"} de diferença`);
  }
  /*
    Cai aqui quando data e valor batem e a regra 1 não pegou — acontece com
    linhas gêmeas, em que a primeira já consumiu o par exato disponível. Vale
    dizer que bate tudo, senão o motivo fica pela metade.
  */
  if (partes.length === 1) partes.push("mesmo valor e mesma data");

  return partes.join(", ");
}

/**
 * Índice de documento → posições, para achar quem é único.
 *
 * Só serve documento que aparece **uma vez** do lado dele. Documento repetido
 * não identifica nada: numa lista onde `1`, `2`, `3` são a numeração interna de
 * cada arquivo, casar por igualdade produziria dezenas de pares inventados com
 * a mesma cara de um par legítimo. O guarda é determinístico e barato, e é
 * preferível a um limiar de esperteza.
 */
function porDocumento(lancamentos: Lancamento[]): Map<string, number[]> {
  const mapa = new Map<string, number[]>();
  for (let i = 0; i < lancamentos.length; i++) {
    const doc = achatar(lancamentos[i].documento ?? "");
    if (!doc) continue;
    const fila = mapa.get(doc);
    if (fila) fila.push(i);
    else mapa.set(doc, [i]);
  }
  return mapa;
}

type Candidato = { i: number; j: number; dias: number; delta: number };

/**
 * Cruza os dois lados e devolve as quatro listas.
 *
 * Quatro regras, nesta ordem:
 *
 * 1. **Exato** — mesmo valor absoluto e mesma data. Casa e sai da fila dos dois
 *    lados. É a única que declara casamento.
 * 2. **Mesmo documento** — o número bate dos dois lados e é único em cada um.
 *    Vira provável par **independente de janela e de tolerância**, porque
 *    identidade não decai com o tempo nem com a taxa. Acrescentada em 10/08.
 * 3. **Deslocado no tempo** — mesmo valor, data dentro da janela. A venda de
 *    sexta que cai na conta na segunda.
 * 4. **Reduzido no valor** — dentro da janela, valor diferente por menos que a
 *    tolerância. A taxa do gateway que come R$ 1,37.
 *
 * **Por que a regra 2 vem depois da 1 e antes da 3.** Antes da 3 porque
 * identidade declarada ganha de proximidade inferida: um boleto pago com dez
 * dias de atraso e R$ 12 de juros está fora da janela e fora da tolerância, e
 * sem esta regra viraria dois órfãos. Depois da 1 porque **o exato é a única
 * regra que afirma**, e ele se apoia em dois fatos independentes coincidindo,
 * enquanto o documento é um campo cujo significado a peça está adivinhando pelo
 * cabeçalho. Deixar um chute do mapeador preemptar um casamento exato faria uma
 * coluna mal mapeada rebaixar pares bons a sugestões.
 *
 * **O custo dessa ordem, dito em voz alta:** um par de documento pode ser
 * desfeito por uma coincidência de data e valor em outro lugar. É raro, e a
 * linha perdida não some — vira órfã e aparece na tela.
 *
 * E a regra 2 **não vira "exato"**, nunca. `Documento` no extrato pode ser
 * número de cheque, e `Nota fiscal` na planilha é outra coisa. Data e valor são
 * fatos que coincidem; documento é uma alegação de identidade. Alegação vira
 * sugestão com o motivo escrito, e quem lê decide.
 *
 * **Um lado nunca casa duas vezes.** As regras 1 e 2 são resolvidas por índice,
 * em ordem de arquivo. As regras 3 e 4 geram todos os pares possíveis, ordenam
 * por distância — primeiro dias, depois centavos, e o número da linha como
 * último desempate — e consomem de cima para baixo pulando quem já casou. Isso é
 * ganancioso e não é o ótimo global de um problema de atribuição; é
 * **determinístico**, que é o que o brief pede, e o mesmo arquivo devolve
 * sempre o mesmo resultado.
 */
export function conciliar(
  ext: LeituraLado,
  pla: LeituraLado,
  p: Parametros = PARAMETROS_PADRAO,
): Resultado {
  const a = ext.lancamentos;
  const b = pla.lancamentos;

  const usadoA = new Array<boolean>(a.length).fill(false);
  const usadoB = new Array<boolean>(b.length).fill(false);

  const casados: Par[] = [];
  const provaveis: Par[] = [];

  /* 1. exato — por índice, para não varrer n×m à toa */

  const porChave = new Map<string, number[]>();
  for (let j = 0; j < b.length; j++) {
    const k = `${b[j].data}|${b[j].abs}`;
    const fila = porChave.get(k);
    if (fila) fila.push(j);
    else porChave.set(k, [j]);
  }

  for (let i = 0; i < a.length; i++) {
    const fila = porChave.get(`${a[i].data}|${a[i].abs}`);
    if (!fila) continue;
    const j = fila.find((x) => !usadoB[x]);
    if (j === undefined) continue;
    usadoA[i] = true;
    usadoB[j] = true;
    casados.push({
      extrato: a[i],
      planilha: b[j],
      tipo: "exato",
      dias: 0,
      delta: 0,
      motivo: "mesmo valor, mesma data",
    });
  }

  /* 2. mesmo documento — identidade, não proximidade */

  const docsA = porDocumento(a);
  const docsB = porDocumento(b);

  for (const [doc, deA] of docsA) {
    if (deA.length !== 1) continue;
    const deB = docsB.get(doc);
    if (!deB || deB.length !== 1) continue;

    const i = deA[0];
    const j = deB[0];
    if (usadoA[i] || usadoB[j]) continue;

    usadoA[i] = true;
    usadoB[j] = true;

    const dias = diasEntre(b[j].data, a[i].data);
    const delta = a[i].abs - b[j].abs;
    provaveis.push({
      extrato: a[i],
      planilha: b[j],
      tipo: "documento",
      dias,
      delta,
      motivo: motivoDocumento(a[i].documento ?? b[j].documento ?? doc, dias, delta),
    });
  }

  /* 3 e 4. aproximado — todos os candidatos, ordenados por distância */

  const candidatos: Candidato[] = [];

  for (let i = 0; i < a.length; i++) {
    if (usadoA[i]) continue;
    for (let j = 0; j < b.length; j++) {
      if (usadoB[j]) continue;

      const dias = diasEntre(b[j].data, a[i].data);
      if (Math.abs(dias) > p.janelaDias) continue;

      // Sem pré-filtro por um teto global: ele economizaria três operações
      // aritméticas e criaria a chance de descartar um par legítimo quando um
      // lado tem valor maior que qualquer coisa do outro. A tolerância do par
      // é a única regra, e ela é calculada por par.
      const delta = a[i].abs - b[j].abs;
      if (delta !== 0 && Math.abs(delta) > toleranciaDe(a[i], b[j], p)) continue;

      candidatos.push({ i, j, dias, delta });
    }
  }

  candidatos.sort(
    (x, y) =>
      Math.abs(x.dias) - Math.abs(y.dias) ||
      Math.abs(x.delta) - Math.abs(y.delta) ||
      x.i - y.i ||
      x.j - y.j,
  );

  for (const c of candidatos) {
    if (usadoA[c.i] || usadoB[c.j]) continue;
    usadoA[c.i] = true;
    usadoB[c.j] = true;
    provaveis.push({
      extrato: a[c.i],
      planilha: b[c.j],
      tipo: c.delta === 0 ? "deslocado" : "reduzido",
      dias: c.dias,
      delta: c.delta,
      motivo: motivoDe(c.dias, c.delta, Math.max(a[c.i].abs, b[c.j].abs)),
    });
  }

  /* 4. o que sobrou */

  const soExtrato = a.filter((_, i) => !usadoA[i]);
  const soPlanilha = b.filter((_, j) => !usadoB[j]);

  return {
    casados,
    provaveis,
    soExtrato,
    soPlanilha,
    conferencia: conferir(ext, pla, { casados, provaveis, soExtrato, soPlanilha }),
  };
}

/* --------------------------------------------------------- o crivo da soma */

/**
 * A peça que confere tem que conferir a si mesma, na frente de quem olha.
 *
 * Este é o crivo determinístico desta peça, na mesma linhagem do `chaveConfere`
 * da `/nota-fiscal` (módulo 11) e do crivo de telefone da `/cobranca`. Ele não
 * checa se o casamento está *certo* — isso nenhum programa sabe. Checa que
 * **nenhuma linha foi perdida nem contada duas vezes**, que é exatamente o modo
 * como um motor de diff falha sem que a tela mostre.
 *
 * Duas conferências independentes, e as duas precisam passar:
 *
 * - **contagem** — casados + prováveis + órfãos = lançamentos lidos, por lado
 * - **centavos** — a soma dos valores absolutos classificados = o total lido
 *
 * É crivo, não garantia: dois erros podem se cancelar, e a mesma ressalva já
 * estava escrita para o `chaveConfere`. Fechar nas duas dimensões ao mesmo
 * tempo derruba quase tudo que fecharia por sorte.
 */
export function conferir(
  ext: LeituraLado,
  pla: LeituraLado,
  listas: Pick<Resultado, "casados" | "provaveis" | "soExtrato" | "soPlanilha">,
): Conferencia {
  const problemas: Problema[] = [];

  const doLado = (leitura: LeituraLado) => {
    const lado = leitura.lado;
    const dele: Lancamento[] = [
      ...listas.casados.map((par) => par[lado]),
      ...listas.provaveis.map((par) => par[lado]),
      ...(lado === "extrato" ? listas.soExtrato : listas.soPlanilha),
    ];

    const vistas = new Set<string>();
    for (const l of dele) {
      if (vistas.has(l.chave)) {
        problemas.push({
          lado,
          texto: `a linha ${l.linha} aparece em mais de uma lista`,
        });
      }
      vistas.add(l.chave);
    }

    const classificados = dele.length;
    const totalClassificado = dele.reduce((s, l) => s + l.abs, 0);

    if (classificados !== leitura.lancamentos.length) {
      const faltam = leitura.lancamentos.length - classificados;
      problemas.push({
        lado,
        texto:
          faltam > 0
            ? `${faltam} ${faltam === 1 ? "linha ficou" : "linhas ficaram"} de fora das listas`
            : `${-faltam} ${-faltam === 1 ? "linha foi contada" : "linhas foram contadas"} mais de uma vez`,
      });
    }

    if (totalClassificado !== leitura.totalLido) {
      const dif = (totalClassificado - leitura.totalLido) / 100;
      problemas.push({
        lado,
        texto: `a soma das listas dá ${reais(Math.abs(dif))} ${dif > 0 ? "a mais" : "a menos"} que o total lido`,
      });
    }

    return {
      lancamentos: leitura.lancamentos.length,
      classificados,
      totalLido: leitura.totalLido,
      totalClassificado,
    };
  };

  const lados = { extrato: doLado(ext), planilha: doLado(pla) };

  return { fecha: problemas.length === 0, lados, problemas };
}

/* ------------------------------------------------------------------ a saída */

export type LinhaExport = {
  arquivo: string;
  linha: number;
  data: string;
  descricao: string;
  documento: string;
  valor: string;
  situacao: string;
  motivo: string;
  casouCom: string;
};

/**
 * Um arquivo só, uma linha por linha lida dos dois arquivos.
 *
 * **O provável par entra, e entra com o motivo em coluna própria** — decisão
 * dele em 10/08. Sem essa coluna, o arquivo que vai para o contador transforma
 * uma sugestão em um par, e a cautela que existe na tela morre na borda do
 * arquivo. É o mesmo formato do `wa.me` com o número errado da N5.
 *
 * Consequência boa e deliberada: **a soma fecha dentro do arquivo também.**
 * Quem recebe soma a coluna de valor de um lado e chega no total lido daquele
 * lado. Nada sai omitido em silêncio, e é isso que a palavra `confere`
 * significa.
 *
 * Sem segundo botão: "só o que não bateu" é um filtro no Excel, não outro
 * arquivo.
 */
export function linhasDoExport(
  ext: LeituraLado,
  pla: LeituraLado,
  r: Resultado,
): LinhaExport[] {
  const linhas: LinhaExport[] = [];

  const base = (l: Lancamento) => ({
    arquivo: LADO_ROTULO[l.lado],
    linha: l.linha,
    data: dataBR(l.data),
    descricao: l.descricao,
    documento: l.documento ?? "",
    valor: dinheiroCsv(l.valor),
  });

  for (const par of r.casados) {
    linhas.push({ ...base(par.extrato), situacao: "casou", motivo: par.motivo, casouCom: `linha ${par.planilha.linha} da planilha` });
    linhas.push({ ...base(par.planilha), situacao: "casou", motivo: par.motivo, casouCom: `linha ${par.extrato.linha} do extrato` });
  }

  for (const par of r.provaveis) {
    linhas.push({ ...base(par.extrato), situacao: "provável", motivo: par.motivo, casouCom: `linha ${par.planilha.linha} da planilha` });
    linhas.push({ ...base(par.planilha), situacao: "provável", motivo: par.motivo, casouCom: `linha ${par.extrato.linha} do extrato` });
  }

  for (const l of r.soExtrato) {
    linhas.push({ ...base(l), situacao: "só no extrato", motivo: "", casouCom: "" });
  }
  for (const l of r.soPlanilha) {
    linhas.push({ ...base(l), situacao: "só na planilha", motivo: "", casouCom: "" });
  }

  // As não lidas fecham o arquivo: quem soma as linhas do CSV e compara com o
  // arquivo de origem tem que chegar no mesmo número de linhas.
  for (const leitura of [ext, pla]) {
    for (const d of leitura.descartadas) {
      linhas.push({
        arquivo: LADO_ROTULO[leitura.lado],
        linha: d.linha,
        data: "",
        descricao: d.celulas.join(" ").slice(0, 120),
        documento: "",
        valor: "",
        situacao: "não lida",
        motivo: d.motivo,
        casouCom: "",
      });
    }
  }

  linhas.sort((x, y) => x.arquivo.localeCompare(y.arquivo, "pt-BR") || x.linha - y.linha);
  return linhas;
}

export function csvConciliacao(ext: LeituraLado, pla: LeituraLado, r: Resultado): string {
  const cabecalho = [
    "arquivo",
    "linha",
    "data",
    "descricao",
    "documento",
    "valor",
    "situacao",
    "motivo",
    "casou_com",
  ];

  // Sem escapar aqui: `montarCsv` escapa toda célula, e escapar duas vezes
  // transforma `SILVA; CIA` em `"""SILVA; CIA"""` dentro do arquivo.
  const corpo = linhasDoExport(ext, pla, r).map((l) => [
    l.arquivo,
    String(l.linha),
    l.data,
    l.descricao,
    l.documento,
    l.valor,
    l.situacao,
    l.motivo,
    l.casouCom,
  ]);

  return montarCsv(cabecalho, corpo);
}

/* ------------------------------------------------------------ para a tela */

/** Total em reais de uma lista de lançamentos, para o resumo de cada seção. */
export function totalDe(lancamentos: Lancamento[]): number {
  return lancamentos.reduce((s, l) => s + l.abs, 0) / 100;
}

export function totalDosPares(pares: Par[], lado: Lado): number {
  return pares.reduce((s, p) => s + p[lado].abs, 0) / 100;
}
