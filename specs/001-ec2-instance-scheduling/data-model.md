# Data Model: Agendamento de Instância EC2

As migrations Sequelize/Umzug do Node permanecem a autoridade de criação e
alteração das tabelas. O worker Python lê e escreve somente com SQL parametrizado,
usando os mesmos nomes snake_case e o mesmo arquivo `DB_STORAGE`.

A allowlist regional compartilhada fica em `config/aws-ec2-regions.json`; o
controller web e o worker rejeitam regiões ausentes antes de qualquer chamada AWS.

## `ec2_config`

Singleton da instância autorizada e das políticas gerais.

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `id` | INTEGER | Sim | Primary key; somente valor `1` é permitido. |
| `instance_id` | VARCHAR(19) | Sim | ID EC2 no formato `i-` seguido de 8 ou 17 hexadecimais. |
| `region` | VARCHAR(32) | Sim | Região presente na allowlist compartilhada, não vazia; deve corresponder à instância. |
| `timezone` | VARCHAR(64) | Sim | MVP exige `America/Sao_Paulo`. |
| `recovery_enabled` | INTEGER | Sim | `0` por padrão; `1` processa todas as ocorrências perdidas. |
| `scheduler_cursor_utc` | TEXT | Não | Último instante de calendário materializado pelo worker, em ISO-8601 UTC. |
| `revision` | INTEGER | Sim | Incrementa em cada atualização; usado para rastrear configuração observada. |
| `updated_at` | TEXT | Sim | ISO-8601 UTC. |

**Invariantes**:

- Deve existir no máximo uma linha; a aplicação cria ou atualiza `id = 1`.
- A alteração não remove histórico de execuções já criadas.
- Quando `recovery_enabled = 0`, o cursor avança sobre períodos perdidos sem criar
  mutações atrasadas. Quando `recovery_enabled = 1`, cada ocorrência entre o
  cursor e o instante atual é materializada em ordem cronológica.
- Ações pendentes guardam snapshot de `instance_id` e `region` para não mudar de
  alvo silenciosamente após uma edição.

## `ec2_transition`

Trava durável de uma transição real ou de uma execução que exige reconciliação.
Existe no máximo uma linha para a instância singleton e não substitui o ledger de
auditoria.

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `instance_id` | TEXT | Sim | Chave da instância controlada; única. |
| `state` | TEXT | Sim | `active` ou `needs_reconciliation`. |
| `run_id` | INTEGER | Sim | Run real que detém a trava. |
| `updated_at` | TEXT | Sim | ISO-8601 UTC. |

**Invariantes**:

- Uma transição real `active` ou `needs_reconciliation` bloqueia outra mutação
  real equivalente para a mesma instância.
- Inspeções e simulações não adquirem a trava.
- `unknown` e `interrupted` mantêm a trava em `needs_reconciliation` até uma
  inspeção observar um estado definitivo.
- Liberar a trava não altera o run original; uma nova ação usa
  `ec2_run.reconciles_run_id` para manter o vínculo de auditoria.

## `auth_session`

Sessão opaca server-side criada depois da validação OIDC. Tokens do provedor não
são persistidos.

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `sid` | TEXT | Sim | Identificador aleatório e único, sem dados da identidade. |
| `issuer` | TEXT | Sim | Issuer OIDC validado. |
| `subject` | TEXT | Sim | Claim `sub` validada; não usar e-mail como identidade. |
| `data` | TEXT | Sim | Dados mínimos da sessão e token CSRF, sem access/refresh token. |
| `created_at` | TEXT | Sim | ISO-8601 UTC. |
| `last_access_at` | TEXT | Sim | ISO-8601 UTC. |
| `expires_at` | TEXT | Sim | Timeout absoluto da sessão. |

**Invariantes**:

- `sid` não pode aparecer em URLs ou logs.
- Sessões expiradas são rejeitadas e removidas sem consultar a AWS.
- O ID da sessão é regenerado após callback OIDC bem-sucedido.

## `ec2_schedule`

Uma ação semanal habilitada para um dia e horário local.

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `id` | INTEGER | Sim | Primary key autoincrement. |
| `action` | TEXT | Sim | Enum lógico `start` ou `stop`. |
| `weekday` | INTEGER | Sim | `1` segunda-feira até `7` domingo. |
| `local_time` | TEXT | Sim | Formato estrito `HH:MM`, hora `00:00` a `23:59`. |
| `enabled` | INTEGER | Sim | `0` ou `1`; padrão `1`. |
| `updated_at` | TEXT | Sim | ISO-8601 UTC. |


- `UNIQUE(action, weekday)` impede duas ações iguais no mesmo dia.
- No máximo uma agenda de início e uma de desligamento por dia no MVP.
- O horário é interpretado como horário local da configuração, nunca como offset
  fixo. `zoneinfo` determina o offset vigente.

## `ec2_run`

Fila durável e registro de auditoria de cada decisão ou solicitação.

