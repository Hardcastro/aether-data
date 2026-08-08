import { NextRequest, NextResponse } from "next/server";
import { chaveConfere } from "@/lib/nota-fiscal";

/**
 * A via de foto do brief-12 — digitalizar.
 *
 * Esta é a única rota do portfólio que custa dinheiro por uso e a única que
 * recebe um arquivo do visitante. As duas coisas moldam o arquivo: quase tudo
 * aqui é contenção, não transcrição.
 *
 * Uma imagem por requisição, de propósito. O cliente enfileira e mostra
 * progresso por arquivo; um lote inteiro numa chamada só estouraria o teto de
 * tempo da função e faria uma foto ruim derrubar as outras nove.
 *
 * **Fornecedor trocado em 07/08 para o Gemini** (decisão dele). O que a troca
 * mudou de verdade foi só duas coisas — o envelope HTTP e a forma de forçar
 * JSON. A instrução, o esquema e todas as contenções são as mesmas, porque
 * nenhuma delas era específica de fornecedor. É o mesmo motivo pelo qual a
 * peça continua funcionando inteira sem chave nenhuma.
 */

export const runtime = "nodejs";
/**
 * Uma transcrição de cupom amassado passa dos 10s padrão com folga. 60 é o
 * teto do plano em uso; se um dia a peça migrar de plano, este número é o
 * primeiro a conferir.
 */
export const maxDuration = 60;

/** Estável atual, e o mais barato da família para tarefa multimodal. */
const MODELO = "gemini-3.6-flash";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO}:generateContent`;

const MAX_BYTES = 6 * 1024 * 1024;
const JANELA_MS = 60_000;
const MAX_POR_JANELA = 12;

/**
 * Limite por IP em memória do processo.
 *
 * Dito em voz alta porque é uma limitação real e não um detalhe: em runtime
 * serverless cada instância tem o próprio Map, então o teto efetivo é maior
 * que `MAX_POR_JANELA` quando a Vercel escala. Isso é aceitável aqui porque
 * ele não é a única contenção — o cliente também tem teto de lote e a imagem é
 * redimensionada antes de subir. Se o custo real aparecer, a troca é por um
 * armazenamento compartilhado, que é a mesma decisão que o brief-14 precisa
 * tomar de qualquer jeito.
 */
const acessos = new Map<string, number[]>();

function excedeu(ip: string): boolean {
  const agora = Date.now();
  const recentes = (acessos.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  recentes.push(agora);
  acessos.set(ip, recentes);
  if (acessos.size > 500) {
    for (const [k, v] of acessos) {
      if (v.every((t) => agora - t >= JANELA_MS)) acessos.delete(k);
    }
  }
  return recentes.length > MAX_POR_JANELA;
}

/**
 * O esquema é o contrato. Pedir JSON em prosa e torcer para vir JSON é o
 * caminho curto que quebra na foto número trinta — o Gemini devolve isto com
 * os tipos garantidos quando o `responseSchema` acompanha o
 * `responseMimeType: application/json`.
 *
 * O dialeto aqui é o subconjunto de OpenAPI que o Gemini aceita: tipos em
 * maiúscula e `nullable: true` em vez da união `["string","null"]` do JSON
 * Schema. É a única diferença real de formato entre este arquivo e a versão
 * anterior.
 *
 * `incertos` é a razão de a peça poder ser honesta: sem um lugar declarado
 * para dizer "não consegui ler isto", um modelo fluente preenche o campo com
 * algo plausível e ninguém fica sabendo.
 */
const texto = (description: string) => ({ type: "STRING", nullable: true, description });
const num = (description?: string) => ({ type: "NUMBER", nullable: true, description });

const ESQUEMA = {
  type: "OBJECT",
  properties: {
    documento: texto(
      'O que o documento é, como aparece nele: "NF-e", "NFC-e", "NFS-e", "Cupom fiscal", "Recibo", "Fatura". null se não der para dizer.',
    ),
    chave: texto("Chave de acesso, 44 dígitos, só números."),
    numero: texto("Número do documento."),
    serie: texto("Série."),
    emissao: texto("Data de emissão em AAAA-MM-DD."),
    emitenteNome: texto("Razão social de quem emitiu."),
    emitenteCnpj: texto("CNPJ do emitente, só dígitos."),
    destinatarioNome: texto("Nome do destinatário."),
    destinatarioDoc: texto("CNPJ ou CPF do destinatário, só dígitos."),
    valorProdutos: num("Soma dos produtos."),
    valorFrete: num("Frete."),
    valorIcms: num("ICMS."),
    valorTotal: num("Valor total do documento."),
    itens: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          numero: { type: "INTEGER", description: "Ordem do item, a partir de 1." },
          codigo: texto("Código do produto."),
          descricao: texto("Descrição como está escrita no documento."),
          ncm: texto("NCM."),
          cfop: texto("CFOP."),
          unidade: texto("Unidade comercial."),
          quantidade: num(),
          valorUnitario: num(),
          valorTotal: num(),
        },
        required: ["numero"],
      },
    },
    incertos: {
      type: "ARRAY",
      description:
        "Nomes dos campos acima que você preencheu sem conseguir ler com clareza, ou que deixou null por estarem ilegíveis. Use os mesmos nomes das propriedades.",
      items: { type: "STRING" },
    },
  },
  required: ["documento", "valorTotal", "itens", "incertos"],
};

const INSTRUCAO = `Você transcreve documentos fiscais brasileiros a partir de imagens: DANFE de NF-e em A4, cupom fiscal térmico de NFC-e fotografado, NFS-e de prefeitura, recibo e nota de serviço sem layout padrão.

