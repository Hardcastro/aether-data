export type Grupo = "puxa" | "entrega" | "consulta" | "responde";

/**
 * Trio do gradiente radial de fundo. Cada peça pinta o mundo inteiro da sua
 * cor quando está selecionada — é a troca de sabor da referência, aplicada a
 * projeto em vez de produto. As duas peças de "puxa" ficam na mesma família
 * fria de propósito: mesmo com um fundo por peça, o parentesco entre elas
 * continua legível na transição.
 */
export type Cor = { inner: string; mid: string; outer: string };

export type Peca = {
  slug: string;
  nome: string;
  capacidade: string;
  grupo: Grupo;
  url: string;
  /**
   * Peça que mora dentro deste próprio site, em rota própria (/calculadora,
   * /chat...), em vez de num projeto separado na Vercel. Muda duas coisas e
   * nada mais: `url` é caminho relativo, e os links para ela não abrem em aba
   * nova — mandar o visitante para outra aba dentro do mesmo site é ruído.
   *
   * Decisão de 06/08: as peças de ponto de contato ganharam rota própria
   * justamente para caberem aqui com url e print, como todas as outras.
   * Ver plano-portfolio.md, "Alinhamento das peças de contato — 06/08".
   */
  interna?: boolean;
  repo?: string;
  stack: string[];
  oQueProva: string[];
  cor: Cor;
  /**
   * Print do site rodando, servido de /public. Enquanto for null o painel
   * desenha um espaço reservado com o nome da peça — nada quebra, só não tem
   * imagem.
   *
   * Para ligar: capture a home em 1440x900, salve em public/prints/ com o
   * nome do slug e troque null pelo caminho. Exemplo:
   *
   *   public/prints/cardapio-planilha.png  ->  imagem: "/prints/cardapio-planilha.png"
   *
   * A moldura do painel é 16/10 com object-fit: cover e alinhamento no topo,
   * então qualquer captura mais alta que larga é cortada pela base e o
   * cabeçalho do site continua visível. 1440x900 já está na proporção certa.
   */
  imagem: string | null;
};

export type GrupoInfo = {
  chave: Grupo;
  titulo: string;
  apoio: string;
};

/**
 * Publicar peça nova é um commit neste arquivo, e mais nada. Grupo sem peça
 * não é desenhado em lugar nenhum — nem no plano, nem na barra de controles,
 * nem na lista do celular. Ver GRUPOS_COM_PECAS mais abaixo.
 */
export const GRUPOS: Record<Grupo, GrupoInfo> = {
  puxa: {
    chave: "puxa",
    titulo: "Puxa dado de onde ele está",
    apoio: "Planilha, catálogo, sistema do cliente, documento",
  },
  entrega: {
    chave: "entrega",
    titulo: "Entrega para alguém",
    apoio: "Formulário, relatório recorrente, integração",
  },
  consulta: {
    chave: "consulta",
    titulo: "Deixa consultável",
    apoio: "Painel, busca, agenda",
  },
  /*
    Grupo novo, 06/08. As quatro peças de ponto de contato (calculadora, chat,
    leitura por e-mail, resumo semanal) têm em comum uma capacidade que os três
    grupos antigos não descrevem: responder sem ninguém do outro lado. Elas não
    puxam dado de fonte alheia, não entregam para um destinatário combinado
    antes, e não deixam um acervo consultável — reagem a quem chegou agora.

    O nome é capacidade, não seção de site, para não furar o eixo declarado do
    plano ("capacidade, não negócio").
  */
  responde: {
    chave: "responde",
    titulo: "Responde sozinho",
    apoio: "Cálculo na hora, conversa, leitura automática",
  },
};

