# Sistema de Notas — Google Sheets + Apps Script

Sistema de lançamento de notas e emissão de boletim para professores, feito com
HTML, CSS e JavaScript puro, Google Sheets como banco de dados e Google Apps
Script como integração. Cada professor implanta a própria cópia; não há login
próprio nem banco de dados externo.

Toda chamada à nuvem exige a **chave de acesso**: um texto criado uma única
vez no Apps Script e digitado pelo usuário na primeira abertura de cada
navegador. A chave nunca é gravada em arquivo nenhum, então a URL pode ir para
o site publicado sem abrir os dados — sem a chave, o script recusa qualquer
leitura ou gravação.

**Sem build.** A nuvem é configurada **uma única vez**, colando a URL do Apps
Script na variável `URL_APPS_SCRIPT` de `js/config.js`. Depois disso, qualquer
computador que tenha essa pasta (ou o site publicado com ela) abre o sistema
direto no Google Sheets, **sem login** — basta digitar a chave de acesso uma
vez por navegador.

## Como funciona

| Forma de abrir | O que configura | Precisa de login? |
| --- | --- | --- |
| `index.html` + `js/config.js` | a URL `/exec` no arquivo, uma vez | não |
| Link `/exec` do Apps Script | nada | não |

As duas usam a mesma planilha e a mesma pasta de backups. A primeira é a que
guarda a configuração no arquivo; a segunda é o atalho sem arquivo nenhum.

## Começando (uma vez, ~10 minutos)

1. Abra <https://script.google.com>, crie um **Novo projeto** e renomeie para
   **Sistema de Notas**.
2. Apague o conteúdo de `Código.gs` e cole todo o `appsscript.txt`. Salve.
3. **Crie a chave de acesso:** rode a função `gerarChaveAcesso` (botão
   *Executar* no editor) e copie a chave que aparece no log — ou abra
   **Configurações do projeto → Propriedades do script** e crie a propriedade
   `CHAVE_ACESSO` com a chave que você escolher (mínimo de 8 caracteres).
   Guarde essa chave em um lugar seguro: **quem tiver a chave acessa os dados**.
4. **Implantar → Nova implantação → Aplicativo da Web**, com:
   - **Executar como:** `Eu`
   - **Quem tem acesso:** `Qualquer pessoa`
5. Autorize os escopos e copie a URL que termina em **`/exec`**.

> **Por que “Qualquer pessoa”?** É o que permite abrir o sistema **sem estar
> logado** na sua conta. O script continua rodando com a sua conta (e a sua
> planilha), mas quem abre não precisa entrar no Google. A URL sozinha, porém,
> não basta: sem a chave de acesso criada no passo 3, o sistema não lê nem grava
> nada. Mesmo assim, não divulgue o endereço.

### Forma principal — a URL em `js/config.js`

1. Abra `js/config.js` e cole a URL entre as aspas:

   ```js
   var CONFIG = {
     URL_APPS_SCRIPT: 'https://script.google.com/macros/s/AKfycb.../exec',
     TEMPO_LIMITE_MS: 90000
   };
   ```

2. Salve e abra `index.html` (duplo clique). O sistema pede a **chave de
   acesso**: digite a criada no passo 3 e clique em **Salvar e conectar**. O
   rodapé da barra lateral mostra `· nuvem` e a faixa amarela de demonstração
   não aparece.
3. Leve a pasta para qualquer computador — ou publique o site (veja abaixo).
   O `config.js` vai junto, então a nuvem já está configurada desde a primeira
   abertura. Em cada navegador novo basta digitar a mesma chave uma vez; ela
   fica guardada naquele navegador.

O `js/config.js` faz parte do site publicado. Se você estiver com uma cópia
apenas do código (sem esse arquivo), crie-o a partir do modelo que fica na pasta
local:

```bash
copy js\config.example.js js\config.js     # Windows
cp js/config.example.js js/config.js       # Linux/macOS
```

Depois é só colar a URL e salvar. Sem esse arquivo (ou com a URL vazia), o
`index.html` abre em **modo demonstração**, com os dados no `localStorage`.

### Forma alternativa — o link `/exec`, sem arquivo

Se você também criar o arquivo HTML **`Index`** no projeto (menu **+** →
**HTML**), com o conteúdo de `apps-script/Index.html`, o próprio link `/exec`
abre a interface. Aí não é preciso `js/config.js` nem pasta nenhuma: funciona em
qualquer computador ou celular, também sem login — a chave de acesso continua
sendo pedida na primeira abertura.

Sem o `Index`, o link mostra a página **“No ar — API v1.0.0”**. Nesse caso, use
a forma principal com `index.html` + `js/config.js`.

## “A nuvem fica salva depois de configurar?”

Sim. Fora do navegador, nada fica em cookies nem no cache. A única coisa guardada
no navegador é a chave de acesso digitada pelo usuário:

