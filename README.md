# Cartoon Loop

Editor de montagem de webtoons, em português, que funciona inteiramente no navegador. React, TypeScript, Vite, Konva, Zustand, Dexie, Radix UI e fflate. Sem backend, conta, API de imagem ou dependência de serviços externos em tempo de execução.

## Rodar

Requer Node.js 22.12+ ou 24 LTS e npm. No PowerShell, use `npm.cmd` se a política de execução bloquear `npm.ps1`.

```sh
npm ci
npm run dev
```

Abra `http://127.0.0.1:5173`. Para conferir a versão de produção:

```sh
npm run build
npm run preview
```

O resultado publicável fica em `dist/`. Sirva por HTTP/HTTPS; não abra `index.html` com `file://`, pois módulos, workers e armazenamento precisam de uma origem de navegador válida.

## Começar a montar

1. Crie um projeto. O padrão é uma página em branco de **800 × 10.000 px**.
2. Escolha um quadro na biblioteca. Ajuste sua largura em colunas, altura, formato, fundo e bordas no painel direito.
3. Arraste imagens do computador para dentro de um quadro. Soltar no espaço de trabalho cria um objeto solto. O botão Imagem usa o quadro selecionado visível ou o centro da região que você está vendo.
4. Acrescente balões ou textos. Dê duplo clique para escrever; mova o círculo do ponteiro para direcionar a fala. A Comic Neue, incluindo negrito e itálico, acompanha a aplicação.
5. Ajuste o ritmo com pausas e faixas de transição. Acrescente páginas manuais quando quiser começar outra sequência.
6. Use **Baixar projeto** para guardar uma cópia editável e **Exportar** para gerar as imagens finais.

As bibliotecas podem ser usadas por clique ou arraste. A aba Páginas e camadas permite localizar inclusive quadros sem borda e objetos soltos. Ambos os painéis laterais são recolhíveis.

### Encaixe e movimento

A organização automática usa 12 colunas: inteira, metade, um terço e dois terços. Dois quadros de metade cabem na mesma linha. A largura da janela e o zoom **não** mudam a composição. A alça mostra o redimensionamento ao vivo; no modo automático, a largura encaixa nas colunas. Arrastar um quadro passa seu posicionamento para Livre, permitindo deixar espaço à esquerda, à direita, acima ou abaixo. Os botões de alinhamento posicionam na margem esquerda, no centro ou na margem direita.

Guias magnéticas ajudam a alinhar bordas, centros, margens e tamanhos de quadros próximos; segure Alt para desativá-las. Quadros livres podem ultrapassar parcialmente a página: a parte externa fica recortada, sem perder a arte original. Cada arraste ou redimensionamento registra uma única ação de desfazer.

Quando uma linha não cabe, a linha inteira segue para uma página de continuação à direita. Uma página adicionada manualmente inicia uma sequência independente. Quadros em modo Livre podem ser posicionados e sobrepostos; não são redistribuídos. Redimensionar a moldura altera o recorte, não a escala das imagens. **Escalar quadro e conteúdo** transforma o conjunto explicitamente e passa o quadro para modo Livre.

Desative **Recortar conteúdo** para um quadro transbordar, ou ative **Pode sair da moldura** para um objeto específico. Isso conserva o vínculo ao quadro. O fluxo reserva o espaço vertical ocupado pelo transbordamento. Um conjunto maior que uma página é rejeitado sem alterar o projeto; reduza sua escala ou aumente a página.

Imagens podem passar de um quadro a outro preservando rotação, inversão e tamanho. Arraste para o espaço cinza ou escolha Desvincular para torná-las soltas. Com transbordamento ativado, arrastar para fora da moldura, mas ainda sobre sua página, conserva o vínculo.

Clique novamente em uma imagem selecionada para selecionar o quadro atrás dela; outro clique volta à imagem. Balões são independentes dos quadros e pertencem à página em que são colocados. Não afetam o fluxo, não são recortados pela moldura e não acompanham a exclusão ou a escala do quadro. Balões antigos vinculados a quadros são convertidos ao abrir ou importar, conservando suas coordenadas e transformações. Balões na área cinza continuam no projeto, mas não são exportados.

