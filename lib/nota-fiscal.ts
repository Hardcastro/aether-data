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
  /**
   * Frases prontas para quem está conferindo, escritas pela rota de leitura.
   *
   * Existe porque `incertos` diz *qual* campo, e não *por quê* — e os porquês
   * não são equivalentes. "O modelo não leu com clareza" é opinião dele;
   * "a chave não fecha com o próprio dígito verificador" é aritmética, e
   * merece outra frase. Vazio para nota que veio de XML.
   */
  avisos: string[];
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

/**
 * A chave de acesso confere com o próprio dígito verificador?
 *
 * Existe por um motivo medido, não teórico: no primeiro teste real da via de
 * foto o modelo devolveu uma chave **plausível e errada** — a imagem tinha um
 * dígito a mais, ele normalizou para 44 em silêncio e deixou `incertos` vazio.
 * Pedir honestidade ao modelo funciona quando ele sabe que não sabe; não
 * funciona quando ele acha que sabe.
 *
 * Isto não pede nada a ninguém. Os 43 primeiros dígitos determinam o 44º por
 * módulo 11 com pesos 2..9 da direita para a esquerda — se a conta não fecha,
 * pelo menos um dígito está errado, e a peça marca o campo sozinha.
 *
 * Não é o contrário: chave que fecha não é chave certa (dois erros podem se
 * cancelar). É um crivo barato, não uma garantia.
 */
