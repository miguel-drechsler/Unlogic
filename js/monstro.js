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
 *   - no começo do andar ela fica `tregua` segundos parada;
 *   - a caçada dura no máximo `folego` segundos; depois a criatura cansa e recua;
 *   - ela também desiste se o jogador abrir distância por PACIENCIA segundos;
 *   - depois de desistir, fica `descanso` segundos sem caçar e vai patrulhar longe.
 *
 * Dificuldade por andar: Monstro.dificuldade(indice, total) interpola CURVA do primeiro
 * andar jogado (−4, "lenta") ao último (T, "implacável"). O andar do meio fica perto da
 * criatura antiga, de constantes fixas. Dois limites nunca mudam, porque mantêm o andar
 * vencível: caçando sem erros ela é mais lenta que o PASSO do jogador, e mesmo no teto
 * (com muitos erros) é mais lenta que a CORRIDA dele. O modo estudo continua desligando-a
 * (jogo3d.js nem chama atualizar).
 *
 * O caminho é recalculado a cada 0,3 s com Labirinto.caminho (A* no grid).
 * Portas fechadas são paredes para o monstro; abertas viram atalho para ele também.
 * Cada virada errada (Estado.viradasErradas) e cada acusação errada aumenta a velocidade.
 * Com o tablet aberto, caçando, ela também acelera (GANHO_TABLET): ler as fórmulas tem
 * risco, e é preciso achar um canto seguro antes. O teto continua abaixo da corrida.
 */