export const PECAS: Peca[] = [
  {
    slug: "cardapio-planilha",
    nome: "Cardápio que o dono edita numa planilha",
    capacidade: "Dado ao vivo de planilha publicada em CSV, sem deploy a cada mudança",
    grupo: "puxa",
    cor: { inner: "#0b8a78", mid: "#044e3b", outer: "#011411" },
    imagem: "/prints/cardapio-planilha.png",
    url: "https://restaurante-cardapio-planilha.vercel.app",
    repo: "https://github.com/Hardcastro/restaurante-cardapio-planilha",
    stack: ["Next.js", "Tailwind", "Vercel"],
    oQueProva: [
      "O dono do restaurante edita uma planilha do Google e o cardápio muda sozinho — sem painel de administração, sem pedir nada para mim, sem republicar o site. O parser de CSV é escrito à mão, sem biblioteca.",
      "E o site sobrevive à planilha cair: existe uma cópia versionada no repositório que segura a página em pé enquanto a fonte não volta. É a diferença entre integração que funciona no dia da entrega e integração que funciona no dia ruim.",
    ],
  },
  {
    slug: "busca-por-aplicacao",
    nome: "Diga o carro, a peça certa aparece",
    capacidade: "Busca em cascata sobre catálogo real, com duas fontes atrás de uma interface só",
    grupo: "puxa",
    cor: { inner: "#0b4f8a", mid: "#04294e", outer: "#010c14" },
    imagem: "/prints/busca-por-aplicacao.png",
    url: "https://distribuidora-autopecas.vercel.app",
    repo: "https://github.com/Hardcastro/distribuidora-autopecas",
    stack: ["Next.js", "Tailwind", "Vercel"],
    oQueProva: [
      "Compatibilidade não é filtro, é junção — o visitante diz montadora, modelo, ano e motor, e recebe só o que serve naquele carro. Abrir uma peça mostra o caminho inverso, em que carros ela entra.",
      "Por baixo, o catálogo não sabe de onde vem o dado: fala com uma interface, e atrás dela existem dois adaptadores, um de CSV e um de API de ERP. Trocar a fonte é trocar uma variável de ambiente. É a resposta pronta para \"mas os meus dados estão no meu sistema, não numa planilha\".",
    ],
  },
  {
    slug: "formulario-que-entrega",
    nome: "Formulário que chega em quem precisa ler",
    capacidade: "Validação nas duas pontas, anti-spam e destino real — e falha honesta quando não dá para entregar",
    grupo: "entrega",
    cor: { inner: "#6d3a8a", mid: "#35194e", outer: "#0f0614" },
    imagem: "/prints/formulario-que-entrega.png",
    url: "https://contabilidade-institucional.vercel.app",
    repo: "https://github.com/Hardcastro/contabilidade-institucional",
    stack: ["Next.js", "Tailwind", "Resend", "Vercel"],
    oQueProva: [
      "As regras de validação existem num lugar só e rodam nas duas pontas — o servidor revalida tudo do zero e não confia em nada que o cliente mandou. O anti-spam é campo-armadilha invisível para quem enxerga e para quem usa leitor de tela, mais limite por IP.",
      "E o detalhe que quase nenhum formulário de site tem: quando a entrega não é possível, ele diz que falhou e mostra telefone e e-mail, em vez de responder \"enviado\" e deixar a pessoa esperando resposta que nunca vem.",
    ],
  },
  {
    slug: "indicadores-tempo-real",
    nome: "Os números do Brasil, atualizados sozinhos",
    capacidade: "Duas fontes públicas, de formatos incompatíveis, atrás de uma interface só — e a página fica em pé quando uma cai",
    grupo: "consulta",
    cor: { inner: "#8a6a0b", mid: "#4e3a04", outer: "#141001" },
    imagem: "/prints/indicadores-tempo-real.png",
    url: "https://indicadores-brasil-tempo-real.vercel.app",
    repo: "https://github.com/Hardcastro/indicadores-brasil-tempo-real",
    stack: ["Next.js", "Tailwind", "Vercel"],
    oQueProva: [
      "Duas fontes públicas — BCB e IBGE — cada uma com formato de erro e regra de limite diferente, atrás de uma interface só. As cinco séries chegam por Promise.allSettled: quando uma cai, as outras quatro continuam no ar em vez de derrubar a página inteira.",
      "É a única peça do conjunto que pode quebrar sozinha depois de publicada — as outras usam dado que eu controlo, esta depende de fonte de terceiro. Por isso existe um fallback versionado: quando uma série falha — inclusive a armadilha que só apareceu em produção, o BCB devolvendo uma página de erro em HTML com HTTP 200 sob rajada — a página mostra o último dado bom em vez de quebrar.",
    ],
  },
  {
    slug: "calculadora-custo",
    nome: "Quanto custa o que você faz na mão",
    capacidade:
      "Três perguntas e a conta aberta na tela — cada fator editável, o número muda enquanto se digita",
    grupo: "responde",
    // Rosa profundo: a quinta família de cor, longe do teal e do azul de
    // "puxa", do roxo de "entrega" e do âmbar de "consulta".
    cor: { inner: "#8a0b4f", mid: "#4e042a", outer: "#14010a" },
    imagem: "/prints/calculadora-custo.png",
    url: "/calculadora",
    interna: true,
    repo: "https://github.com/Hardcastro/aether-data",
    stack: ["Next.js", "Sem servidor", "Vercel"],
    oQueProva: [
      "Quem chega cético em automação fica mais cético diante de um número sem explicação — então a conta não fica escondida atrás do resultado. Os três fatores aparecem na tela, editáveis, e o total se refaz a cada tecla. Dá para discordar de um fator específico e ver o número mudar, em vez de aceitar ou desconfiar do resultado inteiro.",
      "E ela é a peça que prova que nem toda automação precisa de modelo de linguagem para ser útil: o cálculo inteiro acontece no navegador, sem chamada de servidor, sem chave de API e sem custo por uso. Funciona igual com a rede caindo depois que a página abriu.",
    ],
  },
];

/** A peça que abre o site quando a URL não pede nenhuma. */
export const PECA_PADRAO: Peca = PECAS[0];

export function pecasPorGrupo(grupo: Grupo): Peca[] {
  return PECAS.filter((p) => p.grupo === grupo);
}

export function pecaPorSlug(slug: string): Peca | undefined {
  return PECAS.find((p) => p.slug === slug);
}

/** Grupos com pelo menos uma peça, na ordem declarada em GRUPOS — nunca desenhar um grupo vazio. */
export const GRUPOS_COM_PECAS: GrupoInfo[] = (Object.keys(GRUPOS) as Grupo[])
  .map((chave) => GRUPOS[chave])
  .filter((g) => pecasPorGrupo(g.chave).length > 0);
