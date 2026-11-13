/*
 * som.js — Todos os sons são sintetizados com a Web Audio API (nenhum arquivo de áudio)
 *
 * O navegador só libera áudio depois de um gesto do usuário: Som.iniciar() é
 * chamado no clique de "Entrar". Antes disso, todas as funções são silenciosas.
 */
const Som = (() => {
  let ctx = null, mestre, bufferRuido, respiracao, respiracaoPan, respiracaoLfo;

  function iniciar() {
    if (ctx) { ctx.resume(); return; }
    const Classe = window.AudioContext || window.webkitAudioContext;
    if (!Classe) return;
    ctx = new Classe();
    mestre = ctx.createGain();
    mestre.gain.value = 0.8;
    mestre.connect(ctx.destination);

    bufferRuido = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const dados = bufferRuido.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;

    zumbidoAmbiente();
    respiracaoDoMonstro();
  }

  // ---------- Blocos básicos ----------
  function envelope(vol, dur, atraso = 0, ataque = 0.005) {
    const g = ctx.createGain(), t = ctx.currentTime + atraso;
    vol = Math.max(vol, 0.0002); // rampa exponencial não aceita zero (ex.: monstro muito longe)
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + ataque);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(mestre);
    return g;
  }

  function tom(tipo, f0, f1, dur, vol, atraso = 0) {
    if (!ctx) return;
    const o = ctx.createOscillator(), t = ctx.currentTime + atraso;
    o.type = tipo;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    o.connect(envelope(vol, dur, atraso));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function ruido(filtro, f0, f1, dur, vol, atraso = 0, q = 1) {
    if (!ctx) return;
    const fonte = ctx.createBufferSource(), bq = ctx.createBiquadFilter(), t = ctx.currentTime + atraso;
    fonte.buffer = bufferRuido;
    fonte.loop = true;
    bq.type = filtro;
    bq.Q.value = q;
    bq.frequency.setValueAtTime(f0, t);
    bq.frequency.exponentialRampToValueAtTime(f1, t + dur);
    fonte.connect(bq);
    bq.connect(envelope(vol, dur, atraso));
    fonte.start(t, Math.random());
    fonte.stop(t + dur + 0.05);
  }

  // ---------- Camadas contínuas ----------
  function zumbidoAmbiente() {
    const g = ctx.createGain();
    g.gain.value = 0.05;
    g.connect(mestre);
    for (const f of [48, 50.5, 97]) { // batimento lento entre frequências vizinhas
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      o.start();
    }
  }

  function respiracaoDoMonstro() {
    const fonte = ctx.createBufferSource(), filtro = ctx.createBiquadFilter(), onda = ctx.createGain();
    fonte.buffer = bufferRuido;
    fonte.loop = true;
    filtro.type = "bandpass";
    filtro.frequency.value = 420;
    filtro.Q.value = 1.4;
    onda.gain.value = 0.5;
    respiracaoLfo = ctx.createOscillator(); // inspira/expira
    respiracaoLfo.frequency.value = 0.4;
    const profundidade = ctx.createGain();
    profundidade.gain.value = 0.5;
    respiracaoLfo.connect(profundidade);
    profundidade.connect(onda.gain);
    respiracao = ctx.createGain();
    respiracao.gain.value = 0;
    fonte.connect(filtro); filtro.connect(onda); onda.connect(respiracao);
    if (ctx.createStereoPanner) {
      respiracaoPan = ctx.createStereoPanner();
      respiracao.connect(respiracaoPan);
      respiracaoPan.connect(mestre);
    } else {
      respiracao.connect(mestre);
    }
    fonte.start();
    respiracaoLfo.start();
  }

  // Chamado a cada quadro: proximidade 0..1, lado -1 (esquerda) .. 1 (direita).
  function monstro(proximidade, lado, cacando) {
    if (!ctx) return;
    const t = ctx.currentTime;
    respiracao.gain.setTargetAtTime(proximidade * proximidade * 0.9, t, 0.15);
    respiracaoLfo.frequency.setTargetAtTime(cacando ? 1.1 : 0.4, t, 0.5);
    if (respiracaoPan) respiracaoPan.pan.setTargetAtTime(lado, t, 0.1);
  }

  // ---------- Efeitos ----------
  const api = {
    iniciar, monstro,
    clack() { ruido("bandpass", 2600, 900, 0.07, 0.9, 0, 2); tom("square", 190, 70, 0.09, 0.35); tom("square", 1400, 600, 0.03, 0.2, 0.05); },
    negado() { tom("sawtooth", 95, 80, 0.28, 0.35); tom("sawtooth", 98, 82, 0.28, 0.3); },
    porta(vol = 1) { ruido("lowpass", 300, 1400, 0.5, 0.5 * vol); tom("sine", 70, 38, 0.35, 0.6 * vol, 0.42); },
    passo(vol = 1) { ruido("lowpass", 240, 90, 0.09, 0.28 * vol); },
    passoMonstro(vol) { tom("sine", 58, 30, 0.22, 0.9 * vol); ruido("lowpass", 160, 60, 0.15, 0.4 * vol); },
    acerto() { tom("triangle", 520, 520, 0.14, 0.3); tom("triangle", 780, 780, 0.25, 0.3, 0.13); },
    alarme() { for (let i = 0; i < 3; i++) tom("square", 660, 880, 0.22, 0.16, i * 0.3); },
    apagao() { tom("sawtooth", 220, 22, 1.6, 0.5); ruido("lowpass", 3000, 60, 1.6, 0.5); },
    rugido() { tom("sawtooth", 140, 60, 1.1, 0.5); ruido("bandpass", 500, 200, 1.1, 0.5, 0, 0.8); },
    susto() {
      for (const f of [311, 440, 466, 622, 933]) tom("sawtooth", f, f * 0.8, 1.2, 0.35);
      ruido("highpass", 1200, 500, 1.2, 0.8);
      tom("sine", 60, 25, 1.2, 1);
    },
    vitoria() { [392, 494, 587, 784].forEach((f, i) => tom("triangle", f, f, 0.35, 0.28, i * 0.14)); },
  };
  return api;
})();
