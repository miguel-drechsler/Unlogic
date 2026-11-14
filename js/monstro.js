/*
 * monstro.js — A criatura: modelo feito de primitivas + IA de perseguição
 *
 * IA (máquina de estados):
 *   patrulha    anda até células sorteadas (metade das vezes, perto do jogador)
 *   investigar  ouviu o "clack" de uma alavanca e vai até lá
 *   caca        o caminho até o jogador ficou curto: persegue com A*
 *   fúria       acabou a energia: corre direto para o jogador (ver `furia`)
 *
 * Regras de trégua (sem elas o andar não é vencível — conferido com um bot):
 *   - a caçada dura no máximo FOLEGO segundos; depois a criatura cansa e recua;
 *   - ela também desiste se o jogador abrir distância por PACIENCIA segundos;
 *   - depois de desistir, fica DESCANSO segundos sem caçar e vai patrulhar longe.
 *
 * O caminho é recalculado a cada 0,3 s com Labirinto.caminho (A* no grid).
 * Portas fechadas são paredes para o monstro; abertas viram atalho para ele também.
 * Cada virada errada (Estado.viradasErradas) e cada acusação errada aumenta a velocidade.
 */
const Monstro = (() => {
  const REPENSAR = 0.3;        // s entre recálculos do A*
  const FAREJA = 5;            // tiles de caminho para começar a caçar
  const DESISTE = 8;           // tiles de caminho para começar a desistir...
  const PACIENCIA = 2;         // ...depois de tantos segundos longe
  const FOLEGO = 12;           // s: duração máxima de uma caçada
  const DESCANSO = 10;         // s sem caçar depois de desistir
  const RONDA_PERTO = 0.35;    // chance de a patrulha escolher um destino perto do jogador
  const VEL_PATRULHA = 1.9, VEL_CACA = 3.0, VEL_FURIA = 9;
  const GANHO_PATRULHA = 0.2, GANHO_CACA = 0.4; // m/s a mais por erro do jogador
  const TETO_CACA = 6.0;       // abaixo da corrida do jogador (6,4): ainda dá para fugir
  const ALCANCE = 1.1;         // distância em que ele pega o jogador

  // Tudo feito de primitivas: manto torneado com franja rasgada, crânio alongado com
  // órbitas fundas e pupilas em brasa, dentes, braços com cotovelo e garras.
  function modelo() {
    const g = new THREE.Group();
    const pele = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
    const osso = new THREE.MeshStandardMaterial({ color: 0x8d877b, roughness: 0.85, emissive: 0x0b0a09 });
    const brasa = new THREE.MeshBasicMaterial({ color: 0xff2a12, fog: false });
    const breu = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const corpo = new THREE.Group();
    g.add(corpo);
    const p = (geo, mat, x, y, z, pai = corpo) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); pai.add(o); return o; };

    // Manto: um perfil girado em torno do eixo (barra larga, cintura fina, ombros).
    const perfil = [[0.03, 0], [0.5, 0.03], [0.44, 0.35], [0.3, 0.9], [0.24, 1.35], [0.31, 1.62], [0.37, 1.78], [0.2, 1.9], [0.07, 1.96]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    p(new THREE.LatheGeometry(perfil, 10), pele, 0, 0.12, 0);
    for (let k = 0; k < 9; k++) { // franja rasgada na barra
      const a = (k / 9) * Math.PI * 2;
      const tira = p(new THREE.ConeGeometry(0.075, 0.3 + (k % 3) * 0.1, 4), pele, Math.sin(a) * 0.43, 0.06, Math.cos(a) * 0.43);
      tira.rotation.x = Math.PI;
    }

    // Pescoço e cabeça projetados para a frente (postura curvada).
    const pescoco = p(new THREE.CylinderGeometry(0.06, 0.1, 0.34, 6), pele, 0, 2.02, 0.07);
    pescoco.rotation.x = 0.4;
    const cabeca = new THREE.Group();
    cabeca.position.set(0, 2.24, 0.15);
    corpo.add(cabeca);
    p(new THREE.SphereGeometry(0.25, 14, 10), osso, 0, 0, 0, cabeca).scale.set(0.82, 1, 0.92);
    p(new THREE.SphereGeometry(0.17, 12, 8), osso, 0, -0.2, 0.05, cabeca).scale.set(0.72, 1.15, 0.8); // maxilar comprido
    for (const x of [0.1, -0.1]) {
      p(new THREE.SphereGeometry(0.075, 10, 8), breu, x, 0.02, 0.2, cabeca).scale.set(1, 1.25, 0.5); // órbita
      p(new THREE.SphereGeometry(0.02, 6, 6), brasa, x, 0.02, 0.236, cabeca);                        // pupila
    }
    const boca = p(new THREE.SphereGeometry(0.09, 10, 8), breu, 0, -0.25, 0.165, cabeca);
    boca.scale.set(1, 1.7, 0.5);
    for (let k = -2; k <= 2; k++) {
      const dente = p(new THREE.ConeGeometry(0.013, 0.06, 4), osso, k * 0.026, -0.165, 0.2, cabeca);
      dente.rotation.x = Math.PI;
    }

    // Braços: ombro -> cotovelo dobrado -> mão com quatro garras.
    const bracos = [0.34, -0.34].map((x) => {
      const ombro = new THREE.Group();
      ombro.position.set(x, 1.84, 0.02);
      p(new THREE.SphereGeometry(0.12, 8, 6), pele, 0, 0, 0, ombro);
      p(new THREE.CylinderGeometry(0.05, 0.035, 0.75, 6), pele, 0, -0.375, 0, ombro);
      const cotovelo = new THREE.Group();
      cotovelo.position.y = -0.75;
      cotovelo.rotation.x = -0.55;
      ombro.add(cotovelo);
      p(new THREE.CylinderGeometry(0.035, 0.025, 0.72, 6), osso, 0, -0.36, 0, cotovelo);
      p(new THREE.SphereGeometry(0.06, 8, 6), osso, 0, -0.76, 0, cotovelo).scale.set(1, 1.2, 0.6);
      for (let k = 0; k < 4; k++) {
        const garra = p(new THREE.ConeGeometry(0.013, 0.26, 4), osso, (k - 1.5) * 0.032, -0.93, 0.01, cotovelo);
        garra.rotation.set(Math.PI, 0, (k - 1.5) * 0.12);
      }
      corpo.add(ombro);
      return ombro;
    });

    const luz = new THREE.PointLight(0xff2a14, 0.6, 5, 1.5);
    luz.position.set(0, 2.25, 0.7);
    corpo.add(luz);
    return { g, corpo, bracos, boca, luz, cabeca };
  }

  function criar(cena) {
    const { g, corpo, bracos, boca, luz, cabeca } = modelo();
    cena.add(g);
    const T = Mundo.T, centro = Mundo.centro;
    let modo, rota, destino, repensar, perdido, dormindo, cacando = 0, descanso = 0, mesmoTile = false, relogio = 0, andado = 0, guinada = 0;

    function reposicionar(tile, espera = 4) {
      g.position.set(centro(tile.x), 0, centro(tile.z));
      modo = "patrulha"; rota = []; destino = null; repensar = 0; perdido = 0; cacando = 0; descanso = 0;
      dormindo = espera; // segundos de trégua no começo do andar
      guinada = 0;
      g.rotation.y = 0;
      boca.scale.y = 1.7;
      cabeca.rotation.set(0.18, 0, 0); // cabeça baixa
    }

    function ouvir(tile) {
      if (modo === "caca") return;
      modo = "investigar";
      destino = { x: tile.x, z: tile.z };
      repensar = 0;
    }

    function sortearDestino(c) {
      const celulas = c.lab.celulasChao;
      const ate = (t) => Math.abs(t.x - c.tileJogador.x) + Math.abs(t.z - c.tileJogador.z);
      if (descanso > 0) { // recuando: o mais longe do jogador entre alguns sorteios
        let longe = celulas[Math.floor(Math.random() * celulas.length)];
        for (let k = 0; k < 4; k++) {
          const t = celulas[Math.floor(Math.random() * celulas.length)];
          if (ate(t) > ate(longe)) longe = t;
        }
        return longe;
      }
      if (Math.random() < RONDA_PERTO) {
        const perto = celulas.filter((t) => Math.abs(t.x - c.tileJogador.x) + Math.abs(t.z - c.tileJogador.z) <= 8);
        if (perto.length) return perto[Math.floor(Math.random() * perto.length)];
      }
      return celulas[Math.floor(Math.random() * celulas.length)];
    }

    function velocidade(c) {
      if (c.furia) return VEL_FURIA;
      if (modo === "caca") return Math.min(TETO_CACA, VEL_CACA + GANHO_CACA * c.erros);
      return Math.min(4, VEL_PATRULHA + GANHO_PATRULHA * c.erros);
    }

    // c = { lab, passavel(tx,tz), jogador:{x,z}, tileJogador:{x,z}, furia, erros, aoPisar(dist) }
    // Devolve true quando o monstro alcança o jogador.
    function atualizar(dt, c) {
      relogio += dt;
      animar(dt, c);
      if (dormindo > 0) { dormindo -= dt; return false; }

      const pos = g.position;
      const meu = { x: Math.floor(pos.x / T), z: Math.floor(pos.z / T) };
      const distJogador = Math.hypot(c.jogador.x - pos.x, c.jogador.z - pos.z);

      repensar -= dt;
      if (repensar <= 0) {
        repensar = REPENSAR;
        const ateJogador = Labirinto.caminho(c.lab, meu, c.tileJogador, c.passavel);
        const tiles = ateJogador ? ateJogador.length : Infinity;

        descanso = Math.max(0, descanso - REPENSAR);
        if (c.furia || (modo !== "caca" && descanso === 0 && tiles <= FAREJA)) {
          if (modo !== "caca") { c.aoAvistar(); cacando = 0; }
          modo = "caca"; perdido = 0;
        } else if (modo === "caca") {
          cacando += REPENSAR;
          perdido = tiles > DESISTE ? perdido + REPENSAR : 0;
          if (perdido > PACIENCIA || cacando > FOLEGO) { // perdeu o rastro ou cansou: recua
            modo = "patrulha"; destino = null; descanso = DESCANSO;
          }
        }

        mesmoTile = !!ateJogador && ateJogador.length === 0;
        if (modo === "caca") {
          rota = ateJogador || [];
        } else {
          if (!destino || (destino.x === meu.x && destino.z === meu.z)) {
            modo = "patrulha";
            destino = sortearDestino(c);
          }
          rota = Labirinto.caminho(c.lab, meu, destino, c.passavel);
          if (!rota) { rota = []; destino = null; } // uma porta fechou o caminho: escolhe outro
        }
      }

      // Para onde andar agora: centro do próximo tile da rota, ou direto no jogador
      // quando os dois estão no mesmo tile.
      let ax, az, proximo = false;
      if (rota.length) {
        ax = centro(rota[0].x); az = centro(rota[0].z);
        // Fora do eixo do corredor? Volta ao centro do tile antes, para não cortar a quina.
        if (Math.abs(ax - pos.x) > 0.05 && Math.abs(az - pos.z) > 0.05) { ax = centro(meu.x); az = centro(meu.z); }
        else proximo = true;
      } else if (modo === "caca" && mesmoTile) { // sem rota (null) ele espera: nunca atravessa parede
        ax = c.jogador.x; az = c.jogador.z;
      } else {
        return false;
      }

      const dx = ax - pos.x, dz = az - pos.z, falta = Math.hypot(dx, dz);
      const passo = Math.min(falta, velocidade(c) * dt);
      if (falta > 1e-4) {
        pos.x += (dx / falta) * passo;
        pos.z += (dz / falta) * passo;
        const alvo = Math.atan2(dx, dz); // gira o corpo suavemente para a direção do movimento
        guinada += Math.atan2(Math.sin(alvo - guinada), Math.cos(alvo - guinada)) * Math.min(1, 8 * dt);
        g.rotation.y = guinada;
        andado += passo;
        if (andado > 1.5) { andado = 0; c.aoPisar(distJogador); }
      }
      if (proximo && falta - passo < 0.05) rota.shift();

      return distJogador < ALCANCE;
    }

    function animar(dt, c) {
      const agito = modo === "caca" ? 2.2 : 1;
      corpo.position.y = 0.16 + Math.sin(relogio * 2.6 * agito) * 0.06; // flutua
      corpo.rotation.z = Math.sin(relogio * 1.3) * 0.05;
      bracos.forEach((b, i) => {
        const estender = modo === "caca" ? -1.25 : -0.15; // caçando, estica os braços
        b.rotation.x += (estender + Math.sin(relogio * 3 * agito + i * Math.PI) * 0.25 - b.rotation.x) * Math.min(1, 5 * dt);
        b.rotation.z = (i ? -1 : 1) * 0.12;
      });
      // a cabeça pende de um lado para o outro; caçando, treme
      cabeca.rotation.z = Math.sin(relogio * 1.9) * 0.1 + (modo === "caca" ? Math.sin(relogio * 27) * 0.04 : 0);
      luz.intensity = (c && c.furia ? 1.4 : 0.6) * (0.8 + Math.sin(relogio * 17) * 0.2);
    }

    // Jumpscare: aparece colado no rosto do jogador, de boca escancarada.
    function encarar(camera) {
      const frente = new THREE.Vector3();
      camera.getWorldDirection(frente);
      frente.y = 0;
      frente.normalize();
      g.position.set(camera.position.x + frente.x * 1.0, 0, camera.position.z + frente.z * 1.0);
      corpo.position.y = camera.position.y - 2.2; // olhos na altura dos olhos
      g.rotation.y = guinada = Math.atan2(-frente.x, -frente.z);
      boca.scale.y = 2.7;
      cabeca.rotation.set(-0.12, 0, 0.18); // ergue o rosto, torto
      bracos.forEach((b, i) => { b.rotation.x = -1.9; b.rotation.z = (i ? -1 : 1) * 0.5; });
      luz.intensity = 1.1;
    }

    return {
      grupo: g, reposicionar, ouvir, atualizar, encarar,
      get modo() { return modo; },
      get descansando() { return descanso > 0; },
    };
  }

  return { criar };
})();
