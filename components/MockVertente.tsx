import type { Tipo } from "@/lib/manifesto";

/**
 * O que gira no painel da home.
 *
 * Uma peça tem print porque existe uma tela dela. Uma vertente não tem — ela é
 * o conjunto. Então em vez de emprestar o print de uma das peças (o que faria a
 * home parecer que está mostrando aquela peça específica), cada vertente ganha
 * um mock desenhado.
 *
 * Desenhado, não fotografado: é a mesma decisão que o `app/opengraph-image.tsx`
 * já tomou, e a mesma regra do `sistema-visual.md`. Como é SVG inline, ele herda
 * `currentColor` e a paleta de vidro do resto da página, escala sem borrar em
 * qualquer densidade de tela, e não adiciona um arquivo em /public que possa dar
 * 404 depois.
 *
 * Os dois usam o mesmo vocabulário visual do site — retângulos de vidro, cantos
 * arredondados, uma única peça em rosa de destaque — para que a troca entre eles
 * leia como duas variações da mesma coisa, e não como dois desenhos diferentes.
 */

const VIDRO = "rgba(255,255,255,0.07)";
const BORDA = "rgba(255,255,255,0.22)";
const BORDA_FRACA = "rgba(255,255,255,0.13)";
const TEXTO = "rgba(255,255,255,0.34)";
const TEXTO_FORTE = "rgba(255,255,255,0.6)";

