export type Grupo = "puxa" | "confere" | "entrega" | "consulta" | "responde";

/**
 * O corte de 07/08: o visitante escolhe primeiro pelo que ele sabe sobre si
 * mesmo — "preciso de um site" ou "preciso automatizar isso" — e só depois
 * encontra a competência. Competência continua sendo o eixo do portfólio; ela
 * só deixou de ser a porta de entrada, porque é vocabulário nosso e não dele.
 *
 * O mapeamento é o mesmo do `plano-portfolio.md`: S1–S4 são `site`, N2–N5 são
 * `automacao`. Não confundir com `interna` — hoje as duas listas coincidem,
 * mas `interna` responde "onde a peça mora" (rota daqui ou projeto na Vercel) e
 * `tipo` responde "o que a peça é". Uma automação hospedada fora continuaria
 * `automacao` com `interna: false`.
 */
export type Tipo = "site" | "automacao";

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
  tipo: Tipo;
  url: string;
  /**
   * Peça que mora dentro deste próprio site, em rota própria (/nota-fiscal,
   * /cobranca...), em vez de num projeto separado na Vercel. Muda duas coisas e
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

export type TipoInfo = {
  chave: Tipo;
  /** Rota da vitrine desse tipo. É o prefixo que o Hero usa ao escrever ?peca=. */
  rota: string;
  /** Nome no menu, no seletor da home e no display da própria vitrine. */
  titulo: string;
  /** A linha em maiúscula acima do nome, no lugar que a peça usa para o grupo. */
  etiqueta: string;
  /** Uma linha, em português de dono de negócio — não em vocabulário de portfólio. */
  chamada: string;
  /**
   * Cor da vertente. Duas famílias novas, e não empréstimo das peças, porque
   * vertente é um nível acima de peça — pegar o verde do cardápio faria a home
   * parecer que está mostrando o cardápio.
   *
   * A escolha não é de gosto: as cinco peças ocupam os matizes 46 (âmbar), 171
   * (teal), 206 (azul), 281 (roxo) e 326 (vinho). As duas maiores lacunas do
   * círculo são 46→171 e 326→46; estas duas cores caem no meio delas — verde em
   * ~108 e vermelho em ~6. É a maior distância possível das cinco e uma da
   * outra, o que importa porque na home elas aparecem lado a lado.
   */
  cor: Cor;
};

