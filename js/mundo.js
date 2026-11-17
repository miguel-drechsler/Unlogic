/*
 * mundo.js — Constrói o andar em 3D a partir do labirinto e liga os objetos ao motor lógico
 *
 * É aqui que a lógica vira cenário:
 *   - cada alavanca 3D mostra o valor de uma variável (cabo para cima = V, para baixo = F);
 *   - cada porta pergunta ao motor (Estado.situacaoPorta -> Logica.avaliar) se a sua
 *     fórmula é verdadeira e sobe ou desce de acordo;
 *   - o painel neon sobre a porta é uma CanvasTexture redesenhada a cada mudança.
 *
 * Mundo.construir(cena, lab, estado) devolve o andar com:
 *   sincronizar(e)   relê o estado lógico e atualiza portas, painéis e alavancas
 *   atualizar(...)   animações de cada quadro (portas, cabos, lâmpadas piscando)
 *   solido(x, z)     colisão do jogador      passavel(tx, tz)  grid para o A* do monstro
 */
const Mundo = (() => {
  const T = 3;              // lado de um tile, em metros
  const H = 3.2;            // pé-direito
  const ALTURA_PORTA = 2.55;
  const ESPESSURA = 0.45;   // meia espessura de colisão de uma porta fechada
  const PASSA = 0.75;       // abertura mínima para passar: a borda já está acima dos olhos (1,65 m)
  const DENTRO = 0.85;      // |distância ao eixo da porta| em que o jogador ocupa o vão (ESPESSURA + raio)
  const { PAREDE, CHAO } = Labirinto;
  const centro = (t) => (t + 0.5) * T;
  const VERDE = 0x35ff7a, VERMELHO = 0xff3b30;

  let comuns = null; // materiais compartilhados entre os andares (criados uma vez)
  function materiaisComuns() {
    if (!comuns) {
      comuns = {
        parede: new THREE.MeshLambertMaterial({ map: Texturas.azulejo() }),
        piso: new THREE.MeshLambertMaterial({ map: Texturas.piso() }),
        teto: new THREE.MeshLambertMaterial({ map: Texturas.teto() }),
        metal: new THREE.MeshStandardMaterial({ map: Texturas.metal(), roughness: 0.75, metalness: 0.25 }),
        escuro: new THREE.MeshStandardMaterial({ color: 0x1d2023, roughness: 0.6, metalness: 0.3 }),
        aco: new THREE.MeshStandardMaterial({ color: 0x9aa0a4, roughness: 0.45, metalness: 0.4 }),
        preto: new THREE.MeshBasicMaterial({ color: 0x000000 }),
        punho: new THREE.MeshStandardMaterial({ color: 0xb01414, roughness: 0.5 }),
        trava: new THREE.MeshStandardMaterial({ color: 0xc9a416, roughness: 0.6 }),
        telaTerminal: new THREE.MeshBasicMaterial({ map: Texturas.telaTerminal() }),
      };
    }
    return comuns;
  }

  function construir(cena, lab, e) {
    const m = materiaisComuns();
    const { L } = lab;
    const lado = L * T;
    const grupo = new THREE.Group();
    const proprios = []; // materiais e texturas só deste andar (descartados no fim)
    const proprio = (x) => { proprios.push(x); return x; };
    const malha = (geometria, material, x = 0, y = 0, z = 0) => {
      const o = new THREE.Mesh(geometria, material);
      o.position.set(x, y, z);
      return o;
    };

    // ---------- Piso, teto e paredes ----------
    for (const [material, y, giro] of [[m.piso, 0, -Math.PI / 2], [m.teto, H, Math.PI / 2]]) {
      const g = new THREE.PlaneGeometry(lado, lado);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * L); // 1 repetição por tile
      const plano = malha(g, material, lado / 2, y, lado / 2);
      plano.rotation.x = giro;
      grupo.add(plano);
    }

    const blocos = [];
    for (let z = 0; z < L; z++) for (let x = 0; x < L; x++) if (lab.tiles[z * L + x] === PAREDE) blocos.push([x, z]);
    // Uma única InstancedMesh para todas as paredes: 1 draw call em vez de centenas.
    const paredes = new THREE.InstancedMesh(new THREE.BoxGeometry(T, H, T), m.parede, blocos.length);
    const matriz = new THREE.Matrix4();
    blocos.forEach(([x, z], k) => paredes.setMatrixAt(k, matriz.makeTranslation(centro(x), H / 2, centro(z))));
    paredes.frustumCulled = false; // a esfera de recorte só conhece a 1ª instância
    grupo.add(paredes);

    // ---------- Portas (fórmulas) ----------
    function criarPorta(tile, eixo) {
      const g = new THREE.Group();
      g.position.set(centro(tile.x), 0, centro(tile.z));
      if (eixo === "x") g.rotation.y = Math.PI / 2;
      const folha = malha(new THREE.BoxGeometry(T, ALTURA_PORTA, 0.3), m.metal, 0, ALTURA_PORTA / 2, 0);
      const matFaixa = proprio(new THREE.MeshBasicMaterial({ color: VERMELHO }));
      folha.add(malha(new THREE.BoxGeometry(T * 0.86, 0.1, 0.34), matFaixa, 0, 0.25, 0));
      const yVerga = (H + ALTURA_PORTA) / 2;
      g.add(folha, malha(new THREE.BoxGeometry(T, H - ALTURA_PORTA, 0.5), m.escuro, 0, yVerga, 0));

      const canvas = Texturas.tela(1024, 224);
      const textura = proprio(Texturas.comoTextura(canvas));
      // fog: false -> o neon atravessa a escuridão e serve de farol no labirinto
      const matPainel = proprio(new THREE.MeshBasicMaterial({ map: textura, fog: false }));
      for (const s of [1, -1]) {
        const painel = malha(new THREE.PlaneGeometry(2.7, 0.59), matPainel, 0, yVerga, s * 0.26);
        if (s < 0) painel.rotation.y = Math.PI;
        g.add(painel);
      }
      grupo.add(g);
      return { tile, eixo, folha, matFaixa, canvas, textura, abertura: 0, alvo: 0, situacao: null };
    }

    const portas = lab.portas.map((p) => criarPorta(p, p.eixo));
    const saida = criarPorta(lab.saida, lab.saida.eixo);
    // Apontar a mira para uma porta mostra a fórmula e a situação dela (não é interação).
    portas.forEach((p, i) => { p.folha.userData.interativo = { tipo: "porta", indice: i }; });
    saida.folha.userData.interativo = { tipo: "saida" };
    const fora = { x: lab.saida.x - lab.saida.dentro.x, z: lab.saida.z - lab.saida.dentro.z };
    const matFundo = proprio(new THREE.MeshBasicMaterial({ color: 0x06180c }));
    const fundo = malha(new THREE.BoxGeometry(T, H, 0.1), matFundo,
      centro(lab.saida.x) + fora.x * (T / 2 - 0.05), H / 2, centro(lab.saida.z) + fora.z * (T / 2 - 0.05));
    if (lab.saida.eixo === "x") fundo.rotation.y = Math.PI / 2;
    const luzSaida = new THREE.PointLight(VERDE, 0, 9, 1.5);
    luzSaida.position.set(centro(lab.saida.x), 1.8, centro(lab.saida.z));
    grupo.add(fundo, luzSaida);

    const portaNoTile = new Map();
    [...portas, saida].forEach((p) => portaNoTile.set(p.tile.z * L + p.tile.x, p));

    // ---------- Alavancas (variáveis) ----------
    // Coloca um grupo encostado na parede do suporte, com +z apontando para o corredor.
    function naParede(sup, y) {
      const g = new THREE.Group();
      g.position.set(centro(sup.x) + sup.dx * (T / 2 - 0.01), y, centro(sup.z) + sup.dz * (T / 2 - 0.01));
      g.rotation.y = Math.atan2(-sup.dx, -sup.dz);
      grupo.add(g);
      return g;
    }

    const ANGULO = { true: 0.75, false: Math.PI - 0.75 }; // cabo para cima = V, para baixo = F
    const nomes = Object.keys(e.fase.alavancas);
    const alavancas = lab.alavancas.map((sup, k) => {
      const nome = nomes[k], presa = e.fase.presas.includes(nome);
      const g = naParede(sup, 1.4);
      g.userData.interativo = { tipo: "alavanca", nome };
      g.add(malha(new THREE.BoxGeometry(0.5, 0.85, 0.08), m.escuro, 0, 0, 0.04));
      g.add(malha(new THREE.BoxGeometry(0.08, 0.6, 0.02), m.preto, 0, 0, 0.085));

      const matPlaca = proprio(new THREE.MeshLambertMaterial({
        map: proprio(Texturas.placaLetra(nome, presa)), emissive: 0x2a2a2a,
      }));
      g.add(malha(new THREE.PlaneGeometry(0.3, 0.3), matPlaca, 0, 0.64, 0.02));

      const pivo = new THREE.Group();
      pivo.position.z = 0.1;
      pivo.add(malha(new THREE.CylinderGeometry(0.028, 0.028, 0.42, 8), m.aco, 0, 0.21, 0));
      pivo.add(malha(new THREE.SphereGeometry(0.075, 12, 10), presa ? m.aco : m.punho, 0, 0.45, 0));
      g.add(pivo);

      const matLed = proprio(new THREE.MeshBasicMaterial({ color: VERMELHO, fog: false }));
      g.add(malha(new THREE.SphereGeometry(0.035, 8, 8), matLed, 0.17, 0.3, 0.09));

      if (presa) { // premissa: grade amarela travando o cabo
        for (const y of [0.3, -0.3]) g.add(malha(new THREE.BoxGeometry(0.6, 0.05, 0.05), m.trava, 0, y, 0.5));
        for (const x of [0.28, -0.28]) g.add(malha(new THREE.BoxGeometry(0.05, 0.65, 0.5), m.trava, x, 0, 0.27));
      }
      return { nome, presa, sup, grupo: g, pivo, matLed, angulo: ANGULO[e.valores[nome]] };
    });

    // ---------- Terminal "Impossível!" ----------
    const terminal = naParede(lab.terminal, 0);
    terminal.userData.interativo = { tipo: "terminal" };
    terminal.add(malha(new THREE.BoxGeometry(0.7, 1.1, 0.35), m.escuro, 0, 0.55, 0.18));
    terminal.add(malha(new THREE.BoxGeometry(0.95, 0.72, 0.4), m.escuro, 0, 1.46, 0.2));
    terminal.add(malha(new THREE.PlaneGeometry(0.76, 0.57), m.telaTerminal, 0, 1.46, 0.405));
    const luzTerminal = new THREE.PointLight(VERDE, 0.6, 5, 1.5);
    luzTerminal.position.set(0, 1.5, 0.9);
    terminal.add(luzTerminal);

    // ---------- Lâmpadas (as de índice ímpar estão com defeito e piscam muito) ----------
    const lampadas = lab.lampadas.map((c, k) => {
      const mat = proprio(new THREE.MeshBasicMaterial({ color: 0xffffff }));
      const luz = new THREE.PointLight(0xd6ecff, 1, 12, 1.4);
      luz.position.set(centro(c.x), H - 0.4, centro(c.z));
      grupo.add(luz, malha(new THREE.BoxGeometry(1.3, 0.05, 0.35), mat, centro(c.x), H - 0.03, centro(c.z)));
      return { luz, mat, defeituosa: k % 2 === 1, fase: k * 1.7 };
    });

    cena.add(grupo);

    // ---------- Integração com o motor lógico ----------
    function pintarPorta(p, situacao, painel) {
      p.situacao = situacao;
      p.matFaixa.color.set(Texturas.COR[situacao]);
      Texturas.desenharPainel(p.canvas, { situacao, ...painel });
      p.textura.needsUpdate = true;
    }

    // Relê o estado lógico. Devolve as portas que mudaram (para tocar o som delas).
    function sincronizar(est) {
      const mudaram = [];
      portas.forEach((p, i) => {
        const situacao = Estado.situacaoPorta(est, i); // <- Logica.avaliar(fórmula, valoração)
        if (situacao === p.situacao) return;
        pintarPorta(p, situacao, {
          titulo: `PORTA ${i + 1}`,
          rotulo: situacao.toUpperCase(),
          formula: Logica.paraTexto(est.portas[i].arvore),
        });
        p.alvo = situacao === "aberta" ? 1 : 0;
        mudaram.push(p);
      });

      const liberada = Estado.venceu(est);
      const situacao = liberada ? "liberada" : "bloqueada";
      if (situacao !== saida.situacao) {
        pintarPorta(saida, situacao, {
          titulo: "ELEVADOR",
          rotulo: situacao.toUpperCase(),
          formula: liberada ? "SAÍDA" : "abra todas as portas",
        });
        saida.alvo = liberada ? 1 : 0;
        matFundo.color.set(liberada ? 0x2cff7a : 0x06180c);
        luzSaida.intensity = liberada ? 1.3 : 0;
        mudaram.push(saida);
      }

      alavancas.forEach((a) => a.matLed.color.set(est.valores[a.nome] ? VERDE : VERMELHO));
      return mudaram;
    }

    sincronizar(e);
    [...portas, saida].forEach((p) => { p.abertura = p.alvo; }); // estado inicial sem animação

    // ---------- Colisão e grid ----------
    const tipo = (tx, tz) => (tx < 0 || tz < 0 || tx >= L || tz >= L ? PAREDE : lab.tiles[tz * L + tx]);
    const portaEm = (tx, tz) => portaNoTile.get(tz * L + tx);
    const aoLongo = (p, x, z) => (p.eixo === "x" ? x - centro(p.tile.x) : z - centro(p.tile.z));

    function solido(x, z) {
      const tx = Math.floor(x / T), tz = Math.floor(z / T), t = tipo(tx, tz);
      if (t === PAREDE) return true;
      if (t === CHAO) return false;
      const p = portaEm(tx, tz);
      return p.abertura < PASSA && Math.abs(aoLongo(p, x, z)) < ESPESSURA;
    }

    // Para o A*: chão, ou porta realmente aberta (a saída nunca: o monstro não foge).
    // Exige as duas coisas:
    //   - abertura física > 0.6: não passa por uma folha que ainda está subindo;
    //   - alvo lógico aberto: uma porta que começou a fechar bloqueia NA HORA. Só com a
    //     abertura física ele ainda entraria no vão nos ~0,17 s em que a folha desce.
    function passavel(tx, tz) {
      const t = tipo(tx, tz);
      if (t === CHAO) return true;
      if (t === PAREDE) return false;
      const p = portaEm(tx, tz);
      return p !== saida && p.alvo === 1 && p.abertura > 0.6;
    }

    // ---------- Animações de cada quadro ----------
    function atualizar(dt, t, jogador, apagao) {
      const tx = Math.floor(jogador.x / T), tz = Math.floor(jogador.z / T);
      for (const p of [...portas, saida]) {
        let alvo = p.alvo;
        // Sensor de segurança: a porta não desce em cima de quem está DENTRO do vão.
        // (Só perto não basta: senão dava para segurar aberta uma porta logicamente fechada.)
        if (!alvo && p.abertura > 0.6 && p.tile.x === tx && p.tile.z === tz &&
            Math.abs(aoLongo(p, jogador.x, jogador.z)) < DENTRO) alvo = 1;
        p.abertura += Math.max(-2.4 * dt, Math.min(2.4 * dt, alvo - p.abertura));
        p.folha.position.y = ALTURA_PORTA / 2 + p.abertura * (ALTURA_PORTA - 0.05);
      }
      for (const a of alavancas) {
        a.angulo += (ANGULO[e.valores[a.nome]] - a.angulo) * Math.min(1, 14 * dt);
        a.pivo.rotation.x = a.angulo;
      }
      for (const l of lampadas) {
        const pisca = l.defeituosa
          ? (Math.sin(t * 23 + l.fase) * Math.sin(t * 7.3 + l.fase * 2) > 0.2 ? 1 : 0.12)
          : (Math.sin(t * 1.7 + l.fase) > 0.985 ? 0.3 : 1);
        const brilho = apagao ? 0 : pisca;
        l.luz.intensity = brilho;
        l.mat.color.setScalar(0.04 + 0.96 * brilho);
      }
      luzTerminal.intensity = apagao ? 0.15 : 0.6;
    }

    function descartar() {
      cena.remove(grupo);
      grupo.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.isInstancedMesh) o.dispose(); // libera o buffer de matrizes na GPU
      });
      proprios.forEach((p) => p.dispose());
    }

    return {
      lab, portas, saida, alavancas, terminal,
      alvosDoRaio: [paredes, ...portas.map((p) => p.folha), saida.folha, ...alavancas.map((a) => a.grupo), terminal],
      sincronizar, atualizar, solido, passavel, portaEm, descartar,
    };
  }

  return { construir, centro, T, H };
})();