Em **Páginas e camadas**, as linhas superiores ficam na frente. Arraste para reordenar balões e quadros da mesma página, ou imagens e textos do mesmo quadro. Isso altera somente a sobreposição, não os vínculos ou a ordem do fluxo. Os comandos Frente e Trás também funcionam. Balões novos começam à frente.

### Atalhos

| Ação | Atalho |
| --- | --- |
| Navegar | Espaço + arraste, botão central ou rolagem do trackpad |
| Zoom no ponteiro | Ctrl/Cmd + rolar ou gesto de pinça |
| Vários objetos | Shift + clique ou arraste uma área no fundo |
| Ignorar magnetismo | Alt durante o arraste |
| Copiar / colar / duplicar | Ctrl/Cmd + C / V / D |
| Desfazer / refazer | Ctrl/Cmd + Z / Shift + Z |
| Salvar / baixar projeto | Ctrl/Cmd + S / Shift + S |
| Excluir | Delete ou Backspace |
| Mover objetos livres | Setas; Shift para passos de 10 px |
| Confirmar texto no canvas | Ctrl/Cmd + Enter |
| Ver atalhos | ? |

Copiar/colar objetos usa a área de transferência interna da sessão. Colar imagens do sistema também é suportado. Os atalhos não interceptam a digitação em campos. O histórico guarda até 100 operações na sessão; não acompanha o arquivo portátil.

## Salvar não é exportar

**Salvar** grava metadados e blobs no IndexedDB. Alterações são salvas automaticamente após 750 ms de inatividade, com estado real de sucesso/falha. Um bloqueio de escrita mantém a segunda aba em leitura. O botão Salvar força a gravação pendente.

**Baixar projeto** gera um `.cartoonloop`: um ZIP contendo `manifest.json` versionado e arquivos originais em `assets/`. Inclui objetos soltos. A importação verifica versão, vínculos, dimensões, limites, bytes e SHA-256 de cada imagem; sempre cria uma nova cópia, sem sobrescrever projetos existentes.

**Exportar** desenha o fundo de cada página, seus quadros visíveis, objetos vinculados e balões independentes da página, respeitando a ordem das camadas. Imagens e textos sem vínculo não entram, mesmo se estiverem visualmente sobre uma página. Conteúdo é recortado no limite da página. Nenhuma guia, seleção ou alça aparece. A prévia usa o mesmo desenho e as mesmas regras de vínculo, com imagens reduzidas para leitura.

- PNG, JPEG ou WebP. PNG é sem perdas; JPEG/WebP permitem qualidade ajustável. Transparência em JPEG recebe fundo branco.
- Página inteira: uma imagem por página com dimensões exatas. Duas páginas de 800 × 10.000 geram duas imagens dessas dimensões em um ZIP.
- Fatias: WEBTOON 800 × 1.280, Tapas com largura 940 e altura ajustável, ou dimensões personalizadas. Larguras diferentes escalam proporcionalmente a arte; a última fatia pode ser menor.
- Processamento sequencial com progresso e cancelamento. Falhas de dimensão/formato mostram erro e permitem escolher fatias, sem reduzir silenciosamente a imagem.

### Seus arquivos e a privacidade

As imagens não são enviadas a um servidor. O original fica preservado; prévias de até 1.400 px no maior lado são comprimidas no navegador, preferencialmente em Web Worker. A fonte e os ícones também são locais, sem CDN.

**Baixe backups regularmente.** Armazenamento do navegador tem quota e pode ser apagado pelo usuário ou pelo navegador. A persistência é solicitada quando disponível, mas não é uma garantia. Navegadores, perfis e origens diferentes têm bancos separados. O endereço de um projeto não compartilha seu conteúdo com outra pessoa.

Em falha de quota, o documento continua em memória e o download editável permanece disponível. Não feche a aba antes de baixar o backup. O navegador pode mostrar seu próprio aviso ao sair com alterações pendentes; as confirmações internas da aplicação são modais tematizados.

**Google Drive direto não está incluído nesta versão.** Guarde o `.cartoonloop` manualmente no Drive ou em outro serviço. Uma integração futura precisará de configuração OAuth e consentimento do titular da conta.

