/**
 * Nota fiscal → linha de planilha (brief-12).
 *
 * Este módulo é puro: tipos, leitura de XML de NF-e e geração de CSV. Nenhuma
 * importação de React, nenhum acesso a rede, nenhum `window` fora da função que
 * declara precisar de `DOMParser`. Serve ao componente de cliente e aos testes
 * do mesmo jeito.
 *
 * A regra que atravessa o arquivo inteiro: **campo que a nota não traz sai
 * `null`, nunca zero e nunca string vazia disfarçada de dado.** Zero é um
 * número que alguém pode somar sem perceber; `null` obriga a decidir.
 */

/**
 * De onde a linha veio, e a razão de a coluna existir na tela E no CSV.
 *
 * `xml` é documento fiscal: os campos vêm nomeados no arquivo, lidos por
 * DOMParser, e não há inferência nenhuma no caminho.
 * `imagem` é transcrição: um modelo olhou uma figura e escreveu o que leu.
 * Misturar as duas em silêncio é como um número transcrito errado entra na
 * contabilidade de alguém — ver brief-12, adendo de 07/08.
 */
export type Origem = "xml" | "imagem";

export type ItemNota = {
  numero: number;
  codigo: string | null;
  descricao: string | null;
  ncm: string | null;
  cfop: string | null;
  unidade: string | null;
  quantidade: number | null;
  valorUnitario: number | null;
  valorTotal: number | null;
};

export type Nota = {
  /** Identidade local da linha na sessão. Não é a chave da nota. */
  id: string;
  arquivo: string;
  origem: Origem;
  /** O que o documento é. Do XML sai sempre "NF-e"; da imagem, o que o modelo identificou. */
  documento: string | null;
  chave: string | null;
  numero: string | null;
  serie: string | null;
  /** AAAA-MM-DD. O XML traz dhEmi com fuso (4.0) ou dEmi sem (2.0); os dois viram isto. */
  emissao: string | null;
  emitenteNome: string | null;
  emitenteCnpj: string | null;
  destinatarioNome: string | null;
  destinatarioDoc: string | null;
  valorProdutos: number | null;
  valorFrete: number | null;
  valorIcms: number | null;
  valorTotal: number | null;
  itens: ItemNota[];
  /**
   * Nomes de campo que a via de imagem não conseguiu ler com confiança.
   * Sempre vazio quando `origem === "xml"` — não existe leitura duvidosa de um
   * campo nomeado. É a lista que pinta o "confira" na tela.
   */
  incertos: string[];
};

export type Recusa = {
  arquivo: string;
  motivo: string;
};

/* ------------------------------------------------------------------ helpers */

/**
 * Busca por nome local, ignorando namespace.
 *
 * A NF-e declara `xmlns="http://www.portalfiscal.inf.br/nfe"` na raiz, então
 * todo elemento está num namespace. `querySelector("emit")` funciona por
 * acidente em alguns navegadores e falha em outros; `getElementsByTagNameNS`
 * com `*` no namespace é o que a especificação garante.
 */
function achar(raiz: Element | Document, nome: string): Element | null {
  return raiz.getElementsByTagNameNS("*", nome)[0] ?? null;
}

function todos(raiz: Element | Document, nome: string): Element[] {
  return Array.from(raiz.getElementsByTagNameNS("*", nome));
}

/**
 * Texto de um campo, procurado DENTRO de um elemento já escolhido.
 *
 * É aqui que mora o erro mais caro deste parser, e ele é silencioso: `<CNPJ>`
 * existe dentro de `<emit>` e dentro de `<dest>`. Uma busca global pega o
 * primeiro e atribui o CNPJ do emitente ao destinatário — número plausível,
 * planilha errada, ninguém percebe. Toda leitura de campo passa por aqui com
 * um escopo explícito, nunca pelo documento inteiro.
 */
function texto(escopo: Element | null, nome: string): string | null {
  if (!escopo) return null;
  const el = achar(escopo, nome);
  const t = el?.textContent?.trim();
  return t ? t : null;
}

