/*
 * verificar_fases.js — confere se cada fase é jogável.
 * Uso:  node testes/verificar_fases.js
 *
 * Para cada fase, testa TODAS as combinações das alavancas livres e mostra:
 *   - a classificação de cada porta (tautologia / contradição / contingência)
 *   - as soluções e o número mínimo de movimentos a partir do estado inicial
 *   - se a energia da fase é suficiente
 */
const path = require("path");
const Logica = require(path.join(__dirname, "..", "js", "logica.js"));
const FASES = require(path.join(__dirname, "..", "js", "fases.js"));

let tudoCerto = true;

FASES.forEach((fase, i) => {
  console.log(`\n=== Fase ${i + 1}: ${fase.titulo} ===`);
  const portas = fase.portas.map((t) => {
    const f = Logica.ler(t);
    return { f, tipo: Logica.classificar(f) };
  });
  portas.forEach((p, k) => console.log(`  Porta ${k + 1}: ${Logica.paraTexto(p.f).padEnd(34)} ${p.tipo}`));

  const nomes = Object.keys(fase.alavancas);
  const livres = nomes.filter((n) => !fase.presas.includes(n));
  const solucoes = [];

  for (let m = 0; m < 1 << livres.length; m++) {
    const v = { ...fase.alavancas };
    livres.forEach((n, k) => { v[n] = ((m >> k) & 1) === 1; });
    const ok = portas.every((p) => p.tipo === "contradicao" || Logica.avaliar(p.f, v));
    if (ok) {
      const movs = livres.filter((n) => v[n] !== fase.alavancas[n]).length;
      solucoes.push({ v, movs });
    }
  }

  const inicialJaResolvida = solucoes.some((s) => s.movs === 0);
  const minimo = Math.min(...solucoes.map((s) => s.movs));
  solucoes.sort((a, b) => a.movs - b.movs).forEach((s) =>
    console.log(`  Solução (${s.movs} mov.): ` + nomes.map((n) => `${n}=${s.v[n] ? "V" : "F"}`).join(" "))
  );
  console.log(`  Mínimo de movimentos: ${minimo} | energia da fase: ${fase.energia}`);

  if (!solucoes.length) { console.log("  ERRO: fase sem solução"); tudoCerto = false; }
  if (inicialJaResolvida) { console.log("  ERRO: estado inicial já resolve a fase"); tudoCerto = false; }
  if (minimo > fase.energia) { console.log("  ERRO: energia insuficiente"); tudoCerto = false; }
});

console.log(tudoCerto ? "\nTodas as fases são jogáveis." : "\nHá fases com problema.");
process.exit(tudoCerto ? 0 : 1);
