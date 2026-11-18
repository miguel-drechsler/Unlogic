/*
 * jogar_andares.js — um bot joga cada andar no index.html?demo, com a criatura ligada.
 * Uso:  node testes/jogar_andares.js [rodadas por andar]     (padrão: 3)
 *
 * Precisa do Node 22+ e do Chrome ou do Edge instalados (nenhum pacote npm). O caminho
 * do navegador pode ser forçado com a variável CHROME. Os outros testes não dependem dele.
 *
 * Confere que os andares continuam vencíveis com a dificuldade da criatura de cada um.
 * O bot joga como alguém que já conhece o mapa e a solução, mas não sabe prever a criatura:
 *   - vai até cada alavanca da solução mais curta e a vira com E (nunca erra a virada);
 *   - sela as contradições no terminal e atravessa o elevador;
 *   - se a criatura está caçando e chega perto (ou, em qualquer modo, quase encosta),
 *     foge para o vizinho mais longe dela (andando; só corre, com Shift, a 2 tiles ou menos).
 * Ele anda pelas mesmas teclas e colisão do jogador. O único atalho é de conhecimento:
 * as portas contraditórias contam como já vistas, para poder acusá-las no terminal.
 * Ser pego não reprova o andar (o jogador também recomeça); reprova não vencer no limite.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");
const FASES = require(path.join(__dirname, "..", "js", "fases.js"));

const RODADAS = Number(process.argv[2]) || 3;
const LIMITE = 900;   // s de jogo simulado por rodada
const PASSOS = 20;    // passos de 1/30 s por quadro (depurar.passos)
const PORTA = 9334;

// ---------- O bot (roda dentro da página) ----------
function botAndar(indice, { passos, limite }) {
  return new Promise((resolver) => {
    const d = window.depurar;
    const { T, centro } = Mundo;
    const segurando = new Set();
    const tecla = (tipo, code) => document.dispatchEvent(new KeyboardEvent(tipo, { code, bubbles: true }));
    const apertar = (code) => { tecla("keydown", code); tecla("keyup", code); };
    function teclas(quero) { // mantém pressionadas só as teclas de `quero`
      for (const c of [...segurando]) if (!quero.includes(c)) { tecla("keyup", c); segurando.delete(c); }
      for (const c of quero) if (!segurando.has(c)) { tecla("keydown", c); segurando.add(c); }
    }

    document.querySelector(`[data-andar="${indice}"]`).click();
    document.querySelector('[data-acao="jogar"]').click();
    if (d.modoEstudo) return resolver({ erro: "modo estudo ligado" });
    d.passos = passos;

    let e = null, tarefas = [], mira = 0, tempo = 0, capturas = 0, cacadas = 0, cacando = false;
    let maisPerto = Infinity, fugindo = 0;

    function planejar() {
      e = d.e;
      const nomes = Object.keys(e.valores);
      const dist = (s) => nomes.filter((n) => s[n] !== e.valores[n]).length;
      const alvo = e.solucoes.slice().sort((a, b) => dist(a) - dist(b))[0];
      tarefas = nomes.filter((n) => alvo[n] !== e.valores[n]).map((nome) => ({ tipo: "alavanca", nome, valor: alvo[nome] }));
      const contradicoes = e.portas.map((p, k) => (p.tipo === "contradicao" ? k : -1)).filter((k) => k >= 0);
      if (contradicoes.length) tarefas.push({ tipo: "terminal", portas: contradicoes });
      tarefas.push({ tipo: "saida" });
      mira = 0;
    }

    function fim(venceu) {
      teclas([]);
      d.aoPasso = null;
      d.passos = 1;
      resolver({ venceu, tempo: Math.round(tempo), capturas, cacadas, maisPerto: +maisPerto.toFixed(2), erradas: e ? e.viradasErradas : 0 });
    }

    function irPara(px, pz, correr) {
      const pos = d.jogador.pos, dx = px - pos.x, dz = pz - pos.z;
      if (Math.hypot(dx, dz) < 0.12) { teclas([]); return true; }
      d.camera.rotation.set(0, Math.atan2(-dx, -dz), 0, "YXZ");
      teclas(correr && d.jogador.folego > 0.2 ? ["KeyW", "ShiftLeft"] : ["KeyW"]);
      return false;
    }

    // Um passo rumo ao tile vizinho `prox`. Fora do eixo do corredor, volta ao centro antes.
    function passoRumo(meu, prox, correr) {
      const pos = d.jogador.pos, cx = centro(meu.x), cz = centro(meu.z);
      const fora = prox.x !== meu.x ? Math.abs(pos.z - cz) > 0.4 : Math.abs(pos.x - cx) > 0.4;
      return fora ? irPara(cx, cz, correr) : irPara(centro(prox.x), centro(prox.z), correr);
    }

    // Parado no tile, olhando para a parede do suporte (alavanca ou terminal).
    function mirarParede(sup) {
      teclas([]);
      const inclinacao = [-0.12, 0, -0.25][Math.floor(mira / 8) % 3];
      d.camera.rotation.set(inclinacao, Math.atan2(-sup.dx, -sup.dz), 0, "YXZ");
      mira++;
      return mira % 8 === 3; // espera o raycast da mira (mirar()) pegar o objeto
    }

    d.aoPasso = () => {
      if (d.modo === "vitoria") return fim(true);
      if (d.modo !== "jogando") return teclas([]); // susto: a fase vai recomeçar
      if (d.e !== e) { if (e) capturas++; planejar(); }
      tempo += 1 / 30;
      if (tempo > limite) return fim(false);

      const lab = d.lab, passa = d.mundo.passavel, pos = d.jogador.pos;
      const meu = { x: Math.floor(pos.x / T), z: Math.floor(pos.z / T) };
      const mp = d.monstro.grupo.position;
      maisPerto = Math.min(maisPerto, Math.hypot(mp.x - pos.x, mp.z - pos.z));
      const dm = Labirinto.distancias(lab, { x: Math.floor(mp.x / T), z: Math.floor(mp.z / T) }, passa);
      const em = (t) => dm[t.z * lab.L + t.x];
      const caca = d.monstro.modo === "caca";
      if (caca && !cacando) cacadas++;
      cacando = caca;

      // Próximo passo do plano (se houver), para saber se ele leva para perto da criatura.
      let tarefa = tarefas[0];
      const pendentes = tarefas.filter((t) => t.tipo === "alavanca");
      if (pendentes.length) { // a alavanca pendente mais perto primeiro
        const daqui = Labirinto.distancias(lab, meu, passa);
        const sup = (t) => d.mundo.alavancas.find((a) => a.nome === t.nome).sup;
        tarefa = pendentes.reduce((m, t) => (daqui[sup(t).z * lab.L + sup(t).x] < daqui[sup(m).z * lab.L + sup(m).x] ? t : m));
      }
      let destino;
      if (tarefa.tipo === "alavanca") destino = d.mundo.alavancas.find((a) => a.nome === tarefa.nome).sup;
      else if (tarefa.tipo === "terminal") destino = lab.terminal;
      else destino = lab.saida.dentro;
      const rota = Labirinto.caminho(lab, meu, destino, passa);

      // Fuga: caçando e perto (ou o plano anda na direção dela). Fora da caça ela também
      // pega quem encosta (ex.: vem investigar a alavanca em que o bot ainda está), então
      // colada ele se afasta em qualquer modo, como faria uma pessoa que a vê chegando.
      const ate = em(meu);
      const aproxima = rota && rota.length && em(rota[0]) >= 0 && em(rota[0]) < ate;
      const perigo = caca ? ate <= 4 || (ate <= 7 && aproxima) : ate <= 2 || (ate <= 3 && aproxima);
      if (ate >= 0 && perigo) {
        fugindo++;
        let melhor = null;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const t = { x: meu.x + dx, z: meu.z + dz };
          if (passa(t.x, t.z) && em(t) >= 0 && (!melhor || em(t) > em(melhor))) melhor = t;
        }
        if (melhor && em(melhor) >= ate) return void passoRumo(meu, melhor, ate <= 2);
        return void teclas([]); // já está no ponto mais longe: espera ela escolher um lado
      }

      if (tarefa.tipo === "alavanca" && e.valores[tarefa.nome] === tarefa.valor) {
        tarefas.splice(tarefas.indexOf(tarefa), 1); mira = 0; return;
      }
      if (tarefa.tipo === "terminal" && tarefa.portas.every((k) => e.seladas.has(k))) {
        tarefas.splice(tarefas.indexOf(tarefa), 1); mira = 0; return;
      }
      // Saída: do tile de dentro (ou já no vão do elevador), atravessa até o outro lado.
      const s = lab.saida;
      const naSaida = (meu.x === s.x && meu.z === s.z) || (rota && !rota.length);
      if (tarefa.tipo === "saida" && naSaida) {
        return void irPara(centro(s.x) + (s.x - s.dentro.x) * 1.2, centro(s.z) + (s.z - s.dentro.z) * 1.2, false);
      }
      if (rota === null) return void teclas([]); // uma porta fechou o caminho por um instante
      if (rota.length) return void passoRumo(meu, rota[0], false);

      // Chegou ao tile da alavanca ou do terminal.
      if (!irPara(centro(destino.x), centro(destino.z), false)) return;
      if (!mirarParede(destino)) return;
      apertar("KeyE");
      if (tarefa.tipo === "terminal") {
        tarefa.portas.forEach((k) => { e.portasVistas.add(k); apertar(`Digit${k + 1}`); });
      }
    };
  });
}

// ---------- Chrome headless + CDP (sem pacotes) ----------
function acharNavegador() {
  const candidatos = [
    process.env.CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ].filter(Boolean);
  return candidatos.find((c) => fs.existsSync(c));
}

async function abrirNavegador() {
  const exe = acharNavegador();
  if (!exe) throw new Error("Chrome/Edge não encontrado. Defina a variável CHROME com o caminho do navegador.");
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), "unlogic-bot-"));
  const proc = spawn(exe, [
    "--headless=new", `--remote-debugging-port=${PORTA}`, `--user-data-dir=${perfil}`,
    "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio",
    "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows", "--no-first-run", "about:blank",
  ], { stdio: "ignore" });
  let pagina;
  for (let k = 0; k < 75 && !pagina; k++) {
    try { pagina = (await (await fetch(`http://127.0.0.1:${PORTA}/json`)).json()).find((a) => a.type === "page"); } catch { /* ainda abrindo */ }
    if (!pagina) await new Promise((r) => setTimeout(r, 200));
  }
  if (!pagina) { proc.kill(); throw new Error("o navegador não abriu a porta de depuração"); }
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((r, f) => { ws.onopen = r; ws.onerror = f; });
  let id = 0;
  const pendentes = new Map(), ouvintes = new Set();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id); } else ouvintes.forEach((f) => f(m));
  };
  const cmd = (method, params = {}) => new Promise((res, rej) => {
    pendentes.set(++id, (m) => (m.error ? rej(new Error(`${method}: ${m.error.message}`)) : res(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
  await cmd("Page.enable");
  await cmd("Emulation.setDeviceMetricsOverride", { width: 480, height: 320, deviceScaleFactor: 1, mobile: false });
  return {
    async abrir(url) {
      const carregou = new Promise((r) => { const f = (m) => { if (m.method === "Page.loadEventFired") { ouvintes.delete(f); r(); } }; ouvintes.add(f); });
      await cmd("Page.navigate", { url });
      await carregou;
    },
    async avaliar(expr) {
      const r = await cmd("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    fechar() { try { ws.close(); } catch { /* já fechado */ } proc.kill(); },
  };
}

(async () => {
  const url = pathToFileURL(path.join(__dirname, "..", "index.html")).href + "?demo";
  const nav = await abrirNavegador();
  let tudoCerto = true;
  try {
    for (let i = 0; i < FASES.length; i++) {
      await nav.abrir(url);
      const nivel = await nav.avaliar(`typeof Monstro.dificuldade === "function" ? Monstro.dificuldade(${i}, FASES.length).nivel : "fixa"`);
      console.log(`\n=== Andar ${FASES.nomeDoAndar(i)}: ${FASES[i].titulo} · criatura ${nivel} ===`);
      let vitorias = 0;
      for (let r = 0; r < RODADAS; r++) {
        if (r) await nav.abrir(url);
        const res = await nav.avaliar(`(${botAndar})(${i}, ${JSON.stringify({ passos: PASSOS, limite: LIMITE })})`);
        if (res.erro) throw new Error(res.erro);
        if (res.venceu) vitorias++;
        console.log(`  rodada ${r + 1}: ${res.venceu ? "venceu" : "NÃO venceu"} em ${res.tempo} s · capturas ${res.capturas}` +
          ` · caçadas ${res.cacadas} · mais perto ${res.maisPerto} m · viradas em falso ${res.erradas}`);
      }
      if (vitorias < RODADAS) { tudoCerto = false; console.log(`  ERRO: venceu ${vitorias} de ${RODADAS}`); }
    }
  } finally {
    nav.fechar();
  }
  console.log(tudoCerto ? "\nO bot venceu todos os andares." : "\nHá andares que o bot não venceu.");
  process.exit(tudoCerto ? 0 : 1);
})().catch((erro) => { console.error(erro.message); process.exit(2); });
