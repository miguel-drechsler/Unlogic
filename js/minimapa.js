/*
 * minimapa.js — Minimapa com névoa de exploração
 *
 * Só aparece o que o jogador já viu: os tiles ao redor dele e o que está em linha
 * reta nos corredores. Dois modos (a tecla M alterna; o terceiro estado é oculto):
 *
 *   local     centrado no jogador, ampliado e GIRANDO com ele: a frente da câmera é
 *             sempre "para cima" no mapa. Ninguém precisa girar o mapa de cabeça.
 *   completo  o andar inteiro, norte fixo para cima (bom para planejar a rota).
 *
 * Os dois são o mesmo desenho com outra "câmera" (escala + rotação + centro).
 * Para não confundir pela cor, cada coisa tem uma forma:
 *   portas     traço atravessado + número (vermelho fechada, verde aberta, amarelo selada)
 *   alavancas  círculo com a letra (verde V, vermelho F), depois de catalogadas
 *   terminal   quadrado amarelo "T"      elevador  bloco "S" na borda (vermelho/verde)
 *   criatura   anel pulsando — o sensor só capta quando ela está perto
 *   jogador    seta branca com contorno e cone da lanterna, sempre por cima de tudo
 */
const Minimapa = (() => {
  const { CHAO, PAREDE } = Labirinto;
  const ALCANCE_VISAO = 5;   // tiles vistos em linha reta
  const ALCANCE_SENSOR = 13; // metros em que a criatura aparece
  const RAIO_LOCAL = 5;      // tiles do centro à borda no modo local
  const PX_TILE = 16;        // resolução da camada de tiles guardada
  const COR = { ...Texturas.COR, chao: "#3f6853", parede: "#12211a", tinta: "#04110a" };
  const DIRECOES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // A camada de tiles (o grosso do desenho) só muda quando algo novo é revelado:
  // fica guardada num canvas fora da tela (PX_TILE por tile) e é só copiada a cada quadro.
  const camadas = new WeakMap(); // visto -> { canvas, suja }

  function novaVisao(lab) {
    const visto = new Uint8Array(lab.L * lab.L);
    camadas.set(visto, { canvas: document.createElement("canvas"), suja: true });
    return visto;
  }

  // Marca como vistos os tiles em volta de (tx, tz) e ao longo dos corredores.
  function revelar(lab, visto, tx, tz) {
    const { L, tiles } = lab;
    const camada = camadas.get(visto);
    const marcar = (x, z) => {
      if (x < 0 || z < 0 || x >= L || z >= L || visto[z * L + x]) return;
      visto[z * L + x] = 1;
      if (camada) camada.suja = true;
    };
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) marcar(tx + dx, tz + dz);
    for (const [dx, dz] of DIRECOES) {
      for (let k = 1; k <= ALCANCE_VISAO; k++) {
        const x = tx + dx * k, z = tz + dz * k;
        if (x < 0 || z < 0 || x >= L || z >= L) break;
        marcar(x, z);
        marcar(x + dz, z + dx); // as duas laterais do corredor
        marcar(x - dz, z - dx);
        if (tiles[z * L + x] !== CHAO) break; // parede ou porta tapam a visão
      }
    }
  }

  function atualizarCamada(lab, visto) {
    const camada = camadas.get(visto), L = lab.L;
    if (!camada.suja) return camada.canvas;
    camada.canvas.width = camada.canvas.height = L * PX_TILE;
    const gc = camada.canvas.getContext("2d");
    for (let z = 0; z < L; z++) {
      for (let x = 0; x < L; x++) {
        if (!visto[z * L + x]) continue;
        gc.fillStyle = lab.tiles[z * L + x] === PAREDE ? COR.parede : COR.chao;
        gc.fillRect(x * PX_TILE, z * PX_TILE, PX_TILE, PX_TILE);
      }
    }
    camada.suja = false;
    return camada.canvas;
  }

  // d = { lab, visto, mundo, e, jogador:{x,z}, frente:{x,z}, monstro:{x,z}|null, tempo,
  //       modo: "local" | "completo" }
  function desenhar(canvas, d) {
    const { lab, visto, mundo, e } = d;
    const g = canvas.getContext("2d"), W = canvas.width, H = canvas.height, L = lab.L, T = Mundo.T;
    const viu = (t) => visto[t.z * L + t.x];
    const local = d.modo !== "completo";
    const rumo = Math.atan2(d.frente.z, d.frente.x);    // para onde o jogador olha, no plano do mapa
    const jx = d.jogador.x / T, jz = d.jogador.z / T;   // jogador em tiles

    // ---- A "câmera" do mapa: tile (x, z) -> pixel (x·s, z·s), depois gira e centraliza.
    // Local: gira o mundo em −π/2 − rumo, para a frente apontar para cima (−y na tela),
    // com o jogador um pouco abaixo do centro (mostra mais do que vem pela frente).
    const s = local ? W / (2 * RAIO_LOCAL) : W / L;
    const giro = local ? -Math.PI / 2 - rumo : 0;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    if (local) {
      g.translate(W / 2, H * 0.62);
      g.rotate(giro);
      g.translate(-jx * s, -jz * s);
    }

    g.imageSmoothingEnabled = false; // tiles nítidos ao ampliar
    g.drawImage(atualizarCamada(lab, visto), 0, 0, L * s, L * s);

    // Desenha algo "de pé" no ponto (x, z) do mapa, desfazendo o giro.
    const dePe = (x, z, desenho) => {
      g.save();
      g.translate(x * s, z * s);
      g.rotate(-giro);
      desenho();
      g.restore();
    };
    g.textAlign = "center";
    g.textBaseline = "middle";
    const fonte = (px) => { g.font = `bold ${Math.round(px)}px Consolas, monospace`; };

    // ---- Portas: traço atravessado no corredor; no modo local, com o número da porta.
    mundo.portas.forEach((p, i) => {
      if (!viu(p.tile)) return;
      g.fillStyle = COR[p.situacao];
      if (p.eixo === "x") g.fillRect((p.tile.x + 0.32) * s, p.tile.z * s, 0.36 * s, s);
      else g.fillRect(p.tile.x * s, (p.tile.z + 0.32) * s, s, 0.36 * s);
      if (!local) return;
      dePe(p.tile.x + 0.5, p.tile.z + 0.5, () => {
        const r = s * 0.24;
        g.fillStyle = COR.tinta;
        g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = COR[p.situacao];
        fonte(r * 1.5);
        g.fillText(String(i + 1), 0, r * 0.1);
      });
    });

    // ---- Elevador: bloco com "S" (a cor diz se está liberado).
    if (viu(mundo.saida.tile)) {
      const t = mundo.saida.tile;
      g.fillStyle = COR[mundo.saida.situacao];
      g.fillRect(t.x * s, t.z * s, s, s);
      dePe(t.x + 0.5, t.z + 0.5, () => { fonte(s * 0.7); g.fillStyle = COR.tinta; g.fillText("S", 0, s * 0.05); });
    }

    // ---- Alavancas (círculo) e terminal (quadrado). Menores que um tile, e encostados na
    // parede onde estão presos no 3D (sup.dx/dz), não no meio da célula: assim não somem
    // embaixo da seta quando o jogador está na mesma célula.
    const r = s * (local ? 0.36 : 0.52);
    const naParede = (sup) => [sup.x + 0.5 + sup.dx * 0.28, sup.z + 0.5 + sup.dz * 0.28];
    mundo.alavancas.forEach((a) => {
      if (!e.alavancasVistas.has(a.nome)) return;
      dePe(...naParede(a.sup), () => {
        g.fillStyle = e.valores[a.nome] ? COR.aberta : COR.fechada;
        g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
        g.fillStyle = COR.tinta;
        fonte(r * 1.45);
        g.fillText(a.nome, 0, r * 0.1);
      });
    });
    if (viu(lab.terminal)) {
      dePe(...naParede(lab.terminal), () => {
        g.fillStyle = COR.selada;
        g.fillRect(-r, -r, 2 * r, 2 * r);
        g.fillStyle = COR.tinta;
        fonte(r * 1.45);
        g.fillText("T", 0, r * 0.1);
      });
    }

    // ---- Criatura: anel pulsando, só dentro do alcance do sensor (null no modo estudo).
    if (d.monstro && Math.hypot(d.monstro.x - d.jogador.x, d.monstro.z - d.jogador.z) < ALCANCE_SENSOR) {
      const pulso = Math.abs(Math.sin(d.tempo * 6));
      g.strokeStyle = COR.fechada;
      g.fillStyle = COR.fechada;
      g.lineWidth = Math.max(2, s * 0.12);
      g.globalAlpha = 0.5 + 0.5 * pulso;
      g.beginPath(); g.arc((d.monstro.x / T) * s, (d.monstro.z / T) * s, s * (0.3 + 0.25 * pulso), 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc((d.monstro.x / T) * s, (d.monstro.z / T) * s, s * 0.14, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
    }

    // ---- Jogador por último: cone da lanterna + seta com contorno escuro.
    g.save();
    g.translate(jx * s, jz * s);
    g.rotate(rumo);
    const alcance = s * (local ? 3.4 : 2.6);
    const cone = g.createRadialGradient(0, 0, 0, 0, 0, alcance);
    cone.addColorStop(0, "rgba(255, 240, 208, 0.38)");
    cone.addColorStop(1, "rgba(255, 240, 208, 0)");
    g.fillStyle = cone;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, alcance, -0.5, 0.5); g.closePath(); g.fill();
    const a = s * (local ? 0.42 : 0.62);
    g.beginPath();
    g.moveTo(a, 0); g.lineTo(-a * 0.7, a * 0.65); g.lineTo(-a * 0.3, 0); g.lineTo(-a * 0.7, -a * 0.65);
    g.closePath();
    g.lineJoin = "round";
    g.lineWidth = Math.max(3, s * 0.12);
    g.strokeStyle = COR.tinta;
    g.stroke();
    g.fillStyle = "#ffffff";
    g.fill();
    g.restore();

    // ---- Moldura do modo local: escurece a borda e marca onde fica o norte.
    if (local) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const borda = g.createRadialGradient(W / 2, H / 2, W * 0.32, W / 2, H / 2, W * 0.72);
      borda.addColorStop(0, "rgba(1, 5, 3, 0)");
      borda.addColorStop(1, "rgba(1, 5, 3, 0.92)");
      g.fillStyle = borda;
      g.fillRect(0, 0, W, H);
      const norte = -Math.PI / 2 + giro; // a direção −z do mapa, depois do giro
      const nx = W / 2 + Math.cos(norte) * W * 0.43, nz = H / 2 + Math.sin(norte) * H * 0.43;
      g.fillStyle = COR.selada;
      g.beginPath(); g.arc(nx, nz, W * 0.04, 0, Math.PI * 2); g.fill();
      g.fillStyle = COR.tinta;
      fonte(W * 0.05);
      g.fillText("N", nx, nz + 1);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  return { novaVisao, revelar, desenhar };
})();
