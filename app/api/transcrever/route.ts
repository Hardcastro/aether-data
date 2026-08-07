import { NextRequest, NextResponse } from "next/server";

/**
 * A via de imagem do brief-12 (adendo de 07/08).
 *
 * Esta é a única rota do portfólio inteiro que custa dinheiro por uso e a
 * única que recebe um arquivo do visitante. As duas coisas moldam o arquivo:
 * quase tudo aqui é contenção, não transcrição.
 *
 * Uma imagem por requisição, de propósito. O cliente enfileira e mostra
 * progresso por arquivo; um lote inteiro numa chamada só estouraria o teto de
 * tempo da função e faria uma foto ruim derrubar as outras nove.
 */

export const runtime = "nodejs";
/**
 * Uma transcrição de cupom amassado passa dos 10s padrão com folga. 60 é o
 * teto do plano em uso; se um dia a peça migrar de plano, este número é o
 * primeiro a conferir.
 */
export const maxDuration = 60;

const MODELO = "claude-sonnet-5";
const MAX_BYTES = 6 * 1024 * 1024;
const JANELA_MS = 60_000;
const MAX_POR_JANELA = 12;

/**
 * Limite por IP em memória do processo.
 *
 * Dito em voz alta porque é uma limitação real e não um detalhe: em runtime
 * serverless cada instância tem o próprio Map, então o teto efetivo é maior
 * que `MAX_POR_JANELA` quando a Vercel escala. Isso é aceitável aqui porque
 * ele não é a única contenção — o cliente também tem teto de lote e o arquivo
 * é redimensionado antes de subir. Se o custo real aparecer, a troca é por um
 * armazenamento compartilhado, que é a mesma decisão que o brief-14 precisa
 * tomar de qualquer jeito.
 */
const acessos = new Map<string, number[]>();

function excedeu(ip: string): boolean {
  const agora = Date.now();
  const recentes = (acessos.get(ip) ?? []).filter((t) => agora - t < JANELA_MS);
  recentes.push(agora);
  acessos.set(ip, recentes);
  // Sem faxina periódica o Map cresce com o tempo. Uma limpeza barata a cada
  // chamada, quando ele passa de um tamanho que não deveria acontecer.
  if (acessos.size > 500) {
    for (const [k, v] of acessos) {
      if (v.every((t) => agora - t >= JANELA_MS)) acessos.delete(k);
    }
  }
  return recentes.length > MAX_POR_JANELA;
}

/**
 * O esquema é o contrato. Pedir JSON em prosa e torcer para vir JSON é o
 * caminho curto que quebra na foto número trinta — o modelo devolve isto como
 * chamada de ferramenta, com os tipos garantidos pela API.
 *
 * `incertos` é a razão de a peça poder ser honesta: sem um lugar declarado
 * para dizer "não consegui ler isto", um modelo fluente preenche o campo com
 * algo plausível e ninguém fica sabendo.
 */
