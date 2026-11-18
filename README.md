# Unlogic — um jogo de terror em primeira pessoa sobre Lógica Proposicional

## Como rodar o jogo
1. Descompacte o zip.
2. Dê dois cliques em `index.html`. O jogo abre no navegador (Chrome, Safari, Edge ou Firefox).

Não precisa instalar nada nem ter internet: o Three.js vai junto, na pasta `vendor/`.
A versão 2D original continua disponível em `classico.html` (link “Versão 2D clássica” no menu);
de lá, o botão **← Voltar ao modo 3D**, no topo, traz de volta.

## A ideia
Você está preso no subsolo de um laboratório escuro. Em cada andar:

- cada **alavanca** na parede é uma variável proposicional (cabo para cima = V, para baixo = F);
- cada **porta** tem uma fórmula no painel neon e abre na hora em que a fórmula fica verdadeira;
- o **elevador** só libera quando todas as portas estão abertas (ou seladas) **ao mesmo tempo** —
  e aí as alavancas travam, para nenhum clique acidental desfazer a solução no caminho até a saída;
- uma **criatura** patrulha o andar, ouve as alavancas e persegue quem chega perto.

Como as alavancas são compartilhadas, abrir uma porta pode fechar outra — e cada virada gasta energia.

### Controles
| Tecla | Ação |
|---|---|
| W A S D / setas | andar |
| Mouse | olhar (se o navegador bloquear a trava do cursor, arraste para olhar) |
| Shift | correr (gasta fôlego) |
| E ou clique | virar alavanca / usar terminal |
| Tab | abrir e fechar o tablet |
| H | abrir a tabela dos conectivos (ou voltar dela) |
| R | reiniciar o andar |
| M | minimapa: local (gira com você) → completo → oculto |
| F | tela cheia |
| K | ligar/desligar o som |
| 1–9 (tablet aberto) | tabela-verdade da porta · no terminal: acusar a porta |
| 0 (tablet aberto) | voltar à visão geral |
| Roda do mouse ou PgDn / PgUp (tablet aberto) | rolar o tablet |
| P ou Esc | pausar (P também continua) — em tela cheia, pausa **sem sair dela** |

**Tela de início:** escolha o andar no painel do elevador (clique ou ↑/↓) e desça com Enter.
"Como jogar" e "Opções" ficam logo abaixo.
**Pausa:** continuar, reiniciar o andar, opções, controles ou sair para o menu. Reiniciar e sair
pedem um segundo clique de confirmação, porque perdem o progresso do andar.

Em "Opções" (no início e na pausa) há **sensibilidade do mouse**, **volume**, **som ligado** e
**modo estudo**. Tudo isso e os recordes de cada andar ficam salvos no navegador (`js/progresso.js`).
A resolução interna se ajusta sozinha se o FPS cair.
Apontar a mira para uma porta mostra a fórmula e a situação dela.

Se o navegador ou o preview bloquear a **trava do mouse** (Pointer Lock), o jogo entra
automaticamente no modo de **arrastar para olhar**: segure o botão esquerdo (ou direito)
e arraste. Um clique curto sem arrastar continua interagindo, e `E` também funciona.
`Esc` pausa normalmente nesse modo.

### Ajudas para raciocinar (sem entregar a solução)
- **Avaliação de dentro para fora.** Na tabela-verdade de uma porta, o tablet também
  mostra cada subfórmula já resolvida com os valores atuais das alavancas. É a
  semântica composicional acontecendo diante do jogador: primeiro os parênteses
  internos, depois o conectivo principal. A ajuda só aparece para as variáveis que
  você já encontrou.
- **Tabela dos conectivos (`H`).** Uma referência com a tabela-verdade de ¬, ∧, ∨, → e ↔,
  gerada pelo próprio motor lógico, além da precedência e da associatividade da
  condicional. Serve para consultar durante o jogo sem sair dele.
- **Dependências da alavanca.** Ao mirar ou catalogar uma alavanca, a dica informa
  em quais portas já encontradas ela aparece. Isso orienta a navegação, mas não
  revela o valor correto nem a solução.
- **Contador de portas e energia.** O topo da tela mostra `PORTAS abertas/total` e a
  energia exata (`3/5`), para o jogador medir o custo de cada virada.
- **Alavancas travadas após a vitória.** Quando o elevador é liberado, as alavancas
  param de responder. Assim um toque acidental não fecha a saída já conquistada.

### Modo estudo
A opção **Modo estudo** no menu (Esc) desliga a criatura e os sustos, mantém a
pontuação na tela e **não altera os recordes**. O HUD marca `ESTUDO`. É o modo
indicado para estudar as fases com calma ou para apresentar a lógica em sala,
sem o componente de terror atrapalhar a explicação. A lógica, a energia e as
portas continuam exatamente iguais.

### Recordes e preferências
O melhor resultado de cada andar, o total de andares vencidos, a preferência de
modo estudo e o estado do som ficam salvos no `localStorage` do navegador
(`unlogic.progresso.v1`). O menu mostra o recorde por andar e o acumulado.
Se o navegador bloquear o armazenamento (por exemplo, em janela privada), o jogo
continua funcionando e o progresso vale só durante a sessão. Limpar os dados do
site zera os recordes.

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
- Portas fechadas a bloqueiam; portas abertas são atalho para ela também. Se uma porta fecha
  no meio da rota (ou com ela no vão), ela recua e procura outro caminho.
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