| Informação | Onde fica | Limpar o navegador? |
| --- | --- | --- |
| URL do sistema | `js/config.js` (o arquivo) | não afeta |
| Chave de acesso | Propriedades do script, no Apps Script | pede a chave de novo |
| ID da planilha de dados | Propriedades do script, no Apps Script | não afeta |
| Quem pode acessar | Implantação / conta Google | não afeta |

Trocar de aparelho, usar aba anônima ou limpar o cache não muda nada na
configuração: basta abrir a mesma pasta ou o mesmo site e digitar a mesma
chave. Só a exclusão da implantação (o link muda), da chave (troque o valor da
propriedade) ou da planilha (restaure um backup) quebra a ligação.

## Chave de acesso

A chave é a credencial real do sistema. Ela existe **no servidor** (nas
Propriedades do script do Apps Script) e **no navegador de quem usa** (digitada
uma vez e guardada no `localStorage`). Ela **nunca** entra em `js/config.js`,
nem em nenhum outro arquivo do repositório.

### Criando a chave (uma vez por professor)

Três formas, todas no próprio projeto do Apps Script:

1. **Automática:** no editor, selecione a função `gerarChaveAcesso` e clique
   em *Executar*. A chave (`sn-` + 32 caracteres) é gerada, guardada e mostrada
   no log da execução.
2. **Manual:** **Configurações do projeto → Propriedades do script → Adicionar
   propriedade** com nome `CHAVE_ACESSO` e o valor que você escolher (mínimo de
   8 caracteres).
3. **Pela planilha:** se o script estiver vinculado a uma planilha, use o menu
   **Sistema de Notas → Definir chave de acesso**.

### Como é o uso no dia a dia

- Na **primeira abertura** em cada navegador, o sistema abre um campo pedindo a
  chave. Digitou, clicou em **Salvar e conectar**: fica gravada naquele
  navegador e não é pedida de novo.
- Em **outro computador, celular ou aba anônima**, é só digitar a **mesma
  chave** — ela não está amarrada a nenhum aparelho.
- Para **trocar** (ou se alguém souber a antiga): altere o valor da propriedade
  `CHAVE_ACESSO` no Apps Script. A chave antiga deixa de valer na hora e todos
  os navegadores passam a pedir a nova. O botão **Chave de acesso**, no rodapé
  da barra lateral, reabre o campo a qualquer momento.
- **Sem chave configurada no servidor**, o sistema recusa tudo e mostra a
  instrução de como criá-la. Não há como pular essa etapa.

### Um sistema por professor

A chave pertence ao **Apps Script**, não ao site. Se cada professor implanta a
própria cópia, cada um define a **própria chave** e vê **só os próprios
dados**. Usar a URL de outro professor (com a chave dele) seria usar os dados
dele — por isso o modelo é sempre **1 professor = 1 Apps Script = 1 planilha =
1 chave**.

## Publicar num site (opcional)

Para abrir por um **link** em qualquer computador, sem levar a pasta, publique
o site em GitHub Pages, Netlify ou Vercel. O `.gitignore` já está preparado
para o **site enxuto**: versiona `index.html`, `css/`, `js/` (incluindo o
`config.js`), `README.md` e ele mesmo; o backend, a documentação e os scripts
ficam apenas na pasta local.

1. Preencha `js/config.js` com a URL que termina em `/exec`.
2. Faça `git add .`, `git commit` e `git push`.
3. No GitHub, abra **Settings → Pages** e publique a branch `main`, pasta
   **`/ (root)`**.

Não escolha a pasta `/docs`: ela guarda a fonte do guia e não é versionada.

> **Sobre a chave:** ao publicar, a URL do Apps Script fica visível no código da
> página, mas isso **não** abre os dados: toda chamada é recusada sem a chave de
> acesso, que não vai para o repositório e é digitada por cada usuário na
> primeira abertura. Quem visitar o site sem a chave só vê o campo da chave (ou
> o modo demonstração). Guarde a chave fora do repositório — é ela que protege
> as notas.

## O que o sistema faz

- Turmas organizadas por ano, com várias matérias por turma.
- Alunos adicionados manualmente ou importados por lista, CSV/TXT ou link do
  Google Sheets, com modelo de planilha pronto em `modelos/`.
- Avaliações ilimitadas por matéria e bimestre, com pesos em `%`.
- Média ponderada do bimestre e média final pela média aritmética dos bimestres
  com notas (o “quinto conceito”).
- Médias editáveis: clique na média do bimestre ou na média final para digitar
  um valor manual; em branco, o sistema volta ao cálculo automático.
- Boletim por matéria e resumo geral, com indicadores de resultado parcial e
  impressão.
- Aba **Notas** com média por aluno já contando **nota em falta como 0** (o
  peso do que ainda não foi lançado entra na conta; sem nota nenhuma em
  bimestre com avaliação, a célula mostra 0,0), linha “Média da turma”
  contando aluno sem nota como zero e a média manual intocada.
