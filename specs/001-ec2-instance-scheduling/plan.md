# Implementation Plan: Agendamento de Instância EC2

**Branch**: `001-ec2-instance-scheduling` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-ec2-instance-scheduling/spec.md`

## Summary

Adicionar ao projeto atual uma interface web Node/Express para configurar uma
instância EC2, seus horários e ações manuais, mantendo as migrations Sequelize
como fonte de verdade. Um worker Python 3 separado usará Boto3 para processar
uma fila SQLite compartilhada, aplicar decisões idempotentes de estado e registrar
auditoria. Uma allowlist JSON compartilhada validará regiões offline; o worker
confirmará a instância com `DescribeInstances`. Um `systemd timer` a cada minuto
acionará o worker com recuperação atrasada desativada por padrão; quando habilitada,
um cursor e um ledger materializarão todas as ocorrências perdidas em ordem. Uma
trava durável separada impedirá mutações concorrentes e manterá transições incertas
em reconciliação. A interface Node exigirá OIDC com PKCE, sessão server-side e
CSRF, permitindo qualquer identidade aceita pelo provedor. O deployment recomendado
no Raspberry Pi usará credenciais AWS temporárias via `credential_process`,
preferencialmente IAM Roles Anywhere.

## Technical Context

**Language/Version**: Python 3.11+ para o worker; Node.js 23.6+ e TypeScript
estrito permanecem na interface existente.

**Primary Dependencies**: Boto3, botocore, `sqlite3`, `zoneinfo` e `logging` da
biblioteca padrão; pytest e `botocore.stub.Stubber` para testes; Express/EJS,
Sequelize 6, Umzug, `openid-client` v6, `express-session`,
`@types/express-session` e `csrf-sync` no web app. Um Store Sequelize próprio
implementará a interface de sessão sobre `auth_session`, sem schema implícito ou
`store.sync()`.

**Storage**: SQLite existente, com o mesmo caminho absoluto `DB_STORAGE` nos dois
processos. Migrations Sequelize/Umzug continuam sendo a única autoridade do schema;
elas também criam sessões OIDC, cursor de scheduler, ledger de ocorrências e a
trava `ec2_transition`. `config/aws-ec2-regions.json` é a autoridade offline para
nomes/partições de regiões e não é armazenado no banco.

**Testing**: pytest, `unittest.mock`, fakes injetáveis e `botocore.stub.Stubber`;
testes de contrato HTTP Node; `npx tsc --noEmit` e verificações de renderização
para o lado Node/EJS; validação de migration vazia/existente, latência de despacho,
RSS e soak de sete dias.

**Target Platform**: Linux em Raspberry Pi, com systemd e sincronização de relógio;
Docker continua suportado para o app existente, mas a instalação de produção do
worker será nativa para integração simples com systemd e o filesystem local.

**Project Type**: Aplicação web server-rendered com worker agendado e integração
externa AWS.

**Performance Goals**: Avaliar o minuto corrente e iniciar uma execução em até
60 segundos do horário configurado; retornar ações manuais assíncronas sem esperar
a AWS; manter o worker abaixo de 64 MiB RSS; limitar um tick normal a menos de
45 segundos; processar páginas de backlog sem bloquear o SQLite durante chamadas
AWS.

**Constraints**: Uma instância e uma conta AWS por instalação; no máximo um
horário de início e um de desligamento por dia; sem replay por padrão e replay de
todas as ocorrências quando explicitamente habilitado; ações AWS mutáveis sem
retry de transporte após resposta perdida; mesmo `requestId` idempotente e outro
request durante transição real protegido por `409`; runs `unknown`/`interrupted`
imutáveis com nova ação vinculada por reconciliação; autenticação OIDC obrigatória;
operação somente em filesystem local; nenhuma credencial em código, banco ou logs.

**Scale/Scope**: Até 14 entradas semanais, uma configuração ativa, uma execução
por minuto e histórico local de baixo volume. O backlog de recuperação não tem
limite silencioso; é paginado e retomável. Mobile, múltiplas contas, múltiplas
instâncias, allowlists de operadores e notificações externas permanecem fora do MVP.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` is present in the repository. The checks
below preserve the principles already recorded for this feature and the
repository constraints in `AGENTS.md`; no additional external constitution rule
could be loaded.

