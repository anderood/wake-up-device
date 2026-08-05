# Wake Up Device

Aplicacao web para cadastrar e gerenciar dispositivos da rede local. Ela permite
ligar equipamentos por Wake-on-LAN ou abrir um link externo associado ao item.

## Funcionalidades

- Cadastro, edicao e exclusao de dispositivos.
- Envio de pacotes Wake-on-LAN para dispositivos cadastrados com endereco MAC.
- Acesso direto a dispositivos e servicos cadastrados com link externo.
- Endereco IPv4 opcional para verificar por ping se um dispositivo ficou online.
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
- API: http://localhost:3000/api

O Docker Compose cria o arquivo SQLite em um volume persistente, aplica as
migracoes pendentes e somente depois inicia a aplicacao.

## Como usar

Ao cadastrar ou editar um dispositivo, informe nome, tipo, local e, se
disponivel, o endereco IPv4. Em seguida, escolha como o item deve funcionar:

- Se **Link externo** for **Sim**, informe uma URL iniciada por `http://` ou
  `https://`. O item recebera a acao **Acessar**.
- Se **Link externo** for **Nao**, informe o endereco MAC. O item recebera a
  acao **Ligar** para enviar um pacote Wake-on-LAN.

O endereco IPv4 nao e obrigatorio. Quando ele estiver configurado, a aplicacao
tentara confirmar por ping se o dispositivo ficou online depois do envio do
pacote Wake-on-LAN.

## Configuracao

Copie os valores necessarios de `.env.example` para um arquivo `.env`:

| Variavel | Finalidade | Padrao |
| --- | --- | --- |
| `APP_PORT` | Porta publicada pelo Docker Compose | `3000` |
| `DB_STORAGE` | Caminho do arquivo SQLite no desenvolvimento local | `wake-up-device.sqlite` |
| `WOL_BROADCAST_ADDRESS` | Endereco de broadcast usado pelo Wake-on-LAN | `255.255.255.255` |

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

O sucesso do envio confirma apenas que o pacote foi transmitido. Quando houver
um IPv4 cadastrado, a interface fara tentativas de ping por ate 60 segundos. A
falta de resposta nao prova que o dispositivo permaneceu desligado, pois ele
pode bloquear ICMP.

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
