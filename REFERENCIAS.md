# Formato, quadros e lettering

Pesquisa aplicada ao Cartoon Loop; não trata de light novels ou de recomendações de histórias. Referências consultadas em 8 de setembro de 2026. Os presets são pontos de partida editoriais, não uma classificação universal obrigatória.

## Quatro decisões diferentes para um quadro

| Decisão | Opções no editor | Efeito |
| --- | --- | --- |
| Proporção inicial | 1:1, 16:9, 2:3, 4:1, 1:3, largura total | Ritmo e enquadramento inicial, com altura editável |
| Geometria | Retângulo, arredondado, oval, diagonal | Forma da máscara e da moldura |
| Acabamento | Fundo sólido/transparente, borda/sem borda | Aparência visível da moldura |
| Relação com a arte | Recorte ou transbordamento | Arte contida ou ultrapassando os limites do quadro |

Um quadro sem borda continua sendo um contêiner. Um quadro com transbordamento continua sendo dono de suas imagens. São situações diferentes de uma imagem solta na área de trabalho. Essa separação é uma decisão de modelagem do produto para permitir composições flexíveis e exportações previsíveis.

## Leitura vertical e transições

O manual da WEBTOON aborda composição para rolagem vertical e o preparo de arquivos para publicação. A largura de 800 px e o fatiamento de 1.280 px são usados pelo preset de exportação; a página longa de trabalho não é a mesma coisa que cada arquivo enviado à plataforma. [WEBTOON — Creator Resource Handbook](https://webtoons-static.pstatic.net/creator101/en/pdf/Creators-Resource-Handbook-Updated.pdf).

Tapas indica largura de 940 px para páginas de quadrinhos e limites próprios para upload. O editor oferece a largura correspondente, mas não promete que toda exportação estará automaticamente dentro da quota em bytes da plataforma: isso depende da arte e da compressão. [Tapas — File Size Overview](https://help.tapas.io/hc/en-us/articles/360052100813-File-Size-Overview).

Pausas de 80, 200 e 600 px, a grade de 12 colunas e as proporções da biblioteca são escolhas do Cartoon Loop. Pausas curtas aproximam momentos, espaços maiores podem sugerir espera, suspense ou mudança de cena. Faixas com cor/degradê permitem uma transição visual. O significado final depende da sequência criada pelo autor.

## Balões

A Blambot documenta convenções de lettering como balões regulares, pensamento, grito, sussurro, transmissão eletrônica, voz enfraquecida/trêmula e caixas de narração. Isso orientou os oito presets, sem copiar fontes comerciais ou ilustrações da referência. Contornos tracejados sugerem sussurro, bordas explosivas sugerem intensidade, pequenas bolhas indicam pensamento e caixas funcionam como narração. São convenções, não regras obrigatórias. [Blambot — Comic Book Grammar & Tradition](https://blambot.com/pages/comic-book-grammar-tradition).

Comic Neue foi escolhida como fonte de lettering legível e redistribuível. Não há uma única fonte obrigatória de webtoon. A família incluída suporta regular, negrito e itálico e vem com sua licença. [Google Fonts — Comic Neue](https://github.com/google/fonts/tree/main/ofl/comicneue).

## Limites técnicos adotados

WebP tem limite dimensional de 16.383 × 16.383 pixels; o editor limita a altura das páginas a 16.000 e a largura a 1.600. Esses limites são do produto, não dimensões universais de webtoon. [Google — WebP FAQ](https://developers.google.com/speed/webp/faq).

IndexedDB e persistência não substituem backups: quotas e políticas de descarte dependem do navegador. Por isso há salvamento transacional, indicação de falha, pedido de persistência quando suportado e arquivo portátil com imagens originais. [MDN — Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
