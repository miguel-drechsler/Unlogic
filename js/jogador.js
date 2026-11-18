/*
 * jogador.js — Movimentação em primeira pessoa
 *
 * O PointerLockControls cuida só do olhar (mouse). O andar é feito aqui, porque
 * precisamos de colisão com o grid: o jogador é um quadrado de lado 2·RAIO e cada
 * eixo é testado separadamente — assim ele desliza ao longo das paredes em vez de travar.
 *
 * Fluidez:
 *   - a velocidade acelera e freia com suavização exponencial (independe do FPS);
 *   - o deslocamento de cada quadro é dividido em sub-passos de no máximo SUBPASSO,
 *     para encostar de verdade na parede mesmo com quadros longos;
 *   - o balanço da câmera acompanha a velocidade e volta ao centro quando ele para;
 *   - correr abre um pouco o campo de visão.
 */
const Jogador = (() => {
  const ALTURA_OLHOS = 1.65, RAIO = 0.35;
  const ANDAR = 4.0, CORRER = 6.4;       // m/s
  const ACELERA = 12, FREIA = 16;        // 1/s: quanto maior, mais "seco" o controle
  const SUBPASSO = 0.08;                 // m: maior deslocamento testado de uma vez
  const FOLEGO_GASTA = 1 / 4.5, FOLEGO_VOLTA = 1 / 7; // fração por segundo
  const FOV_CORRENDO = 6;                // graus a mais ao correr
  const PICO_MOUSE = 350;                // px num único evento: só pode ser bug do navegador

  function criar(camera, elemento) {
    const controles = new THREE.PointerLockControls(camera, elemento);
    const teclas = new Set();
    const pos = { x: 0, z: 0 };
    const vel = { x: 0, z: 0 };
    const frente = new THREE.Vector3();
    const FOV_BASE = camera.fov;
    let folego = 1, cansado = false, balanco = 0, amplitude = 0, desdeOPasso = 0;

    document.addEventListener("keydown", (ev) => teclas.add(ev.code));
    document.addEventListener("keyup", (ev) => teclas.delete(ev.code));
    window.addEventListener("blur", () => teclas.clear());
    const apertada = (...codigos) => codigos.some((c) => teclas.has(c));

    // Chrome no Windows às vezes entrega um movementX/Y absurdo (ao travar o mouse ou
    // ao trocar de monitor) e a câmera dá um salto. A captura em `window` roda antes
    // do listener do PointerLockControls (no document) e descarta esses eventos.
    window.addEventListener("mousemove", (ev) => {
      if (Math.abs(ev.movementX) > PICO_MOUSE || Math.abs(ev.movementY) > PICO_MOUSE) ev.stopImmediatePropagation();
    }, true);

    function posicionar(x, z, guinada) {
      pos.x = x; pos.z = z;
      vel.x = vel.z = 0;
      folego = 1; cansado = false; amplitude = 0;
      camera.rotation.set(0, guinada, 0, "YXZ");
      camera.position.set(x, ALTURA_OLHOS, z);
      if (camera.fov !== FOV_BASE) { camera.fov = FOV_BASE; camera.updateProjectionMatrix(); }
    }

    // solido(x, z) -> true se o ponto está dentro de parede ou porta fechada.
    function atualizar(dt, solido, aoPisar) {
      camera.getWorldDirection(frente);
      frente.y = 0;
      frente.normalize();
      const f = (apertada("KeyW", "ArrowUp") ? 1 : 0) - (apertada("KeyS", "ArrowDown") ? 1 : 0);
      const l = (apertada("KeyD", "ArrowRight") ? 1 : 0) - (apertada("KeyA", "ArrowLeft") ? 1 : 0);
      // direita = frente × cima = (-fz, 0, fx)
      const mx = frente.x * f - frente.z * l, mz = frente.z * f + frente.x * l;
      const tamanho = Math.hypot(mx, mz);
      const andando = tamanho > 0;

      const correndo = andando && apertada("ShiftLeft", "ShiftRight") && !cansado;
      folego = Math.max(0, Math.min(1, folego + (correndo ? -FOLEGO_GASTA : FOLEGO_VOLTA) * dt));
      if (folego === 0) cansado = true;         // esgotou: só volta a correr com 30% de fôlego
      else if (folego > 0.3) cansado = false;

      // Velocidade suavizada: 1 - e^(-k·dt) dá a mesma sensação a 30 ou a 144 FPS.
      const rapidez = andando ? (correndo ? CORRER : ANDAR) / tamanho : 0;
      const k = 1 - Math.exp(-(andando ? ACELERA : FREIA) * dt);
      vel.x += (mx * rapidez - vel.x) * k;
      vel.z += (mz * rapidez - vel.z) * k;
      if (!andando && Math.hypot(vel.x, vel.z) < 0.02) vel.x = vel.z = 0;

      const livre = (x, z) =>
        !solido(x - RAIO, z - RAIO) && !solido(x + RAIO, z - RAIO) &&
        !solido(x - RAIO, z + RAIO) && !solido(x + RAIO, z + RAIO);
      const dx = vel.x * dt, dz = vel.z * dt;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / SUBPASSO));
      const antes = { x: pos.x, z: pos.z };
      for (let i = 0; i < n; i++) {
        if (livre(pos.x + dx / n, pos.z)) pos.x += dx / n; else vel.x = 0; // bateu: perde só esse eixo
        if (livre(pos.x, pos.z + dz / n)) pos.z += dz / n; else vel.z = 0;
      }

      const andou = Math.hypot(pos.x - antes.x, pos.z - antes.z);
      balanco += andou * 2.6;
      desdeOPasso += andou;
      if (desdeOPasso > (correndo ? 2.6 : 2.1)) { desdeOPasso = 0; aoPisar(correndo); }

      // O balanço cresce com a velocidade real (não com a tecla) e some ao parar.
      const ritmo = dt > 0 ? Math.min(1.4, andou / dt / ANDAR) : 0;
      amplitude += (ritmo - amplitude) * (1 - Math.exp(-8 * dt));
      camera.position.set(pos.x, ALTURA_OLHOS + Math.sin(balanco) * 0.045 * amplitude, pos.z);

      const fov = FOV_BASE + (correndo && andou > 0 ? FOV_CORRENDO : 0);
      if (Math.abs(fov - camera.fov) > 0.01) {
        camera.fov += (fov - camera.fov) * (1 - Math.exp(-6 * dt));
        camera.updateProjectionMatrix();
      }
      return { correndo, folego };
    }

    return {
      controles, pos, posicionar, atualizar,
      get folego() { return folego; },
      set sensibilidade(s) { controles.pointerSpeed = s; },
    };
  }

  // ANDAR e CORRER saem daqui para monstro.js (limites da criatura) e para os testes.
  return { criar, ALTURA_OLHOS, ANDAR, CORRER };
})();

if (typeof module !== "undefined") module.exports = Jogador;