## Limites e compatibilidade

- Página: 320–1.600 px de largura e 1.000–16.000 px de altura.
- Até 20 páginas, 2.000 objetos, 250 MiB de imagens originais e 8 MiB de metadados/texto por projeto.
- Por imagem: PNG, JPEG ou WebP **estático**, até 20 MiB e 32 megapixels. GIF, SVG, APNG e WebP animado não entram.
- Zoom: 5%–400%. Canvas do editor limitado ao tamanho da janela, com descarte visual fora da região próxima. Cache de imagens decodificadas limitado a aproximadamente 96 MiB; um único original de 32 MP pode ultrapassar esse orçamento durante sua utilização.
- Edição para computador, a partir de 960 px de largura de janela. Em telas menores: projetos, importação, download e prévia de leitura.
- Testado em Chromium. Chrome/Edge atuais são a referência. Outros navegadores modernos podem ter limites de memória, armazenamento e codificação diferentes.
- O máximo de 20 páginas não significa que todos os dispositivos conseguem exportá-las inteiras com qualquer conteúdo. Prefira fatias em dispositivos com pouca memória.
- Sem colaboração em tempo real, desenho de ilustrações, edição destrutiva de imagens, sincronização em nuvem ou suporte offline garantido após recarregar a página sem rede.

## Publicar no GitHub Pages

Repositório: [malgany/cartoon-loop](https://github.com/malgany/cartoon-loop). A publicação é feita pelo workflow de GitHub Pages.

1. Crie um repositório no GitHub e envie o conteúdo deste diretório, incluindo `package-lock.json` e `.github/workflows/pages.yml`. Não envie `node_modules/` ou seus projetos pessoais.
2. Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions**.
3. Envie as alterações à branch padrão (`main` ou `master`) ou execute o workflow manualmente na branch padrão.
4. O workflow instala dependências, executa testes unitários, testes de interface, build e teste do build em subdiretório. A publicação só ocorre após sucesso.

O Vite usa `base: './'`, e as rotas usam hash (`#/project/ID`), permitindo publicar em uma subpasta sem regras de rewrite. Para um ambiente que exija base absoluta, configure `VITE_BASE_PATH=/nome-do-repositorio/` no build. A saída também pode ser servida por qualquer hospedagem estática HTTPS. [Documentação de deploy do Vite](https://vite.dev/guide/static-deploy.html#github-pages).

## Testar e desenvolver

```sh
npx playwright install chromium
npm test
npm run test:e2e
npm run test:static
npm run format
```

Em Linux/CI, use `npx playwright install --with-deps chromium`. Os testes usam bancos temporários dos contextos de teste, não os projetos do seu Chrome pessoal. `test:static` serve `dist/` em `/cartoon-loop/` e verifica atualização direta do hash, imagens, worker e fontes. Evidências de falha e screenshots ficam em `test-results/`; o relatório de interface em `playwright-report/`.

### Estrutura

- `src/core/model.ts`: schema v1 independente do Konva, limites e geometria de coordenadas.
- `src/core/layout.ts`: grade, transbordamento e continuação de sequências.
- `src/core/store.ts`: operações atômicas, seleção e histórico.
- `src/core/storage.ts`: IndexedDB, bloqueio de abas, importação e arquivo portátil.
- `src/core/image-format.ts` e `image.worker.ts`: validação e prévias.
- `src/core/drawing.ts`: desenho e medidas de texto compartilhados.
- `src/core/render.ts`: prévia, renderizador e exportação sequencial.
- `src/ui/`: projetos, canvas, bibliotecas, propriedades e componentes acessíveis.
- `tests/`: lógica, persistência, pixels, interações, quota simulada e build estático.

Geometrias de balões e máscaras são código vetorial original. Fontes Comic Neue e Inter usam SIL Open Font License; cópias estão em `public/licenses/` e acompanham o build. As imagens importadas e os direitos de uso são responsabilidade do autor.

Veja [REFERENCIAS.md](REFERENCIAS.md) para as convenções de formato e lettering que orientam os presets.
