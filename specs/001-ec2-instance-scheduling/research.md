# Research: Agendamento de Instância EC2

## Decision: allowlist local compartilhada para regiões EC2

O formulário validará a região sem chamar a AWS usando uma allowlist versionada em
`config/aws-ec2-regions.json`. Cada entrada contém o nome da região e a partição
AWS (`aws`, `aws-cn`, `aws-us-gov` ou outra partição explicitamente suportada). A
lista contém somente regiões EC2 regionais, não zonas de disponibilidade, Local
Zones, endpoints FIPS ou nomes de endpoint. Node e Python lerão o mesmo arquivo.

O worker ainda criará o cliente Boto3 com a região persistida e executará
`DescribeInstances(InstanceIds=[instance_id])` antes de qualquer mutação. A
allowlist local prova apenas que o nome é suportado pelo produto; não prova que a
região está habilitada na conta, que a instância existe ou que há autorização.
Regiões novas serão adicionadas de forma aditiva. Remoções exigirão uma política
explícita para não invalidar configurações existentes silenciosamente.

**Rationale**: A decisão atende à validação offline exigida pelo formulário,
mantém Node e Python consistentes e torna o escopo de partições explícito. A
consulta AWS permanece a autoridade para existência, autorização e associação
real da instância.

**Alternatives considered**:

- Usar `botocore.Session.get_available_regions`: trata partições, mas a lista
  depende da versão instalada e não é naturalmente compartilhada com Node.
- Validar somente por regex: aceita regiões inexistentes, Local Zones e endpoints.
- Chamar AWS no salvamento: adiciona latência, exige credenciais e viola o fluxo
  de configuração offline.

## Decision: Worker Python separado, com SQLite compartilhado

O Node/Express existente continuará responsável pela interface web, validação de
formulários e migrações Sequelize/Umzug. Um worker Python separado será responsável
por ler a configuração, avaliar os horários, consultar a EC2 e registrar resultados.
Os dois processos usarão o mesmo arquivo SQLite configurado por `DB_STORAGE`.

**Rationale**: A separação mantém o padrão visual e os contratos web atuais sem
acoplar a aplicação Node ao ciclo de vida do Boto3. O worker pode falhar e ser
reiniciado independentemente, enquanto a fila e a auditoria permanecem duráveis.
Para o MVP de uma instância, SQLite evita Redis, SQS ou outro serviço operacional.

**Alternatives considered**:

- Invocar Python como subprocesso a cada requisição: rejeitado por dificultar
  supervisão, timeout e rastreamento de ações em andamento.
- Criar um serviço HTTP Python: rejeitado por adicionar autenticação, descoberta e
  disponibilidade entre processos sem benefício necessário para uma instalação.
- Reimplementar a integração AWS em Node: rejeitado porque o pedido exige Python 3
  e Boto3.
- Usar uma fila externa: reservada para múltiplas instalações ou maior volume.

## Decision: systemd timer periódico com agenda dinâmica no banco

O deployment Linux usará um `systemd timer` que aciona um serviço Python de curta
duração a cada minuto. O serviço lê os agendamentos atuais do SQLite, cria ações
automáticas idempotentes para o minuto local corrente e processa ações manuais
pendentes. O timer terá `Persistent=false`, deixando a política de recuperação
inteiramente no worker.

Com recuperação desabilitada, o worker avança o cursor e registra horários
perdidos sem mutação. Com recuperação explicitamente habilitada, ele materializa
todas as ocorrências perdidas desde o cursor até o momento atual, em ordem
cronológica, uma vez por ocorrência. O backlog é processado em páginas e continua
no próximo tick sem descartar ocorrências.

O Python usará `zoneinfo.ZoneInfo("America/Sao_Paulo")` para interpretar o dia e
horário configurados. A agenda não será codificada no arquivo do timer, permitindo
alterações pela interface sem recarregar unidades específicas.

**Rationale**: systemd oferece supervisão, status, timeout, usuário dedicado,
restrições de filesystem e logs no journald. Um timer único por minuto evita
gerar ou alterar unidades quando o operador edita a agenda. `Persistent=false`
evita que o systemd invente um catch-up único; o cursor e o ledger permitem cumprir
a decisão de processar todas as ocorrências somente quando o operador habilitar.

**Alternatives considered**:

- Cron: rejeitado por oferecer supervisão, logging e controles de serviço menos
  integrados ao Linux moderno.
- Um timer systemd por horário: rejeitado porque toda alteração na interface
  exigiria gerar e recarregar unidades.
- Loop Python permanente: tecnicamente viável, mas o timer periódico reduz o
  estado residente e mantém a execução supervisionada e limitada.
