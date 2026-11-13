/*
 * texturas.js — Texturas procedurais desenhadas em <canvas> (nenhum arquivo de imagem)
 *
 * Superfícies do laboratório (azulejo sujo, piso, teto, metal enferrujado) e as
 * telas dinâmicas: o painel neon das portas é redesenhado sempre que a fórmula
 * muda de valor.
 */
const Texturas = (() => {
  const FONTE = "Consolas, 'DejaVu Sans Mono', 'Courier New', monospace";
  const COR = { fechada: "#ff3b30", aberta: "#35ff7a", selada: "#ffc93a", bloqueada: "#ff3b30", liberada: "#35ff7a" };
  const sorteio = (a, b) => a + Math.random() * (b - a);

  function tela(w, h) {
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    return c;
  }

  // `repetir` só é passado para superfícies lado a lado (parede, piso, teto).
  function comoTextura(canvas, repetir = 0) {
    const t = new THREE.CanvasTexture(canvas);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = 4;
    if (repetir) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(repetir, repetir);
    }
    return t;
  }

  function granulado(g, w, h, quantos, alfa) {
    for (let i = 0; i < quantos; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? "0,0,0" : "255,255,255"},${Math.random() * alfa})`;
      g.fillRect(Math.random() * w, Math.random() * h, sorteio(1, 3), sorteio(1, 3));
    }
  }

  function manchas(g, w, h, quantas, cor) {
    for (let i = 0; i < quantas; i++) {
      const x = Math.random() * w, y = Math.random() * h, r = sorteio(12, 60);
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, cor);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
  }

  // ---------- Superfícies ----------
  function azulejo() {
    const c = tela(256, 256), g = c.getContext("2d");
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const v = Math.floor(sorteio(118, 150));
        g.fillStyle = `rgb(${v},${v + 8},${v - 6})`;
        g.fillRect(x * 64, y * 64, 64, 64);
      }
    }
    g.strokeStyle = "#2c302a";
    g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
    }
    manchas(g, 256, 256, 9, "rgba(40,28,12,0.45)");
    for (let i = 0; i < 7; i++) { // escorridos de ferrugem
      const x = Math.random() * 256, alt = sorteio(60, 220);
      const grad = g.createLinearGradient(0, 0, 0, alt);
      grad.addColorStop(0, "rgba(96,44,14,0.55)");
      grad.addColorStop(1, "rgba(96,44,14,0)");
      g.fillStyle = grad;
      g.fillRect(x, 0, sorteio(3, 9), alt);
    }
    granulado(g, 256, 256, 2500, 0.12);
    return comoTextura(c, 2);
  }

  function piso() {
    const c = tela(256, 256), g = c.getContext("2d");
    g.fillStyle = "#3a3c3d";
    g.fillRect(0, 0, 256, 256);
    manchas(g, 256, 256, 10, "rgba(10,10,10,0.5)");
    manchas(g, 256, 256, 2, "rgba(70,8,8,0.45)");
    granulado(g, 256, 256, 5000, 0.14);
    g.strokeStyle = "rgba(0,0,0,0.6)";
    g.lineWidth = 2;
    g.strokeRect(1, 1, 254, 254);
    g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
    return comoTextura(c, 1);
  }

  function teto() {
    const c = tela(128, 128), g = c.getContext("2d");
    g.fillStyle = "#26282a";
    g.fillRect(0, 0, 128, 128);
    manchas(g, 128, 128, 4, "rgba(0,0,0,0.5)");
    granulado(g, 128, 128, 1200, 0.1);
    g.strokeStyle = "#101112";
    g.lineWidth = 3;
    g.strokeRect(0, 0, 128, 128);
    return comoTextura(c, 1);
  }

  function metal() {
    const c = tela(256, 256), g = c.getContext("2d");
    g.fillStyle = "#4b4640";
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) { // nervuras
      g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0, y, 256, 3);
      g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(0, y + 3, 256, 2);
    }
    manchas(g, 256, 256, 14, "rgba(120,52,16,0.6)");
    manchas(g, 256, 256, 6, "rgba(20,12,6,0.6)");
    granulado(g, 256, 256, 4000, 0.15);
    g.fillStyle = "#2a2622";
    for (let x = 16; x < 256; x += 56) {
      for (const y of [14, 242]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
    }
    return comoTextura(c);
  }

  // ---------- Placas e telas ----------
  function placaLetra(letra, presa) {
    const c = tela(128, 128), g = c.getContext("2d");
    g.fillStyle = presa ? "#8a8f93" : "#d8b21c";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#111";
    g.lineWidth = 8;
    g.strokeRect(6, 6, 116, 116);
    g.fillStyle = "#111";
    g.font = `bold 92px ${FONTE}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(letra, 64, 70);
    granulado(g, 128, 128, 500, 0.2);
    return comoTextura(c);
  }

  function telaTerminal() {
    const c = tela(256, 192), g = c.getContext("2d");
    g.fillStyle = "#020a04";
    g.fillRect(0, 0, 256, 192);
    g.fillStyle = "#35ff7a";
    g.shadowColor = "#35ff7a";
    g.shadowBlur = 8;
    g.textAlign = "center";
    g.font = `bold 20px ${FONTE}`;
    g.fillText("PROTOCOLO", 128, 48);
    g.font = `bold 34px ${FONTE}`;
    g.fillText("IMPOSSÍVEL!", 128, 96);
    g.font = `16px ${FONTE}`;
    g.fillText("selar contradições", 128, 132);
    g.fillText("> _", 128, 164);
    return comoTextura(c);
  }

  function escreverAjustado(g, texto, x, y, larguraMax, tamanho) {
    do { g.font = `bold ${tamanho}px ${FONTE}`; tamanho -= 4; }
    while (g.measureText(texto).width > larguraMax && tamanho > 20);
    g.fillText(texto, x, y);
  }

  // Painel neon sobre a porta: nome, situação e a fórmula. Chamado a cada mudança de estado.
  function desenharPainel(canvas, { titulo, situacao, rotulo, formula }) {
    const g = canvas.getContext("2d"), w = canvas.width, h = canvas.height;
    const cor = COR[situacao];
    g.shadowBlur = 0;
    g.fillStyle = "#04070a";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = cor;
    g.lineWidth = 10;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = cor;
    g.shadowColor = cor;
    g.shadowBlur = 18;
    g.textBaseline = "middle";
    g.font = `bold 40px ${FONTE}`;
    g.textAlign = "left";
    g.fillText(titulo, 36, 48);
    g.textAlign = "right";
    g.fillText(rotulo, w - 36, 48);
    g.textAlign = "center";
    escreverAjustado(g, formula, w / 2, h / 2 + 30, w - 80, 104);
  }

  return { azulejo, piso, teto, metal, placaLetra, telaTerminal, tela, comoTextura, desenharPainel, COR };
})();