- Tela **Alunos de recuperação** agrupada **por matéria**: para cada matéria,
  quem ficou com a média do semestre abaixo de 5,0 — ((média 1º bim. + média
  2º bim.) ÷ 2) no 1º semestre e o mesmo com 3º e 4º no 2º —, com os casos de
  recuperação nos dois semestres marcados. **Nota em falta vale 0**: o peso da
  avaliação sem nota conta como zero e a conta segue normalmente (aluno sem
  nota nenhuma aparece com 0,0). Calculado ao abrir a página (nada é gravado) e
  com botão para gerar o PDF (um bloco por matéria). Os cartões do topo contam
  alunos, não recuperações, e a legenda explica a contagem. Botão em **Turmas →
  Dados de teste** cria duas turmas de exemplo (com aprovados e com recuperação
  no 1º, no 2º e nos dois semestres) e o mesmo botão os apaga.
- Backup semanal em JSON no Google Drive e restauração de emergência pela
  interface, com backup de segurança automático antes de restaurar.
- Chave de acesso que bloqueia qualquer leitura ou gravação sem ela — inclusive
  para quem tiver a URL da implantação.

## Documentação

> Estes arquivos ficam na pasta local e **não** são publicados no GitHub Pages.

- [`SISTEMA.md`](SISTEMA.md) — arquitetura, modelo de dados, regras de cálculo,
  importação, backup, conexão com a nuvem, segurança e problemas comuns.
- `Guia-Nuvem-e-Backup.pdf` — guia ilustrado de ativação da nuvem e do backup.
  A fonte editável está em `docs/guia-nuvem-backup.html`; o PDF é gerado pelo
  Chrome com `--print-to-pdf`.

## Estrutura

```
index.html             interface em arquivos separados (abre com config.js)
css/                   estilos separados por responsabilidade
js/                    frontend separado por funcionalidade (views/ incluído)
js/config.js           URL do Apps Script (vai para o repositório do site)
js/config.example.js   modelo local, sem URL (não vai para o repositório)
apps-script/
  Index.html           interface empacotada em um HTML único (opcional, p/ /exec)
appsscript.txt         backend completo do Apps Script (Código.gs)
appsscript.json        manifesto do projeto (fuso, escopos e web app)
scripts/empacotar.js   regenera apps-script/Index.html (opcional)
docs/
  guia-nuvem-backup.html  fonte do guia em PDF
modelos/
  modelo-importacao-alunos.xlsx  planilha pronta para preencher
  modelo-importacao-alunos.csv   mesmo conteúdo em CSV
  LEIA-ME.txt        instruções resumidas do modelo
.gitignore             o que vai e o que não vai para o GitHub Pages
```

No repositório público entram apenas `index.html`, `css/`, `js/`, `README.md`,
`modelos/` e `.gitignore`. Backend, guia, PDF e scripts continuam na pasta local
para manutenção, mas não são publicados.

Depois de alterar `css/` ou `js/`, regenere o pacote que vai para o `/exec`:

```bash
node scripts/empacotar.js
```

É Node.js puro, sem `npm install` e sem pasta `dist/`. Não é necessário para
usar o sistema nem para o fluxo com `js/config.js`.

## Publicar no GitHub

O repositório é o **site enxuto**. O `.gitignore` versiona `index.html`,
`css/`, `js/` (com `js/config.js`), `README.md`, `modelos/` (os três arquivos
do modelo) e ele mesmo, e bloqueia:

- `js/config.js` **não** é bloqueado: ele precisa ir junto para o site abrir
  conectado (veja o aviso de segurança acima);
- `.clasprc.json` e `.clasp.json` — credenciais e configuração local do clasp;
- `backup-notas-*.json`, `backups/`, `*.csv`, `*.xlsx` — dados reais de alunos
  (os arquivos de `modelos/` são a exceção: são nomes fictícios e vão junto);
- `appsscript.txt`, `appsscript.json`, `apps-script/`, `scripts/`, `docs/`,
  `Guia-Nuvem-e-Backup.pdf`, `SISTEMA.md` e `js/config.example.js` — ficam só
  na pasta local;
- `node_modules/`, `dist/`, arquivos de sistema e temporários.

Antes do primeiro `git push`, confira com `git status` se nada disso aparece na
lista. Se um arquivo sensível já tiver sido commitado, apagar depois não basta:
ele continua no histórico e a implantação deve ser revogada (criar outra).

```bash
git init
git add .
git commit -m "Sistema de Notas"
```

## Limitações

- Um professor por implantação; sem multiusuário.
- Quatro bimestres fixos e notas entre 0 e 10.
- Limite de 16 backups e cotas do Apps Script/Drive.
- Com acesso **Qualquer pessoa**, a URL não é mais a única credencial: sem a
  chave de acesso nada é lido nem gravado. Ainda assim, não divulgue o endereço
  nem a chave.
