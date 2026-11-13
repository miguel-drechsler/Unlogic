# Unlogic — terror em primeira pessoa de Lógica Proposicional

## Como rodar
1. Descompacte o zip.
2. Dê dois cliques em `index.html`. O jogo abre no navegador (Chrome, Edge ou Firefox).

Não precisa instalar nada nem ter internet: o Three.js vai junto, na pasta `vendor/`.
A versão 2D original continua disponível em `classico.html`.

## A ideia
Você está preso no subsolo de um laboratório escuro. Em cada andar:

- cada **alavanca** na parede é uma variável proposicional (cabo para cima = V, para baixo = F);
- cada **porta** tem uma fórmula no painel neon e abre na hora em que a fórmula fica verdadeira;
- o **elevador** só libera quando todas as portas estão abertas (ou seladas) **ao mesmo tempo**;
- uma **criatura** patrulha o andar, ouve as alavancas e persegue quem chega perto.

Como as alavancas são compartilhadas, abrir uma porta pode fechar outra — e cada virada gasta energia.

### Controles
| Tecla | Ação |
|---|---|
| W A S D / setas | andar |
| Mouse | olhar |
| Shift | correr (gasta fôlego) |
| E ou clique | virar alavanca / usar terminal |
| Tab | abrir e fechar o tablet |
| M | mostrar e esconder o minimapa |
| 1–9 (tablet aberto) | tabela-verdade da porta · no terminal: acusar a porta |
| PgDn / PgUp (tablet aberto) | rolar o tablet |
| Esc | pausar |

### Mecânicas e onde está a lógica
| Mecânica | Conceito de lógica |
|---|---|
| Alavancas | Variáveis proposicionais e valoração |
| Portas | Avaliação de fórmulas com ¬, ∧, ∨, →, ↔ |
| Energia limitada → apagão | Obriga a raciocinar antes de mexer: quando a energia não alcança mais nenhuma solução, as luzes apagam e a criatura corre até você |
| Virada em falso acelera a criatura | Tentativa e erro é punida (em falso = não aproxima de nenhuma solução) |
| Terminal "Impossível!" | Identificar **contradições** (errar custa 1 de energia) |
| Porta sempre aberta (andar −4) | **Tautologia** (silogismo hipotético) |
| Porta-isca (andar −4) | Parece impossível, mas abre em exatamente uma linha da tabela-verdade |
| Tabela-verdade no tablet | Ferramenta estratégica (custa pontos) |
| Alavancas com grade (andar −5) | Premissas, **modus ponens**, **modus tollens** e silogismo disjuntivo |
| Tablet só mostra o que foi encontrado | Valoração parcial: fórmulas aparecem com `?` até você achar as alavancas |

### Os andares
| Andar | Conceito | Alavancas | Portas | Viradas mínimas / energia |
|---|---|---|---|---|
| −1 | ∧, ∨, ¬ com parênteses negados | 4 | 4 | 3 / 5 |
| −2 | Condicional: o caminho curto usa antecedentes falsos | 5 | 5 | 3 / 5 |
| −3 | Bicondicional: começa com 4 de 5 portas abertas, e mesmo assim faltam 4 viradas | 5 | 5 | 4 / 5 |
| −4 | 2 contradições a selar, 1 tautologia e 1 porta-isca | 4 | 6 | 3 / 4 |
| −5 | 2 premissas presas, dedução em cadeia e 1 contradição a selar | 6 | 7 | 4 / 4 |

Uma virada errada custa 2 de energia (ida e volta): os andares −1 e −2 perdoam um erro,
os −3 e −4 só perdoam uma acusação errada no terminal, e o −5 não perdoa nada.

### A criatura
- Patrulha o andar e vai investigar o barulho de cada alavanca virada.
- Começa a caçar quando o caminho até você fica curto; caçando, é mais lenta que o seu passo
  normal — até você errar. Cada virada em falso e cada acusação errada a aceleram.
- Uma caçada dura no máximo 12 s; depois ela cansa, recua e fica 10 s sem caçar.
- Portas fechadas a bloqueiam; portas abertas são atalho para ela também.
- Os andares não têm becos sem saída: sempre existe uma segunda rota de fuga.
  Mas virar uma alavanca pode **fechar** uma porta atrás de você — a lógica avisa antes.

### Pontuação
100 por andar + 25 por energia que sobrar − 10 por tabela-verdade consultada − 20 por acusação errada.

## Estrutura dos arquivos
```
index.html                 página do jogo 3D (HUD sobreposto ao Three.js)
classico.html              versão 2D original (usa css/estilo.css e js/jogo.js)
css/terror.css             HUD, tablet e telas
vendor/                    Three.js r147 + PointerLockControls

js/logica.js               MOTOR LÓGICO: parser, avaliação, tabela-verdade, classificação
js/fases.js                as fases (fácil de editar e criar novas)
js/estado.js               regras em tempo real (energia, vitória, apagão, pontuação)
js/labirinto.js            labirinto procedural por fase + pathfinding A*
js/mundo.js                o andar em 3D; liga portas e alavancas ao motor lógico
js/jogador.js              movimentação em primeira pessoa e colisão
js/monstro.js              modelo e IA da criatura
js/hud.js                  bateria, avisos e tablet
js/minimapa.js             minimapa com névoa de exploração
js/texturas.js             texturas desenhadas em canvas (inclui o painel das portas)
js/som.js                  sons sintetizados (Web Audio)
js/jogo3d.js               cena, raycast de interação e laço principal

testes/verificador_fases.js   confere se toda fase tem solução com a energia dada
testes/verificar_labirinto.js confere se o mapa de cada fase é jogável (e sem becos)
testes/verificar_regras.js    simula partidas: caminho ótimo, viradas erradas, apagão
```

### Como o mapa nasce das fases
Cada andar tem a mesma planta organizada: um **saguão central** onde o jogador nasce (quatro saídas),
quatro alas de corredores que crescem a partir dele e **salas de laboratório nos cantos**.
`labirinto.js` monta isso como um labirinto perfeito (tudo alcançável) e depois abre uma parede
extra para cada porta da fase. Assim as portas bloqueiam **atalhos**, nunca o único caminho: o jogador
sempre consegue chegar a todas as alavancas, e a fase 3D tem solução sempre que a fase lógica tem.
A mesma fase gera sempre o mesmo mapa.

O **minimapa** só mostra o que já foi visto. Portas aparecem na cor da situação, alavancas
catalogadas na cor do valor, o terminal como `T` — e a criatura só quando está perto.

## Criando novas fases
Edite `js/fases.js`. As fórmulas são escritas como texto:
`!` (não), `&` (e), `|` (ou), `->` (se...então), `<->` (se e somente se).
Exemplo: `"(A & !B) | C"`. O labirinto, as alavancas e as portas do novo andar são gerados sozinhos.

Depois, se tiver o Node.js instalado, rode:
```
node testes/verificador_fases.js     # a fase tem solução? quantos movimentos no mínimo?
node testes/verificar_labirinto.js   # desenha o mapa e confere se tudo é alcançável
node testes/verificar_regras.js      # simula a partida com as regras do jogo
```

## Para a apresentação
- Os botões −1 a −5 no menu (Esc) pulam para qualquer andar.
- `index.html?demo` roda sem travar o mouse e expõe `depurar` no console do navegador
  (`depurar.passos = 8` acelera a simulação; foi assim que um bot jogou os cinco andares).
