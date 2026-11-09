# Feature Specification: Agendamento de Instância EC2

**Feature Branch**: `001-ec2-instance-scheduling`

**Created**: 2026-11-08

**Status**: Draft

**Input**: User description: "Criar uma aplicação de automação para controlar o estado de uma instância Amazon EC2, permitindo configurar horários de inicialização e desligamento, execução manual, simulação, auditoria e tratamento seguro de falhas em um Raspberry Pi."

## Clarifications

### Session 2026-11-08

- Q: Quando a aplicação perder um horário, o que a opção explícita de recuperação deve fazer? → A: Executar todas as ocorrências perdidas desde a indisponibilidade.
- Q: Como o acesso à interface web deve ser protegido no MVP? → A: Usar autenticação externa, como OAuth ou SSO.
- Q: Quais identidades autenticadas pelo provedor externo devem poder configurar e controlar a instância? → A: Permitir qualquer identidade autenticada pelo provedor externo.
- Q: Quando o operador solicitar início ou desligamento manual, a aplicação deve responder imediatamente e processar a ação em segundo plano? → A: Processar em segundo plano e retornar o resultado posteriormente.
- Q: Quando uma operação de início ou desligamento for enviada, mas a AWS não responder antes do timeout, o que a aplicação deve fazer? → A: Marcar como desconhecida, não repetir automaticamente e exigir reconciliação manual.
- Q: Como a região AWS deve ser validada antes de salvar a configuração? → A: Validar localmente contra uma lista mantida de regiões EC2 suportadas, sem chamar a AWS durante o salvamento; o worker confirma o alvo com `DescribeInstances` antes de qualquer execução.
- Q: O que deve ocorrer quando uma solicitação manual for repetida ou concorrer com outra transição? → A: Repetir o mesmo `requestId` retorna a execução já criada sem duplicá-la; um `requestId` diferente para uma transição real equivalente em andamento retorna `409` e não cria outra execução.
- Q: Como o operador reconcilia uma execução `unknown` ou `interrupted`? → A: A execução original permanece imutável e sem retry automático; o operador consulta o estado atual, decide a ação necessária e cria uma nova solicitação manual, que referencia a execução anterior no histórico.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configurar instância e horários (Priority: P1)

Como operador autenticado, quero informar a instância EC2 que será controlada e configurar
horários semanais de início e desligamento, para que a rotina diária seja
executada sem acesso manual ao console da AWS.

**Why this priority**: Sem uma configuração válida, nenhuma automação pode
reduzir custos ou controlar a instância.

**Independent Test**: Cadastrar uma instância, selecionar a região, definir os
dias úteis, horários de início e desligamento e confirmar que a configuração
fica disponível para a próxima execução.

**Acceptance Scenarios**:

1. **Given** que não existe uma configuração válida, **When** o operador informa
   o ID da instância, a região, os dias e os dois horários obrigatórios,
   **Then** o sistema valida os dados e salva a configuração.
2. **Given** que existe uma configuração salva, **When** o operador altera a
   instância, região, dias ou horários, **Then** o próximo ciclo usa os valores
   atualizados sem alteração no código da aplicação.
3. **Given** que um horário de início ou desligamento é inválido, **When** o
   operador tenta salvar, **Then** o sistema informa o problema e não substitui
   a configuração válida anterior.
4. **Given** que um horário está configurado para um dia não selecionado,
   **When** esse dia chegar, **Then** nenhuma ação automática é solicitada.

---

### User Story 2 - Executar a rotina automática (Priority: P1)

Como operador, quero que a aplicação avalie os horários todos os dias no fuso
`America/Sao_Paulo`, para que a instância seja iniciada e desligada no período
planejado sem intervenção humana.

**Why this priority**: A execução autônoma é o principal valor da funcionalidade
e evita custos causados por instâncias ligadas fora do horário necessário.

**Independent Test**: Usar um relógio controlado ou uma execução agendada de
teste para simular os horários configurados e verificar a decisão tomada para
cada estado da instância.

**Acceptance Scenarios**:

1. **Given** uma configuração de segunda a sexta às 08:00 e uma instância
   parada, **When** o relógio atingir 08:00 em `America/Sao_Paulo`, **Then** o
   sistema solicita a inicialização uma vez e registra o resultado.
