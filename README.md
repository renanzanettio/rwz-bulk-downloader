# Baixador em massa

Baixa uma sequência de arquivos numerados (episódios, aulas, capítulos, áudios) direto para uma pasta do seu computador, com fila, progresso por arquivo e velocidade total. Tudo roda no navegador: não existe servidor nem proxy no meio, e nada é enviado a lugar nenhum além das requisições que você mesmo configura.

## Como usar

1. Cole um **link de exemplo** de um dos arquivos. A página troca o número da URL por `{n}` e monta o **modelo da URL**. Você também pode escrever o modelo à mão.
2. Defina o **primeiro** e o **último número**.
3. Escolha o **nome dos arquivos** e a **pasta de destino**.
4. Clique em **Baixar tudo**. Se parar no meio, o botão vira **Continuar download** e pula o que já terminou. As configurações ficam salvas no navegador.

### Modelo da URL

| Escreva | Vira (número 7) |
| --- | --- |
| `{n}` | `7` |
| `{nn}` | `07` |
| `{nnn}` | `007` |

Exemplo: `https://servidor/aulas/aula-{nn}.mp4`, de 1 a 12, baixa `aula-01.mp4` até `aula-12.mp4`.

O mesmo vale para o **nome dos arquivos** (`Aula {nn}`). A extensão é adicionada sozinha, a partir da URL ou do tipo do arquivo. Se o servidor numera a partir de 0 e você quer o arquivo 01, use **Somar ao número no nome** = 1.

## Casos de uso

- **Conteúdo de domínio público no Stremio.** O Stremio mantém um servidor local (`http://127.0.0.1:11470/<hash>/<índice>`) que entrega os episódios por HTTP. Com o Stremio aberto, cole o link de um episódio: a página reconhece o formato, começa em 0 e numera os arquivos a partir de 01. Assim dá para baixar uma temporada inteira de uma obra em domínio público ou de licença aberta, em vez de baixar episódio por episódio.
- **Seu próprio servidor**: NAS, Jellyfin, um servidor caseiro ou um Raspberry Pi com arquivos em URLs previsíveis, para copiar uma pasta de vídeos, áudios ou PDFs para o PC.
- **Aulas, palestras e gravações** que você tem permissão para baixar e cujas URLs seguem um padrão (`aula-01.mp4`, `aula-02.mp4`...).
- **Coleções abertas**, como obras em domínio público, projetos de licença livre e acervos públicos, desde que o servidor permita acesso pelo navegador (veja CORS abaixo).
- **Legendas, capítulos em PDF, faixas de áudio** e qualquer outra sequência numerada.

Use apenas com conteúdo que você tem o direito de baixar. A ferramenta não verifica direitos autorais; essa responsabilidade é de quem usa.

## Limitações

- **CORS.** Como roda no navegador, só baixa de servidores que permitem esse acesso (cabeçalho `Access-Control-Allow-Origin`). O servidor local do Stremio permite. Muitos sites não, e nesse caso aparece "Não foi possível acessar a URL". Isso é uma regra do navegador, e não há como contornar sem um proxy. Por segurança e custo, a ferramenta não inclui um.
- **Salvar em pasta** usa a File System Access API, disponível em **Chrome e Edge**. Em outros navegadores o arquivo passa pela memória antes de ser salvo, e arquivos grandes podem falhar.
- **Torrent.** Se a origem é um torrent (como no Stremio), os downloads simultâneos dividem a mesma banda. O limite é 3 e o padrão é 1.
- **Retomar** reinicia o arquivo que estava em andamento. Os já concluídos são pulados.

## Rodar localmente

```bash
npm install
npm run dev
```

## Publicar na Vercel

É um site estático em Vite, e a Vercel detecta tudo sozinha.

1. Suba esta pasta para um repositório no GitHub.
2. Na Vercel, **Add New Project**, importe o repositório e clique em **Deploy** (build `npm run build`, saída `dist`).

Ou, sem GitHub: `npx vercel` dentro da pasta.

A Vercel só hospeda a página. Os downloads continuam saindo do seu navegador direto para o servidor de origem. Dois cuidados:

- **Servidor local (Stremio, NAS) a partir de um site público.** Pelo que consta na documentação do Chrome, a partir da versão 142 um site público que acessa `localhost` ou a rede local aciona a permissão "Local Network Access". É preciso clicar em **Permitir** quando o aviso aparecer. Rodando em `localhost` com `npm run dev`, esse aviso não aparece.
- **HTTP em página HTTPS.** Servidores locais costumam usar `http://`. O Chrome libera isso para endereços locais; para um servidor público só com HTTP, o navegador bloqueia.

## Estrutura

```
index.html      estilos e ponto de entrada
src/main.jsx    monta o React
src/App.jsx     toda a lógica e a interface
```
