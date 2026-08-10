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

/**
 * O modelo, escolhido por medição e não por descrição de catálogo.
 *
 * Quatro configurações foram comparadas contra as mesmas imagens, com a chave
 * de acesso como gabarito — ela tem dígito verificador, então dá para saber se
 * a leitura está certa sem depender de opinião:
 *
 *   modelo                          fácil   difícil   tempo
 *   gemini-3.6-flash                 5/5      0/4      7,9s
 *   gemini-3.6-flash + thinking high 5/5      0/4     11,5s
 *   gemini-3.5-flash                 5/5      errou   12,3s
 *   gemini-3.5-flash-lite            errou    errou    1,2s
 *
 * **Nenhum acerta a imagem difícil.** Subir o esforço do modelo não melhorou a
 * leitura e custou 45% de latência; descer quebrou o caso fácil. Trocar de
 * modelo não é a alavanca desta peça — o crivo é, e ele pegou 10 de 10 erros
 * em todas as configurações.
 *
 * Fica em variável de ambiente por isso mesmo: o dia em que um modelo novo
 * ganhar essa medição, a troca é um campo no painel, não um deploy.
 */
const MODELO = process.env.GEMINI_MODELO || "gemini-3.6-flash";
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
        "Nomes dos campos acima que ESTÃO no documento mas você não conseguiu ler com certeza. Campo que o documento simplesmente não tem NÃO entra aqui — volta null e pronto.",
      items: { type: "STRING" },
    },
  },
  required: ["documento", "valorTotal", "itens", "incertos"],
};