| Princípio | Avaliação inicial |
| --- | --- |
| I. Contratos Explícitos e Evolução Controlada | PASS. Rotas, formulários, tabelas, estados e comandos serão documentados; mudanças de schema ocorrerão em migrations. |
| II. Segurança por Padrão | PASS. Alvos vêm da configuração persistida, entradas são validadas, OIDC/PKCE/CSRF protegem a interface, credenciais AWS são temporárias e permissões são limitadas ao ARN. |
| III. Verificação Automatizada | PASS. O plano inclui pytest, Stubber, testes de integração Node/Python, migrations vazias/existentes e type-check. |
| IV. Operação Observável e Segura | PASS. Cada ocorrência gera auditoria, AWS tem timeout e retry limitado, respostas perdidas não são repetidas automaticamente e backlog explícito é retomável. |
| V. Simplicidade e Compatibilidade Operacional | PASS WITH JUSTIFIED EXCEPTION. O Node/EJS/SQLite atual é preservado; o worker Python separado é necessário pelo requisito Boto3 e evita substituir ou acoplar o web app. |

**Gate result**: PASS WITH DOCUMENTED EXCEPTION. A exceção de runtime é
justificada porque o Python é limitado ao worker AWS, enquanto a aplicação web,
SQLite, Docker existente e contratos atuais permanecem preservados.

## Project Structure

### Documentation (this feature)

```text
specs/001-ec2-instance-scheduling/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── web.md
│   └── worker.md
└── tasks.md              # Phase 2, criado por /speckit.tasks
```

### Source Code (repository root)

```text
config/
└── aws-ec2-regions.json                 # allowlist offline compartilhada
server.ts
src/
├── controllers/
│   ├── home.controller.ts
│   └── ec2.controller.ts              # configuração, ações e auditoria web
├── middleware/
│   ├── auth.ts                         # OIDC e sessão server-side
│   └── csrf.ts                         # formulários e fetch state-changing
├── models/
│   ├── device.ts
│   ├── ec2-config.ts
│   ├── ec2-schedule.ts
│   ├── ec2-run.ts
│   ├── ec2-transition.ts
│   └── auth-session.ts
├── router/
│   ├── web.ts
│   └── routes.ts
├── database/
│   └── migrations/
│       └── 20261108150000-add-ec2-automation.ts
├── services/
│   ├── oidc.ts
│   ├── session.ts                         # express-session Store Sequelize
│   └── aws-regions.ts                     # leitura/validação da allowlist
└── views/
    └── ec2/
        └── index.ejs

worker/
├── pyproject.toml
├── src/ec2_worker/
│   ├── __init__.py
│   ├── cli.py                         # --tick e códigos de saída
│   ├── config.py                      # ambiente e validação
│   ├── db.py                          # conexão sqlite3 e transações curtas
│   ├── regions.py                     # allowlist compartilhada de regiões
│   ├── repository.py                  # filas, schedules e auditoria
│   ├── scheduler.py                   # ZoneInfo e deduplicação por minuto
│   ├── ec2_gateway.py                 # protocolo e implementação Boto3
│   ├── executor.py                    # matriz de estados e ações
│   └── service.py                     # ciclo de um tick e shutdown
└── tests/
    ├── test_config.py
    ├── test_scheduler.py
    ├── test_repository.py
    ├── test_executor.py
    ├── test_ec2_gateway.py
    ├── test_manual_actions.py
    └── test_integration_sqlite.py

tests/
└── ec2-web.contract.test.ts            # contratos HTTP Node

deploy/systemd/
├── wake-up-device-ec2.service
└── wake-up-device-ec2.timer
```

**Structure Decision**: Manter o web app nos diretórios existentes e adicionar o
worker Python em `worker/`, com migrations e models Node compartilhando as tabelas.
O diretório `deploy/systemd/` conterá somente unidades e documentação sem segredos.
O worker não exporá HTTP no MVP; a fronteira entre processos será o SQLite
parametrizado.

## Design Phases

### Phase 0: Research

- Registrar decisões de scheduler, credenciais, Boto3, SQLite, timezone e testes
  em `research.md`.
- Fixar uma allowlist local compartilhada de regiões EC2 e a confirmação posterior
  por `DescribeInstances`, sem chamada AWS no salvamento.
- Resolver a tensão entre schedules editáveis pela interface e unidades systemd
  usando um único timer por minuto com `Persistent=false`.
- Definir cursor/ledger para processar todas as ocorrências perdidas somente com
  `recovery_enabled=1`, sem coalescer nem descartar backlog.
- Definir OIDC Authorization Code + PKCE, sessão opaca server-side, CSRF e
  permissão para qualquer identidade aceita pelo issuer configurado.