Regras, em ordem de importância:

1. NUNCA invente um valor. Se um campo está borrado, cortado, apagado pelo desbotamento do papel térmico ou simplesmente ausente do documento, devolva null para ele e inclua o nome do campo em "incertos". Um campo vazio é útil; um campo plausível e errado atravessa a conferência de quem recebe a planilha e vira erro contábil.

2. Se você leu um campo mas não tem certeza de um dígito, preencha com sua melhor leitura E inclua o nome do campo em "incertos". As duas coisas juntas, não uma ou outra.

3. Valores em número, não em texto: 1234.56, com ponto decimal. O documento mostra "1.234,56" — converta. Nunca devolva o símbolo de moeda.

4. Datas em AAAA-MM-DD. O documento mostra DD/MM/AAAA — converta.

5. CNPJ e CPF só com dígitos, sem ponto, barra ou traço.

6. Itens: transcreva todos os que conseguir ler, numerados a partir de 1 na ordem em que aparecem. Cupom térmico costuma ter descrição abreviada — transcreva como está, não expanda a abreviação nem adivinhe o produto.

7. Se a imagem não é um documento fiscal, devolva documento: null, valorTotal: null, itens vazio, e "imagem" em incertos.

Não explique nada. Devolva só o JSON.`;

type Corpo = { imagem?: string; arquivo?: string };

export async function POST(req: NextRequest) {
  const chave = process.env.GEMINI_API_KEY;
  /**
   * Regra do vazio, mesma que rege MARCA.email no Cabecalho.tsx: sem a chave a
   * via não existe, em vez de existir quebrada. O cliente pergunta isso antes
   * de desenhar o campo de foto, então este 503 é a segunda linha de defesa,
   * não a primeira.
   */
  if (!chave) {
    return NextResponse.json(
      { erro: "A leitura de foto não está ligada neste ambiente. O XML continua funcionando." },
      { status: 503 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "desconhecido";
  if (excedeu(ip)) {
    return NextResponse.json(
      { erro: `Muitas fotos em pouco tempo. Espere um minuto — o limite é ${MAX_POR_JANELA} por minuto.` },
      { status: 429 },
    );
  }

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  const imagem = corpo.imagem;
  if (!imagem || typeof imagem !== "string") {
    return NextResponse.json({ erro: "Nenhuma imagem recebida." }, { status: 400 });
  }

  const m = imagem.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) {
    return NextResponse.json(
      { erro: "Formato não aceito. Envie JPEG, PNG ou WebP — o PDF é convertido no navegador antes de subir." },
      { status: 400 },
    );
  }
  const [, tipo, base64] = m;

  // base64 cresce ~4/3 sobre o binário; a conta evita materializar o buffer só
  // para medir.
  if ((base64.length * 3) / 4 > MAX_BYTES) {
    return NextResponse.json(
      { erro: "Imagem grande demais depois do redimensionamento. Tente uma foto menor." },
      { status: 413 },
    );
  }

  try {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Header, não query string: chave em URL vaza para log de proxy e para
        // o histórico de qualquer intermediário no caminho.
        "x-goog-api-key": chave,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCAO }] },
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType: tipo, data: base64 } },
              { text: "Transcreva este documento." },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: ESQUEMA,
          // Transcrição não é tarefa criativa: o mesmo documento deve dar a
          // mesma leitura duas vezes.
          temperature: 0,
        },
      }),
    });

    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      console.error("transcrever: Gemini respondeu", r.status, detalhe.slice(0, 500));
      // O status do fornecedor não vaza para o cliente; o que vaza é se vale a
      // pena tentar de novo.
      return NextResponse.json(
        {
          erro:
            r.status === 429
              ? "O serviço de leitura está ocupado. Tente de novo em alguns segundos."
              : "Não consegui ler esta foto agora. O XML continua funcionando.",
        },
        { status: r.status === 429 ? 429 : 502 },
      );
    }

    const dados = await r.json();

    /*
      Duas formas de voltar vazio, e elas querem dizer coisas diferentes:
      `promptFeedback.blockReason` é a foto barrada pelo filtro de segurança;
      candidato sem texto é o modelo não tendo produzido nada. A pessoa não
      precisa da distinção, mas o log precisa — senão vira "às vezes falha".
    */
    const bloqueio = dados?.promptFeedback?.blockReason;
    const bruto = dados?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text ?? "")
      .join("")
      .trim();

    if (!bruto) {
      console.error("transcrever: resposta sem texto", { bloqueio, motivo: dados?.candidates?.[0]?.finishReason });
      return NextResponse.json(
        { erro: "A leitura voltou vazia. Tente outra foto do mesmo documento." },
        { status: 502 },
      );
    }

    let nota: { chave?: string | null; incertos?: unknown };
    try {
      nota = JSON.parse(bruto);
    } catch {
      console.error("transcrever: resposta não era JSON", bruto.slice(0, 300));
      return NextResponse.json(
        { erro: "A leitura veio num formato que não consegui aproveitar. Tente de novo." },
        { status: 502 },
      );
    }

    /*
      O único crivo que não depende da honestidade do modelo.

      No primeiro teste real ele devolveu uma chave plausível e errada — a foto
      tinha um dígito a mais, ele normalizou para 44 em silêncio e não marcou
      nada em `incertos`. Pedir "diga quando não souber" resolve o caso em que
      o modelo sabe que não sabe; não resolve o caso em que ele acha que sabe.
      O dígito verificador resolve, porque é aritmética.
    */
    const incertos = new Set(Array.isArray(nota.incertos) ? nota.incertos.map(String) : []);
    if (nota.chave && !chaveConfere(nota.chave)) {
      incertos.add("chave");
    }

    return NextResponse.json({ nota: { ...nota, incertos: [...incertos] } });
  } catch (e) {
    console.error("transcrever: falhou", e);
    return NextResponse.json(
      { erro: "Não consegui ler esta foto agora. O XML continua funcionando." },
      { status: 502 },
    );
  }
}

/**
 * O cliente pergunta antes de desenhar a área de foto. Sem a chave, a via
 * inteira some da tela em vez de aparecer e falhar no primeiro uso.
 */
export async function GET() {
  return NextResponse.json({ ligado: Boolean(process.env.GEMINI_API_KEY) });
}