/** Número da NF-e vem sempre com ponto decimal, por especificação. */
function numero(escopo: Element | null, nome: string): number | null {
  const t = texto(escopo, nome);
  if (t === null) return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/** `2026-08-07T10:30:00-03:00` (dhEmi, 4.0) e `2026-08-07` (dEmi, 2.0) viram `2026-08-07`. */
function dataEmissao(ide: Element | null): string | null {
  const bruto = texto(ide, "dhEmi") ?? texto(ide, "dEmi");
  if (!bruto) return null;
  const m = bruto.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : bruto;
}

export function formatarDoc(doc: string | null): string | null {
  if (!doc) return null;
  const d = doc.replace(/\D/g, "");
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  return doc;
}

let sequencia = 0;
function novoId(): string {
  sequencia += 1;
  return `n${sequencia}`;
}

/* ------------------------------------------------------------- leitura do XML */

/**
 * O que o arquivo é, antes de tentar lê-lo como nota.
 *
 * Quem arrasta a pasta inteira de XML do mês arrasta também eventos de
 * cancelamento, cartas de correção e NFS-e de prefeitura. Cada um precisa de
 * uma recusa que diga o nome da coisa — "arquivo inválido" faz a pessoa
 * conferir o arquivo certo achando que é o errado.
 */
function classificar(doc: Document): { tipo: "nfe"; raiz: Element } | { tipo: "recusa"; motivo: string } {
  const erro = doc.getElementsByTagName("parsererror")[0];
  if (erro) return { tipo: "recusa", motivo: "não é um XML válido — o arquivo pode estar truncado" };

  const infNFe = achar(doc, "infNFe");
  if (infNFe) return { tipo: "nfe", raiz: infNFe };

  if (achar(doc, "procEventoNFe") || achar(doc, "evento")) {
    return { tipo: "recusa", motivo: "é um evento de NF-e (cancelamento ou carta de correção), não uma nota" };
  }
  if (achar(doc, "retDistDFeInt") || achar(doc, "resNFe")) {
    return { tipo: "recusa", motivo: "é um resumo de distribuição da SEFAZ, não a nota completa" };
  }
  if (achar(doc, "CompNfse") || achar(doc, "Nfse") || achar(doc, "InfNfse")) {
    return {
      tipo: "recusa",
      motivo: "é NFS-e de prefeitura — cada município tem um layout próprio. Arraste a imagem ou o PDF dela",
    };
  }
  if (achar(doc, "infCte")) {
    return { tipo: "recusa", motivo: "é um CT-e (transporte), fora desta peça" };
  }
  const raiz = doc.documentElement?.nodeName ?? "desconhecido";
  return { tipo: "recusa", motivo: `não é uma NF-e — o elemento raiz é <${raiz}>` };
}

/**
 * Lê um XML de NF-e. Aceita os dois envelopes: `<nfeProc>` (nota autorizada,
 * com protocolo) e `<NFe>` nua. O caminho até `infNFe` muda entre os dois, e é
 * por isso que a busca parte de `infNFe` para baixo em vez de descer a partir
 * da raiz.
 */
export function lerXmlNfe(conteudo: string, arquivo: string): Nota | Recusa {
  const doc = new DOMParser().parseFromString(conteudo, "application/xml");
  const classe = classificar(doc);
  if (classe.tipo === "recusa") return { arquivo, motivo: classe.motivo };

  const infNFe = classe.raiz;
  const ide = achar(infNFe, "ide");
  const emit = achar(infNFe, "emit");
  const dest = achar(infNFe, "dest");
  const total = achar(infNFe, "ICMSTot");

  // A chave vem no atributo Id como "NFe" + 44 dígitos.
  const idAttr = infNFe.getAttribute("Id") ?? "";
  const chave = idAttr.replace(/\D/g, "") || null;

  const itens = todos(infNFe, "det")
    .map((det): ItemNota => {
      const prod = achar(det, "prod");
      return {
        numero: Number.parseInt(det.getAttribute("nItem") ?? "0", 10) || 0,
        codigo: texto(prod, "cProd"),
        descricao: texto(prod, "xProd"),
        ncm: texto(prod, "NCM"),
        cfop: texto(prod, "CFOP"),
        unidade: texto(prod, "uCom"),
        quantidade: numero(prod, "qCom"),
        valorUnitario: numero(prod, "vUnCom"),
        valorTotal: numero(prod, "vProd"),
      };
    })
    // `nItem` é a ordem declarada. A ordem no arquivo não é garantia.
    .sort((a, b) => a.numero - b.numero);

  return {
    id: novoId(),
    arquivo,
    origem: "xml",
    documento: "NF-e",
    chave: chave && chave.length === 44 ? chave : null,
    numero: texto(ide, "nNF"),
    serie: texto(ide, "serie"),
    emissao: dataEmissao(ide),
    emitenteNome: texto(emit, "xNome"),
    emitenteCnpj: texto(emit, "CNPJ"),
    destinatarioNome: texto(dest, "xNome"),
    // Destinatário pode ter CPF, ou nenhum dos dois (consumidor não
    // identificado). Nenhum dos três casos é erro.
    destinatarioDoc: texto(dest, "CNPJ") ?? texto(dest, "CPF"),
    valorProdutos: numero(total, "vProd"),
    valorFrete: numero(total, "vFrete"),
    valorIcms: numero(total, "vICMS"),
    valorTotal: numero(total, "vNF"),
    itens,
    incertos: [],
  };
}

export function ehRecusa(r: Nota | Recusa): r is Recusa {
  return "motivo" in r;
}

/* -------------------------------------------------------------------- CSV */

/**
 * Separador `;` e decimal com vírgula.
 *
 * O destinatário desta peça abre planilha no Excel em português, onde `,` é
 * separador decimal e `;` é separador de coluna. Um CSV com `,` nos dois
 * papéis obriga a passar pelo assistente de importação — que é exatamente o
 * passo manual que a peça existe para remover. O BOM no começo é o que faz o
 * Excel reconhecer UTF-8 e não transformar "Serviços" em "ServiÃ§os".
 */
const SEP = ";";
const BOM = "﻿";

function celula(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return v.toFixed(2).replace(".", ",");
  // Aspas duplas viram duas aspas; qualquer campo com separador, aspa ou
  // quebra de linha vai entre aspas.
  const s = String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function montar(cabecalho: string[], linhas: (string | number | null)[][]): string {
  const corpo = linhas.map((l) => l.map(celula).join(SEP));
  return BOM + [cabecalho.join(SEP), ...corpo].join("\r\n");
}

/** Uma linha por nota — para quem lança no sistema. */
export function csvPorNota(notas: Nota[]): string {
  return montar(
    [
      "origem",
      "conferir",
      "arquivo",
      "documento",
      "chave",
      "numero",
      "serie",
      "emissao",
      "emitente",
      "cnpj_emitente",
      "destinatario",
      "doc_destinatario",
      "valor_produtos",
      "valor_frete",
      "valor_icms",
      "valor_total",
      "itens",
    ],
    notas.map((n) => [
      n.origem === "xml" ? "XML" : "IMAGEM",
      // A coluna que faz a marca sobreviver à sessão. Sem ela no arquivo, a
      // distinção só existe na tela e não serve para nada.
      n.incertos.length ? n.incertos.join(" ") : "",
      n.arquivo,
      n.documento,
      n.chave,
      n.numero,
      n.serie,
      n.emissao,
      n.emitenteNome,
      formatarDoc(n.emitenteCnpj),
      n.destinatarioNome,
      formatarDoc(n.destinatarioDoc),
      n.valorProdutos,
      n.valorFrete,
      n.valorIcms,
      n.valorTotal,
      n.itens.length,
    ]),
  );
}

/** Uma linha por item — para quem confere estoque. */
export function csvPorItem(notas: Nota[]): string {
  const linhas: (string | number | null)[][] = [];
  for (const n of notas) {
    for (const i of n.itens) {
      linhas.push([
        n.origem === "xml" ? "XML" : "IMAGEM",
        n.incertos.length ? n.incertos.join(" ") : "",
        n.arquivo,
        n.chave,
        n.numero,
        n.emissao,
        n.emitenteNome,
        formatarDoc(n.emitenteCnpj),
        i.numero,
        i.codigo,
        i.descricao,
        i.ncm,
        i.cfop,
        i.unidade,
        i.quantidade,
        i.valorUnitario,
        i.valorTotal,
      ]);
    }
  }
  return montar(
    [
      "origem",
      "conferir",
      "arquivo",
      "chave",
      "numero_nota",
      "emissao",
      "emitente",
      "cnpj_emitente",
      "item",
      "codigo",
      "descricao",
      "ncm",
      "cfop",
      "unidade",
      "quantidade",
      "valor_unitario",
      "valor_total",
    ],
    linhas,
  );
}

export function baixarCsv(conteudo: string, nome: string) {
  const blob = new Blob([conteudo], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------ conferências */

/**
 * A soma dos itens contra o total declarado.
 *
 * Não é validação fiscal — frete, seguro, desconto e ICMS-ST entram no total e
 * não estão em `vProd`. Serve para uma coisa só, e é a mais útil da via de
 * imagem: quando o modelo transcreve um item errado, a soma deixa de fechar e
 * a tela avisa. Numa nota vinda de XML isso praticamente nunca dispara, o que
 * é justamente o ponto.
 */
export function somaConfere(n: Nota): boolean | null {
  if (n.valorProdutos === null || n.itens.length === 0) return null;
  const soma = n.itens.reduce((t, i) => t + (i.valorTotal ?? 0), 0);
  return Math.abs(soma - n.valorProdutos) < 0.02;
}

export const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
