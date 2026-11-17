/*
 * minimapa.js — Minimapa com névoa de exploração
 *
 * Só aparece o que o jogador já viu: os tiles ao redor dele e o que está em linha
 * reta nos corredores. Norte fixo (o mapa não gira; a seta do jogador gira).
 *
 *   portas     traço na cor da situação (vermelho fechada, verde aberta, amarelo selada)
 *   alavancas  letra na cor do valor (verde V, vermelho F), depois de catalogadas
 *   terminal   T amarelo            elevador   bloco verde/vermelho na borda
 *   criatura   ponto vermelho pulsando — o sensor só capta quando ela está perto
 */
const Minimapa = (() => {
  const { CHAO, PAREDE } = Labirinto;
  const ALCANCE_VISAO = 5;   // tiles vistos em linha reta
  const ALCANCE_SENSOR = 13; // metros em que a criatura aparece
  const COR = { ...Texturas.COR, chao: "#3f6853", parede: "#12211a" };
  const DIRECOES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  // A camada de tiles (o grosso do desenho) só muda quando algo novo é revelado:
  // fica guardada num canvas fora da tela e é só copiada a cada quadro.
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

  // d = { lab, visto, mundo, e, jogador:{x,z}, frente:{x,z}, monstro:{x,z}, tempo }
  function desenhar(canvas, d) {
    const { lab, visto, mundo, e } = d;
    const g = canvas.getContext("2d"), L = lab.L, s = canvas.width / L, T = Mundo.T;
    const viu = (t) => visto[t.z * L + t.x];
    g.clearRect(0, 0, canvas.width, canvas.height);

    const camada = camadas.get(visto);
    if (camada.suja || camada.canvas.width !== canvas.width) {
      camada.canvas.width = canvas.width;
      camada.canvas.height = canvas.height;
      const gc = camada.canvas.getContext("2d");
      for (let z = 0; z < L; z++) {
        for (let x = 0; x < L; x++) {
          if (!visto[z * L + x]) continue;
          gc.fillStyle = lab.tiles[z * L + x] === PAREDE ? COR.parede : COR.chao;
          gc.fillRect(x * s, z * s, s + 0.5, s + 0.5); // +0.5 fecha as frestas entre tiles
        }
      }
      camada.suja = false;
    }
    g.drawImage(camada.canvas, 0, 0);

    // Portas e elevador: um traço atravessado no corredor.
    const traco = (p, cor) => {
      g.fillStyle = cor;
      if (p.eixo === "x") g.fillRect((p.tile.x + 0.3) * s, p.tile.z * s, 0.4 * s, s);
      else g.fillRect(p.tile.x * s, (p.tile.z + 0.3) * s, s, 0.4 * s);
    };
    mundo.portas.forEach((p) => { if (viu(p.tile)) traco(p, COR[p.situacao]); });
    if (viu(mundo.saida.tile)) {
      g.fillStyle = COR[mundo.saida.situacao];
      g.fillRect(mundo.saida.tile.x * s, mundo.saida.tile.z * s, s, s);
    }

    // Alavancas e terminal: etiqueta preenchida (maior que o tile, para a letra ser legível).
    g.font = `bold ${Math.round(s * 1.15)}px Consolas, monospace`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    const letra = (t, texto, cor) => {
      const cx = (t.x + 0.5) * s, cz = (t.z + 0.5) * s, r = s * 0.72;
      g.fillStyle = cor;
      g.fillRect(cx - r, cz - r, 2 * r, 2 * r);
      g.fillStyle = "#04110a";
      g.fillText(texto, cx, cz + s * 0.08);
    };
    mundo.alavancas.forEach((a) => {
      if (e.alavancasVistas.has(a.nome)) letra(a.sup, a.nome, e.valores[a.nome] ? COR.aberta : COR.fechada);
    });
    if (viu(lab.terminal)) letra(lab.terminal, "T", COR.selada);

    // Criatura: só dentro do alcance do sensor, e pulsando.
    // No modo estudo, `d.monstro` é null e o sensor fica desligado.
    if (d.monstro) {
      const mx = d.monstro.x - d.jogador.x, mz = d.monstro.z - d.jogador.z;
      if (Math.hypot(mx, mz) < ALCANCE_SENSOR) {
        g.globalAlpha = 0.45 + 0.55 * Math.abs(Math.sin(d.tempo * 6));
        g.fillStyle = COR.fechada;
        g.beginPath();
        g.arc((d.monstro.x / T) * s, (d.monstro.z / T) * s, s * 0.45, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
    }

    // Jogador: seta apontando para onde ele olha.
    g.save();
    g.translate((d.jogador.x / T) * s, (d.jogador.z / T) * s);
    g.rotate(Math.atan2(d.frente.z, d.frente.x));
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.moveTo(s * 0.6, 0);
    g.lineTo(-s * 0.4, s * 0.4);
    g.lineTo(-s * 0.15, 0);
    g.lineTo(-s * 0.4, -s * 0.4);
    g.closePath();
    g.fill();
    g.restore();
  }

  return { novaVisao, revelar, desenhar };
})();