| Campo | Tipo | Obrigatório | Regras |
| --- | --- | --- | --- |
| `id` | INTEGER | Sim | Primary key autoincrement. |
| `idempotency_key` | TEXT | Sim | Unique; automático `automatic:<schedule_id>:<scheduled-instant>`, manual UUID. |
| `occurrence_key` | TEXT | Não | Chave estável da ocorrência automática; nula para ações manuais. |
| `source` | TEXT | Sim | `automatic` ou `manual`. |
| `mode` | TEXT | Sim | `real` ou `simulation`. |
| `action` | TEXT | Sim | `start`, `stop` ou `inspect`; `inspect` é somente consulta manual. |
| `instance_id` | TEXT | Sim | Snapshot do alvo no momento do enqueue. |
| `region` | TEXT | Sim | Snapshot da região no momento do enqueue. |
| `config_revision` | INTEGER | Sim | Revisão usada para criar a execução. |
| `schedule_id` | INTEGER | Não | FK lógica para `ec2_schedule` em runs automáticos. |
| `scheduled_date` | TEXT | Não | Data local `YYYY-MM-DD` para runs automáticos. |
| `scheduled_time` | TEXT | Não | Hora local `HH:MM` para runs automáticos. |
| `scheduled_at_utc` | TEXT | Não | Instante UTC calculado para a ocorrência automática. |
| `schedule_revision` | INTEGER | Não | Revisão da agenda usada para materializar a ocorrência. |
| `actor_issuer` | TEXT | Não | Emissor OIDC da sessão que criou uma ação manual. |
| `actor_subject` | TEXT | Não | `sub` OIDC da sessão que criou uma ação manual. |
| `reconciles_run_id` | INTEGER | Não | Run `unknown`/`interrupted` ou inspeção anterior que fundamenta a nova ação. |
| `status` | TEXT | Sim | `queued`, `running`, `requested`, `observed`, `noop`, `skipped`, `simulated`, `failed`, `interrupted`, `unknown` ou `conflict`. |
| `claim_token` | TEXT | Não | Token interno de claim do worker. |
| `requested_at` | TEXT | Sim | ISO-8601 UTC. |
| `started_at` | TEXT | Não | ISO-8601 UTC. |
| `finished_at` | TEXT | Não | ISO-8601 UTC. |
| `observed_state` | TEXT | Não | Estado EC2 retornado antes da decisão. |
| `result` | TEXT | Não | Mensagem segura e compreensível em pt-BR. |
| `error_code` | TEXT | Não | Categoria sanitizada: `network`, `auth`, `permission`, `not_found`, `throttled`, `timeout` ou `unknown`. |
| `error_message` | TEXT | Não | Nunca inclui token, secret, header ou conteúdo de credencial. |

**Invariantes e índices**:

- `UNIQUE(idempotency_key)` torna a criação automática e manual idempotente.
- `UNIQUE(occurrence_key)` torna a materialização de cada ocorrência idempotente.
- Índice parcial único em `instance_id` para `mode = 'real'` e status `running`
  impede parte das mutações reais concorrentes; `ec2_transition` também bloqueia
  estados `requested` e `needs_reconciliation`, enquanto várias ocorrências
  automáticas podem permanecer `queued` para formar o backlog de recuperação.
- Uma execução `running` encontrada no início do worker é marcada `interrupted`,
  nunca re-enfileirada automaticamente.
- `requested` significa que a AWS aceitou a solicitação; não significa que o
  estado final já foi alcançado.
- `observed` representa uma consulta manual concluída, sem mutação da instância.
- `noop` significa que o estado já era o desejado; `skipped` significa estado
  intermediário ou final não elegível; `simulated` não chama a AWS.
- `unknown` representa timeout ou resposta perdida depois de uma mutação; não pode
  ser repetido automaticamente. `conflict` representa ocorrências simultâneas
  incompatíveis que exigem resolução manual.
- O mesmo `requestId` manual é idempotente quando a intenção é igual; intenção
  diferente para o mesmo ID e mutação real concorrente retornam `409`.

## Relationships

```text
ec2_config (1) ──< ec2_schedule
ec2_config (1) ──< ec2_run
ec2_schedule (0..1) ──< ec2_run
ec2_transition (1) ──1 ec2_run (holder)
ec2_run (0..1) ──< ec2_run (reconciles_run_id)
```

As relações com configuração são lógicas, pois snapshots em `ec2_run` precisam
continuar legíveis mesmo depois de uma alteração da configuração. A exclusão de
uma agenda não deve apagar auditoria.

## State Transitions

```text
queued -> running -> requested
                  -> observed
                  -> noop
                  -> skipped
                  -> simulated
                  -> failed
                  -> interrupted
                  -> unknown
                  -> conflict
queued -> failed
running -> interrupted  (crash/restart, sem replay)
```

The transition gate follows the real mutation lifecycle:

```text
absent -> active -> absent
active -> needs_reconciliation
needs_reconciliation -> absent  (inspect observes a definitive state)
```

Runs in `unknown` or `interrupted` are immutable terminal audit records. A new
manual action after inspection is a new run with `reconciles_run_id`; it never
reopens or retries the original run.

O executor consulta a EC2 antes da transição:

| Ação | Estado observado | Resultado |
| --- | --- | --- |
| `inspect` | Qualquer estado retornado | Não envia mutação; registra o estado e marca `observed`. |
| `start` | `stopped` | Envia uma solicitação e marca `requested`. |
| `start` | `pending`, `running`, `stopping`, `shutting-down`, `terminated` ou desconhecido | Não envia mutação; marca `noop` para `running` ou `skipped` nos demais. |
| `stop` | `running` | Envia uma solicitação e marca `requested`. |
| `stop` | `stopping`, `stopped`, `pending`, `shutting-down`, `terminated` ou desconhecido | Não envia mutação; marca `noop` para `stopped` ou `skipped` nos demais. |

Falhas de consulta e mutação terminam a execução como `failed`, com erro
sanitizado. Timeout ou resposta perdida durante mutação termina como
`interrupted`/`unknown` conforme a fase, sem nova tentativa automática. Ocorrências
de recuperação são materializadas antes da execução, em ordem de
`scheduled_at_utc`; o backlog não pode ser coalescido ou descartado por tamanho.
