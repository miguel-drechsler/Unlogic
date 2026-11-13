/*
 * jogador.js — Movimentação em primeira pessoa
 *
 * O PointerLockControls cuida só do olhar (mouse). O andar é feito aqui, porque
 * precisamos de colisão com o grid: o jogador é um quadrado de lado 2·RAIO e cada
 * eixo é testado separadamente — assim ele desliza ao longo das paredes em vez de travar.
 */
const Jogador = (() => {
  const ALTURA_OLHOS = 1.65, RAIO = 0.35;
  const ANDAR = 4.0, CORRER = 6.4;       // m/s
  const FOLEGO_GASTA = 1 / 4.5, FOLEGO_VOLTA = 1 / 7; // fração por segundo

  function criar(camera, elemento) {
    const controles = new THREE.PointerLockControls(camera, elemento);
    const teclas = new Set();
    const pos = { x: 0, z: 0 };
    const frente = new THREE.Vector3();
    let folego = 1, cansado = false, balanco = 0, desdeOPasso = 0;

    document.addEventListener("keydown", (ev) => teclas.add(ev.code));
    document.addEventListener("keyup", (ev) => teclas.delete(ev.code));
    window.addEventListener("blur", () => teclas.clear());
    const apertada = (...codigos) => codigos.some((c) => teclas.has(c));

    function posicionar(x, z, guinada) {
      pos.x = x; pos.z = z;
      folego = 1; cansado = false;
      camera.rotation.set(0, guinada, 0, "YXZ");
      camera.position.set(x, ALTURA_OLHOS, z);
    }

    // solido(x, z) -> true se o ponto está dentro de parede ou porta fechada.
    function atualizar(dt, solido, aoPisar) {
      camera.getWorldDirection(frente);
      frente.y = 0;
      frente.normalize();
      const f = (apertada("KeyW", "ArrowUp") ? 1 : 0) - (apertada("KeyS", "ArrowDown") ? 1 : 0);
      const l = (apertada("KeyD", "ArrowRight") ? 1 : 0) - (apertada("KeyA", "ArrowLeft") ? 1 : 0);
      // direita = frente × cima = (-fz, 0, fx)
      let mx = frente.x * f - frente.z * l, mz = frente.z * f + frente.x * l;
      const tamanho = Math.hypot(mx, mz);
      const andando = tamanho > 0;

      const correndo = andando && apertada("ShiftLeft", "ShiftRight") && !cansado;
      folego = Math.max(0, Math.min(1, folego + (correndo ? -FOLEGO_GASTA : FOLEGO_VOLTA) * dt));
      if (folego === 0) cansado = true;         // esgotou: só volta a correr com 30% de fôlego
      else if (folego > 0.3) cansado = false;

      if (andando) {
        const passo = (correndo ? CORRER : ANDAR) * dt / tamanho;
        const livre = (x, z) =>
          !solido(x - RAIO, z - RAIO) && !solido(x + RAIO, z - RAIO) &&
          !solido(x - RAIO, z + RAIO) && !solido(x + RAIO, z + RAIO);
        const antes = { x: pos.x, z: pos.z };
        if (livre(pos.x + mx * passo, pos.z)) pos.x += mx * passo;
        if (livre(pos.x, pos.z + mz * passo)) pos.z += mz * passo;

        const andou = Math.hypot(pos.x - antes.x, pos.z - antes.z);
        balanco += andou * 2.6;
        desdeOPasso += andou;
        if (desdeOPasso > (correndo ? 2.6 : 2.1)) { desdeOPasso = 0; aoPisar(correndo); }
      }
      camera.position.set(pos.x, ALTURA_OLHOS + Math.sin(balanco) * 0.045, pos.z);
      return { correndo, folego };
    }

    return { controles, pos, posicionar, atualizar, get folego() { return folego; } };
  }

  return { criar, ALTURA_OLHOS };
})();