const FERRAMENTA = {
  name: "registrar_nota",
  description: "Registra os campos lidos de um documento fiscal brasileiro.",
  input_schema: {
    type: "object" as const,
    properties: {
      documento: {
        type: ["string", "null"],
        description:
          'O que o documento é, como aparece nele: "NF-e", "NFC-e", "NFS-e", "Cupom fiscal", "Recibo", "Fatura". null se não der para dizer.',
      },
      chave: { type: ["string", "null"], description: "Chave de acesso, 44 dígitos, só números." },
      numero: { type: ["string", "null"] },
      serie: { type: ["string", "null"] },
      emissao: { type: ["string", "null"], description: "Data de emissão em AAAA-MM-DD." },
      emitenteNome: { type: ["string", "null"], description: "Razão social de quem emitiu." },
      emitenteCnpj: { type: ["string", "null"], description: "Só dígitos." },
      destinatarioNome: { type: ["string", "null"] },
      destinatarioDoc: { type: ["string", "null"], description: "CNPJ ou CPF do destinatário, só dígitos." },
      valorProdutos: { type: ["number", "null"] },
      valorFrete: { type: ["number", "null"] },
      valorIcms: { type: ["number", "null"] },
      valorTotal: { type: ["number", "null"], description: "Valor total do documento." },
      itens: {
        type: "array",
        items: {
          type: "object",
          properties: {
            numero: { type: "number" },
            codigo: { type: ["string", "null"] },
            descricao: { type: ["string", "null"] },
            ncm: { type: ["string", "null"] },
            cfop: { type: ["string", "null"] },
            unidade: { type: ["string", "null"] },
            quantidade: { type: ["number", "null"] },
            valorUnitario: { type: ["number", "null"] },
            valorTotal: { type: ["number", "null"] },
          },
          required: ["numero"],
        },
      },
      incertos: {
        type: "array",
        items: { type: "string" },
        description:
          "Nomes dos campos acima que você preencheu sem conseguir ler com clareza, ou que deixou null por estarem ilegíveis. Use os mesmos nomes das propriedades.",
      },
    },
    required: ["documento", "valorTotal", "itens", "incertos"],
  },
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

Não explique nada. Registre com a ferramenta.`;

type Corpo = { imagem?: string; arquivo?: string };

export async function POST(req: NextRequest) {
  const chave = process.env.ANTHROPIC_API_KEY;
  /**
   * Regra do vazio, mesma que rege MARCA.email no Cabecalho.tsx: sem a chave a
   * via não existe, em vez de existir quebrada. O cliente pergunta isso antes
   * de desenhar o campo de imagem, então este 503 é a segunda linha de defesa,
   * não a primeira.
   */
  if (!chave) {
    return NextResponse.json(
      { erro: "A leitura de imagem não está ligada neste ambiente. O XML continua funcionando." },
      { status: 503 },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "desconhecido";
  if (excedeu(ip)) {
    return NextResponse.json(
      { erro: `Muitas imagens em pouco tempo. Espere um minuto — o limite é ${MAX_POR_JANELA} por minuto.` },
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
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": chave,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: 4096,
        system: INSTRUCAO,
        tools: [FERRAMENTA],
        // Força a chamada da ferramenta: sem isto o modelo pode responder em
        // prosa numa imagem difícil, e aí não há JSON para ler.
        tool_choice: { type: "tool", name: FERRAMENTA.name },
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: tipo, data: base64 } },
              { type: "text", text: "Transcreva este documento." },
            ],
          },
        ],
      }),
    });

    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      console.error("transcrever: API respondeu", r.status, detalhe.slice(0, 500));
      // O status do fornecedor não vaza para o cliente; o que vaza é se vale a
      // pena tentar de novo.
      return NextResponse.json(
        {
          erro:
            r.status === 429
              ? "O serviço de leitura está ocupado. Tente de novo em alguns segundos."
              : "Não consegui ler esta imagem agora. O XML continua funcionando.",
        },
        { status: r.status === 429 ? 429 : 502 },
      );
    }

    const dados = await r.json();
    const uso = dados?.content?.find(
      (c: { type: string; name?: string }) => c.type === "tool_use" && c.name === FERRAMENTA.name,
    );
    if (!uso?.input) {
      return NextResponse.json({ erro: "A leitura voltou vazia. Tente outra foto do mesmo documento." }, { status: 502 });
    }

    return NextResponse.json({ nota: uso.input });
  } catch (e) {
    console.error("transcrever: falhou", e);
    return NextResponse.json(
      { erro: "Não consegui ler esta imagem agora. O XML continua funcionando." },
      { status: 502 },
    );
  }
}

/**
 * O cliente pergunta antes de desenhar a área de imagem. Sem a chave, a via
 * inteira some da tela em vez de aparecer e falhar no primeiro uso.
 */
export async function GET() {
  return NextResponse.json({ ligado: Boolean(process.env.ANTHROPIC_API_KEY) });
}
