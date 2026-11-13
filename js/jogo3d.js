/*
 * jogo3d.js — Cena Three.js, laço principal e a cola entre todas as peças
 *
 *   logica.js  -> estado.js      regras (o "cérebro")
 *   fases.js   -> labirinto.js   mapa procedural + A*
 *   mundo.js                     labirinto em 3D, portas e alavancas ligadas ao motor lógico
 *   jogador.js / monstro.js      primeira pessoa e a criatura
 *   hud.js / som.js              tablet, avisos e áudio sintetizado
 *
 * Modos: menu -> jogando <-> pausado, jogando -> susto -> jogando, jogando -> vitoria.
 * Dica de depuração: abra index.html?demo para jogar sem travar o mouse.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const { T, centro } = Mundo;
  const VF = Hud.VF;
  const DEMO = location.search.includes("demo");
  const limitar = (v) => Math.max(0, Math.min(1, v));

  // ---------- Cena, câmera e iluminação ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  $("palco").appendChild(renderer.domElement);

  const cena = new THREE.Scene();
  cena.background = new THREE.Color(0x010202);
  cena.fog = new THREE.FogExp2(0x010202, 0.07); // a névoa esconde o fim dos corredores

  const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 80);
  cena.add(camera); // precisa estar na cena para a lanterna (filha da câmera) funcionar
  cena.add(new THREE.AmbientLight(0x4a565c, 0.22));

  const lanterna = new THREE.SpotLight(0xfff0d0, 1.5, 20, 0.5, 0.55, 1.1);
  lanterna.position.set(0.25, -0.25, 0);
  lanterna.target.position.set(0, 0, -1);
  camera.add(lanterna, lanterna.target);

  function ajustarTela() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", ajustarTela);
  ajustarTela();

  // ---------- Estado da partida ----------
  const jogador = Jogador.criar(camera, document.body);
  const controles = jogador.controles;
  const monstro = Monstro.criar(cena);
  const raio = new THREE.Raycaster();
  raio.far = 3; // só interage de perto
  const CENTRO_DA_TELA = new THREE.Vector2(0, 0);
  const frente = new THREE.Vector3();
  const melhores = Array(FASES.length).fill(null);

  let modo = "menu";
  let e, lab, mundo;
  let alvo = null;             // o que a mira está apontando
  let tabletAberto = false, visao = { tipo: "geral" };
  let apagao = false, saidaLiberada = false;
  let relogio = 0, tempoSusto = 0;
  let visto, ultimoTile = -1; // névoa de exploração do minimapa

  function iniciarFase(indice) {
    if (mundo) mundo.descartar();
    const fase = FASES[indice];
    e = Estado.criar(fase, indice);
    lab = Labirinto.paraFase(fase, indice);
    mundo = Mundo.construir(cena, lab, e);

    // Começa olhando para o corredor, não para a parede.
    const [dx, dz] = [[1, 0], [0, 1], [-1, 0], [0, -1]]
      .find(([x, z]) => mundo.passavel(lab.inicio.x + x, lab.inicio.z + z));
    jogador.posicionar(centro(lab.inicio.x), centro(lab.inicio.z), Math.atan2(-dx, -dz));
    monstro.reposicionar(lab.monstro, 6);

    visto = Minimapa.novaVisao(lab);
    ultimoTile = -1;
    apagao = false;
    saidaLiberada = false;
    alvo = null;
    tabletAberto = false;
    visao = { tipo: "geral" };
    Hud.barra(e);
    Hud.tablet(e, false, visao);
    Hud.dica("");
    Hud.perigo(0);
    Hud.seletor(indice, melhores, (i) => iniciarFase(i));
  }

  // ---------- Raycast: o que está na mira ----------
  function mirar() {
    raio.setFromCamera(CENTRO_DA_TELA, camera);
    const acerto = raio.intersectObjects(mundo.alvosDoRaio, true)[0]; // paredes e portas tapam a mira
    alvo = null;
    for (let o = acerto && acerto.object; o; o = o.parent) {
      if (o.userData.interativo) { alvo = o.userData.interativo; break; }
    }
    if (!alvo) return Hud.dica("");
    if (alvo.tipo === "terminal") return Hud.dica("[E] Usar o terminal — Protocolo IMPOSSÍVEL");
    const n = alvo.nome;
    if (e.fase.presas.includes(n)) return Hud.dica(`Alavanca ${n} = ${VF(e.valores[n])} — PRESA (premissa)`);
    Hud.dica(e.energia > 0
      ? `[E] Virar alavanca ${n}: ${VF(e.valores[n])} → ${VF(!e.valores[n])}  (−1 energia)`
      : `Alavanca ${n} = ${VF(e.valores[n])} — sem energia`);
  }

  // ---------- Jogadas ----------
  function interagir() {
    if (!alvo) return;
    if (alvo.tipo === "terminal") {
      tabletAberto = true;
      visao = { tipo: "terminal" };
      return Hud.tablet(e, true, visao);
    }
    const nome = alvo.nome;
    const r = Estado.virar(e, nome);
    if (!r.ok) {
      Som.negado();
      return Hud.aviso(r.motivo === "presa"
        ? `A alavanca ${nome} está presa: é uma premissa.`
        : "Sem energia: as alavancas travaram.", "ruim");
    }
    Som.clack();
    monstro.ouvir(mundo.alavancas.find((a) => a.nome === nome).sup); // o barulho atrai a criatura
    Hud.aviso(r.errada
      ? `${nome} = ${VF(r.valor)}. Virada em falso — algo no escuro ficou mais rápido.`
      : `Alavanca ${nome} agora vale ${VF(r.valor)}.`, r.errada ? "ruim" : "");
    depoisDaJogada();
  }

  function acusar(i) {
    if (!e.portasVistas.has(i)) return Hud.aviso(`Porta ${i + 1} ainda não foi encontrada.`, "ruim");
    const r = Estado.acusar(e, i);
    if (!r.ok) return;
    if (r.correto) {
      Som.acerto();
      Hud.aviso(`Correto! A porta ${i + 1} é uma contradição: falsa em todas as valorações. Selada.`, "bom");
    } else {
      Som.negado();
      const motivo = r.tipo === "tautologia"
        ? "é verdadeira em TODAS as linhas (tautologia)"
        : "é verdadeira em pelo menos uma linha da tabela-verdade";
      Hud.aviso(`Errado: a porta ${i + 1} ${motivo}. −1 de energia.`, "ruim");
    }
    depoisDaJogada();
  }

  // Depois de qualquer mudança lógica: portas reagem na hora e checamos vitória/apagão.
  function depoisDaJogada() {
    const mudaram = mundo.sincronizar(e);
    if (mudaram.length) {
      const perto = Math.min(...mudaram.map((p) => Math.hypot(centro(p.tile.x) - jogador.pos.x, centro(p.tile.z) - jogador.pos.z)));
      Som.porta(0.25 + 0.75 * limitar(1 - perto / 30));
    }
    Hud.barra(e);
    Hud.tablet(e, tabletAberto, visao);

    const situacao = Estado.situacao(e);
    if (situacao === "vitoria" && !saidaLiberada) {
      Som.alarme();
      Hud.aviso("ELEVADOR LIBERADO. Corra para a saída!", "bom");
    }
    saidaLiberada = situacao === "vitoria";
    if (situacao === "apagao" && !apagao) {
      apagao = true;
      Som.apagao();
      setTimeout(Som.rugido, 1200);
      Hud.aviso(e.energia === 0
        ? "SEM ENERGIA. As luzes se apagaram. Ele está vindo."
        : "A energia que resta não abre mais todas as portas. O sistema entrou em colapso. Ele está vindo.", "ruim");
    }
  }

  // O jogador só "sabe" o que já viu de perto: alimenta os chips e o tablet.
  // "De perto" = no tile ao lado, ou até 3 tiles em linha reta por um corredor livre.
  function descobrir(tx, tz) {
    const vizinho = (t) => {
      const dx = t.x - tx, dz = t.z - tz, d = Math.abs(dx) + Math.abs(dz);
      if (d <= 1) return true;
      if (d > 3 || (dx && dz)) return false;
      for (let k = 1; k < d; k++) {
        if (lab.tiles[(tz + Math.sign(dz) * k) * lab.L + tx + Math.sign(dx) * k] !== Labirinto.CHAO) return false;
      }
      return true;
    };
    let novo = false;
    for (const a of mundo.alavancas) {
      if (e.alavancasVistas.has(a.nome) || !vizinho(a.sup)) continue;
      e.alavancasVistas.add(a.nome);
      Hud.aviso(`Alavanca ${a.nome} catalogada: vale ${VF(e.valores[a.nome])}${a.presa ? " e está presa (premissa)" : ""}.`);
      novo = true;
    }
    mundo.portas.forEach((p, i) => {
      if (e.portasVistas.has(i) || !vizinho(p.tile)) return;
      e.portasVistas.add(i);
      Hud.aviso(`Porta ${i + 1} catalogada no tablet (TAB).`);
      novo = true;
    });
    if (novo) { Hud.barra(e); Hud.tablet(e, tabletAberto, visao); }
  }

  // Tile que o monstro deve perseguir. Se o jogador está encostado numa porta fechada,
  // o alvo é o tile do lado dele — senão o A* tentaria atravessar a porta.
  function tileAlvo(tx, tz) {
    const p = mundo.portaEm(tx, tz);
    if (!p || mundo.passavel(tx, tz)) return { x: tx, z: tz };
    return p.eixo === "x"
      ? { x: tx + (jogador.pos.x < centro(tx) ? -1 : 1), z: tz }
      : { x: tx, z: tz + (jogador.pos.z < centro(tz) ? -1 : 1) };
  }

  // ---------- Um quadro de jogo ----------
  function atualizar(dt) {
    relogio += dt;
    e.tempo += dt;
    const pos = jogador.pos;

    const mov = jogador.atualizar(dt, mundo.solido, (correndo) => Som.passo(correndo ? 1 : 0.6));
    Hud.folego(mov.folego);
    mundo.atualizar(dt, relogio, pos, apagao);

    const tx = Math.floor(pos.x / T), tz = Math.floor(pos.z / T);
    if (tz * lab.L + tx !== ultimoTile) { // mudou de tile: revela o que dá para ver daqui
      ultimoTile = tz * lab.L + tx;
      Minimapa.revelar(lab, visto, tx, tz);
    }
    descobrir(tx, tz);
    mirar();

    if (tabletAberto && visao.tipo === "terminal") { // afastou-se do terminal: desconecta
      const t = lab.terminal;
      if (Math.hypot(centro(t.x) - pos.x, centro(t.z) - pos.z) > 4.5) { visao = { tipo: "geral" }; tabletAberto = false; Hud.tablet(e, false, visao); }
    }

    // Vitória: atravessar a porta do elevador.
    const s = lab.saida;
    const alem = (pos.x - centro(s.x)) * (s.x - s.dentro.x) + (pos.z - centro(s.z)) * (s.z - s.dentro.z);
    if (tx === s.x && tz === s.z && alem > 0.3 && Estado.venceu(e)) return vencer();

    const pegou = monstro.atualizar(dt, {
      lab,
      passavel: mundo.passavel,
      jogador: pos,
      tileJogador: tileAlvo(tx, tz),
      furia: apagao,
      erros: e.viradasErradas + e.erros,
      aoPisar: (d) => Som.passoMonstro(limitar(1 - d / 18)),
      aoAvistar: () => Som.rugido(),
    });

    // Presença do monstro: respiração (com lado esquerdo/direito), vinheta e lanterna falhando.
    const mx = monstro.grupo.position.x - pos.x, mz = monstro.grupo.position.z - pos.z;
    const dist = Math.hypot(mx, mz) || 1;
    const proximidade = limitar(1 - dist / 16);
    camera.getWorldDirection(frente);
    const lado = (mx * -frente.z + mz * frente.x) / dist; // produto escalar com o vetor "direita"
    Som.monstro(proximidade, lado, monstro.modo === "caca");
    Hud.perigo(proximidade * proximidade * (0.75 + 0.25 * Math.sin(relogio * 9)));

    Minimapa.desenhar($("minimapa"), { lab, visto, mundo, e, jogador: pos, frente, monstro: monstro.grupo.position, tempo: relogio });

    const falha = Math.sin(relogio * 31) * Math.sin(relogio * 4.7) > 0.95 - 0.5 * proximidade;
    lanterna.intensity = apagao ? (falha ? 0.05 : 0.4) : (falha ? 0.45 : 1.5);

    if (pegou) capturado();
  }

  // ---------- Jumpscare ----------
  function capturado() {
    modo = "susto";
    tempoSusto = 0;
    Hud.tablet(e, false, visao);
    Hud.dica("");
    camera.rotation.x = 0;
    monstro.encarar(camera);
    lanterna.intensity = 1.0;
    Som.susto();
    Hud.susto(true);
  }

  function atualizarSusto(dt) {
    tempoSusto += dt;
    camera.rotation.z = (Math.random() - 0.5) * 0.09; // tremor
    if (tempoSusto < 1.5) return;
    camera.rotation.z = 0;
    Hud.susto(false);
    const semEnergia = apagao;
    iniciarFase(e.indice);
    Hud.aviso(semEnergia
      ? "Sem energia, no escuro, ele te achou. Pense antes de virar cada alavanca."
      : "A criatura te pegou. O andar foi reiniciado.", "ruim");
    if (controles.isLocked || DEMO) modo = "jogando";
    else pausar();
  }

  // ---------- Vitória ----------
  function vencer() {
    modo = "vitoria";
    Som.vitoria();
    Som.monstro(0, 0, false);
    Hud.perigo(0);
    Hud.tablet(e, false, visao);
    const pts = Estado.pontuacao(e);
    melhores[e.indice] = Math.max(melhores[e.indice] || 0, pts);
    if (controles.isLocked) controles.unlock(); // devolve o mouse para clicar nos botões

    const valoracao = Object.keys(e.valores)
      .map((n) => `<b class="${e.valores[n] ? "v" : "f"}">${n}=${VF(e.valores[n])}</b>`).join(" ");
    const provas = e.portas.map((p, i) => e.seladas.has(i)
      ? `<li>Porta ${i + 1}: contradição — selada</li>`
      : `<li>Porta ${i + 1}: ${Logica.paraTexto(p.arvore, (n) => VF(e.valores[n]))} = <b class="v">V</b></li>`).join("");
    const { PONTOS_BASE, BONUS_ENERGIA, CUSTO_TABELA, CUSTO_ERRO } = Estado;
    const ultima = e.indice === FASES.length - 1;
    const repetir = ["Jogar este andar de novo", () => { iniciarFase(e.indice); entrar(); }];

    Hud.telaFim(true, {
      titulo: `Andar −${e.indice + 1} vencido`,
      corpo: `
        <p>Valoração final: ${valoracao} · tempo ${Math.round(e.tempo)} s</p>
        <ul class="provas">${provas}</ul>
        <table class="pontuacao">
          <tr><td>Base</td><td>${PONTOS_BASE}</td></tr>
          <tr><td>Energia restante (${e.energia} × ${BONUS_ENERGIA})</td><td>+${BONUS_ENERGIA * e.energia}</td></tr>
          <tr><td>Tabelas consultadas (${e.tabelasVistas.size} × ${CUSTO_TABELA})</td><td>−${CUSTO_TABELA * e.tabelasVistas.size}</td></tr>
          <tr><td>Acusações erradas (${e.erros} × ${CUSTO_ERRO})</td><td>−${CUSTO_ERRO * e.erros}</td></tr>
          <tr class="soma"><td>Pontos do andar</td><td>${pts}</td></tr>
        </table>`,
      botoes: ultima
        ? [["Ver resultado final", mostrarFinal], repetir]
        : [["Descer ao próximo andar →", () => { iniciarFase(e.indice + 1); entrar(); }], repetir],
    });
  }

  function mostrarFinal() {
    const total = melhores.reduce((s, p) => s + (p || 0), 0);
    const maximo = FASES.reduce((s, f) => s + Estado.pontuacaoMaxima(f), 0);
    Hud.telaFim(true, {
      titulo: "Você escapou do laboratório",
      corpo: `
        <p>Andares vencidos: <b>${melhores.filter((p) => p !== null).length} de ${FASES.length}</b></p>
        <p>Pontuação total: <b class="v">${total}</b> de ${maximo} possíveis.</p>
        <p>Pontuação máxima = resolver cada andar com o mínimo de viradas, sem tabelas e sem
        acusações erradas: só raciocínio lógico.</p>`,
      botoes: [["Recomeçar do andar −1", () => { melhores.fill(null); iniciarFase(0); entrar(); }]],
    });
  }

  // ---------- Menu, pausa e trava do mouse ----------
  function entrar() {
    Som.iniciar();
    Hud.telaFim(false);
    if (DEMO) { modo = "jogando"; return Hud.telaInicio(false); }
    modo = "pausado";
    controles.lock(); // o evento "lock" é que coloca o jogo em "jogando"
  }

  function pausar() {
    modo = "pausado";
    Hud.telaInicio(true, { titulo: "PAUSADO", subtitulo: `Andar −${e.indice + 1} · ${e.fase.titulo}`, botao: "Voltar" });
  }

  controles.addEventListener("lock", () => {
    if (modo === "pausado" || modo === "menu") modo = "jogando";
    Hud.telaInicio(false);
  });
  controles.addEventListener("unlock", () => { if (modo === "jogando") pausar(); });
  document.addEventListener("pointerlockerror", () => { if (modo === "pausado") pausar(); });
  $("btnEntrar").onclick = entrar;

  // ---------- Teclado e mouse ----------
  function digito(n) {
    if (visao.tipo === "terminal") { if (n >= 1 && n <= e.portas.length) acusar(n - 1); return; }
    if (n === 0) visao = { tipo: "geral" };
    else if (n > e.portas.length) return;
    else if (!e.portasVistas.has(n - 1)) return Hud.aviso(`Porta ${n} ainda não foi encontrada.`, "ruim");
    else {
      if (Estado.verTabela(e, n - 1)) Hud.aviso(`Tabela-verdade da porta ${n} consultada: −${Estado.CUSTO_TABELA} pontos.`);
      visao = { tipo: "tabela", porta: n - 1 };
    }
    Hud.tablet(e, tabletAberto, visao);
  }

  document.addEventListener("keydown", (ev) => {
    if (ev.code === "Tab") ev.preventDefault(); // não deixa o foco sair do jogo
    if (modo !== "jogando" || ev.repeat) return;
    if (ev.code === "Tab") {
      tabletAberto = !tabletAberto;
      visao = { tipo: "geral" };
      Hud.tablet(e, tabletAberto, visao);
    } else if (ev.code === "KeyM") {
      $("minimapa").hidden = !$("minimapa").hidden;
    } else if (ev.code === "KeyE") {
      interagir();
    } else if (tabletAberto) {
      const d = /^(?:Digit|Numpad)(\d)$/.exec(ev.code);
      if (d) digito(Number(d[1]));
      // com o mouse travado não há barra de rolagem: o tablet rola pelo teclado
      else if (ev.code === "PageDown") $("tabletCorpo").scrollTop += 220;
      else if (ev.code === "PageUp") $("tabletCorpo").scrollTop -= 220;
    }
  });
  document.addEventListener("mousedown", (ev) => {
    if (modo === "jogando" && ev.button === 0 && (controles.isLocked || DEMO)) interagir();
  });

  // ---------- Laço principal ----------
  let ultimo = performance.now();
  function quadro(agora) {
    requestAnimationFrame(quadro);
    const dt = Math.min(0.05, (agora - ultimo) / 1000); // limita o salto se a aba ficou em 2º plano
    ultimo = agora;
    // Em ?demo, depurar.passos = N simula N passos fixos por quadro (testes automáticos rápidos).
    const passos = (DEMO && window.depurar.passos) || 1;
    for (let k = 0; k < passos; k++) {
      const passo = passos > 1 ? 1 / 30 : dt;
      if (modo === "jogando") atualizar(passo);
      else if (modo === "susto") atualizarSusto(passo);
      if (DEMO && window.depurar.aoPasso) window.depurar.aoPasso();
    }
    renderer.render(cena, camera);
  }

  if (DEMO) { // acesso pelo console para depurar: depurar.e, depurar.lab, depurar.jogador...
    window.depurar = { jogador, monstro, camera, iniciarFase, get e() { return e; }, get lab() { return lab; }, get mundo() { return mundo; }, get modo() { return modo; } };
  }

  iniciarFase(0);
  Hud.telaInicio(true, {
    titulo: "UNLOGIC",
    subtitulo: "Subsolo do laboratório — escape pela lógica",
    botao: "Entrar",
  });
  requestAnimationFrame(quadro);
})();