- `Persistent=true`: rejeitado porque faria um catch-up implícito e único, sem
  enumerar todas as ocorrências perdidas exigidas pela especificação.
- EventBridge Scheduler: mais independente do Raspberry Pi, mas desloca a
  configuração e a auditoria para AWS e está fora do MVP local.

## Decision: OIDC in-app com sessão server-side

A interface Node usará OpenID Connect (OIDC), Authorization Code Flow com PKCE
`S256`, contra um único provedor configurado por ambiente. O callback validará
`state`, `nonce`, PKCE, assinatura JWKS, `iss`, `aud`, `azp`, `exp`, `iat` e `sub`.

O cliente OIDC será `openid-client` v6. A aplicação usará `express-session` com
um store Sequelize próprio sobre a tabela `auth_session`, em vez de depender de
`store.sync()` ou de um schema implícito de outro pacote. `csrf-sync` fornecerá
tokens sincronizadores para formulários EJS e o cabeçalho `X-CSRF-Token` usado por
`fetch`.

Após o login, a aplicação criará uma sessão opaca server-side em SQLite, regenerará
o ID da sessão e protegerá rotas de configuração, status, histórico e ações. Cookies
terão `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/` e timeout idle/absoluto.
Formulários e chamadas `fetch` terão tokens CSRF; logout será uma ação POST.

Qualquer identidade aceita pelo provedor será operador no MVP, sem allowlist local.
O worker automático não dependerá de uma sessão web.

**Rationale**: OIDC fornece identidade autenticada, ao contrário de OAuth2 puro.
Uma integração in-app mantém um único limite de autenticação e evita adicionar um
proxy separado ao Raspberry Pi. Sessões server-side impedem armazenar tokens em
`localStorage` e permitem revogação local.

**Alternatives considered**:

- OAuth2 sem OIDC: rejeitado porque não define identidade autenticada de forma
  suficiente para a sessão web.
- `oauth2-proxy`: viável quando várias aplicações compartilham SSO, mas adiciona
  um processo e ainda exigiria CSRF na aplicação.
- Headers de identidade enviados por proxy: rejeitados por permitirem bypass caso
  o upstream seja acessível diretamente ou os headers não sejam sanitizados.
- Allowlist de usuários, grupos ou roles: explicitamente fora do MVP.
- `connect-session-sequelize`: compatível como Store padrão, mas seu schema e
  interoperabilidade ESM/Express 5 exigiriam adaptar campos e ainda não
  resolveriam os campos de issuer/subject e o controle de sessão deste projeto.

O store próprio implementará `get`, `set`, `touch` e `destroy` com operações
Sequelize parametrizadas, expirará e removerá sessões sem consultar AWS e
regenerará o identificador após callback OIDC bem-sucedido. Nenhum access token
ou refresh token será persistido.

## Decision: trava durável para transições e reconciliação

Além do ledger imutável `ec2_run`, o schema terá uma tabela `ec2_transition` com
uma linha por instância configurada. A trava representa `active` para uma
transição real em andamento ou `needs_reconciliation` após crash/resposta perdida.
Ela impede uma nova mutação real enquanto a execução anterior estiver em fase
`requested`, `unknown` ou `interrupted`, algo que um índice parcial apenas em
`status = 'running'` não garante.

O mesmo `requestId` manual é idempotente e retorna o run existente quando a
intenção (`action`, `mode`, alvo) é igual. Reutilizar o mesmo ID com intenção
diferente retorna `409`. Um ID diferente para uma transição real protegida pela
trava também retorna `409`; simulações e inspeções não adquirem a trava.

Uma inspeção é um run separado, sem mutação. Se observar um estado definitivo,
ela pode liberar a trava; estados intermediários, erro de consulta ou ausência de
autorização mantêm `needs_reconciliation`. A execução incerta original é
imutável. Uma nova ação manual após a inspeção recebe `reconciles_run_id`, criando
um vínculo de auditoria sem reabrir nem repetir automaticamente o run anterior.

Claims, finalizações e liberação da trava usam `BEGIN IMMEDIATE` somente em
transações curtas. Nenhuma chamada AWS ocorre dentro de uma transação SQLite.

**Rationale**: A trava protege também estados `requested` e incertos, preserva a
semântica de reconciliação e torna a concorrência explícita sem transformar uma
chamada AWS em uma transação distribuída.

**Alternatives considered**:

- Índice parcial apenas em `running`: não cobre `requested` ou transições incertas.
- Reabrir ou repetir `unknown`/`interrupted`: a AWS pode ter aceitado a primeira
  mutação e o resultado não pode ser provado.
