/*
 * fases.js — Os 5 andares do jogo
 *
 * Para criar uma fase nova, basta adicionar um objeto nesta lista:
 *   alavancas : valor inicial de cada alavanca (true = V, false = F)
 *   presas    : alavancas que o jogador NÃO pode mexer (funcionam como premissas)
 *   portas    : fechaduras lógicas (fórmulas escritas como texto)
 *   energia   : quantas vezes o jogador pode virar uma alavanca
 *
 * Rode  node testes/verificador_fases.js  para conferir se todas as fases têm solução
 * com a energia disponível, e  node testes/verificar_regras.js  para simular a partida.
 *
 * Dificuldade crescente (viradas mínimas / energia):
 *   1: 3/5   2: 3/5   3: 4/5   4: 3/4 + 2 portas a selar   5: 4/4 + 1 porta a selar
 * Uma virada errada custa 2 de energia (ida e volta). Então a folga de 2 dos andares
 * 1 e 2 perdoa um erro; a folga de 1 dos andares 3 e 4 só perdoa uma acusação errada
 * no terminal; o andar 5 não perdoa nada.
 * Evite chamar uma alavanca de V ou F: confunde com os valores.
 */
const FASES = [
  {
    titulo: "Primeiro contato",
    conceito: "Conjunção, disjunção e negação",
    texto:
      "A porta abre quando a fórmula da fechadura é VERDADEIRA. " +
      "P ∧ Q só é verdadeira se as duas partes forem; P ∨ Q basta uma; ¬P inverte o valor. " +
      "Cuidado com a negação de um parêntese: ¬(P ∧ Q) só é falsa quando as DUAS são verdadeiras. " +
      "Abra as quatro portas ao mesmo tempo.",
    // Solução única: A=V B=F C=V D=F
    alavancas: { A: false, B: true, C: false, D: false },
    presas: [],
    portas: ["A & !B", "B | C", "!(C & D)", "(A | D) & !(B & C)"],
    energia: 5,
  },
  {
    titulo: "Se... então",
    conceito: "Condicional (→)",
    texto:
      "P → Q só é FALSA quando P é verdadeira e Q é falsa. " +
      "Se P for falsa, a condicional é verdadeira, não importa Q — desligar o antecedente " +
      "costuma ser mais barato do que satisfazer o consequente. " +
      "Há mais de uma saída, mas só uma cabe em três viradas.",
    // Mais curta (3 viradas): A=F C=V E=F, mantendo B=F e D=V
    alavancas: { A: true, B: false, C: false, D: true, E: true },
    presas: [],
    portas: ["A -> B", "B -> (C & !D)", "!C -> E", "E -> (A & D)", "(A -> D) -> C"],
    energia: 5,
  },
  {
    titulo: "Se, e somente se",
    conceito: "Bicondicional (↔)",
    texto:
      "P ↔ Q é verdadeira quando P e Q têm o MESMO valor; ¬(P ↔ Q), quando têm valores diferentes. " +
      "Quase todas as portas já estão abertas — e é esse o problema: cada alavanca que você vira " +
      "abre uma e fecha outras. Monte a cadeia inteira de dependências antes de tocar em qualquer coisa.",
    // Solução única: A=F B=V C=V D=V E=F (4 viradas: A, B, C, E)
    alavancas: { A: true, B: false, C: false, D: true, E: true },
    presas: [],
    portas: ["A <-> !B", "(B <-> C) <-> D", "!(C <-> E)", "(A & D) <-> E", "C <-> (A -> E)"],
    energia: 5,
  },
  {
    titulo: "As portas impossíveis",
    conceito: "Tautologia e contradição",
    texto:
      "Duas portas são CONTRADIÇÕES: falsas em todas as linhas da tabela-verdade, nunca abrem. " +
      "Encontre-as e sele-as no terminal “Impossível!” (errar custa energia). " +
      "Uma porta é uma TAUTOLOGIA e está sempre aberta. " +
      "E atenção: uma das portas só PARECE impossível — ela abre em exatamente uma linha.",
    // Portas 2 e 5 são contradições; a 3 é tautologia (silogismo hipotético);
    // a 4 é a isca: só abre com A=V B=F C=V D=F, que é a solução do andar.
    alavancas: { A: false, B: true, C: false, D: false },
    presas: [],
    portas: [
      "(A | B) -> (C & !D)",
      "(A -> B) & (B -> C) & A & !C",
      "((A -> B) & (B -> C)) -> (A -> C)",
      "!(A -> B) & (C <-> A) & !D",
      "(A <-> B) & (B <-> !C) & (C <-> A)",
      "D -> !A",
    ],
    energia: 4,
  },
  {
    titulo: "Premissas",
    conceito: "Modus ponens, modus tollens e silogismo disjuntivo",
    texto:
      "As alavancas com grade estão presas: são PREMISSAS (P é verdadeira, Q é falsa). " +
      "Modus ponens: de P e P → X, conclua X. Modus tollens: de ¬Q e X → Q, conclua ¬X. " +
      "Silogismo disjuntivo: de X ∨ Y e ¬X, conclua Y. " +
      "Deduza A, B, C e D — e desconfie de uma porta que contradiz as próprias premissas. " +
      "Não há energia sobrando para tentativa e erro.",
    // Dedução: P → (A ∨ B) dá A ∨ B; A → Q e ¬Q dão ¬A; logo B; (C ∧ P) → Q dá ¬C;
    // B → (C ↔ ¬D) dá D. Solução única: A=F B=V C=F D=V. A porta 7 é contradição.
    alavancas: { A: true, B: false, C: true, D: false, P: true, Q: false },
    presas: ["P", "Q"],
    portas: [
      "P -> (A | B)",
      "A -> Q",
      "B -> (C <-> !D)",
      "(C & P) -> Q",
      "(D | A) -> B",
      "(B & !C) -> (Q | D)",
      "(P -> Q) & P & !Q",
    ],
    energia: 4,
  },
];

if (typeof module !== "undefined") module.exports = FASES;