2. **Given** uma configuração de segunda a sexta às 19:00 e uma instância em
   execução, **When** o relógio atingir 19:00 em `America/Sao_Paulo`, **Then** o
   sistema solicita o desligamento uma vez e registra o resultado.
3. **Given** que a instância já está no estado desejado, **When** o horário
   correspondente for processado, **Then** o sistema não envia uma operação
   desnecessária e registra a decisão como nenhuma ação necessária.
4. **Given** que a instância está em um estado intermediário, **When** um
   horário for processado, **Then** o sistema não inicia uma segunda transição,
   registra o estado observado e aguarda uma próxima avaliação.

---

### User Story 3 - Controlar e simular manualmente (Priority: P2)

Como operador autenticado, quero consultar o estado e solicitar início, desligamento ou
simulação pela interface, para testar a configuração e agir fora do calendário
quando necessário.

**Why this priority**: O controle manual facilita a operação e permite validar
uma configuração sem depender do próximo horário automático.

**Independent Test**: Consultar o estado, executar uma simulação de cada ação e
executar início ou desligamento manual em um ambiente de teste autorizado.

**Acceptance Scenarios**:

1. **Given** uma configuração válida e uma sessão autenticada, **When** o operador consulta o estado,
   **Then** o sistema mostra o estado atual ou informa claramente a falha de
   consulta.
2. **Given** que o operador escolhe iniciar ou desligar, **When** confirma a
   ação manual, **Then** o sistema enfileira a solicitação, retorna um identificador
   imediatamente, aplica a mesma validação de estado usada pela rotina automática
   e disponibiliza o resultado posteriormente.
3. **Given** que o modo simulação está ativado, **When** o operador solicita
   início ou desligamento, **Then** o sistema mostra a ação que seria executada,
   não modifica a instância real e registra a simulação.
 4. **Given** uma ação manual em andamento, **When** o operador repete a mesma
    solicitação com o mesmo `requestId`, **Then** o sistema retorna a execução já
    criada sem duplicá-la; **When** usar outro `requestId` para uma transição real
    equivalente em andamento, **Then** responde `409` e não cria outra execução.
5. **Given** uma requisição sem autenticação externa válida, **When** ela tenta
   acessar a tela ou uma ação EC2, **Then** o sistema rejeita a requisição sem
   consultar ou alterar a instância.

---

### User Story 4 - Investigar execuções e falhas (Priority: P2)

Como operador autenticado, quero consultar o histórico das execuções, para entender quando
uma ação foi tentada, qual era o alvo, qual resultado ocorreu e por que uma ação
falhou.

**Why this priority**: Auditoria e diagnóstico são necessários para manter a
automação confiável em execução contínua e para diferenciar falhas da AWS,
conectividade e configuração.

**Independent Test**: Gerar execuções bem-sucedidas, ignoradas, simuladas e
falhas controladas e confirmar que cada registro contém as informações
operacionais necessárias sem credenciais ou segredos.

**Acceptance Scenarios**:

1. **Given** uma tentativa automática ou manual, **When** ela termina, **Then**
   o histórico contém data, hora, ação, instância, região, modo de execução,
   estado observado e resultado.
2. **Given** uma falha de conexão, autenticação, autorização ou indisponibilidade
   temporária, **When** a execução falha, **Then** o sistema registra uma
   mensagem compreensível, não encerra definitivamente o serviço e aguarda a
   próxima oportunidade prevista.
3. **Given** que a aplicação ficou indisponível durante um ou mais horários,
   **When** ela voltar a operar, **Then** não executa ações atrasadas por padrão;
   se a recuperação explícita estiver habilitada, processa todas as ocorrências
   perdidas, cada uma no máximo uma vez.
4. **Given** qualquer registro de execução, **When** um operador autenticado o
   consulta, **Then** nenhum segredo, token ou credencial aparece no histórico.
 5. **Given** que uma mutação foi enviada e a resposta da AWS foi perdida, **When**
    o timeout ocorrer, **Then** a execução será marcada como desconhecida ou
    interrompida, sem retry automático; **When** o operador consultar o estado,
    **Then** a execução original permanecerá imutável e uma nova ação manual poderá
    ser criada somente após a decisão de reconciliação, com referência ao registro
    anterior no histórico.