- Endpoint de reconciliação que altera o run original: rejeitado porque destrói
  a auditoria imutável; a decisão será registrada por inspeção e novo run.

## Decision: replay de todas as ocorrências via ledger durável

Cada ocorrência semanal terá uma identidade estável baseada em schedule e instante
local/UTC. O worker manterá um cursor de avaliação e materializará ocorrências
perdidas antes de executá-las. Todas serão processadas em ordem cronológica; uma
ocorrência já satisfeita vira `noop`, e não uma chamada AWS redundante.

O ledger será o próprio registro `ec2_run`, com `occurrence_key`, `scheduled_at_utc`
e revisão da agenda. O cursor será persistido em `ec2_config`. O replay será
serializado por instância, paginado por tick e não terá um limite silencioso que
viole a decisão de processar todas as ocorrências. Conflitos de mesmo instante
serão registrados e pausados para resolução explícita.

**Rationale**: `Persistent=true` do systemd não representa cada evento perdido.
Cursor, chave única e estado terminal tornam crashes, ticks duplicados e alterações
de agenda observáveis. A checagem de estado antes de cada ação mantém o replay
seguro mesmo quando a instância mudou externamente.

**Alternatives considered**:

- Recuperar somente o último horário: rejeitado pela decisão de processar todos.
- Reenviar comandos sem ledger: rejeitado por duplicar ocorrências após crash.
- Coalescer start/stop até o estado final: rejeitado porque perde auditoria de cada
  ocorrência e não atende o requisito literal de replay completo.

## Decision: credenciais temporárias por `credential_process`

O caminho preferencial usará IAM Roles Anywhere com certificado e chave protegida
no Raspberry Pi, junto do helper oficial configurado como `credential_process` no
perfil AWS usado pelo Boto3. O worker não receberá chaves por argumentos, banco,
arquivo de configuração funcional ou logs.

Como alternativa documentada, uma identidade de bootstrap restrita poderá assumir
um role dedicado via STS. Chaves IAM de longa duração serão somente fallback
temporário, com permissões de arquivo, rotação e monitoramento definidos.

A política mínima terá `ec2:DescribeInstances`, `ec2:StartInstances` e
`ec2:StopInstances`, limitando start/stop ao ARN da instância configurada. Ações
de término, criação ou alteração de atributos não serão concedidas.

**Rationale**: O credential provider chain padrão do Boto3 suporta credenciais
temporárias sem que o código implemente refresh. Roles Anywhere atende execução
fora da AWS sem deixar uma chave permanente no Raspberry Pi.

**Alternatives considered**:

- Chaves diretas em variáveis de ambiente: rejeitadas como solução principal por
  serem credenciais de longa duração e fáceis de vazar em processos ou diagnósticos.
- Metadata de instância EC2: não disponível de forma confiável no Raspberry Pi.
- Secret Manager acessado pelo próprio worker: exigiria uma credencial inicial e
  adicionaria uma dependência de rede antes da autenticação principal.

## Decision: gateway Boto3 com política de retries conservadora

O gateway fará `DescribeInstances` antes de qualquer mutação. Só enviará
`StartInstances` para `stopped` e `StopInstances` para `running`. Estados
`pending`, `stopping`, `shutting-down`, `terminated` e outros estados não elegíveis
serão registrados sem mutação.

As consultas de leitura poderão usar retry limitado. As mutações terão uma única
tentativa de transporte por execução; timeout ou resposta perdida será registrado
como `interrupted`/`unknown` e não será repetido automaticamente, pois start/stop
não fornecem um client token para provar idempotência ponta a ponta.

**Rationale**: O banco garante no máximo uma tentativa despachada por execução
registrada, mas não pode provar se a AWS recebeu uma requisição cuja resposta foi
perdida. Não repetir cegamente evita desligamento ou inicialização duplicada.

**Alternatives considered**:

- Retry automático de todas as chamadas: rejeitado para mutações incertas.
- `DryRun=True` como simulação: rejeitado porque ainda acessa a AWS e exige
  credenciais; simulação será totalmente local.
- Esperar até o estado final: rejeitado para o MVP, pois a API confirma a
  solicitação, não a conclusão, e aguardas longas aumentariam consumo e locks.

O gateway também rejeitará qualquer execução cuja região não esteja na allowlist
compartilhada antes de construir o cliente. A resposta de `DescribeInstances`
será exigida antes de `StartInstances` ou `StopInstances`, inclusive para novas
ações criadas após reconciliação.

## Decision: SQLite como fila durável e auditoria