export function chaveConfere(chave: string | null): boolean {
  if (!chave || !/^\d{44}$/.test(chave)) return false;
  let soma = 0;
  let peso = 2;
  for (let i = 42; i >= 0; i -= 1) {
    soma += Number(chave[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  const dv = resto === 0 || resto === 1 ? 0 : 11 - resto;
  return dv === Number(chave[43]);
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

  /*
    Um XML que esta peça mesmo gerou a partir de uma foto volta marcado como
    IMAGEM, não como XML exato. Sem esta leitura, bastaria exportar e
    rearrastar para a procedência se perder — a peça lavaria o próprio palpite
    e o devolveria com cara de documento fiscal. Ver MARCA_TRANSCRICAO.
  */
  const observacao = texto(achar(infNFe, "infAdic"), "infCpl") ?? "";
  const transcrito = observacao.includes(MARCA_TRANSCRICAO);
  const incertos = transcrito
    ? (observacao
        .split(MARCA_INCERTOS)[1]
        ?.replace(/\.$/, "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [])
    : [];

  return {
    id: novoId(),
    arquivo,
    origem: transcrito ? "imagem" : "xml",
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
    incertos,
    avisos: transcrito
      ? ["Este XML foi gerado a partir de uma foto por esta mesma peça — não é documento fiscal."]
      : [],
  };
}

export function ehRecusa(r: Nota | Recusa): r is Recusa {
  return "motivo" in r;
}

/* ------------------------------------------------- gerar XML da transcrição */

/**
 * A marca que separa um XML transcrito de um documento fiscal.
 *
 * Ela existe porque um XML gerado de foto **parece** uma NF-e, e um sistema
 * contábil que o importe vai tratá-lo como se fosse. A coluna `origem`, que
 * segura a honestidade da tabela e do CSV, não sobrevive ao formato — XML de
 * NF-e não tem campo para "isto é um palpite". Então a proteção é outra, e são
 * quatro camadas de uma vez:
 *
 *   1. Sem `<nfeProc>` e sem `<protNFe>` — não há protocolo de autorização.
 *   2. Sem `<Signature>` — não há assinatura digital.
 *   3. Esta frase em `<infCpl>`, que é campo impresso no DANFE e lido por ERP.
 *   4. Nome de arquivo começando em `transcrito-`.
 *
 * A frase também é o que permite reconhecer o próprio arquivo quando ele
 * voltar para cá: um XML transcrito rearrastado na peça continua marcado como
 * IMAGEM em vez de virar XML exato. Sem isso, a peça lavaria a procedência do
 * próprio dado numa volta.
 */
export const MARCA_TRANSCRICAO = "TRANSCRITO DE IMAGEM POR AETHER DATA";
const MARCA_INCERTOS = "Campos incertos:";

function esc(v: string): string {
  return v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Tag só existe se houver valor. Campo ausente não vira tag vazia nem zero. */
function tag(nome: string, v: string | number | null): string {
  if (v === null || v === undefined || v === "") return "";
  const texto = typeof v === "number" ? v.toFixed(2) : esc(String(v));
  return `<${nome}>${texto}</${nome}>`;
}

/**
 * Monta um XML no layout NF-e 4.00 a partir do que foi transcrito.
 *
 * **O que ele não faz, de propósito:** não inventa chave de acesso. Se a foto
 * não deixou ler os 44 dígitos, o atributo `Id` simplesmente não sai — o
 * arquivo fica fora do schema, e isso é melhor que um documento bem-formado
 * com uma chave fabricada. Schema-válido não é o objetivo; não mentir é.
 */
export function gerarXmlNfe(nota: Nota, agora = new Date()): string {
  const dest = nota.destinatarioDoc?.replace(/\D/g, "") ?? "";
  const docDest =
    dest.length === 14 ? tag("CNPJ", dest) : dest.length === 11 ? tag("CPF", dest) : "";

  const itens = nota.itens
    .map(
      (i) => `      <det nItem="${i.numero}">
        <prod>
          ${tag("cProd", i.codigo)}
          ${tag("xProd", i.descricao)}
          ${tag("NCM", i.ncm)}
          ${tag("CFOP", i.cfop)}
          ${tag("uCom", i.unidade)}
          ${i.quantidade === null ? "" : `<qCom>${i.quantidade.toFixed(4)}</qCom>`}
          ${tag("vUnCom", i.valorUnitario)}
          ${tag("vProd", i.valorTotal)}
        </prod>
      </det>`,
    )
    .join("\n");

  const incertos = nota.incertos.length ? ` ${MARCA_INCERTOS} ${nota.incertos.join(", ")}.` : "";
  const observacao =
    `${MARCA_TRANSCRICAO} EM ${agora.toISOString().slice(0, 10)}. ` +
    `NAO E DOCUMENTO FISCAL: sem assinatura digital e sem protocolo de autorizacao da SEFAZ. ` +
    `Conferir contra o documento original antes de usar.` +
    (nota.chave ? "" : " A chave de acesso nao pode ser lida na imagem.") +
    incertos;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Gerado por AEther Data a partir de uma imagem. NAO e um documento fiscal:
  nao tem assinatura digital nem protocolo de autorizacao da SEFAZ, e os
  valores foram lidos de uma figura por um modelo de linguagem.
  Confira contra o documento original antes de usar.
-->
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe versao="4.00"${nota.chave ? ` Id="NFe${nota.chave}"` : ""}>
    <ide>
      ${tag("nNF", nota.numero)}
      ${tag("serie", nota.serie)}
      ${tag("dhEmi", nota.emissao)}
    </ide>
    <emit>
      ${tag("CNPJ", nota.emitenteCnpj?.replace(/\D/g, "") ?? null)}
      ${tag("xNome", nota.emitenteNome)}
    </emit>
    <dest>
      ${docDest}
      ${tag("xNome", nota.destinatarioNome)}
    </dest>
${itens}
    <total>
      <ICMSTot>
        ${tag("vProd", nota.valorProdutos)}
        ${tag("vFrete", nota.valorFrete)}
        ${tag("vICMS", nota.valorIcms)}
        ${tag("vNF", nota.valorTotal)}
      </ICMSTot>
    </total>
    <infAdic>
      <infCpl>${esc(observacao)}</infCpl>
    </infAdic>
  </infNFe>
</NFe>
`;
}

export function nomeDoXml(nota: Nota): string {
  const base = nota.chave ?? nota.numero ?? nota.arquivo.replace(/\.[^.]+$/, "");
  return `transcrito-${base}.xml`.replace(/[^\w.-]+/g, "-");
}

export function baixarArquivo(conteudo: string, nome: string, tipo: string) {
  const blob = new Blob([conteudo], { type: `${tipo};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
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
  baixarArquivo(conteudo, nome, "text/csv");
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
  if (n.itens.length === 0) return null;
  /*
    Cupom fiscal quase nunca declara um subtotal de produtos separado — foi o
    que apareceu no primeiro teste real, e a conferência simplesmente não
    disparava. Quando não há `vProd` e não há frete, o total é o subtotal, e aí
    a comparação volta a valer. Com frete declarado a conta deixaria de fechar
    por construção, então nesse caso o crivo se cala em vez de mentir.
  */
  const alvo =
    n.valorProdutos ?? (!n.valorFrete ? n.valorTotal : null);
  if (alvo === null) return null;
  const soma = n.itens.reduce((t, i) => t + (i.valorTotal ?? 0), 0);
  return Math.abs(soma - alvo) < 0.02;
}

export const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