const INSTRUCAO = `Você transcreve documentos fiscais brasileiros a partir de imagens: DANFE de NF-e em A4, cupom fiscal térmico de NFC-e fotografado, NFS-e de prefeitura, recibo e nota de serviço sem layout padrão.

Regras, em ordem de importância:

1. NUNCA invente um valor. Se um campo está borrado, cortado ou apagado pelo desbotamento do papel térmico, devolva null para ele e inclua o nome do campo em "incertos". Um campo vazio é útil; um campo plausível e errado atravessa a conferência de quem recebe a planilha e vira erro contábil.

2. Se você leu um campo mas não tem certeza de um dígito, preencha com sua melhor leitura E inclua o nome do campo em "incertos". As duas coisas juntas, não uma ou outra.

2b. "incertos" é só para o que ESTÁ no documento e você não conseguiu ler. Campo que o documento não tem — cupom fiscal quase nunca traz frete, ICMS destacado ou destinatário — volta null e NÃO entra em "incertos". Marcar ausência como dúvida enche a tela de avisos que não pedem nada, e quem recebe uma lista assim para de olhar para todos, inclusive os que importam.

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

  /**
   * Uma chamada ao Gemini. Devolve o JSON já parseado, ou lança com o status.
   *
   * Arrow function e não `function` declarada: declaração é içada, e o
   * TypeScript desfaz a garantia de que `chave` já foi verificada acima
   * quando o corpo pode, em tese, rodar antes do teste.
   */
  const pedir = async (corpoDaChamada: object): Promise<Record<string, unknown>> => {
    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Header, não query string: chave em URL vaza para log de proxy e para
        // o histórico de qualquer intermediário no caminho.
        "x-goog-api-key": chave,
      },
      body: JSON.stringify(corpoDaChamada),
    });

    if (!r.ok) {
      const detalhe = await r.text().catch(() => "");
      console.error("transcrever: Gemini respondeu", r.status, detalhe.slice(0, 400));
      throw Object.assign(new Error("gemini"), { status: r.status });
    }

    const dados = await r.json();
    /*
      Duas formas de voltar vazio, e elas querem dizer coisas diferentes:
      `promptFeedback.blockReason` é a foto barrada pelo filtro de segurança;
      candidato sem texto é o modelo não tendo produzido nada. A pessoa não
      precisa da distinção, mas o log precisa — senão vira "às vezes falha".
    */
    const texto = dados?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p?.text ?? "")
      .join("")
      .trim();
    if (!texto) {
      console.error("transcrever: resposta sem texto", {
        bloqueio: dados?.promptFeedback?.blockReason,
        motivo: dados?.candidates?.[0]?.finishReason,
      });
      throw Object.assign(new Error("vazia"), { status: 502 });
    }
    return JSON.parse(texto);
  };

  const parteImagem = { inlineData: { mimeType: tipo, data: base64 } };
  // Transcrição não é tarefa criativa: o mesmo documento deve dar a mesma
  // leitura duas vezes.
  const comum = { temperature: 0, responseMimeType: "application/json" };

  try {
    const nota = (await pedir({
      systemInstruction: { parts: [{ text: INSTRUCAO }] },
      contents: [{ role: "user", parts: [parteImagem, { text: "Transcreva este documento." }] }],
      generationConfig: { ...comum, responseSchema: ESQUEMA },
    })) as { chave?: string | null; incertos?: unknown };

    const incertos = new Set(Array.isArray(nota.incertos) ? nota.incertos.map(String) : []);
    const avisos: string[] = [];

    /*
      O crivo que não depende da honestidade do modelo — e a coisa mais
      produtiva desta peça inteira.

      Medido em 10 leituras de uma foto degradada, com quatro modelos e níveis
      de esforço diferentes: **nenhum acertou a chave, e o dígito verificador
      pegou os dez.** Em nenhuma delas o modelo avisou — estava confiante e
      errado. Pedir "diga quando não souber" cobre o caso em que ele sabe que
      não sabe; isto cobre o caso em que ele acha que sabe.

      Quando o crivo reprova, vale uma segunda leitura focada só na chave antes
      de desistir: às vezes é lapso e a releitura fecha. Quando não fecha, a
      peça para de tentar e diz o que sabe. Insistir seria adivinhar com mais
      etapas.
    */
    if (nota.chave && !chaveConfere(nota.chave)) {
      let corrigida: string | null = null;
      try {
        const segunda = (await pedir({
          systemInstruction: {
            parts: [
              {
                text:
                  "Leia APENAS a chave de acesso do documento fiscal na imagem. São 44 dígitos, " +
                  "normalmente impressos em grupos de quatro. Leia dígito por dígito, sem completar " +
                  "com o que seria plausível. Se não der para ler todos com certeza, devolva null.",
              },
            ],
          },
          contents: [{ role: "user", parts: [parteImagem, { text: "Só a chave." }] }],
          generationConfig: {
            ...comum,
            responseSchema: {
              type: "OBJECT",
              properties: { chave: { type: "STRING", nullable: true } },
              required: ["chave"],
            },
          },
        })) as { chave?: string | null };
        if (segunda.chave && chaveConfere(segunda.chave)) corrigida = segunda.chave;
      } catch {
        // A releitura é bônus: se falhar, o resultado da primeira continua
        // valendo — marcado, que é o comportamento seguro.
      }

      if (corrigida) {
        nota.chave = corrigida;
        avisos.push(
          "A chave saiu errada na primeira leitura e foi refeita numa segunda passagem — esta fecha com o próprio dígito verificador.",
        );
      } else {
        incertos.add("chave");
        avisos.push(
          "A chave não fecha com o próprio dígito verificador: pelo menos um dos 44 números está errado. Isso não é opinião do modelo, é aritmética.",
        );
      }
    }

    /*
      E o aviso que a medição obrigou a escrever. A chave sabe se conferir
      sozinha; valor, data e CNPJ não sabem. Quem vê a peça pegar um erro de
      chave pode concluir que ela pega todos — e essa conclusão é falsa.
    */
    if (incertos.size === 0) {
      avisos.push(
        "Nenhum campo ficou em dúvida — mas só a chave tem dígito verificador. Valor, data e CNPJ não têm como se conferir sozinhos: compare com a foto ao lado antes de exportar.",
      );
    }

    return NextResponse.json({ nota: { ...nota, incertos: [...incertos], avisos } });
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status) {
      return NextResponse.json(
        {
          erro:
            status === 429
              ? "O serviço de leitura está ocupado. Tente de novo em alguns segundos."
              : "Não consegui ler esta foto agora. O XML continua funcionando.",
        },
        { status: status === 429 ? 429 : 502 },
      );
    }
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