/** Barra que faz as vezes de linha de texto — o "lorem ipsum" sem letra nenhuma. */
function Linha({ x, y, w, h = 6, o = TEXTO }: { x: number; y: number; w: number; h?: number; o?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={o} />;
}

/**
 * Sites — uma página que mostra dado.
 *
 * Lê como navegador: barra de endereço, um bloco de manchete, e três cartões de
 * conteúdo. O detalhe que carrega o argumento é a coluna de dado à direita
 * ligada aos cartões: a página não é decoração, ela está mostrando uma fonte.
 */
function MockSite() {
  return (
    <svg viewBox="0 0 640 400" role="img" aria-label="Ilustração de uma página que exibe dados vindos de uma fonte externa">
      <rect x="0" y="0" width="640" height="400" rx="14" fill={VIDRO} />
      <rect x="0.5" y="0.5" width="639" height="399" rx="14" fill="none" stroke={BORDA_FRACA} />

      {/* cromo do navegador */}
      <path d="M0 34h640" stroke={BORDA_FRACA} strokeWidth="1" />
      <circle cx="22" cy="17" r="4" fill={TEXTO} />
      <circle cx="38" cy="17" r="4" fill={TEXTO} />
      <circle cx="54" cy="17" r="4" fill={TEXTO} />
      <rect x="76" y="9" width="220" height="16" rx="8" fill="rgba(255,255,255,0.06)" stroke={BORDA_FRACA} />
      <Linha x={88} y={14} w={120} h={6} />

      {/* manchete */}
      <Linha x={40} y={72} w={300} h={16} o={TEXTO_FORTE} />
      <Linha x={40} y={100} w={216} h={16} o={TEXTO_FORTE} />
      <Linha x={40} y={136} w={260} h={7} />
      <Linha x={40} y={152} w={190} h={7} />

      {/* a fonte de dado, à direita, ligada aos cartões */}
      <rect x="452" y="64" width="148" height="104" rx="10" fill="rgba(255,255,255,0.05)" stroke={BORDA} strokeDasharray="5 4" />
      <Linha x={468} y={82} w={70} h={6} o={TEXTO_FORTE} />
      {[102, 118, 134, 150].map((y) => (
        <g key={y}>
          <Linha x={468} y={y} w={44} h={5} />
          <Linha x={522} y={y} w={62} h={5} />
        </g>
      ))}
      <path
        d="M526 176 v34 q0 10 -10 10 h-330 q-10 0 -10 10 v14"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        opacity="0.75"
      />
      <circle cx="176" cy="244" r="3.5" fill="var(--accent)" />

      {/* cartões alimentados por ela */}
      {[40, 216, 392].map((x, i) => (
        <g key={x}>
          <rect
            x={x}
            y={258}
            width="160"
            height="104"
            rx="10"
            fill={VIDRO}
            stroke={i === 0 ? "var(--accent)" : BORDA_FRACA}
            strokeOpacity={i === 0 ? 0.55 : 1}
          />
          <rect x={x + 14} y={274} width="132" height="40" rx="6" fill="rgba(255,255,255,0.05)" />
          <Linha x={x + 14} y={324} w={104} h={6} o={TEXTO_FORTE} />
          <Linha x={x + 14} y={340} w={66} h={5} />
        </g>
      ))}
    </svg>
  );
}

/**
 * Automações — uma ferramenta que roda sozinha.
 *
 * Lê como fluxo: o que entra à esquerda, o que processa no meio, o que sai à
 * direita — e o laço por baixo, que é a parte que separa automação de script.
 * O relógio existe porque "sozinha" quer dizer "sem ninguém apertar nada".
 */
function MockAutomacao() {
  const caixa = (x: number, y: number, w: number, h: number, destaque = false) => (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={10}
      fill={VIDRO}
      stroke={destaque ? "var(--accent)" : BORDA}
      strokeOpacity={destaque ? 0.6 : 1}
    />
  );

  return (
    <svg viewBox="0 0 640 400" role="img" aria-label="Ilustração de um fluxo automático: entrada, processamento agendado e saídas">
      <rect x="0" y="0" width="640" height="400" rx="14" fill={VIDRO} />
      <rect x="0.5" y="0.5" width="639" height="399" rx="14" fill="none" stroke={BORDA_FRACA} />

      <Linha x={40} y={38} w={130} h={7} o={TEXTO_FORTE} />

      {/* entrada */}
      {caixa(40, 148, 132, 84)}
      <Linha x={58} y={170} w={64} h={6} o={TEXTO_FORTE} />
      <Linha x={58} y={188} w={96} h={5} />
      <Linha x={58} y={202} w={76} h={5} />

      <path d="M172 190 h56" stroke={BORDA} strokeWidth="1.6" fill="none" />
      <path d="M222 185 l8 5 -8 5z" fill={BORDA} />

      {/* o miolo, com o relógio */}
      {caixa(236, 130, 152, 120, true)}
      <circle cx="312" cy="172" r="21" fill="none" stroke="var(--accent)" strokeWidth="1.8" opacity="0.85" />
      <path d="M312 160 v13 l9 6" stroke="var(--accent)" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      <Linha x={262} y={208} w={100} h={6} o={TEXTO_FORTE} />
      <Linha x={262} y={224} w={72} h={5} />

      <path d="M388 190 h56" stroke={BORDA} strokeWidth="1.6" fill="none" />
      <path d="M438 185 l8 5 -8 5z" fill={BORDA} />

      {/* saídas */}
      {caixa(452, 108, 148, 68)}
      <Linha x={470} y={128} w={58} h={6} o={TEXTO_FORTE} />
      <Linha x={470} y={144} w={100} h={5} />

      {caixa(452, 204, 148, 68)}
      <Linha x={470} y={224} w={70} h={6} o={TEXTO_FORTE} />
      <Linha x={470} y={240} w={86} h={5} />

      <path d="M444 190 v-48 q0-8 8-8" stroke={BORDA} strokeWidth="1.4" fill="none" />
      <path d="M444 190 v48 q0 8 8 8" stroke={BORDA} strokeWidth="1.4" fill="none" />

      {/* o laço: é isto que faz rodar sozinha, e não uma vez só */}
      <path
        d="M526 288 v34 q0 10 -10 10 h-410 q-10 0 -10 -10 v-90"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeDasharray="6 5"
        opacity="0.7"
      />
      <path d="M101 237 l5 -9 5 9z" fill="var(--accent)" opacity="0.7" />
      <Linha x={214} y={344} w={210} h={6} />
    </svg>
  );
}

export function MockVertente({ tipo }: { tipo: Tipo }) {
  return (
    <div className="mock" aria-hidden={false}>
      {tipo === "site" ? <MockSite /> : <MockAutomacao />}
    </div>
  );
}