### Edge Cases

- O ID da instância, a região, o horário ou os dias não podem ser vazios ou
  inválidos.
- A região deve pertencer à lista local mantida de regiões EC2 suportadas; salvar
  a configuração não deve depender de uma chamada de rede à AWS.
- Deve existir exatamente uma configuração ativa para o MVP de uma instância.
- O sistema deve tratar estados `pending`, `stopping`, `shutting-down` e outros
  estados transitórios sem emitir uma ação concorrente desnecessária.
- Estados finais não elegíveis para a ação, como uma instância terminada, devem
  gerar um resultado compreensível e não uma tentativa de alteração.
- Se a instância não existir ou não estiver autorizada para a operação, o
  sistema deve informar a falha e manter o serviço disponível.
- Se a internet ou a API AWS estiver indisponível, a execução deve terminar com
  erro controlado, sem tentativas infinitas. O replay de todas as ocorrências
  perdidas só ocorre quando a recuperação explícita estiver habilitada.
- Se uma mutação AWS exceder o timeout ou perder a resposta depois do envio, o
  sistema deve marcar o resultado como desconhecido/interrompido, não repetir a
  operação automaticamente e exigir consulta ou ação manual para reconciliação.
- Uma nova ação criada após reconciliação deve manter a execução `unknown` ou
  `interrupted` original imutável e registrar a referência entre os dois registros.
- Reiniciar a aplicação não deve apagar a configuração nem causar execução
  duplicada do mesmo horário.
- Alterar uma configuração enquanto uma ação está em andamento não deve
  cancelar nem duplicar a ação atual; a nova configuração vale para avaliações
  posteriores.
- Horários no limite do dia e mudanças de data devem ser interpretados no fuso
  `America/Sao_Paulo`.
- O modo simulação deve continuar funcionando sem alterar recursos reais,
  inclusive quando não houver credenciais válidas para executar ações reais.
- A indisponibilidade do provedor de identidade, sessão expirada ou token inválido
  deve bloquear telas e ações protegidas sem interromper o worker automático.
- Qualquer identidade autenticada pelo provedor configurado pode operar a única
  instância do MVP; restrições por grupo ou usuário ficam fora do escopo inicial.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST permitir configurar o ID de uma única instância EC2
  ativa no MVP.
- **FR-002**: O sistema MUST permitir configurar a região AWS associada à
  instância sem alteração do código-fonte e MUST validar a região localmente
  contra a lista mantida de regiões EC2 suportadas.
- **FR-003**: O sistema MUST validar o ID da instância, a região, os dias da
  semana e os horários antes de salvar uma configuração; o salvamento MUST NOT
  depender de uma chamada de rede à AWS.
- **FR-004**: O sistema MUST permitir selecionar os dias da semana e definir um
  horário de início e um horário de desligamento para a rotina.
- **FR-005**: O sistema MUST interpretar e exibir os horários no fuso
  `America/Sao_Paulo`.
- **FR-006**: O sistema MUST persistir a configuração e reutilizá-la após
  reinicializações, sem exigir alteração de código.
- **FR-007**: O sistema MUST avaliar a configuração automaticamente em operação
  contínua e executar a ação correspondente no horário e dia configurados.
- **FR-008**: O sistema MUST consultar o estado atual da instância antes de
  solicitar início ou desligamento.
- **FR-009**: O sistema MUST solicitar início somente quando a instância estiver
  em `stopped` e MUST solicitar desligamento somente quando estiver em `running`.
  Para qualquer outro estado, MUST registrar a decisão sem solicitar alteração.
- **FR-010**: O sistema MUST evitar operações duplicadas quando o estado já for
  o desejado ou quando existir uma transição equivalente em andamento; repetir
  um `requestId` MUST retornar a execução existente, enquanto outro `requestId`
  para uma transição real equivalente em andamento MUST responder `409`.
- **FR-011**: O sistema MUST tratar estados intermediários sem encerrar o
  serviço, registrar o estado observado e permitir nova avaliação posterior.
- **FR-012**: O sistema MUST permitir consultar o estado atual manualmente.
- **FR-013**: O sistema MUST permitir solicitar início e desligamento manual,
  aplicando as mesmas regras de segurança e de estado da rotina automática.
