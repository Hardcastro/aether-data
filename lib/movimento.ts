/**
 * Matemática pura da seção 8 — flutuação e magnetismo. Sem leitura de DOM,
 * sem gsap. Só o loop de requestAnimationFrame chama isto, uma vez por
 * frame e por cartão.
 */

export type OffsetMundo = { x: number; y: number; rot: number };

/** Amplitude 4px em unidades de MUNDO, rotação 0.9°, período 7–11s. */
export function flutuacao(tempoMs: number, offsetFase: number, periodoS: number): OffsetMundo {
  const fase = (tempoMs / 1000) * ((Math.PI * 2) / periodoS) + offsetFase;
  return {
    x: 0,
    y: Math.sin(fase) * 4,
    rot: Math.cos(fase) * 0.9,
  };
}

export type OffsetTela = { x: number; y: number };

const RAIO_MAGNETICO_PX = 220;
const DESLOCAMENTO_MAX_PX = 10;
const LERP_MAGNETISMO = 0.12;

/**
 * Um passo de magnetismo em direção ao cursor. `atual` é o offset de tela do
 * frame anterior (para o lerp); devolve o novo offset de tela, ainda por
 * dividir por k antes de virar transform (ver seção 8.2).
 */
export function passoMagnetismo(
  atual: OffsetTela,
  cartaoTelaX: number,
  cartaoTelaY: number,
  cursorTelaX: number | null,
  cursorTelaY: number | null,
  suprimido: boolean
): OffsetTela {
  if (suprimido || cursorTelaX === null || cursorTelaY === null) {
    return {
      x: atual.x + (0 - atual.x) * LERP_MAGNETISMO,
      y: atual.y + (0 - atual.y) * LERP_MAGNETISMO,
    };
  }
  const dx = cursorTelaX - cartaoTelaX;
  const dy = cursorTelaY - cartaoTelaY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist >= RAIO_MAGNETICO_PX || dist === 0) {
    return {
      x: atual.x + (0 - atual.x) * LERP_MAGNETISMO,
      y: atual.y + (0 - atual.y) * LERP_MAGNETISMO,
    };
  }
  const forca = (RAIO_MAGNETICO_PX - dist) / RAIO_MAGNETICO_PX;
  const alvoX = (dx / dist) * forca * DESLOCAMENTO_MAX_PX;
  const alvoY = (dy / dist) * forca * DESLOCAMENTO_MAX_PX;
  return {
    x: atual.x + (alvoX - atual.x) * LERP_MAGNETISMO,
    y: atual.y + (alvoY - atual.y) * LERP_MAGNETISMO,
  };
}

const LERP_BARRA = 0.06;
const DESLOCAMENTO_BARRA_MAX = 4;

/** Contra-parallaxe da barra de controles — ±4px, lerp 0.06 (seção 8.5). */
export function passoParallaxeBarra(
  atual: OffsetTela,
  centroX: number,
  centroY: number,
  cursorTelaX: number | null,
  cursorTelaY: number | null
): OffsetTela {
  if (cursorTelaX === null || cursorTelaY === null) {
    return {
      x: atual.x + (0 - atual.x) * LERP_BARRA,
      y: atual.y + (0 - atual.y) * LERP_BARRA,
    };
  }
  const dx = cursorTelaX - centroX;
  const dy = cursorTelaY - centroY;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  // Contra-parallaxe: a barra se afasta do cursor, não vai na direção dele.
  const alvoX = -(dx / dist) * DESLOCAMENTO_BARRA_MAX;
  const alvoY = -(dy / dist) * DESLOCAMENTO_BARRA_MAX;
  return {
    x: atual.x + (alvoX - atual.x) * LERP_BARRA,
    y: atual.y + (alvoY - atual.y) * LERP_BARRA,
  };
}
