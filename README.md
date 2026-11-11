# Wake Up Device

Aplicacao web para cadastrar e gerenciar dispositivos da rede local. Ela permite
ligar equipamentos por Wake-on-LAN e abrir enderecos locais ou externos
associados ao item.

## Funcionalidades

- Cadastro, edicao e exclusao de dispositivos.
- Envio de pacotes Wake-on-LAN para dispositivos cadastrados com endereco MAC.
- Acesso local e externo por IPv4 e porta configurados em cada dispositivo.
- Endereco IPv4 local usado para verificar por ping se um dispositivo ficou online.
- Vinculo opcional com uma instancia AWS EC2.
- Agendamentos recorrentes para ligar e desligar instancias EC2 pelo EventBridge Scheduler.
- Acoes dos cards representadas por icones do Font Awesome carregados localmente.
- Interface web responsiva renderizada no servidor.
- Persistencia dos dados em um arquivo SQLite.

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
- Instancias EC2: http://localhost:3000/ec2
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

A rota `/ec2` exibe a mesma interface de cards, mas somente dispositivos com uma
instancia EC2 vinculada. A busca nessa pagina continua filtrando por nome e tipo.

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
| `AWS_REGION` | Regiao AWS padrao usada pelo SDK | `us-east-1` |
| `AWS_SCHEDULER_ROLE_ARN` | IAM Role assumida pelo EventBridge Scheduler | vazio |
| `AWS_SCHEDULER_GROUP_NAME` | Grupo de schedules do EventBridge | `default` |
| `AWS_SCHEDULER_NAME_PREFIX` | Prefixo dos nomes dos schedules | `wake-up-device` |

`APP_PORT` altera somente a porta publicada pelo Docker Compose. O servidor
dentro do container continua ouvindo na porta `3000`.

## Wake-on-LAN

Defina `WOL_BROADCAST_ADDRESS` com o endereco de broadcast da rede dos
dispositivos. Para uma rede `192.168.1.0/24`, por exemplo:

```env
WOL_BROADCAST_ADDRESS=192.168.1.255
```

O valor padrao `255.255.255.255` pode permanecer dentro da rede bridge do
Docker. Prefira o broadcast dirigido da rede local e confirme que o firewall do
host permite trafego UDP de saida na porta 9.

## Agendamentos AWS

Edite um dispositivo e informe o ID da instancia EC2 e a regiao AWS. Depois,
abra a acao **Agendamentos AWS** no card do dispositivo para criar horarios
recorrentes de ligar e desligar.

Os horarios sao executados pelo EventBridge Scheduler, portanto a aplicacao nao
precisa estar em execucao no momento da acao. O Scheduler utiliza uma IAM Role
com as permissoes `ec2:StartInstances` e `ec2:StopInstances`.

A aplicacao precisa de permissoes para criar e administrar os schedules:

```text
scheduler:CreateSchedule
scheduler:UpdateSchedule
scheduler:DeleteSchedule
scheduler:GetSchedule
iam:PassRole
ec2:DescribeInstances
```

O SDK AWS usa a cadeia padrao de credenciais. Em producao, prefira uma IAM Role
do ambiente em vez de access keys armazenadas em arquivos ou no banco.

Nesta fase as rotas AWS ainda nao possuem autenticacao. Mantenha a aplicacao
restrita a uma rede confiavel ate que a autenticacao e a autorizacao sejam
implementadas.

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

O projeto ainda nao possui testes automatizados. O comando `npm test` e apenas
um placeholder e termina com erro.

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

A aplicacao nao possui autenticacao, autorizacao ou protecao contra CSRF.
Mantenha-a restrita a uma rede confiavel.