- **FR-014**: O sistema MUST oferecer modo simulação para cada ação, informando
  o que seria executado sem modificar a instância real.
- **FR-015**: O sistema MUST registrar cada execução automática, manual ou
  simulada com data, hora, ação, instância, região, modo, estado observado e
  resultado.
- **FR-016**: O sistema MUST registrar erros de conexão, autenticação,
  autorização, configuração e indisponibilidade temporária com mensagens
  compreensíveis em português do Brasil.
- **FR-017**: O sistema MUST limitar as tentativas de cada execução. Após uma
  indisponibilidade, MUST evitar replay por padrão; quando a recuperação explícita
  estiver habilitada, MUST processar todas as ocorrências agendadas perdidas e
  registrar cada uma no máximo uma vez.
- **FR-018**: O sistema MUST continuar disponível depois de uma falha externa e
  MUST tentar novamente apenas nas próximas avaliações previstas ou conforme uma
  política explícita e limitada.
- **FR-019**: O sistema MUST obter credenciais AWS de um mecanismo seguro do
  ambiente de execução e MUST impedir que credenciais sejam armazenadas na
  configuração funcional ou nos registros.
- **FR-020**: O sistema MUST restringir operações à instância e região
  configuradas e autorizadas para o serviço.
- **FR-021**: O sistema MUST preservar a configuração e o histórico necessários
  para manter comportamento previsível após reinicialização.
- **FR-022**: O sistema MUST permitir atualizar a instância, a região, os dias,
  os horários e o modo de recuperação sem alterar a lógica principal.
- **FR-023**: O sistema MUST exigir autenticação por um provedor externo antes de
  permitir acesso à interface de configuração, estado, histórico ou ações EC2.
- **FR-024**: O sistema MUST rejeitar sessões ausentes, expiradas ou inválidas
  sem consultar a AWS, enfileirar ações ou revelar dados da configuração.
- **FR-025**: O sistema MUST permitir operações manuais, alterações de configuração
  e consultas de auditoria para qualquer identidade autenticada pelo provedor
  externo configurado, sem exigir uma allowlist adicional no MVP.
- **FR-026**: O sistema MUST enfileirar ações manuais e responder com um
  identificador de execução sem bloquear a requisição web aguardando a AWS; uma
  repetição do mesmo `requestId` MUST retornar esse identificador sem criar outra
  execução.
- **FR-027**: O sistema MUST marcar uma mutação como `unknown` ou `interrupted`
  quando a resposta for perdida após o envio, MUST evitar retry automático e MUST
  disponibilizar a execução para reconciliação manual. A execução original MUST
  permanecer imutável; após consultar o estado, o operador MAY criar uma nova
  ação manual, que MUST referenciar a execução reconciliada no histórico.

### Non-Functional Requirements

- **NFR-001**: A solução MUST integrar-se ao projeto web existente e operar em
  um ambiente de baixo consumo, adequado a um Raspberry Pi.
- **NFR-002**: A interface MUST apresentar mensagens operacionais e de erro em
  português do Brasil, com indicação da ação que o operador pode tomar.
- **NFR-003**: A automação MUST funcionar continuamente sem intervenção diária,
  desde que o equipamento, a rede e as permissões AWS estejam disponíveis.
- **NFR-004**: A solução MUST permitir testes sem iniciar ou desligar uma
  instância real e MUST separar claramente simulação de execução real.
- **NFR-005**: A documentação MUST explicar instalação, configuração de acesso
  AWS, operação, simulação, recuperação de falhas e interpretação dos logs.
- **NFR-006**: A solução MUST usar permissões AWS mínimas para consultar o
  estado, iniciar e desligar somente o recurso autorizado.
- **NFR-007**: A autenticação externa MUST usar transporte seguro, validação de
  emissor e audiência, expiração de sessão e proteção contra reutilização de
  tokens inválidos.

### Key Entities

- **Configuração da Instância**: Representa a única instância controlada no MVP,
  incluindo ID, região, dias ativos, horários e política de recuperação.
- **Agendamento**: Representa a combinação de dias e horários que determina uma
  ação de início ou desligamento no fuso de referência.
- **Execução**: Representa uma avaliação automática, ação manual ou simulação,
  incluindo alvo, estado observado, ação pretendida, resultado e erro seguro.
