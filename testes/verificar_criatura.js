/*
 * verificar_criatura.js — confere a dificuldade da criatura em cada andar (sem 3D).
 * Uso:  node testes/verificar_criatura.js
 *
 * Os limites que mantêm todo andar vencível:
 *   - caçando sem erros do jogador, ela é mais lenta que o PASSO dele;
 *   - mesmo no teto (com muitos erros), é mais lenta que a CORRIDA dele;
 *   - a trégua continua existindo: parada no começo, caçada com fim e descanso depois.
 * E a curva: do primeiro andar jogado (−5) ao último (−1), nada fica mais fácil.
 * Para ver um bot jogando os andares de verdade:  node testes/jogar_andares.js
 */
const path = require("path");
const js = (nome) => require(path.join(__dirname, "..", "js", nome));
const FASES = js("fases.js");
const Jogador = js("jogador.js");
const Monstro = js("monstro.js");

let tudoCerto = true;
const conferir = (ok, msg) => { if (!ok) { console.log("  ERRO: " + msg); tudoCerto = false; } };
const SOBE = ["velPatrulha", "velCaca", "tetoCaca", "fareja", "folego", "rondaPerto"];
const DESCE = ["tregua", "descanso"];

console.log(`Jogador: passo ${Jogador.ANDAR} m/s, corrida ${Jogador.CORRER} m/s\n`);
console.log("andar  nível       trégua  patrulha  caça  teto  fareja  fôlego  descanso  ronda");
let anterior = null;
FASES.forEach((fase, i) => {
  const d = Monstro.dificuldade(i, FASES.length);
  const andar = FASES.nomeDoAndar(i);
  console.log(`${andar.padEnd(6)} ${d.nivel.padEnd(11)} ${d.tregua.toFixed(1).padStart(5)}s ` +
    `${d.velPatrulha.toFixed(2).padStart(8)} ${d.velCaca.toFixed(2).padStart(5)} ${d.tetoCaca.toFixed(2).padStart(5)} ` +
    `${String(d.fareja).padStart(7)} ${d.folego.toFixed(1).padStart(6)}s ${d.descanso.toFixed(1).padStart(8)}s ${d.rondaPerto.toFixed(2).padStart(6)}`);

  conferir(d.velCaca < Jogador.ANDAR, `${andar}: caça sem erros (${d.velCaca}) não é menor que o passo`);
  conferir(d.tetoCaca < Jogador.CORRER, `${andar}: teto de caça (${d.tetoCaca}) não é menor que a corrida`);
  conferir(d.tetoCaca >= d.velCaca, `${andar}: teto de caça abaixo da caça sem erros`);
  conferir(d.tregua > 0 && d.folego > 0 && Number.isFinite(d.folego) && d.descanso > 0, `${andar}: sem trégua`);
  if (anterior) {
    SOBE.forEach((k) => conferir(d[k] >= anterior[k], `${andar}: ${k} ficou mais fácil`));
    DESCE.forEach((k) => conferir(d[k] <= anterior[k], `${andar}: ${k} ficou mais fácil`));
  }
  anterior = d;
});

const primeiro = Monstro.dificuldade(0, FASES.length), ultimo = Monstro.dificuldade(FASES.length - 1, FASES.length);
conferir(primeiro.nivel === "lenta" && ultimo.nivel === "implacável", "níveis do primeiro e do último andar");
conferir(SOBE.every((k) => ultimo[k] > primeiro[k]) && DESCE.every((k) => ultimo[k] < primeiro[k]),
  "o último andar não é mais difícil que o primeiro em tudo");
const fora = Monstro.dificuldade(99, FASES.length);
conferir(fora.velCaca < Jogador.ANDAR && fora.tetoCaca < Jogador.CORRER && fora.tregua > 0, "limites fora da curva");

console.log(tudoCerto ? "\nA criatura respeita os limites em todos os andares." : "\nHá andares com a criatura fora dos limites.");
process.exit(tudoCerto ? 0 : 1);