- Fixar a política de perda de resposta AWS: `interrupted`/`unknown`, sem retry
  automático e com reconciliação por inspeção seguida de uma nova ação vinculada;
  runs incertos permanecem imutáveis e uma trava durável bloqueia mutações reais.

### Phase 1: Design & Contracts

- Definir tabelas, invariantes, índices e estados em `data-model.md`.
- Definir páginas, formulários, respostas 202, mensagens e estados em
  `contracts/web.md`.
- Definir a CLI do worker, comportamento do timer, filas e códigos de saída em
  `contracts/worker.md`.
- Documentar instalação, simulação e validação end-to-end em `quickstart.md`.

### Implementation Sequence

1. Criar `config/aws-ec2-regions.json`, migration e models Node para configuração,
   agenda, execuções e `ec2_transition`; validar banco vazio e banco existente
   com SQLite, incluindo sessões OIDC e cursor de scheduler.
2. Adicionar OIDC com `openid-client`, sessões server-side com Store Sequelize
   próprio, CSRF e middleware de proteção; manter
   qualquer identidade autenticada como operador no MVP.
3. Adicionar controller, rotas, formulário EJS e tela de status/auditoria; manter
   `express.urlencoded`, respostas 202 e mensagens pt-BR.
4. Implementar pacote Python com configuração segura, allowlist de regiões, cursor
   de replay completo, repositório parametrizado, trava de transição, scheduler
   timezone-aware, gateway Boto3 e executor idempotente, incluindo inspeção manual
   e reconciliação sem mutação automática.
5. Adicionar testes pytest unitários, concorrência SQLite, Stubber e integração
   com linhas produzidas pelo Sequelize.
6. Adicionar unidades systemd, permissões do usuário dedicado, logging journald,
   `README.md` e configuração sem segredos.
7. Executar migrations, type-check, pytest, contratos HTTP, validação OIDC/CSRF,
   timer, métricas de RSS/latência, soak de sete dias e cenários de simulação
   antes da revisão.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Segundo runtime: worker Python 3 | O requisito exige Boto3 e execução AWS isolada do web app Node | Reusar Node preservaria um runtime, mas contrariaria a linguagem/SDK solicitados e acoplaria falhas AWS ao servidor web |
| Persistência compartilhada em múltiplas tabelas | Necessária para ações manuais, automáticas, simulação, sessões OIDC, idempotência e replay seguro | Chamada síncrona ou arquivo JSON não preserva estado entre processos nem impede duplicatas |
| Trava `ec2_transition` além do ledger | Índice em `running` não protege estados `requested` ou `needs_reconciliation` após resposta perdida | Reabrir ou repetir runs incertos destruiria a garantia de não repetir mutações ambíguas |
| Store de sessão Sequelize próprio | A tabela exige issuer/subject, expiração e atualização de acesso sem tokens; schema implícito dificultaria a migration única | `connect-session-sequelize` reduziria código, mas não atende diretamente o schema e adiciona risco de interoperabilidade ESM/Express 5 |
| OIDC, sessão e CSRF no web app | A especificação exige autenticação externa para ações EC2 e qualquer identidade do issuer como operador | Confiar em headers de proxy ou manter a aplicação sem sessão permitiria bypass ou não atenderia a decisão de segurança |

## Post-Design Constitution Check

| Princípio | Resultado após design |
| --- | --- |
| I. Contratos e evolução | PASS. `data-model.md`, contratos web/worker, allowlist regional, migration única e vínculo de reconciliação definem as fronteiras. |
| II. Segurança | PASS. O gateway nunca recebe alvo da requisição, regiões são validadas offline, OIDC/PKCE/CSRF protegem a UI, o worker usa perfil seguro e os logs são sanitizados. |
| III. Verificação | PASS. O quickstart e a matriz de testes cobrem schema, estado, rede, simulação e integração. |
| IV. Operação | PASS. systemd supervisiona ticks, journald registra saída, métricas de latência/RSS e soak são definidos, cada ocorrência tem resultado, backlog é retomável e mutações não têm retry cego. |
| V. Simplicidade | PASS WITH SAME JUSTIFIED EXCEPTION. A separação Python/Node é limitada ao requisito AWS e usa o SQLite já existente. |

**Final gate result**: PASS WITH DOCUMENTED EXCEPTION; não há clarificações
pendentes que bloqueiem `/speckit.tasks`. The missing constitution file is noted
above rather than treated as an implicit approval of unlisted principles.
