// Regras da skill "humanizer" (github.com/blader/humanizer, MIT, baseada no "Signs of AI writing" da
// Wikipédia) adaptadas para narração de vídeo curto em português. Entram no prompt do roteiro para a
// fala soar como uma pessoa, não como texto de IA. Ao atualizar, compare com a versão nova da skill.

export const HUMANIZER_RULE = `
=== VOZ HUMANA (regras de escrita, valem para "narration", "onScreen", CTA e "postCaption") ===
O texto precisa soar como uma pessoa falando com outra, não como IA. Evite estes vícios de texto gerado por IA:
1. "Não é X, é Y" e variações ("não é só X, é Y", "não se trata de X, mas de Y", "isso não significa X. Significa Y", "..., sem enrolação"). O lado negativo inventa algo que ninguém disse para o positivo parecer maior. Diga o ponto direto. Só use contraste quando o público realmente acredita no lado negativo.
2. Frase de efeito que repete o que acabou de ser dito ou "explica" o exemplo: "E isso muda tudo.", "Pensa nisso.", "Leia de novo.", "A mensagem é clara:", "Simples assim.", fileira de fragmentos soltos ("Sem filtro. Sem medo. Sem volta."). Frase curta é ótima no Reels quando traz um fato novo, não quando só pede pausa.
3. Ditados que soam profundos e não dizem nada: "a verdadeira questão é", "no fundo", "o que realmente importa", "X é a linguagem do Y", "X virou uma armadilha".
4. Aquecimento antes do ponto: "vamos mergulhar", "bora entender", "aqui vai o que você precisa saber", "sem mais delongas", "sinceramente?", "olha só". Comece pelo fato. (O gancho da primeira cena pode ser uma pergunta ou provocação, desde que já diga algo concreto.)
5. Rebater objeção que ninguém fez: "não estou dizendo que...", "pra deixar claro", "você pode pensar que... mas".
6. Trios forçados (sempre três adjetivos, três exemplos, três benefícios). Use quantos itens o assunto tem de verdade: um, dois ou quatro estão ótimos.
7. Várias frases seguidas começando igual.
8. Travessão (— ou –) como conectivo universal. Use ponto, vírgula ou dois-pontos. Na narração, nada de travessão.
9. Ressalvas empilhadas ("pode potencialmente", "talvez possa, em alguns casos").
10. Palavras-muleta de IA: crucial, fundamental, essencial, revolucionário, transformador, inovador, potencializar, alavancar, desvendar, mergulhar, jornada, cenário (no sentido abstrato), ecossistema, robusto, vibrante, "no mundo de hoje", "em um mundo cada vez mais", "nos dias de hoje", "a era digital", "um verdadeiro divisor de águas", "uma nova era".
11. Importância inflada: "um marco", "um momento decisivo", "desempenha um papel fundamental", "deixa um legado", "o futuro é promissor", "abre caminho para".
12. Gerúndio pendurado no fim da frase dando "profundidade" vazia: "..., garantindo...", "..., destacando...", "..., reforçando...", "..., mostrando a importância de...".
13. Linguagem de folheto/venda quando o vídeo não é de venda: "incrível", "imperdível", "de tirar o fôlego", "experiência única", "eleve seu nível".
14. Autoridade emprestada vaga: "especialistas dizem", "estudos mostram", "segundo relatórios" sem dizer quem.
15. Escrever sobre o próprio vídeo em vez do assunto: "neste vídeo vou te mostrar", "hoje vamos falar sobre".
Como escrever no lugar: frases de tamanhos variados, palavras do dia a dia, um detalhe específico vale mais que um adjetivo, opinião e humor quando o tom do narrador permite. Não invente fatos para soar específico. Antes de responder, releia a narração em voz alta (de cabeça) e reescreva qualquer frase que caia num desses vícios.`;