js/logica.js               MOTOR LÓGICO: parser, avaliação, tabela-verdade, classificação, subfórmulas
js/fases.js                as fases (fácil de editar e criar novas)
js/estado.js               regras em tempo real (energia, vitória, apagão, pontuação)
js/progresso.js            recordes e preferências no localStorage
js/labirinto.js            labirinto procedural por fase + pathfinding A*
js/mundo.js                o andar em 3D; liga portas e alavancas ao motor lógico
js/jogador.js              movimentação em primeira pessoa e colisão
js/monstro.js              modelo e IA da criatura
js/hud.js                  bateria, avisos e tablet
js/menus.js                tela de início (painel do elevador) e menu de pausa
js/minimapa.js             minimapa com névoa de exploração
js/texturas.js             texturas desenhadas em canvas (inclui o painel das portas)
js/som.js                  sons sintetizados (Web Audio)
js/jogo3d.js               cena, raycast de interação e laço principal

testes/testes.html            suíte que roda no navegador, sem Node.js (parser, regras, fases)
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

O **minimapa** só mostra o que já foi visto. No modo **local** (o padrão) ele fica centrado no
jogador e gira junto com a câmera: a sua frente é sempre "para cima", e um marcador **N** mostra
onde fica o norte. No modo **completo** aparece o andar inteiro com o norte fixo. Cada coisa tem
uma forma, não só uma cor: portas são traços com o número, alavancas são círculos com a letra
(na cor do valor), o terminal é um quadrado `T`, o elevador é o bloco `S` e a criatura é um anel
pulsando, que só aparece quando ela está perto. A escolha do modo fica salva.

**Tela cheia sem perder a pausa:** em tela cheia (F), o Esc do navegador sairia da tela cheia.
No Chrome/Edge o jogo captura o Esc (Keyboard Lock API): um toque pausa, e para sair da tela
cheia aperte F ou segure o Esc. Nos outros navegadores, P pausa sem sair da tela cheia.

## Criando novas fases
Edite `js/fases.js`. As fórmulas são escritas como texto:
`!` (não), `&` (e), `|` (ou), `->` (se...então), `<->` (se e somente se).
Exemplo: `"(A & !B) | C"`. O labirinto, as alavancas e as portas do novo andar são gerados sozinhos.

Depois, para conferir tudo:

**Sem instalar nada:** abra `testes/testes.html` no navegador (dois cliques). A suíte
testa o parser, a precedência, as tabelas-verdade, a classificação, as regras de
energia/vitória/apagão e a existência de solução em todas as fases.

**Com Node.js instalado:**
```
node testes/verificador_fases.js     # a fase tem solução? quantos movimentos no mínimo?
node testes/verificar_labirinto.js   # desenha o mapa e confere se tudo é alcançável
node testes/verificar_regras.js      # simula a partida com as regras do jogo
```

## Versão clássica 2D
`classico.html` mantém o puzzle original. Ela ganhou um link **← Voltar ao modo 3D** no topo
(alcançável com `Tab`; em tela estreita ele divide a primeira linha com o título) e duas
correções de consistência com o jogo 3D:
- a fase termina assim que a energia restante **não alcança mais nenhuma solução**,
  em vez de deixar o jogador virando alavancas sem saída (a mensagem explica se
  ainda faltavam viradas ou se nenhuma valoração abre todas as portas);
- `R` reinicia a fase, além do botão “Reiniciar fase”.

## Para a apresentação
- Ative o **Modo estudo** em Opções para desligar a criatura; o recorde não é afetado.
- O painel do elevador na tela de início pula para qualquer andar (pela pausa: "Sair para o menu").
- `H` abre a tabela dos conectivos a qualquer momento durante a partida.
- `index.html?demo` roda sem travar o mouse e expõe `depurar` no console do navegador
  (`depurar.passos = 8` acelera a simulação; foi assim que um bot jogou os cinco andares).

## O que mudou nesta versão
- Ajudas de raciocínio no tablet: avaliação passo a passo da valoração atual,
  referência dos conectivos (`H`) e dica das portas em que cada alavanca aparece.
- Modo estudo (sem criatura e sem recorde), recordes persistentes por andar e
  preferências de som/estudo no `localStorage`.
- Contador de portas e de energia, reinício rápido (`R`), mudo (`K`) e alavancas
  travadas depois que o elevador é liberado.
- Fallback de câmera: se o navegador bloquear a trava do mouse, o jogo aceita
  arrastar para olhar em vez de ficar preso no menu.
- Correção do apagão: ele também dispara quando ainda há energia, mas não há mais
  solução possível. A mesma regra foi levada à versão 2D.
- Selar uma contradição no terminal é gratuito e pode ser a última jogada mesmo com
  energia zero (necessário para o caminho ótimo do andar −5).
- Suíte de testes no navegador, sem depender de Node.js.
- Versão 2D com link de volta ao modo 3D (issue #5).

Nada disso muda o núcleo: as fases continuam sendo resolvidas avaliando fórmulas
proposicionais sobre as mesmas alavancas compartilhadas.