As migrations existentes continuarão sendo a fonte de verdade do schema. O Node
criará configurações e ações pendentes com SQL parametrizado via Sequelize; o
Python lerá e atualizará as mesmas tabelas com `sqlite3` parametrizado.

Cada execução terá uma chave de idempotência única. Ocorrências automáticas usarão
`automatic:<schedule_id>:<scheduled-instant>`, sem incluir revisão da configuração;
execuções manuais terão um UUID. Um índice parcial impedirá mais de uma ação real
`running` para a instância, enquanto ocorrências `queued` formam o backlog.

O worker usará `BEGIN IMMEDIATE` somente para transações curtas de claim e nunca
manterá uma transação aberta durante uma chamada AWS. Cada conexão definirá
`busy_timeout`; o banco ficará em filesystem local, nunca NFS.

**Rationale**: O volume é baixo, o host é único e o SQLite já é persistido pela
aplicação. A mesma fila serve para status operacional, auditoria, cursor e replay
seguro após reinício.

**Alternatives considered**:

- ORM Python adicional: rejeitado para evitar divergência entre metadados do ORM
  e migrations Sequelize.
- Arquivo JSON: rejeitado por não oferecer claims concorrentes e durabilidade
  adequada para dois processos.
- Fila em memória: rejeitada por perder ações e auditoria no reboot.

## Decision: testes com pytest, fakes e Stubber

Testes de regras de estado usarão um gateway fake e relógio injetado. Testes do
gateway usarão `botocore.stub.Stubber` para verificar operações e parâmetros sem
AWS real. Testes de persistência usarão `tmp_path` com SQLite. Testes de integração
verificarão que linhas criadas por Sequelize são lidas pelo Python e vice-versa.

**Rationale**: A estratégia valida regras, contratos e concorrência sem custos ou
risco de alterar uma instância real, mantendo os testes rápidos no Raspberry Pi.

Os testes operacionais também medirão três limites do plano: despacho até 60
segundos após o horário, duração de tick normal menor que 45 segundos e RSS do
worker abaixo de 64 MiB. O quickstart incluirá verificação das unidades systemd,
integridade SQLite e um soak de sete dias para a rotina contínua.

## Decision: systemd oneshot a cada minuto

Um único timer usará `OnCalendar=*-*-* *:*:00`, `AccuracySec=1s` e
`Persistent=false`, acionando um serviço `Type=oneshot` com usuário Unix dedicado,
`TimeoutStartSec=45s`, journald, `NoNewPrivileges=yes` e `PrivateTmp=yes`. O
systemd não fará catch-up; cursor e ledger permanecem a autoridade da recuperação.

`MemoryMax` será apenas uma barreira operacional, não a medição de desempenho. A
validação usará `/usr/bin/time` ou métricas do serviço para confirmar RSS abaixo
de 64 MiB, nenhum tick sobreposto e despacho dentro de 60 segundos. SQLite ficará
em filesystem local, com `busy_timeout` e claims curtos; WAL será opcional e não
será requisito de correção.

**Alternatives considered**:

- Loop Python permanente: maior estado residente e supervisão mais complexa.
- `Persistent=true`: inventaria catch-up implícito incompatível com o replay por
  ocorrência.
- Timer por horário: exigiria regenerar units a cada edição da agenda.

## Sources

- Regras do produto: `specs/001-ec2-instance-scheduling/spec.md`
- Contrato existente de storage e migrations: `src/database/database.ts`,
  `src/database/migrate.ts`, `compose.yaml`
- [Boto3 credentials](https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html)
- [AWS process credential provider](https://docs.aws.amazon.com/sdkref/latest/guide/feature-process-credentials.html)
- [IAM Roles Anywhere](https://docs.aws.amazon.com/rolesanywhere/latest/userguide/introduction.html)
- [EC2 API idempotency](https://docs.aws.amazon.com/ec2/latest/devguide/ec2-api-idempotency.html)
- [Boto3 retries](https://boto3.amazonaws.com/v1/documentation/api/latest/guide/retries.html)
- [systemd.timer](https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html)
- [systemd.service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
- [Python zoneinfo](https://docs.python.org/3/library/zoneinfo.html)
- [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)
- [RFC 7636 PKCE](https://www.rfc-editor.org/rfc/rfc7636)
- [OWASP CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [SQLite transactions](https://www.sqlite.org/lang_transaction.html)
- [Python sqlite3](https://docs.python.org/3/library/sqlite3.html)
- [botocore Stubber](https://botocore.amazonaws.com/v1/documentation/api/latest/reference/stubber.html)
