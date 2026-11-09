# Worker Contract: Automação EC2

## CLI

O worker será instalado como pacote Python e executado pelo systemd:

```text
python -m ec2_worker.cli --tick
```

Opções previstas:

- `--tick`: executa um ciclo e termina; é o comando usado pelo timer.
- `--db-path PATH`: substitui `DB_STORAGE` somente para desenvolvimento/testes.
- `--log-level LEVEL`: substitui o nível configurado sem incluir segredos.
- `--dry-run`: limita o ciclo a decisões locais; não deve ser usado para burlar a
  distinção persistida entre `real` e `simulation`.

O comando não recebe instance ID, região, credencial ou ação mutável como
argumento. Esses valores vêm da configuração persistida ou de uma execução já
enfileirada.

## Ciclo `--tick`

1. Carrega e valida `DB_STORAGE`, timezone e limites operacionais.
2. Carrega `config/aws-ec2-regions.json` e rejeita uma configuração cuja região
   não esteja na allowlist local, sem fazer chamada AWS.
3. Marca runs `running` órfãos como `interrupted` sem re-enfileirar e mantém a
   trava da instância em `needs_reconciliation`.
4. Calcula o minuto atual em `America/Sao_Paulo`.
5. Usa `scheduler_cursor_utc` para materializar todas as ocorrências perdidas
   quando `recovery_enabled=1`; quando desabilitado, avança o cursor sem criar
   mutações atrasadas. A chave `occurrence_key` deduplica ticks e crashes.
6. Ordena o backlog por `scheduled_at_utc`, faz claim de uma ação real por vez e
   processa uma página sem descartar o restante.
7. Executa simulações sem criar cliente AWS.
8. Para runs `inspect`, consulta o estado e marca `observed` sem mutação. Para
   inspeções ligadas a `reconciles_run_id`, libera a trava somente após um estado
   definitivo; estados intermediários ou falha de consulta mantêm a reconciliação.
9. Para runs `start`/`stop` reais, consulta o estado e aplica a matriz de
   `data-model.md`.
10. Persiste resultado, erro sanitizado, timestamps, estado observado e vínculo
    `reconciles_run_id` quando aplicável.
11. Em timeout ou resposta perdida após mutação, marca `unknown`/`interrupted`,
    mantém a trava em `needs_reconciliation` e não reenvia a operação.
12. Retorna código `0` se o ciclo foi processado, mesmo havendo uma falha de uma
    execução; retorna código não zero somente para falha estrutural que impeça a
    leitura segura do banco ou da configuração.

Uma falha de uma ação não deve impedir o processamento dos próximos runs nem
encerrar definitivamente o serviço agendador.

## Configuração do processo

Variáveis não secretas previstas:

| Variável | Obrigatória | Finalidade |
| --- | --- | --- |
| `DB_STORAGE` | Sim | Caminho absoluto do SQLite compartilhado. |
| `AWS_PROFILE` | Não | Perfil que contém `credential_process`; não incluir segredo. |
| `AWS_DEFAULT_REGION` | Não | Fallback de região, subordinado à região persistida. |
| `WORKER_LOG_LEVEL` | Não | `INFO` por padrão. |
| `WORKER_MAX_RUNS_PER_TICK` | Não | `10` por padrão; pagina backlog sem descartá-lo. |
| `WORKER_READ_RETRIES` | Não | Limite pequeno para leituras AWS; mutações permanecem em uma tentativa. |

Credenciais serão resolvidas pelo provider chain do Boto3. A aplicação não deve
ler ou imprimir o conteúdo de `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, tokens,
certificados ou chaves privadas.

## systemd units

`wake-up-device-ec2.timer`:

- `OnCalendar=*-*-* *:*:00` para uma ativação por minuto;
- `Persistent=false` para não inventar um catch-up do systemd; o worker aplica a
  política `recovery_enabled` e o cursor durável;
- `AccuracySec=1s`;
- `Unit=wake-up-device-ec2.service`.

`wake-up-device-ec2.service`:

- `Type=oneshot` e `ExecStart=python -m ec2_worker.cli --tick`;
- usuário Unix dedicado sem shell administrativo;
- `TimeoutStartSec` menor que o intervalo do timer;
- `NoNewPrivileges=yes`, `PrivateTmp=yes` e proteção de filesystem compatível com
  o caminho local do SQLite e do pacote;
- stdout/stderr no journald;
- sem `EnvironmentFile` contendo credenciais.

O relógio do Raspberry Pi deve estar sincronizado. A unidade não deve ser criada
ou editada quando o operador altera schedules; apenas o banco muda.

## Error categories

O worker converte falhas externas em categorias estáveis:

- `network`: DNS, conexão ou endpoint indisponível;
- `auth`: credenciais ausentes, expiradas ou rejeitadas;
- `permission`: IAM sem ação ou recurso permitido;
- `not_found`: instância/região não encontrada;
- `throttled`: limite temporário da API;
- `timeout`: operação excedeu o timeout;
- `unknown`: falha não classificada ou resposta perdida.

Mensagens para a UI são curtas e em pt-BR; detalhes técnicos ficam no journald,
sem valores sensíveis.

## Transições e reconciliação

- O mesmo `requestId` manual é idempotente quando ação, modo e snapshot são
  iguais; intenção diferente para o mesmo ID resulta em `409`.
- Uma mutação real não pode ser reivindicada quando a instância possui uma trava
  `active` ou `needs_reconciliation`; inspeções e simulações são permitidas.
- `unknown` e `interrupted` são terminais e imutáveis. Uma nova ação só é aceita
  depois de uma inspeção com estado definitivo e deve carregar
  `reconciles_run_id`.
- Nenhuma chamada AWS ocorre dentro de uma transação SQLite; claims e alterações
  da trava usam somente transações curtas.