export const TIPOS: Record<Tipo, TipoInfo> = {
  site: {
    chave: "site",
    rota: "/sites",
    titulo: "Sites",
    etiqueta: "Página que mostra dado",
    chamada:
      "Páginas que mostram dado que já existe no seu negócio, sem ninguém digitar nada duas vezes",
    cor: { inner: "#3a8a0b", mid: "#1f4e04", outer: "#071401" },
  },
  automacao: {
    chave: "automacao",
    rota: "/automacoes",
    titulo: "Automações",
    etiqueta: "Ferramenta que roda sozinha",
    chamada:
      "Ferramentas que fazem sozinhas o que hoje alguém faz na mão — calcular, responder, avisar",
    cor: { inner: "#8a1a0b", mid: "#4e0d04", outer: "#140301" },
  },
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
  /*
    Grupo de 10/08. A pergunta estava aberta desde o `brief-11`, que a deixou
    explicitamente como decisão dele: conciliação não é `puxa` (puxa duas
    coisas e compara) nem `entrega`, e "confere o que não bate" é capacidade
    própria — que é o eixo declarado do portfólio inteiro.

    **O argumento que ganhou é o do conjunto, não o desta peça.** Com `confere`
    no lugar, as quatro automações passam a carregar uma competência cada —
    `puxa` (nota-fiscal), `confere` (conciliação), `entrega` (cobrança) e
    `responde` (monitor). É a demonstração mais limpa da tese declarada do
    portfólio, e ela só existe porque nenhuma peça foi empilhada num grupo que
    já tinha dono. O contra, dito em voz alta: grupo com uma peça só descreve a
    peça, não uma competência.

    Fica logo depois de `puxa` porque a ordem das chaves aqui é a ordem em que
    os grupos aparecem, e a sequência lê como o caminho do dado: puxa, confere,
    entrega, deixa consultável, responde sozinho.

    Nasce vazio e por isso invisível — a `/conciliacao` (`brief-11`) é a
    primeira peça dele. Ver GRUPOS_COM_PECAS.
  */
  confere: {
    chave: "confere",
    titulo: "Confere o que não bate",
    apoio: "Conciliação, cadastro duplicado, o que sumiu entre dois sistemas",
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
    Nasceu em 06/08 para as quatro peças de ponto de contato. As quatro
    morreram — C1, C2 e C3 em 07/08, a calculadora em 10/08 — e o grupo ficou
    vazio, invisível pela regra do vazio.

    **Sobrevive com dono novo:** o monitor (`/monitor`, `brief-14`) é a única
    peça do portfólio que roda sem ninguém clicar, que é o que "responde
    sozinho" sempre quis dizer. Decisão dele em 10/08, no fecho do `brief-11`,
    e ela **sobrepõe o próprio `brief-14`**, que tinha escrito `entrega`
    ("o apoio já diz relatório recorrente"). O argumento é do conjunto: com o
    monitor aqui, as quatro automações carregam uma competência cada.

    O apoio foi reescrito na mesma data. O antigo — "Cálculo na hora, conversa,
    leitura automática" — descrevia o chat, a leitura por e-mail e a
    calculadora. Nenhum dos três existe.
  */
  responde: {
    chave: "responde",
    titulo: "Responde sozinho",
    apoio: "Regra que dispara, aviso agendado, registro do que rodou",
  },
};

export const PECAS: Peca[] = [
  {
    slug: "cardapio-planilha",
    nome: "Cardápio que o dono edita numa planilha",
    capacidade: "Dado ao vivo de planilha publicada em CSV, sem deploy a cada mudança",
    grupo: "puxa",
    tipo: "site",
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
    tipo: "site",
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
    // Site, não automação: a peça publicada é o institucional da Meridiano
    // Contabilidade (S1). O formulário é a competência que ele carrega.
    tipo: "site",
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
    tipo: "site",
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
    slug: "nota-fiscal-planilha",
    nome: "A nota fiscal vira linha de planilha",
    capacidade:
      "Foto da nota vira XML e vira linha de planilha — com a foto ao lado para conferir o que o modelo leu com dúvida",
    grupo: "puxa",
    // Primeira automação do grupo `puxa`: até 07/08 o grupo era só de sites. O
    // apoio dele sempre disse "documento" e a vaga nunca tinha sido ocupada.
    tipo: "automacao",
    // Azul-violeta. As cinco peças anteriores ocupam os matizes 46, 171, 206,
    // 281 e 326; as duas vertentes, 108 e 6. A maior lacuna que sobra é
    // 206→281, e este tom cai no meio dela.
    cor: { inner: "#1e0b8a", mid: "#10044e", outer: "#040114" },
    imagem: "/prints/nota-fiscal-planilha.png",
    url: "/nota-fiscal",
    interna: true,
    repo: "https://github.com/Hardcastro/aether-data",
    // "Gemini", não "Claude": o fornecedor foi trocado em 07/08 (commit 8af5216,
    // `gemini-3.6-flash` por fetch direto) e este chip ficou três dias mentindo
    // na vitrine. Achado em 10/08, durante o enterro da calculadora.
    stack: ["Next.js", "DOMParser", "Gemini (visão)", "pdf.js"],
    oQueProva: [
      "O processo inteiro da pilha de papel, nos dois verbos que ele tem: digitalizar e planilhar. A foto entra, vira um XML no layout que os sistemas importam, e o XML vira linha de planilha. Quem já tem o XML pula o primeiro estágio — esse caminho não sobe nada, porque nota já digital não precisa que ninguém olhe para ela.",
      "E o que veio de foto nunca se disfarça de documento. O XML gerado sai sem assinatura e sem protocolo da SEFAZ, com o aviso escrito dentro dele; a tabela marca campo a campo o que o modelo leu com dúvida em vez de preencher com algo plausível; e abrir a linha põe a foto original ao lado dos campos, para conferir e corrigir ali. Um número transcrito errado entrando na contabilidade de alguém é o dano real desta categoria de ferramenta, e cada uma dessas decisões existe contra ele.",
    ],
  },
  {
    slug: "cobranca-mensagens",
    nome: "A lista de quem deve vira as mensagens prontas",
    capacidade:
      "CSV de contas a receber vira uma mensagem por devedor, com o link do WhatsApp já preenchido — e sem link nenhum para telefone que não passa no crivo",
    grupo: "entrega",
    // Primeira automação do grupo `entrega`: até 10/08 ele carregava só o
    // formulário da S1, que é site. O apoio dele sempre disse "entrega para um
    // destinatário combinado antes" — é exatamente o que uma cobrança é.
    tipo: "automacao",
    // Rosa profundo, herdado da calculadora enterrada — e por método, não por
    // sentimentalismo: com ela fora, as peças e vertentes ocupam os matizes 6,
    // 46, 108, 171, 206, 249 e 281, e a maior lacuna do círculo volta a ser
    // 281→6, com 85 de largura. O meio dela é ~324, que é onde este tom está.
    cor: { inner: "#8a0b4f", mid: "#4e042a", outer: "#14010a" },
    imagem: "/prints/cobranca-mensagens.png",
    url: "/cobranca",
    interna: true,
    repo: "https://github.com/Hardcastro/aether-data",
    stack: ["Next.js", "Sem servidor", "Sem chave", "Vercel"],
    oQueProva: [
      "Relatório de contas a receber não tem formato: NF-e tem schema, OFX tem especificação, e o export do seu sistema chama a mesma coluna de Cliente, Sacado ou RAZAO_SOCIAL. Então a peça não adivinha — ela chuta pelo cabeçalho, mostra o chute com as três primeiras linhas do arquivo ao lado, e deixa você corrigir em cinco menus. Por baixo, o leitor aguenta o que o arquivo real traz: vírgula decimal, windows-1252, data em três formatos e o cabeçalho do relatório antes da tabela.",
      "E ela recusa três coisas de propósito. Não dispara sozinha — cada botão abre uma conversa, e quem aperta enviar é você. Não preenche juros nem multa por conta própria, porque não conhece o seu contrato. E telefone que não passa no crivo — DDD que não existe, celular sem o nono dígito, campo vazio — não ganha link nenhum: vai para uma lista à parte com o motivo escrito. Um número errado não é dado ruim numa planilha, é uma acusação de dívida entregue a quem não deve nada.",
    ],
  },
  /*
    A `calculadora-custo` (/calculadora) morava aqui e foi enterrada em
    10/08/2026 — ver `plano-portfolio.md`, "⚠ A N1 sai". Ela era a última
    sobrevivente do eixo de 05/08 e reprovava nos mesmos dois testes que
    mataram C1, C2 e C3: se ela parar, nenhum negócio para, e ela não vira
    ativo reutilizável para cliente nenhum. Uma calculadora do custo do
    trabalho manual vende a AEther; ela não faz o trabalho de quem compra.

    No lugar dela entrou a `/cobranca` (`brief-15`), construída no mesmo dia,
    que roda no arquivo de contas a receber do próprio visitante — e mora em
    `entrega`, não em `responde`. O grupo que ela esvaziou fica vazio e
    invisível até o monitor entrar; ver o comentário de `responde` em GRUPOS.
  */
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

export function pecasPorTipo(tipo: Tipo): Peca[] {
  return PECAS.filter((p) => p.tipo === tipo);
}

/** Rota de vitrine (`/sites`, `/automacoes`) → o tipo que ela mostra. */
export function tipoPorRota(rota: string): TipoInfo | undefined {
  return (Object.keys(TIPOS) as Tipo[]).map((t) => TIPOS[t]).find((t) => t.rota === rota);
}

/**
 * Onde a peça mora agora que a vitrine se dividiu em duas. Um lugar só decide
 * isso — se amanhã as rotas mudarem de nome, muda aqui e o site inteiro segue.
 */
export function rotaDaPeca(peca: Peca): string {
  return `${TIPOS[peca.tipo].rota}?peca=${peca.slug}`;
}

/**
 * Grupos com peça DENTRO de um tipo. A vitrine de automações não deve desenhar
 * "Puxa dado de onde ele está" enquanto nenhuma automação carregar essa
 * competência — é a mesma regra do vazio de GRUPOS_COM_PECAS, aplicada por
 * tipo em vez de no conjunto inteiro.
 */
export function gruposComPecasDoTipo(tipo: Tipo): GrupoInfo[] {
  return (Object.keys(GRUPOS) as Grupo[])
    .map((chave) => GRUPOS[chave])
    .filter((g) => PECAS.some((p) => p.tipo === tipo && p.grupo === g.chave));
}
