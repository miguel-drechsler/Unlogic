/*
 * fases.js — As 5 fases do jogo
 *
 * Para criar uma fase nova, basta adicionar um objeto nesta lista:
 *   alavancas : valor inicial de cada alavanca (true = V, false = F)
 *   presas    : alavancas que o jogador NÃO pode mexer (funcionam como premissas)
 *   portas    : fechaduras lógicas (fórmulas escritas como texto)
 *   energia   : quantas vezes o jogador pode virar uma alavanca
 *
 * Rode  node testes/verificar_fases.js  para conferir se todas as fases têm solução
 * com a energia disponível.
 */
const FASES = [
  {
    titulo: "Primeiro contato",
    conceito: "Conjunção, disjunção e negação",
    texto:
      "A porta abre quando a fórmula da fechadura é VERDADEIRA. " +
      "P ∧ Q só é verdadeira se as duas partes forem; P ∨ Q basta uma; ¬P inverte o valor. " +
      "Abra as três portas ao mesmo tempo.",
    alavancas: { A: false, B: false, C: true },
    presas: [],
    portas: ["A & B", "!C", "B | C"],
    energia: 4,
  },
  {
    titulo: "Se... então",
    conceito: "Condicional (→)",
    texto:
      "P → Q só é FALSA quando P é verdadeira e Q é falsa. " +
      "Atenção: se P for falsa, a condicional é verdadeira, não importa Q. " +
      "Você tem pouca energia — existe um caminho mais curto do que parece.",
    alavancas: { A: true, B: false, C: true, D: false },
    presas: [],
    portas: ["A -> B", "B -> !C", "C | D", "!D -> A"],
    energia: 2,
  },
  {
    titulo: "Se, e somente se",
    conceito: "Bicondicional (↔)",
    texto:
      "P ↔ Q é verdadeira quando P e Q têm o MESMO valor. " +
      "Cada alavanca que você vira pode abrir uma porta e fechar outra. " +
      "Pense na cadeia de dependências antes de mexer.",
    alavancas: { A: false, B: true, C: true, D: false },
    presas: [],
    portas: ["A <-> B", "!(B <-> C)", "C -> D", "!D -> !A"],
    energia: 2,
  },
  {
    titulo: "A porta impossível",
    conceito: "Tautologia e contradição",
    texto:
      "Uma das portas é uma CONTRADIÇÃO: falsa em todas as linhas da tabela-verdade, nunca abre. " +
      "Encontre-a e use o botão “Impossível!” para selá-la (errar custa energia). " +
      "Outra porta é uma TAUTOLOGIA: está sempre aberta. Por quê?",
    alavancas: { A: true, B: false, C: false },
    presas: [],
    portas: [
      "A | C",
      "(A -> B) & (B -> C) & A & !C",
      "(A -> B) <-> (!B -> !A)",
      "!(A & B) -> C",
    ],
    energia: 2,
  },
  {
    titulo: "Premissas",
    conceito: "Modus ponens e modus tollens",
    texto:
      "As alavancas com cadeado estão presas: são PREMISSAS, você não pode mudá-las. " +
      "Use-as para deduzir o resto. Modus ponens: de P e P → Q, conclua Q. " +
      "Modus tollens: de ¬Q e P → Q, conclua ¬P. Sem energia sobrando para tentativa e erro!",
    alavancas: { A: true, B: false, C: true, D: false, E: false },
    presas: ["A", "E"],
    portas: ["A -> B", "C -> E", "B -> (C | D)", "D <-> !E", "(B & D) -> !C"],
    energia: 3,
  },
];

if (typeof module !== "undefined") module.exports = FASES;
