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
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  // Resolução dinâmica: começa no máximo e desce se o FPS cair (ver ajustarQualidade).
  const PIXEL_MAX = Math.min(window.devicePixelRatio, 1.5), PIXEL_MIN = 0.6;
  let pixel = PIXEL_MAX, mediaQuadro = 1 / 60, proximoAjuste = 3;
  renderer.setPixelRatio(pixel);
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
  // Recordes e preferências (progresso.js): sobrevivem ao recarregar a página.
  const progresso = Progresso.carregar(FASES.length);
  const melhores = progresso.melhores;
  let modoEstudo = progresso.modoEstudo; // sem criatura: para estudar/apresentar
  let mudo = progresso.mudo;
  let modoMapa = progresso.mapa;         // "local" (gira com você) | "completo" | "oculto"

  // O que aparece em "Opções" (no início e na pausa). menus.js edita este objeto
  // e avisa por aplicarOpcoes(nome).
  const opcoes = {
    sensibilidade: progresso.sensibilidade,
    volume: progresso.volume,
    som: !mudo,
    modoEstudo,
  };

  let modo = "menu";
  let e, lab, mundo;
  let guinadaInicial = 0;      // para onde a câmera olha ao nascer (o menu gira a câmera)
  let trocaPendente = null;    // andar escolhido no elevador, ainda não construído
  let alvo = null;             // o que a mira está apontando
  let tabletAberto = false, visao = { tipo: "geral" };
  let apagao = false, saidaLiberada = false;
  let relogio = 0, tempoSusto = 0;
  let visto, ultimoTile = -1; // névoa de exploração do minimapa
  // Alguns navegadores/ambientes (iframe, preview, políticas de segurança) bloqueiam
  // a Pointer Lock API. Nesse caso o jogo continua com "arrastar para olhar".
  let semTrava = false;
  let arrasto = null;
  let tentativaTrava = null;

  function salvarProgresso() {
    Progresso.salvar({ melhores, modoEstudo, mudo, sensibilidade: opcoes.sensibilidade, volume: opcoes.volume, mapa: modoMapa });
  }

  // Tecla M: local -> completo -> oculto -> local. Começa no local, o mais fácil de ler.
  const NOME_MAPA = {
    local: "Minimapa local: gira com você, a sua frente é sempre para cima.",
    completo: "Minimapa completo: o andar inteiro, com o norte para cima.",
    oculto: "Minimapa oculto.",
  };
  function mostrarMapa() { $("minimapa").hidden = modoMapa === "oculto"; }
  function alternarMapa() {
    const lista = Progresso.MAPAS;
    modoMapa = lista[(lista.indexOf(modoMapa) + 1) % lista.length];
    mostrarMapa();
    salvarProgresso();
    Hud.aviso(NOME_MAPA[modoMapa], "", "minimapa");
  }

  // Reflete as preferências nas Opções (início e pausa) e no HUD.
  function atualizarOpcoes() {
    opcoes.modoEstudo = modoEstudo;
    opcoes.som = !mudo;
    opcoes.telaCheia = emTelaCheia();
    Menus.sincronizarOpcoes();
    const som = $("somEstado");
    som.textContent = mudo ? "SOM MUDO" : "SOM LIGADO";
    som.classList.toggle("mudo", mudo);
    monstro.grupo.visible = !modoEstudo;
  }

  // Chamado por menus.js quando o jogador mexe numa opção (e uma vez na largada, sem nome).
  function aplicarOpcoes(nome) {
    // A caixa "Tela cheia" não é preferência salva: só pede (ou larga) a tela cheia agora.
    if (nome === "telaCheia") return alternarTelaCheia(opcoes.telaCheia);
    jogador.sensibilidade = opcoes.sensibilidade;
    Som.volume(opcoes.volume);
    mudo = !opcoes.som;
    Som.definirMudo(mudo);
    if (nome === "modoEstudo" && opcoes.modoEstudo !== modoEstudo) {
      modoEstudo = opcoes.modoEstudo;
      if (e) Hud.barra(e, modoEstudo);
      if (modoEstudo) {
        Som.monstro(0, 0, false);
        Hud.perigo(0);
        Hud.aviso("Modo estudo: a criatura foi desligada. O recorde não será alterado.", "bom");
      } else {
        Hud.aviso("A criatura está de volta ao andar.", "ruim");
      }
    }
    atualizarOpcoes();
    salvarProgresso();
  }

  // ---------- Tela cheia (issue #1: pausar sem sair dela) ----------
  // Problema: o Esc é a tecla de pausa, mas em tela cheia o navegador usa o mesmo Esc para
  // SAIR da tela cheia. Duas saídas, da melhor para a mais simples:
  //   1. Keyboard Lock API (Chrome, Edge, Opera): em tela cheia, a página "segura" o Esc.
  //      Um toque no Esc chega ao jogo e só pausa; para sair da tela cheia o navegador
  //      exige SEGURAR o Esc (ele mesmo mostra esse aviso) — ou apertar F.
  //   2. Nos outros (Firefox, Safari), o Esc continua saindo da tela cheia, então a tecla
  //      P pausa sem sair. Soltar o mouse por código (exitPointerLock) não tira a tela cheia.
  const podeTelaCheia = !!(document.documentElement.requestFullscreen && document.exitFullscreen);
  const emTelaCheia = () => !!document.fullscreenElement;
  let escSeguro = false; // o Esc está capturado pela Keyboard Lock API?

  function alternarTelaCheia(querer = !emTelaCheia()) {
    if (!podeTelaCheia) return Hud.aviso("Este navegador não permite tela cheia pela página. Use o F11.", "ruim");
    if (querer === emTelaCheia()) return atualizarOpcoes();
    const pedido = querer
      ? document.documentElement.requestFullscreen({ navigationUI: "hide" })
      : document.exitFullscreen();
    // Recusa (ex.: sem clique ou tecla do jogador): a caixa em Opções volta ao estado real.
    Promise.resolve(pedido).catch(() => atualizarOpcoes());
  }

  document.addEventListener("fullscreenchange", async () => {
    escSeguro = false;
    const teclado = navigator.keyboard;
    if (emTelaCheia()) {
      if (teclado && teclado.lock) {
        try { await teclado.lock(["Escape"]); escSeguro = true; } catch (_) { /* sem Keyboard Lock: vale o P */ }
      }
      Hud.aviso(escSeguro
        ? "Tela cheia. Esc ou P pausam sem sair dela. Para sair: F, ou segure o Esc."
        : "Tela cheia. Use P para pausar sem sair dela (aqui o Esc sai da tela cheia). F também sai.");
    } else if (teclado && teclado.unlock) {
      teclado.unlock();
    }
    atualizarOpcoes();
  });

  // manterDescobertas: ao recomeçar o MESMO andar (captura, R, "Reiniciar andar"), o que
  // o jogador já encontrou continua no tablet e no minimapa. O conhecimento é dele; só o
  // puzzle (alavancas, energia, selos, tabelas consultadas) volta ao início. Sem isso,
  // cada captura obrigava a reexplorar o labirinto inteiro: tédio, não medo.
  // O mapa é o mesmo (mesma semente), então a névoa do minimapa pode ser copiada.
  function iniciarFase(indice, manterDescobertas = false) {
    const antes = manterDescobertas && e && e.indice === indice
      ? { alavancas: e.alavancasVistas, portas: e.portasVistas, visto }
      : null;
    if (mundo) mundo.descartar();
    const fase = FASES[indice];
    e = Estado.criar(fase, indice);
    if (antes) {
      e.alavancasVistas = new Set(antes.alavancas);
      e.portasVistas = new Set(antes.portas);
    }
    lab = Labirinto.paraFase(fase, indice);
    mundo = Mundo.construir(cena, lab, e);

    // Começa olhando para o corredor, não para a parede.
    const [dx, dz] = [[1, 0], [0, 1], [-1, 0], [0, -1]]
      .find(([x, z]) => mundo.passavel(lab.inicio.x + x, lab.inicio.z + z));
    guinadaInicial = Math.atan2(-dx, -dz);
    jogador.posicionar(centro(lab.inicio.x), centro(lab.inicio.z), guinadaInicial);
    monstro.reposicionar(lab.monstro, Monstro.dificuldade(indice, FASES.length)); // cresce a cada andar

    visto = Minimapa.novaVisao(lab); // visão nova (a camada desenhada do minimapa é por visão)...
    if (antes) visto.set(antes.visto); // ...com os tiles que já tinham sido vistos
    ultimoTile = -1;
    apagao = false;
    saidaLiberada = false;
    alvo = null;
    tabletAberto = false;
    visao = { tipo: "geral" };
    monstro.grupo.visible = !modoEstudo;
    Hud.limparAvisos(); // avisos do andar anterior não valem mais
    Hud.barra(e, modoEstudo);
    Hud.tablet(e, false, visao);
    Hud.dica("");
    Hud.perigo(0);
    Menus.andares(indice, melhores);
  }

  // Botões do elevador (e setas ↑/↓). O painel responde na hora; o andar 3D só é
  // construído quando a escolha assenta, para segurar a seta não reconstruir 5 mundos.
  function escolherAndar(i) {
    Menus.andares(i, melhores);
    clearTimeout(trocaPendente && trocaPendente.relogio);
    trocaPendente = { indice: i, relogio: setTimeout(aplicarTroca, 220) };
  }

  function aplicarTroca() {
    if (!trocaPendente) return;
    clearTimeout(trocaPendente.relogio);
    const { indice } = trocaPendente;
    trocaPendente = null;
    if (indice !== e.indice) iniciarFase(indice);
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
    if (alvo.tipo === "terminal") {
      return Hud.dica(saidaLiberada
        ? "[E] Terminal — o elevador já está liberado"
        : "[E] Usar o terminal — Protocolo IMPOSSÍVEL");
    }
    // Portas e elevador só informam: a mira não "acende", porque não há o que apertar.
    if (alvo.tipo === "porta") {
      const i = alvo.indice;
      return Hud.dica(`Porta ${i + 1} · ${Logica.paraTexto(e.portas[i].arvore)} · ${Estado.situacaoPorta(e, i).toUpperCase()}`, false);
    }
    if (alvo.tipo === "saida") {
      return Hud.dica(saidaLiberada ? "Elevador LIBERADO — atravesse!" : "Elevador bloqueado: todas as portas abertas (ou seladas) ao mesmo tempo", false);
    }
    const n = alvo.nome, valor = `Alavanca ${n} = ${VF(e.valores[n])}`;
    // Dica de navegação: em quais portas já encontradas esta alavanca aparece.
    // Não revela valores nem a solução; só ajuda a orientar o raciocínio.
    const portas = Estado.portasComVariavel(e, n).filter((i) => e.portasVistas.has(i));
    const onde = portas.length ? ` · aparece nas portas ${portas.map((i) => i + 1).join(", ")}` : "";
    if (e.fase.presas.includes(n)) return Hud.dica(`${valor} — PRESA (premissa)${onde}`);
    if (saidaLiberada) return Hud.dica(`${valor} — travada: o elevador já está liberado`);
    if (apagao || e.energia <= 0) return Hud.dica(`${valor} — sem energia${onde}`);
    Hud.dica(`[E] Virar alavanca ${n}: ${VF(e.valores[n])} → ${VF(!e.valores[n])}  (−1 energia)${onde}`);
  }

  // ---------- Jogadas ----------
  function interagir() {
    if (!alvo || alvo.tipo === "porta" || alvo.tipo === "saida") return;
    if (alvo.tipo === "terminal") {
      tabletAberto = true;
      visao = { tipo: "terminal" };
      return Hud.tablet(e, true, visao);
    }
    const nome = alvo.nome;
    const r = Estado.virar(e, nome);
    if (!r.ok) {
      Som.negado();
      return Hud.aviso({
        presa: `A alavanca ${nome} está presa: é uma premissa.`,
        vitoria: "O elevador já está liberado: as alavancas travaram. Siga para a saída.",
      }[r.motivo] || "Sem energia: as alavancas travaram.", r.motivo === "vitoria" ? "bom" : "ruim");
    }
    Som.clack();
    const a = mundo.alavancas.find((x) => x.nome === nome);
    if (!modoEstudo && a) monstro.ouvir(a.sup); // o barulho atrai a criatura
    Hud.aviso(r.errada
      ? (modoEstudo
        ? `${nome} = ${VF(r.valor)}. Essa virada não aproxima o andar da solução.`
        : `${nome} = ${VF(r.valor)}. Virada em falso — algo no escuro ficou mais rápido.`)
      : `Alavanca ${nome} agora vale ${VF(r.valor)}.`, r.errada ? "ruim" : "");
    depoisDaJogada();
  }

  function acusar(i) {
    if (!e.portasVistas.has(i)) return Hud.aviso(`Porta ${i + 1} ainda não foi encontrada.`, "ruim");
    const r = Estado.acusar(e, i);
    if (!r.ok) {
      if (r.motivo === "vitoria") return Hud.aviso("O elevador já está liberado. Siga para a saída.", "bom");
      if (r.motivo === "sem-energia") return Hud.aviso("Sem energia para acusar outra porta.", "ruim");
      return Hud.aviso(`A porta ${i + 1} já está selada.`);
    }
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
    Hud.barra(e, modoEstudo);
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
      if (modoEstudo) {
        Hud.aviso("Sem energia para abrir as portas restantes. Aperte R para reiniciar o andar.", "ruim");
      } else {
        setTimeout(Som.rugido, 1200);
        Hud.aviso(e.energia === 0
          ? "SEM ENERGIA. As luzes se apagaram. Ele está vindo."
          : "A energia que resta não abre mais todas as portas. O sistema entrou em colapso. Ele está vindo.", "ruim");
      }
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
      const portas = Estado.portasComVariavel(e, a.nome).filter((i) => e.portasVistas.has(i));
      const onde = portas.length ? ` Aparece nas portas ${portas.map((i) => i + 1).join(", ")}.` : "";
      Hud.aviso(`Alavanca ${a.nome} catalogada: vale ${VF(e.valores[a.nome])}${a.presa ? " e está presa (premissa)" : ""}.${onde}`);
      novo = true;
    }
    mundo.portas.forEach((p, i) => {
      if (e.portasVistas.has(i) || !vizinho(p.tile)) return;
      e.portasVistas.add(i);
      Hud.aviso(`Porta ${i + 1} catalogada no tablet (TAB).`);
      novo = true;
    });
    if (novo) { Hud.barra(e, modoEstudo); Hud.tablet(e, tabletAberto, visao); }
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

    camera.getWorldDirection(frente); // a seta do minimapa e o "lado" do som usam isso

    let pegou = false;
    let proximidade = 0;
    if (!modoEstudo) {
      pegou = monstro.atualizar(dt, {
        lab,
        passavel: mundo.passavel,
        jogador: pos,
        tileJogador: tileAlvo(tx, tz),
        furia: apagao,
        erros: e.viradasErradas + e.erros,
        tablet: tabletAberto, // a luz do tablet atrai: caçando, ela acelera
        aoPisar: (d) => Som.passoMonstro(limitar(1 - d / 18)),
        aoAvistar: () => Som.rugido(),
      });

      // Presença do monstro: respiração (com lado esquerdo/direito), vinheta e lanterna falhando.
      const mx = monstro.grupo.position.x - pos.x, mz = monstro.grupo.position.z - pos.z;
      const dist = Math.hypot(mx, mz) || 1;
      proximidade = limitar(1 - dist / 16);
      const lado = (mx * -frente.z + mz * frente.x) / dist; // produto escalar com o vetor "direita"
      Som.monstro(proximidade, lado, monstro.modo === "caca");
      Hud.perigo(proximidade * proximidade * (0.75 + 0.25 * Math.sin(relogio * 9)));
    } else {
      // Modo estudo: sem criatura, sem respiração e sem vinheta.
      Som.monstro(0, 0, false);
      Hud.perigo(0);
    }

    if (modoMapa !== "oculto") {
      Minimapa.desenhar($("minimapa"), {
        lab, visto, mundo, e, jogador: pos, frente,
        monstro: modoEstudo ? null : monstro.grupo.position,
        tempo: relogio,
        modo: modoMapa,
      });
    }

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
    iniciarFase(e.indice, true);
    Hud.aviso(semEnergia
      ? "Sem energia, no escuro, ele te achou. Pense antes de virar cada alavanca."
      : "A criatura te pegou. O andar recomeçou, mas o que você encontrou continua no tablet.", "ruim");
    if (controles.isLocked || semTrava || DEMO) modo = "jogando";
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
    if (!modoEstudo) {
      melhores[e.indice] = Math.max(melhores[e.indice] || 0, pts);
      salvarProgresso(); // recorde persistente entre sessões
    }
    if (controles.isLocked) controles.unlock(); // devolve o mouse para clicar nos botões

    const valoracao = Object.keys(e.valores)
      .map((n) => `<b class="${e.valores[n] ? "v" : "f"}">${n}=${VF(e.valores[n])}</b>`).join(" ");
    const provas = e.portas.map((p, i) => e.seladas.has(i)
      ? `<li>Porta ${i + 1}: contradição — selada</li>`
      : `<li>Porta ${i + 1}: ${Logica.paraTexto(p.arvore, (n) => VF(e.valores[n]))} = <b class="v">V</b></li>`).join("");
    const { PONTOS_BASE, CUSTO_TABELA, CUSTO_ERRO } = Estado;
    const folga = Estado.folgaDaFase(e.fase);
    const ultima = e.indice === FASES.length - 1;
    const repetir = ["Jogar este andar de novo", () => { iniciarFase(e.indice); entrar(); }];
    const menu = ["Menu principal", voltarAoMenu];
    const notaEstudo = modoEstudo
      ? `<p class="nota">Modo estudo: esta pontuação não entra no recorde. Desligue o modo estudo em Opções para valer.</p>`
      : "";

    Hud.telaFim(true, {
      titulo: `Andar ${nomeDoAndar(e.indice)} vencido`,
      corpo: `
        <p>Valoração final: ${valoracao} · tempo ${Math.round(e.tempo)} s</p>
        ${notaEstudo}
        <ul class="provas">${provas}</ul>
        <table class="pontuacao">
          <tr><td>Base</td><td>${PONTOS_BASE}</td></tr>
          <tr><td>Folga de energia preservada (${Math.min(e.energia, folga)} de ${folga})</td><td>+${Estado.bonusEnergia(e)}</td></tr>
          <tr><td>Tabelas consultadas (${e.tabelasVistas.size} × ${CUSTO_TABELA})</td><td>−${CUSTO_TABELA * e.tabelasVistas.size}</td></tr>
          <tr><td>Acusações erradas (${e.erros} × ${CUSTO_ERRO})</td><td>−${CUSTO_ERRO * e.erros}</td></tr>
          <tr class="soma"><td>Pontos do andar</td><td>${pts}</td></tr>
        </table>`,
      botoes: ultima
        ? [["Sair do laboratório", mostrarFinal], repetir, menu] // o T é a saída
        : [[`Subir ao andar ${nomeDoAndar(e.indice + 1)}`, () => { iniciarFase(e.indice + 1); entrar(); }], repetir, menu],
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
      botoes: [
        // Recomeçar a subida NÃO apaga os recordes: eles são o histórico do jogador.
        [`Recomeçar do andar ${nomeDoAndar(0)}`, () => { iniciarFase(0); entrar(); }],
        ["Menu principal", voltarAoMenu],
      ],
    });
  }

  // ---------- Menu, pausa e trava do mouse ----------
  // Sem Pointer Lock, o olhar passa a ser por arrasto. O clique curto continua
  // interagindo; o clique com arrasto só gira a câmera. Assim o jogo funciona
  // também em iframes/previews que bloqueiam a trava do mouse.
  function usarMouseLivre() {
    clearTimeout(tentativaTrava);
    tentativaTrava = null;
    const primeiraVez = !semTrava;
    semTrava = true;
    arrasto = null;
    document.body.classList.add("sem-trava");
    document.body.classList.remove("arrastando");
    if (modo === "menu" || modo === "pausado" || modo === "vitoria") {
      modo = "jogando";
      Som.pausar(false);
      Menus.inicio(false);
      Menus.pausa(false);
    }
    if (primeiraVez) {
      Hud.aviso("Este navegador bloqueou a trava do mouse. Arraste com o botão esquerdo (ou direito) para olhar; clique sem arrastar ou aperte E para interagir.", "bom");
    }
  }

  function olharPorArrasto(dx, dy) {
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    euler.setFromQuaternion(camera.quaternion);
    // A mesma preferência que ajusta `pointerSpeed` no Pointer Lock precisa valer
    // no fallback de arrastar: sem isso o slider não faz nada nesse modo.
    const passo = 0.0025 * opcoes.sensibilidade;
    euler.y -= dx * passo;
    euler.x -= dy * passo;
    const limite = Math.PI / 2 - 0.02;
    euler.x = Math.max(-limite, Math.min(limite, euler.x));
    camera.quaternion.setFromEuler(euler);
  }

  document.addEventListener("pointerdown", (ev) => {
    if (!semTrava || modo !== "jogando" || (ev.button !== 0 && ev.button !== 2)) return;
    arrasto = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, distancia: 0, botao: ev.button };
    document.body.classList.add("arrastando");
    try { ev.target.setPointerCapture(ev.pointerId); } catch { /* sem captura: segue o arrasto normal */ }
    if (ev.button === 2) ev.preventDefault();
  });

  document.addEventListener("pointermove", (ev) => {
    if (!semTrava || !arrasto || ev.pointerId !== arrasto.id) return;
    const dx = ev.clientX - arrasto.x, dy = ev.clientY - arrasto.y;
    if (!dx && !dy) return;
    arrasto.x = ev.clientX;
    arrasto.y = ev.clientY;
    arrasto.distancia += Math.abs(dx) + Math.abs(dy);
    olharPorArrasto(dx, dy);
    ev.preventDefault();
  });

  document.addEventListener("pointerup", (ev) => {
    if (!arrasto || ev.pointerId !== arrasto.id) return;
    const { distancia, botao } = arrasto;
    arrasto = null;
    document.body.classList.remove("arrastando");
    // Clique curto (sem arrastar) interage, como no modo com trava do mouse.
    if (semTrava && modo === "jogando" && botao === 0 && distancia < 6) interagir();
  });

  document.addEventListener("pointercancel", () => {
    arrasto = null;
    document.body.classList.remove("arrastando");
  });

  document.addEventListener("contextmenu", (ev) => {
    if (semTrava) ev.preventDefault(); // botão direito serve para olhar
  });

  // menu --jogar--> (trava o mouse) --> jogando --P/Esc--> pausado --continuar--> jogando
  //                                        pausado --sair para o menu--> menu
  function entrar() {
    Som.iniciar();
    Hud.telaFim(false);
    if (DEMO) {
      modo = "jogando";
      Som.pausar(false);
      Menus.inicio(false);
      return Menus.pausa(false);
    }
    // Sempre tenta travar o mouse de novo (mesmo vindo do modo arrasto): se agora der
    // certo, o evento "lock" desliga o arrasto sozinho.
    if (!document.body.requestPointerLock) { usarMouseLivre(); return; }
    modo = "pausado";
    try {
      controles.lock(); // o evento "lock" é que coloca o jogo em "jogando"
      // Se o evento de erro não vier (ou o pedido ficar pendente), não deixamos
      // o jogador preso no menu: depois de 900 ms partimos para o arrasto.
      clearTimeout(tentativaTrava);
      tentativaTrava = setTimeout(() => {
        tentativaTrava = null;
        if (!controles.isLocked && modo === "pausado") usarMouseLivre();
      }, 900);
    } catch {
      usarMouseLivre();
    }
  }

  function jogar() {
    aplicarTroca(); // o andar escolhido no elevador ainda pode estar esperando para ser construído
    jogador.posicionar(centro(lab.inicio.x), centro(lab.inicio.z), guinadaInicial); // desfaz o giro do menu
    entrar();
  }

  function pausar(motivo) {
    modo = "pausado";
    Som.pausar(true); // senão a respiração da criatura continua no volume do último quadro
    Hud.dica("");
    Menus.pausa(true, { e, motivo });
  }

  // P em jogo. Com o mouse travado, soltar o mouse já dispara o "unlock", que pausa.
  function pedirPausa() {
    if (controles.isLocked) controles.unlock();
    else pausar();
  }

  function voltarAoMenu() {
    Hud.telaFim(false);
    Menus.pausa(false);
    Som.pausar(false);       // o zumbido do subsolo fica tocando no menu...
    Som.monstro(0, 0, false); // ...mas a respiração da criatura, não
    iniciarFase(e.indice);
    modo = "menu";
    tempoMenu = 0; // o giro do menu recomeça olhando para o corredor
    Menus.inicio(true);
  }

  Menus.configurar({
    jogar,
    escolherAndar,
    continuar: entrar,
    reiniciar: () => { iniciarFase(e.indice, true); entrar(); },
    sairParaMenu: voltarAoMenu,
    mudarOpcao: aplicarOpcoes,
  }, opcoes);

  // Navegadores novos devolvem uma Promise em requestPointerLock; sem o catch, cada recusa
  // vira "Uncaught (in promise)" no console. A recusa em si chega pelo "pointerlockerror".
  controles.lock = function () {
    const p = this.domElement.requestPointerLock();
    if (p && typeof p.catch === "function") p.catch(() => {});
  };

  controles.addEventListener("lock", () => {
    clearTimeout(tentativaTrava);
    tentativaTrava = null;
    // Se a trava funcionou, encerra o modo de arrasto (o cursor volta a sumir).
    if (semTrava) {
      semTrava = false;
      arrasto = null;
      document.body.classList.remove("sem-trava", "arrastando");
    }
    if (modo === "pausado" || modo === "menu") modo = "jogando";
    Som.pausar(false);
    Menus.inicio(false);
    Menus.pausa(false);
  });
  // Momento em que o mouse foi solto (Esc, P ou fim de andar). O Chrome recusa travar de
  // novo por ~1 s depois disso: um erro nessa janela é espera, não bloqueio do navegador,
  // então não vale cair no "arrastar para olhar" — basta pedir outro clique.
  let ultimaSoltura = -Infinity;
  controles.addEventListener("unlock", () => {
    ultimaSoltura = performance.now();
    if (!semTrava && modo === "jogando") pausar();
  });
  document.addEventListener("pointerlockerror", () => {
    if (DEMO) return;
    if (performance.now() - ultimaSoltura < 1500 && modo === "pausado") {
      clearTimeout(tentativaTrava);
      tentativaTrava = null;
      return pausar("O navegador ainda não liberou o mouse. Clique em Continuar de novo.");
    }
    usarMouseLivre();
  });

  // ---------- Teclado e mouse ----------
  const CONFIRMA_R = 2500;        // ms para o segundo toque no R
  let pedidoReinicio = -Infinity; // quando foi o primeiro toque

  function digito(n) {
    // 0 volta à visão geral de qualquer visão do tablet, inclusive do terminal
    // (onde 1–9 acusam portas): é o que os controles do README prometem.
    if (n === 0) visao = { tipo: "geral" };
    else if (visao.tipo === "terminal") { if (n >= 1 && n <= e.portas.length) acusar(n - 1); return; }
    else if (n > e.portas.length) return;
    else if (!e.portasVistas.has(n - 1)) return Hud.aviso(`Porta ${n} ainda não foi encontrada.`, "ruim");
    else {
      if (Estado.verTabela(e, n - 1)) Hud.aviso(`Tabela-verdade da porta ${n} consultada: −${Estado.CUSTO_TABELA} pontos.`);
      visao = { tipo: "tabela", porta: n - 1 };
    }
    Hud.tablet(e, tabletAberto, visao);
  }

  document.addEventListener("keydown", (ev) => {
    // F: tela cheia de qualquer tela (a tecla é um gesto do jogador, então o navegador aceita).
    if (ev.code === "KeyF" && !ev.repeat && modo !== "susto" && ev.target.type !== "range") {
      return void alternarTelaCheia();
    }
    if (modo === "menu" || modo === "pausado") return void Menus.tecla(ev, modo);
    if (modo !== "jogando") return; // nos menus, Tab navega pelos botões normalmente
    if (ev.code === "Tab") ev.preventDefault(); // em jogo, não deixa o foco sair do canvas
    // Esc que chega até aqui é nosso: sem Pointer Lock (arrasto) ou capturado em tela cheia
    // (Keyboard Lock). Nos dois casos o navegador não pausou nada: a pausa é por nossa conta.
    if (ev.code === "Escape" && (semTrava || escSeguro)) return void pedirPausa();
    if (ev.repeat) return;
    if (ev.code === "KeyP") {
      pedirPausa();
    } else if (ev.code === "Tab") {
      tabletAberto = !tabletAberto;
      visao = { tipo: "geral" };
      Hud.tablet(e, tabletAberto, visao);
    } else if (ev.code === "KeyH") {
      // Abre o tablet já na referência dos conectivos; H de novo volta.
      if (!tabletAberto) {
        tabletAberto = true;
        visao = { tipo: "ajuda" };
      } else {
        visao = visao.tipo === "ajuda" ? { tipo: "geral" } : { tipo: "ajuda" };
      }
      Hud.tablet(e, tabletAberto, visao);
    } else if (ev.code === "KeyR") {
      // Reinício rápido do andar: útil no modo estudo e depois de um apagão. O R fica
      // ao lado do E (interagir), então pede um segundo toque, como o botão da pausa.
      // Depois do apagão não há o que perder: reinicia direto.
      const agora = performance.now();
      if (!apagao && agora - pedidoReinicio > CONFIRMA_R) {
        pedidoReinicio = agora;
        return void Hud.aviso("Aperte R de novo para reiniciar o andar (as alavancas e a energia voltam ao início).", "ruim");
      }
      pedidoReinicio = -Infinity;
      iniciarFase(e.indice, true);
      Hud.aviso("Andar reiniciado. O que você já tinha encontrado continua no tablet.", "");
    } else if (ev.code === "KeyK") {
      mudo = Som.alternarMudo();
      atualizarOpcoes();
      salvarProgresso();
      Hud.aviso(mudo ? "Som desligado." : "Som ligado.", "", "som");
    } else if (ev.code === "KeyM") {
      alternarMapa();
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
    // Com arrasto para olhar, quem decide se foi clique ou arrasto é o pointerup.
    if (!semTrava && modo === "jogando" && ev.button === 0 && (controles.isLocked || DEMO)) interagir();
  });
  // A roda rola o tablet tanto com o mouse travado (sem cursor sobre ele) quanto no
  // modo de arrastar para olhar. Nesse modo o navegador já rola o tablet naturalmente
  // quando o cursor está sobre ele; só rolamos por código quando ele está fora.
  document.addEventListener("wheel", (ev) => {
    if (modo !== "jogando" || !tabletAberto) return;
    const corpo = $("tabletCorpo");
    if (corpo.contains(ev.target)) return;
    corpo.scrollTop += ev.deltaY;
  }, { passive: true });

  // ---------- Resolução dinâmica ----------
  // Média móvel do tempo de quadro. Abaixo de ~40 FPS reduz a resolução interna em degraus;
  // com folga, sobe de volta — mas devagar, para não ficar oscilando entre dois degraus.
  function ajustarQualidade(dtReal) {
    if (dtReal > 0.25) return; // aba em segundo plano: a medida não vale
    mediaQuadro += (dtReal - mediaQuadro) * 0.05;
    proximoAjuste -= dtReal;
    if (proximoAjuste > 0) return;
    let novo = pixel;
    if (mediaQuadro > 1 / 40 && pixel > PIXEL_MIN) novo = Math.max(PIXEL_MIN, pixel - 0.15);
    else if (mediaQuadro < 1 / 57 && pixel < PIXEL_MAX) novo = Math.min(PIXEL_MAX, pixel + 0.15);
    if (novo === pixel) return;
    proximoAjuste = novo < pixel ? 2 : 8;
    pixel = novo;
    renderer.setPixelRatio(pixel);
  }

  // ---------- Fundo vivo do menu ----------
  // Atrás da tela de início, a câmera olha devagar em volta do saguão do andar escolhido.
  let tempoMenu = 0;
  function atualizarMenu(dt) {
    tempoMenu += dt;
    relogio += dt;
    mundo.atualizar(dt, relogio, jogador.pos, false); // lâmpadas piscando, portas
    camera.rotation.y = guinadaInicial + Math.sin(tempoMenu * 0.08) * 0.9;
    camera.rotation.x = 0.03 + Math.sin(tempoMenu * 0.21) * 0.04;
    lanterna.intensity = Math.sin(relogio * 31) * Math.sin(relogio * 4.7) > 0.93 ? 0.45 : 1.2;
  }

  // ---------- Laço principal ----------
  let ultimo = performance.now();
  function quadro(agora) {
    requestAnimationFrame(quadro);
    const dtReal = (agora - ultimo) / 1000;
    const dt = Math.min(0.05, dtReal); // limita o salto se a aba ficou em 2º plano
    ultimo = agora;
    if (document.body.dataset.modo !== modo) document.body.dataset.modo = modo; // o CSS esconde o HUD no menu
    if (modo === "menu") atualizarMenu(dt);
    if ((modo === "jogando" || modo === "menu") && !(DEMO && window.depurar.passos > 1)) ajustarQualidade(dtReal);
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
    window.depurar = {
      jogador, monstro, camera, iniciarFase,
      get e() { return e; }, get lab() { return lab; }, get mundo() { return mundo; },
      get modo() { return modo; }, get modoEstudo() { return modoEstudo; },
      get melhores() { return melhores; }, get pixel() { return pixel; },
      get modoMapa() { return modoMapa; }, get escSeguro() { return escSeguro; },
      get tabletAberto() { return tabletAberto; },
    };
  }

  aplicarOpcoes(); // sensibilidade, volume e som salvos; sincroniza Opções e o HUD
  mostrarMapa();
  // O elevador abre no primeiro andar ainda não vencido: quem volta ao jogo continua de
  // onde parou. Jogador novo (ou quem já venceu todos) começa no mais fundo (−4).
  const primeiroPendente = melhores.findIndex((p) => p === null);
  iniciarFase(primeiroPendente >= 0 ? primeiroPendente : 0);
  Menus.inicio(true);
  requestAnimationFrame(quadro);
})();