- **Política de Acesso**: Representa as permissões que autorizam o serviço a
  consultar e alterar somente a instância configurada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um operador consegue configurar uma instância e seus horários em
  até 5 minutos, sem alterar código-fonte ou editar arquivos internos.
- **SC-002**: Em uma execução normal, a solicitação de início ou desligamento
  ocorre em até 60 segundos após o horário configurado, considerando que a rede
  e a AWS estejam disponíveis.
- **SC-003**: Em testes com a instância já no estado desejado, 100% das avaliações
  não enviam uma operação redundante.
- **SC-004**: Em testes de simulação, 100% das execuções deixam a instância real
  inalterada e exibem claramente a ação que seria tomada.
- **SC-005**: 100% das tentativas automáticas, manuais e simuladas produzem um
  registro auditável com resultado e sem credenciais ou tokens.
- **SC-006**: Após falhas de rede, autenticação, autorização ou disponibilidade
  da AWS, o serviço permanece ativo e processa uma próxima avaliação prevista
  sem intervenção manual.
- **SC-007**: Durante um teste contínuo de 7 dias com conectividade disponível,
  a rotina executa os horários configurados sem exigir reinicialização manual.
- **SC-008**: Em uma avaliação operacional, o operador identifica o estado atual,
  a próxima ação e o motivo da última falha sem consultar o console AWS.
- **SC-009**: Em testes com recuperação explícita habilitada, 100% das ocorrências
  perdidas são processadas no máximo uma vez; com a opção desabilitada, 0% delas
  gera uma nova solicitação automática.
- **SC-010**: Em testes de segurança, 100% das requisições sem autenticação externa
  válida são rejeitadas antes de criar uma ação, consultar a AWS ou exibir dados.
- **SC-011**: Em testes de operação manual, 100% das solicitações válidas retornam
  um identificador de execução sem aguardar a resposta da AWS na mesma requisição.
- **SC-012**: Em 100% dos testes de timeout ou resposta perdida após uma mutação,
  nenhuma segunda mutação automática é enviada e a execução fica marcada para
  reconciliação manual.

## Assumptions

- O MVP controla uma única instância EC2 em uma única conta AWS por instalação.
- O operador acessa a interface por um provedor externo de identidade configurado
  para o deployment e continua responsável por manter o equipamento e a rede do
  Raspberry Pi disponíveis.
- Toda identidade aceita pelo provedor externo tem permissão de operador no MVP;
  controle por grupos, funções ou usuários específicos será uma evolução futura.
- Ações manuais e consultas que dependem da AWS são assíncronas; a interface usa
  o identificador da execução para acompanhar o resultado persistido.
- O mesmo `requestId` identifica uma única solicitação manual e retorna a execução
  existente quando repetido; um `requestId` diferente não pode criar uma transição
  real equivalente enquanto outra estiver em andamento.
- Uma mutação AWS com resposta perdida exige reconciliação manual; o sistema não
  tenta inferir sucesso nem reenvia a operação automaticamente. A reconciliação
  consiste em consultar o estado atual, manter a execução original imutável e,
  se necessário, criar uma nova ação manual com referência ao registro anterior.
- O MVP possui um horário de início e um horário de desligamento por rotina
  diária; múltiplos intervalos por dia ficam fora do escopo inicial.
- O modo de recuperação atrasada fica desativado por padrão; quando habilitado,
  todas as ocorrências perdidas desde a indisponibilidade são processadas uma vez.
- A região informada corresponde à região real da instância e as permissões
  disponíveis permitem somente as operações necessárias nesse recurso; a região
  é validada localmente contra uma lista mantida de regiões EC2 suportadas antes
  de salvar.
- A autenticação AWS será fornecida pelo ambiente de execução, por exemplo por
  uma identidade ou perfil configurado no Raspberry Pi, sem credenciais no código.
- O horário de referência é `America/Sao_Paulo`; o comportamento em mudanças de
  regras de horário seguirá a definição oficial desse fuso.
- O histórico de execução será mantido por tempo suficiente para investigação
  operacional; o período exato de retenção será definido durante o planejamento.
- Aplicativo mobile, múltiplas contas AWS, múltiplas instâncias e notificações
  externas não fazem parte deste lançamento.
