# Wake Up Device

Aplicacao web para cadastrar e gerenciar dispositivos da rede local. Ela permite
ligar equipamentos por Wake-on-LAN e abrir enderecos locais ou externos
associados ao item.

## Funcionalidades

- Cadastro, edicao e exclusao de dispositivos.
- Envio de pacotes Wake-on-LAN para dispositivos cadastrados com endereco MAC.
- Acesso local e externo por IPv4 e porta configurados em cada dispositivo.
- Endereco IPv4 local usado para verificar por ping se um dispositivo ficou online.
- Acoes dos cards representadas por icones do Font Awesome carregados localmente.
- Interface web responsiva renderizada no servidor.
- Persistencia dos dados em um arquivo SQLite.
- Agendamento semanal e auditoria de operacoes EC2.
- Worker Python independente com simulacao, reconciliacao e protecao contra
  repeticao de mutacoes AWS.

## Iniciar com Docker

### Requisitos

- Docker
- Docker Compose

As configuracoes padrao funcionam sem criar um arquivo `.env`. Para
personaliza-las, use `.env.example` como referencia.

```bash
docker compose up --build
```

A aplicacao ficara disponivel em:

- Interface web: http://localhost:3000
- API: http://localhost:3000/api

O Docker Compose cria o arquivo SQLite em um volume persistente, aplica as
migracoes pendentes e somente depois inicia a aplicacao.

## Como usar

Ao cadastrar ou editar um dispositivo, nome e tipo sao obrigatorios. Os destinos
abaixo sao opcionais e podem ser usados ao mesmo tempo:

- **Endereco IPv4 local**: adiciona a acao **Local** quando tambem existe porta
  de acesso e e usado na confirmacao por ping depois do Wake-on-LAN.
- **Endereco IPv4 externo**: adiciona a acao **Externo** quando tambem existe
  porta de acesso.
- **Porta de acesso**: e compartilhada pelos enderecos local e externo e so e
  obrigatoria quando a opcao **Porta configurada** esta habilitada.
- **Endereco MAC**: adiciona a acao **Ligar** para enviar Wake-on-LAN.

Por exemplo, os enderecos `192.168.1.6`, `100.100.10.10` e a porta `8080`
geram os links `http://192.168.1.6:8080` e
`http://100.100.10.10:8080`. Todas as acoes de acesso abrem uma nova aba.

## Configuracao

Copie os valores necessarios de `.env.example` para um arquivo `.env`:

| Variavel | Finalidade | Padrao |
| --- | --- | --- |
| `APP_PORT` | Porta publicada pelo Docker Compose | `3000` |
| `DB_STORAGE` | Caminho do arquivo SQLite no desenvolvimento local | `wake-up-device.sqlite` |
| `WOL_BROADCAST_ADDRESS` | Endereco de broadcast usado pelo Wake-on-LAN | `255.255.255.255` |
| `SESSION_SECRET` | Segredo das sessoes web server-side | obrigatorio em producao |
| `OIDC_ISSUER` | Issuer do provedor OIDC | obrigatorio para `/ec2` |
| `OIDC_CLIENT_ID` | Client ID OIDC | obrigatorio para `/ec2` |
| `OIDC_CLIENT_SECRET` | Client secret OIDC, quando o cliente for confidencial | opcional |
| `OIDC_REDIRECT_URI` | Callback registrado no provedor | `http://localhost:3000/auth/callback` |
| `AWS_REGION_FILE` | Allowlist offline de regioes EC2 | `config/aws-ec2-regions.json` |
| `WORKER_TIMEZONE` | Fuso do worker | `America/Sao_Paulo` |
| `WORKER_MAX_RUNS_PER_TICK` | Limite de runs por ciclo | `10` |
| `WORKER_READ_RETRIES` | Tentativas adicionais de leitura AWS | `2` |

`APP_PORT` define a porta usada pelo servidor. O Compose usa rede host para
permitir que os broadcasts Wake-on-LAN saiam pela interface do host.

## Automacao EC2

O console protegido esta em `/ec2`. Configure o provedor OIDC com o callback
exato de `OIDC_REDIRECT_URI`, aplique as migracoes e configure o mesmo caminho
absoluto de `DB_STORAGE` para o processo web e o worker. A allowlist regional e
offline e deve ser revisada somente por alteracoes versionadas em
`config/aws-ec2-regions.json`.

O worker nao recebe credenciais ou alvos pela linha de comando. Use a cadeia de
credenciais padrao da AWS, `credential_process` ou uma role da maquina. Para
instalar o worker localmente:

```bash
python3 -m venv .venv
.venv/bin/pip install -e './worker[test]'
DB_STORAGE=/var/lib/wake-up-device/wake-up-device.sqlite \
  .venv/bin/python -m ec2_worker.cli --tick
```

Os units em `deploy/` executam o servidor e um tick do worker a cada minuto
sob um usuario dedicado. Ajuste `WorkingDirectory`, caminhos e
`/etc/wake-up-device.env` antes de instalar os units.

## Wake-on-LAN

Defina `WOL_BROADCAST_ADDRESS` com o endereco de broadcast da rede dos
dispositivos. Para uma rede `192.168.1.0/24`, por exemplo:

```env
WOL_BROADCAST_ADDRESS=192.168.1.255
```

O valor padrao `255.255.255.255` pode permanecer dentro da rede bridge do
Docker. Prefira o broadcast dirigido da rede local e confirme que o firewall do
host permite trafego UDP de saida na porta 9.

O sucesso do envio confirma apenas que o pacote foi transmitido. Quando houver
um IPv4 local cadastrado, a interface fara tentativas de ping por ate 60
segundos. A falta de resposta nao prova que o dispositivo permaneceu desligado,
pois ele pode bloquear ICMP.

## Desenvolvimento local

O desenvolvimento sem Docker requer:

- Node.js 23.6 ou mais recente.
- Comando `ping` instalado no sistema.

Instale as dependencias e inicie o servidor com recarregamento automatico:

```bash
npm install
npm run dev
```

Para iniciar sem o nodemon:

```bash
npm start
```

Para verificar os tipos:

```bash
npx tsc --noEmit
```

Testes web e verificacoes de sintaxe:

```bash
npm run test:web
python3 -m compileall -q worker/src worker/tests
pytest worker/tests -q
```

O comando `npm test` permanece um placeholder e termina com erro.

## Migracoes

As migracoes sao executadas automaticamente pelo Docker Compose. Para aplica-las
manualmente em um ambiente local configurado pelo `.env`:

```bash
npm run db:migrate
```

## Encerrar a aplicacao

```bash
docker compose down
```

Para remover tambem o arquivo SQLite persistido no volume:

```bash
docker compose down --volumes
```

## Seguranca

As rotas EC2 exigem OIDC Authorization Code com PKCE, sessoes server-side em
SQLite e tokens CSRF nos POSTs. Credenciais AWS ficam somente no worker e nunca
sao aceitas por HTTP nem gravadas na auditoria. Ainda nao existem papeis de
autorizacao nem rate limiting; mantenha a aplicacao restrita a uma rede
confiavel.
