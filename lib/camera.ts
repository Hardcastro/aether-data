export type Camera = {
  /** ponto do mundo no centro da tela */
  x: number;
  y: number;
  k: number;
};

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 1.8;

export function clampZoom(k: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, k));
}

/** tx/ty do container do mundo, a partir da câmera e do tamanho do viewport. */
export function transformDoMundo(camera: Camera, viewportW: number, viewportH: number) {
  const tx = viewportW / 2 - camera.x * camera.k;
  const ty = viewportH / 2 - camera.y * camera.k;
  return { tx, ty, k: camera.k };
}

export function telaParaMundo(
  camera: Camera,
  viewportW: number,
  viewportH: number,
  screenX: number,
  screenY: number
) {
  const { tx, ty, k } = transformDoMundo(camera, viewportW, viewportH);
  return {
    x: (screenX - tx) / k,
    y: (screenY - ty) / k,
  };
}

function boundsDePontos(pontos: Array<{ x: number; y: number }>, raioCartao = 140): Bounds {
  const xs = pontos.map((p) => p.x);
  const ys = pontos.map((p) => p.y);
  return {
    minX: Math.min(...xs) - raioCartao,
    minY: Math.min(...ys) - raioCartao,
    maxX: Math.max(...xs) + raioCartao,
    maxY: Math.max(...ys) + raioCartao,
  };
}

/** Nova câmera após um zoom que mantém o ponto de mundo sob o cursor fixo na tela. */
export function zoomEmTornoDoCursor(
  camera: Camera,
  viewportW: number,
  viewportH: number,
  screenX: number,
  screenY: number,
  novoK: number
): Camera {
  const pontoMundo = telaParaMundo(camera, viewportW, viewportH, screenX, screenY);
  const k = clampZoom(novoK);
  return {
    x: pontoMundo.x + (viewportW / 2 - screenX) / k,
    y: pontoMundo.y + (viewportH / 2 - screenY) / k,
    k,
  };
}

/** Câmera que enquadra os pontos dados, com margem, sem nunca fixar zoom na mão. */
export function enquadrar(
  pontos: Array<{ x: number; y: number }>,
  viewportW: number,
  viewportH: number,
  margem = 1.35
): Camera {
  if (pontos.length === 0) {
    return { x: 0, y: 0, k: 1 };
  }
  const b = boundsDePontos(pontos);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const largura = Math.max(1, (b.maxX - b.minX) * margem);
  const altura = Math.max(1, (b.maxY - b.minY) * margem);
  const kX = viewportW / largura;
  const kY = viewportH / altura;
  const k = clampZoom(Math.min(kX, kY));
  return { x: cx, y: cy, k };
}
