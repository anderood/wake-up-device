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
conexao interna com o MySQL e cria automaticamente a tabela `devices` na
primeira inicializacao.

## Encerrar a aplicacao

```bash
docker compose down
```

Para remover tambem os dados persistidos do MySQL:

```bash
docker compose down --volumes
```

## Desenvolvimento local

Com Node.js 23.6 ou mais recente e um MySQL configurado pelo `.env`:

```bash
npm install
npm run dev
```

Para verificar os tipos:

```bash
npx tsc --noEmit
```
