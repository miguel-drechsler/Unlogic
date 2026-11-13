# Unlogic — um puzzle de Lógica Proposicional

## Como rodar
1. Descompacte o zip.
2. Dê dois cliques em `index.html`. O jogo abre no navegador (Chrome, Edge ou Firefox).

Não precisa instalar nada nem ter internet.

## A ideia
O jogador está preso num laboratório. Cada **alavanca** é uma variável proposicional (V ou F)
e cada **porta** tem uma fechadura que é uma fórmula. A porta abre quando a fórmula é verdadeira.
Para vencer a fase, todas as portas precisam estar abertas **ao mesmo tempo**. Como as alavancas
são compartilhadas, abrir uma porta pode fechar outra.

### Mecânicas e onde está a lógica
| Mecânica | Conceito de lógica |
|---|---|
| Alavancas | Variáveis proposicionais e valoração |
| Portas | Avaliação de fórmulas com ¬, ∧, ∨, →, ↔ |
| Energia limitada | Obriga a raciocinar antes de mexer (sem tentativa e erro) |
| Botão "Impossível!" | Identificar **contradições** |
| Porta sempre aberta (fase 4) | **Tautologia** (equivalência da contrapositiva) |
| Botão "Tabela-verdade" | Tabela-verdade como ferramenta estratégica (custa pontos) |
| Alavancas presas (fase 5) | Premissas, **modus ponens** e **modus tollens** |

### As fases
1. **Primeiro contato** — ∧, ∨ e ¬.
2. **Se... então** — condicional; a solução mais curta usa o antecedente falso.
3. **Se, e somente se** — bicondicional e cadeias de dependência.
4. **A porta impossível** — uma contradição (silogismo hipotético + ¬C) e uma tautologia.
5. **Premissas** — A = V e E = F presos; deduz-se B, C e D.

### Pontuação
100 por fase + 25 por energia que sobrar − 10 por tabela-verdade consultada − 20 por acusação errada.

## Estrutura dos arquivos
```
index.html               página do jogo
css/estilo.css           visual
js/logica.js             MOTOR LÓGICO: parser, avaliação, tabela-verdade, classificação
js/fases.js              as fases (fácil de editar e criar novas)
js/jogo.js               regras do jogo e interface
testes/verificar_fases.js  confere se toda fase tem solução com a energia dada
```

## Criando novas fases
Edite `js/fases.js`. As fórmulas são escritas como texto:
`!` (não), `&` (e), `|` (ou), `->` (se...então), `<->` (se e somente se).
Exemplo: `"(A & !B) | C"`.

Depois, se tiver o Node.js instalado, rode `node testes/verificar_fases.js` para confirmar
que a fase tem solução e ver o número mínimo de movimentos (use isso para definir a energia).

## Atalhos
Aperte a letra da alavanca no teclado (A, B, C...) para virá-la.
As bolinhas numeradas no topo permitem pular para qualquer fase (útil na apresentação).