const Monstro = (() => {
  const J = typeof Jogador !== "undefined" ? Jogador : require("./jogador.js");
  const REPENSAR = 0.3;        // s entre recálculos do A*
  const DESISTE = 8;           // tiles de caminho para começar a desistir (> maior `fareja`)...
  const PACIENCIA = 2;         // ...depois de tantos segundos longe
  const VEL_FURIA = 9;
  const GANHO_PATRULHA = 0.2, GANHO_CACA = 0.4; // m/s a mais por erro do jogador
  // A luz do tablet atrai: caçando, ela ganha isto enquanto o tablet está aberto (sempre
  // limitada a `tetoCaca`, que fica abaixo da corrida). Sem isso, quem não erra nunca é
  // alcançado andando, e o momento de pensar, o coração do jogo, não tinha risco.
  const GANHO_TABLET = 1.5;
  const ALCANCE = 1.1;         // distância em que ele pega o jogador

  // [primeiro andar jogado, último andar]. Cada valor cresce (ou a trégua encolhe) de um ao outro.
  const CURVA = {
    tregua:      [8, 4],       // s parada no começo do andar
    velPatrulha: [1.6, 2.3],   // m/s
    velCaca:     [2.6, 3.5],   // m/s caçando, sem erros do jogador (passo dele: 4,0)
    tetoCaca:    [5.0, 6.0],   // m/s caçando, com erros (corrida dele: 6,4)
    fareja:      [4, 7],       // tiles de caminho para começar a caçar
    folego:      [9, 15],      // s: duração máxima de uma caçada
    descanso:    [13, 7],      // s sem caçar depois de desistir
    rondaPerto:  [0.2, 0.5],   // chance de a patrulha escolher um destino perto do jogador
  };
  const FOLGA_FUGA = 0.3;      // m/s que a criatura sempre fica abaixo do passo e da corrida
  const TREGUA_MIN = 2;        // s: a trégua inicial nunca some
  const DESCANSO_MIN = 4;      // s: nem o descanso depois de uma caçada
  const NIVEIS = [[0.3, "lenta"], [0.8, "atenta"], [Infinity, "implacável"]];

  // Parâmetros da criatura no andar `indice` (0 = primeira fase jogada) de `total`.
  function dificuldade(indice, total) {
    const t = total > 1 ? Math.max(0, Math.min(1, indice / (total - 1))) : 0;
    const p = {};
    for (const [nome, [primeiro, ultimo]] of Object.entries(CURVA)) p[nome] = primeiro + (ultimo - primeiro) * t;
    p.fareja = Math.min(DESISTE - 1, Math.round(p.fareja)); // começa a caçar antes do ponto de desistir
    // Os limites que mantêm o andar vencível valem mesmo que alguém edite a CURVA.
    p.velCaca = Math.min(p.velCaca, J.ANDAR - FOLGA_FUGA);
    p.tetoCaca = Math.max(p.velCaca, Math.min(p.tetoCaca, J.CORRER - FOLGA_FUGA));
    p.tregua = Math.max(TREGUA_MIN, p.tregua);
    p.descanso = Math.max(DESCANSO_MIN, p.descanso); // depois de cansar, sempre há respiro
    p.nivel = NIVEIS.find(([limite]) => t < limite)[1];
    return p;
  }

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
    let rotaComRecuo = false; // a rota atual já começa saindo de um vão de porta fechada
    let dif = dificuldade(0, 1); // parâmetros do andar atual (ver reposicionar)

    // Começo de um andar: `parametros` vem de Monstro.dificuldade(indice, total).
    function reposicionar(tile, parametros = dificuldade(0, 1)) {
      dif = parametros;
      g.position.set(centro(tile.x), 0, centro(tile.z));
      modo = "patrulha"; rota = []; destino = null; repensar = 0; perdido = 0; cacando = 0; descanso = 0; rotaComRecuo = false;
      dormindo = dif.tregua; // segundos de trégua no começo do andar
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
      if (Math.random() < dif.rondaPerto) {
        const perto = celulas.filter((t) => Math.abs(t.x - c.tileJogador.x) + Math.abs(t.z - c.tileJogador.z) <= 8);
        if (perto.length) return perto[Math.floor(Math.random() * perto.length)];
      }
      return celulas[Math.floor(Math.random() * celulas.length)];
    }

    function velocidade(c) {
      if (c.furia) return VEL_FURIA;
      if (modo === "caca") return Math.min(dif.tetoCaca, dif.velCaca + GANHO_CACA * c.erros + (c.tablet ? GANHO_TABLET : 0));
      return Math.min(4, dif.velPatrulha + GANHO_PATRULHA * c.erros);
    }

    // c = { lab, passavel(tx,tz), jogador:{x,z}, tileJogador:{x,z}, furia, erros, tablet, aoPisar(dist) }
    // Devolve true quando o monstro alcança o jogador.
    function atualizar(dt, c) {
      relogio += dt;
      animar(dt, c);
      if (dormindo > 0) { dormindo -= dt; return false; }

      const pos = g.position;
      const meu = { x: Math.floor(pos.x / T), z: Math.floor(pos.z / T) };
      const distJogador = Math.hypot(c.jogador.x - pos.x, c.jogador.z - pos.z);

      // A porta fechou com ela no vão: recalcula já (com recuo), não daqui a REPENSAR s.
      if (!c.passavel(meu.x, meu.z) && !rotaComRecuo) repensar = 0;
      repensar -= dt;
      if (repensar <= 0) {
        repensar = REPENSAR;
        // Uma porta fechou com ela no vão: o A* não testa o tile de partida e a deixaria
        // sair pelo outro lado. Ela recua para o vizinho livre mais perto de onde está.
        let origem = meu, recuo = null;
        if (!c.passavel(meu.x, meu.z)) {
          const perto = (t) => Math.hypot(centro(t.x) - pos.x, centro(t.z) - pos.z);
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const t = { x: meu.x + dx, z: meu.z + dz };
            if (c.passavel(t.x, t.z) && (!recuo || perto(t) < perto(recuo))) recuo = t;
          }
          if (recuo) origem = recuo;
        }
        rotaComRecuo = !!recuo;
        const comRecuo = (r) => (r && recuo ? [recuo, ...r] : r);
        const ateJogador = comRecuo(Labirinto.caminho(c.lab, origem, c.tileJogador, c.passavel));
        const tiles = ateJogador ? ateJogador.length : Infinity;

        descanso = Math.max(0, descanso - REPENSAR);
        if (c.furia || (modo !== "caca" && descanso === 0 && tiles <= dif.fareja)) {
          if (modo !== "caca") { c.aoAvistar(); cacando = 0; }
          modo = "caca"; perdido = 0;
        } else if (modo === "caca") {
          cacando += REPENSAR;
          perdido = tiles > DESISTE ? perdido + REPENSAR : 0;
          if (perdido > PACIENCIA || cacando > dif.folego) { // perdeu o rastro ou cansou: recua
            modo = "patrulha"; destino = null; descanso = dif.descanso;
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
          rota = comRecuo(Labirinto.caminho(c.lab, origem, destino, c.passavel));
          if (!rota) { rota = []; destino = null; } // uma porta fechou o caminho: escolhe outro
        }
      }

      // Para onde andar agora: centro do próximo tile da rota, ou direto no jogador
      // quando os dois estão no mesmo tile.
      let ax, az, proximo = false;
      // A rota tem até REPENSAR segundos de idade: se uma porta fechou no meio dela,
      // para e recalcula já no próximo quadro (senão ela atravessaria a porta fechada).
      if (rota.length && !c.passavel(rota[0].x, rota[0].z)) { rota = []; repensar = 0; }
      if (rota.length) {
        ax = centro(rota[0].x); az = centro(rota[0].z);
        // Fora do eixo do corredor? Volta ao centro do tile antes, para não cortar a quina.
        if (Math.abs(ax - pos.x) > 0.05 && Math.abs(az - pos.z) > 0.05) { ax = centro(meu.x); az = centro(meu.z); }
        else proximo = true;
      } else if (modo === "caca" && mesmoTile) { // sem rota (null) ele espera: nunca atravessa parede
        ax = c.jogador.x; az = c.jogador.z;
      } else {
        return distJogador < ALCANCE; // parada (sem rota), mas ainda pega quem encostar nela
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

  return { criar, dificuldade };
})();

if (typeof module !== "undefined") module.exports = Monstro;
