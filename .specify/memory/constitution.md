<!--
Sync Impact Report
- Version change: scaffold sem versão -> 1.0.0
- Modified principles: cinco placeholders de princípios -> princípios I a V
- Added sections: Additional Constraints; Development Workflow
- Removed sections: nenhum
- Follow-up TODOs: TODO(RATIFICATION_DATE), pois a data de adoção original não
  está registrada no repositório
- Deferred intent: automação AWS com agendamento e script Python deve ser tratada
  posteriormente por /speckit.specify
-->

# Wake Up Device Constitution

## Core Principles

### I. Contratos Explícitos e Evolução Controlada
Rotas, formulários, respostas, modelos e configurações MUST ter contratos claros e
validação no servidor. Mudanças no esquema SQLite MUST usar migrações versionadas,
e mudanças incompatíveis MUST registrar impacto e plano de transição. Isso mantém
o comportamento previsível entre a interface, a aplicação e os dados persistidos.

### II. Segurança por Padrão
Entradas HTTP, identificadores de rota e endereços de rede MUST ser validados no
servidor. Operações de banco MUST usar APIs parametrizadas. Segredos, credenciais
de nuvem e chaves MUST vir de configuração segura e nunca ser versionados. Novas
integrações MUST usar o menor privilégio necessário e destinos obtidos de dados
confiáveis, nunca de parâmetros arbitrários da requisição. Essas regras reduzem
injeção, execução contra alvos indevidos e exposição acidental de credenciais.

### III. Verificação Automatizada
Cada comportamento novo ou alterado MUST ter verificação proporcional ao risco.
Mudanças de TypeScript MUST passar pelo type-check estrito; mudanças de rotas,
validação, migrações ou integrações MUST incluir testes ou uma verificação
reproduzível equivalente. Fluxos com banco, rede ou processos externos MUST ser
verificados também na fronteira de integração. A verificação automatizada evita
regressões que uma inspeção visual não detecta.

### IV. Operação Observável e Segura
Ações que alteram o estado de dispositivos ou dependem de rede MUST comunicar
claramente sucesso, falha e limitações da confirmação. Integrações externas MUST
ter timeouts, tratamento de erro e comportamento idempotente quando aplicável.
Logs e respostas não podem expor segredos. Essa transparência permite distinguir
falha de transporte, indisponibilidade do alvo e ausência de confirmação.

### V. Simplicidade e Compatibilidade Operacional
Implementações MUST preferir os padrões, dependências e estruturas já adotados
no projeto. Novos componentes MUST ter responsabilidade única e só ser criados
quando uma necessidade concreta justificar a complexidade. A aplicação MUST
preservar execução local, persistência SQLite e operação via Docker conforme os
contratos documentados, salvo mudança aprovada explicitamente. Isso mantém o
projeto operável sem introduzir camadas de infraestrutura desnecessárias.

## Additional Constraints

- O runtime permanece Node.js em modo ESM com TypeScript estrito, Express 5,
  EJS, Sequelize 6, SQLite e `sqlite3`, salvo decisão documentada em contrário.
- Formulários HTML continuam usando `application/x-www-form-urlencoded`; novas
  entradas MUST preservar validação server-side e valores seguros na renderização.
- O arquivo SQLite MUST permanecer em armazenamento persistente quando executado
  em Docker, e os serviços de migração e aplicação MUST usar o mesmo armazenamento.
- Operações de rede MUST usar alvos carregados do banco ou de configuração validada.
  A aplicação não pode aceitar um destino de Wake-on-LAN ou ping arbitrário no
  corpo de uma requisição.
- O sistema não possui autenticação, autorização, CSRF ou limitação de requisições.
  Ele MUST permanecer restrito a uma rede confiável até que esses controles sejam
  implementados.

## Development Workflow

- Toda mudança MUST declarar o comportamento alterado, os dados afetados e os
  riscos operacionais relevantes.
- Mudanças de esquema MUST incluir migração, atualização do modelo e verificação
  em um banco vazio e em um banco existente quando a operação puder reconstruir
  tabelas SQLite.
- Antes da revisão, a autoria MUST executar `npx tsc --noEmit` e as verificações
  específicas da mudança. Alterações em EJS MUST ser renderizadas com valores
  representativos; alterações de execução MUST ser verificadas no ambiente
  correspondente, local ou Docker.
- A revisão MUST verificar segurança, validação, compatibilidade de contratos,
  persistência, tratamento de falhas e cobertura de testes. Uma exceção MUST
  registrar a justificativa e o risco aceito.

## Governance

A constituição prevalece sobre práticas locais conflitantes. Uma alteração exige
uma proposta documentada, análise do impacto sobre princípios e contratos, revisão
e atualização deste arquivo antes de a mudança ser considerada concluída. O
relatório de impacto no topo do arquivo MUST ser atualizado durante a alteração e
removido antes do commit final, pois é material temporário de revisão.

A versão usa Semantic Versioning. Um incremento MAJOR indica remoção ou redefinição
incompatível de um princípio; MINOR indica novo princípio ou expansão material de
governança; PATCH indica esclarecimento, correção textual ou refinamento semântico
sem mudança de obrigação. A data da última emenda MUST ser atualizada em toda
alteração aceita.

Cada revisão de código MUST verificar conformidade com os princípios, as restrições
e os gates de qualidade desta constituição. Violações bloqueiam a integração até
serem corrigidas ou formalmente justificadas. A cada mudança relevante de runtime,
rotas, esquema, segurança ou operação, a revisão MUST confirmar que a documentação
e os procedimentos de verificação continuam corretos.

**Version**: 1.0.0 | **Ratified**: TODO(RATIFICATION_DATE): data original de adoção não registrada | **Last Amended**: 2026-11-08
