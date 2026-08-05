# Wake Up Device

Aplicacao web para cadastrar e gerenciar dispositivos da rede local.

## Requisitos

- Docker
- Docker Compose

## Iniciar a aplicacao

As configuracoes padrao funcionam sem criar um arquivo `.env`. Para
personaliza-las, use `.env.example` como referencia.

```bash
docker compose up --build
```

A aplicacao ficara disponivel em:

- Interface web: http://localhost:3000
- API: http://localhost:3000/api

Use `APP_PORT` no `.env` para alterar a porta publicada. O Compose configura a
conexao interna com o MySQL, cria a tabela `devices` na primeira inicializacao
e aplica as migracoes pendentes antes de iniciar a aplicacao.

## Wake-on-LAN

Defina `WOL_BROADCAST_ADDRESS` no `.env` com o endereco de broadcast da rede dos
dispositivos. Para uma rede `192.168.1.0/24`, por exemplo:

```env
WOL_BROADCAST_ADDRESS=192.168.1.255
```

O valor padrao e `255.255.255.255`, mas esse broadcast pode permanecer dentro da
rede bridge do Docker. Prefira o broadcast dirigido da rede local e confirme que
o firewall do host permite trafego UDP de saida na porta 9.

O botao **Ligar** envia o pacote para o endereco MAC cadastrado. Quando o
dispositivo tambem possui um IPv4, a interface tenta confirmar por ping durante
ate 60 segundos. A falta de resposta nao significa necessariamente que o
dispositivo permaneceu desligado, pois ele pode bloquear ICMP.

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

Para remover tambem os dados persistidos do MySQL:

```bash
docker compose down --volumes
```

## Desenvolvimento local

Com Node.js 23.6 ou mais recente, o comando `ping` e um MySQL configurado pelo
`.env`:

```bash
npm install
npm run dev
```

Para verificar os tipos:

```bash
npx tsc --noEmit
```
