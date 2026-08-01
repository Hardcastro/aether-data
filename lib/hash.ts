/**
 * Hash determinístico sobre o slug — nunca Math.random(). Aleatório roda
 * diferente no servidor e no cliente, o React reclama de hidratação e o
 * primeiro frame pisca. Ver seção 8.1 do prompt-claude-code-04.
 */
function hash32(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type FaseFlutuacao = {
  /** offset de fase, em radianos */
  offset: number;
  /** período do ciclo, em segundos — entre 7 e 11 */
  periodo: number;
};

export function faseDoSlug(slug: string): FaseFlutuacao {
  const h = hash32(slug);
  const offset = (h % 1000) / 1000 * Math.PI * 2;
  const periodo = 7 + ((h >>> 10) % 5); // 7..11
  return { offset, periodo };
}
