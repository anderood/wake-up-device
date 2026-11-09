# Quickstart: Validar Automação EC2

Este guia valida a feature sem exigir uma operação real até o passo explicitamente
marcado. Os comandos pressupõem Linux/Raspberry Pi e o repositório na raiz do
projeto.

## Pré-requisitos

- Node.js 23.6 ou mais recente e dependências atuais instaladas.
- Python 3.11 ou mais recente, `venv`, pytest e acesso local ao arquivo SQLite.
- systemd no host de execução e relógio sincronizado por NTP.
- Um provedor OIDC configurado com issuer HTTPS, client ID, secret, callback e
  logout URI exatos; a aplicação deve ser servida por TLS.
- Para execução real: uma conta AWS, uma instância EC2 autorizada e o perfil
  temporário configurado conforme `research.md` e `README.md`.
- Para simulação e testes: nenhuma credencial AWS é necessária.

## Preparar o ambiente

1. Instale as dependências Node:

   ```bash
   npm install
   ```

2. Crie o ambiente Python do worker:

   ```bash
   python3 -m venv .venv
   . .venv/bin/activate
   python -m pip install --upgrade pip
   python -m pip install -e 'worker[test]'
   ```

3. Defina um caminho absoluto compartilhado para o SQLite. Node e Python devem
   apontar para o mesmo arquivo, no mesmo filesystem local:

   ```bash
   export DB_STORAGE="$PWD/wake-up-device.sqlite"
   ```

   Confirme que `config/aws-ec2-regions.json` contém a região escolhida. Salvar
   uma região ausente deve retornar `422` sem credenciais AWS e sem chamada de
   rede.

4. Aplique as migrations antes de iniciar qualquer processo:

   ```bash
   DB_STORAGE="$DB_STORAGE" npm run db:migrate
   ```

## Validar testes sem AWS

Execute:

```bash
pytest worker/tests -q
npx tsc --noEmit
```

Os testes devem cobrir horários em `America/Sao_Paulo`, deduplicação por minuto,
transições `stopped`/`running`, estados intermediários, simulação sem cliente
Boto3, falhas AWS com Stubber e concorrência no SQLite. O type-check deve passar
sem alterar os contratos TypeScript existentes.

## Validar a interface e a simulação

1. Inicie o web app com `DB_STORAGE` apontando para o mesmo arquivo:

   ```bash
   DB_STORAGE="$DB_STORAGE" npm start
   ```

2. Acesse `/ec2` e conclua o login no provedor OIDC. Confirme que uma identidade
   aceita pelo provedor consegue entrar sem allowlist adicional.
3. Salve uma instância de teste, região `sa-east-1`, fuso `America/Sao_Paulo` e
   horários próximos.
4. Adicione dias e horários de início/desligamento.
5. Use **Simular início** e **Simular desligamento**.
6. Confirme que a tela mostra `simulated`, que `ec2_run` foi registrado e que
   nenhum cliente AWS ou operação real foi necessário.
7. Consulte o histórico e confirme que não existem tokens, chaves ou credenciais.
8. Use **Atualizar estado** para criar uma consulta manual; confirme que o estado
   observado chega pelo worker e que nenhuma ação de início ou desligamento é
   enviada.
9. Repita uma ação manual com o mesmo `requestId` e confirme que o mesmo `runId`
   é retornado sem uma segunda linha em `ec2_run`. Envie outro `requestId` durante
   uma transição real e confirme `409`.
10. Remova o cookie de sessão ou expire a sessão e confirme que páginas protegidas
   redirecionam ao login e endpoints JSON respondem `401`.
11. Envie um formulário sem CSRF e confirme resposta `403` sem criar uma execução.

## Validar um tick local

Com o ambiente Python ativo:

```bash
DB_STORAGE="$DB_STORAGE" python -m ec2_worker.cli --tick
```

Sem uma agenda que coincida com o minuto atual, o comando não deve criar uma ação
automática. O comando deve sair com código `0` e deixar o banco íntegro.

Para testar um horário, configure uma agenda para o próximo minuto no fuso
correto, execute o tick no minuto correspondente e confirme no histórico que a
chave de ocorrência contém `automatic:<schedule_id>:<scheduled-instant>`. Reexecutar
o mesmo tick não deve criar um segundo run.

Para validar recuperação completa, deixe o worker parado durante pelo menos duas
ocorrências, habilite `recoveryEnabled` e execute o tick. Confirme que todas as
ocorrências perdidas foram materializadas e processadas em ordem, sem coalescer ou
descartar o backlog. Com a opção desabilitada, confirme que o cursor avança sem
criar ações atrasadas.

## Configurar credenciais reais

1. Configure um perfil AWS sem secrets no repositório, usando preferencialmente
   IAM Roles Anywhere e `credential_process`.
2. Verifique que o helper retorna credenciais temporárias somente para o usuário
   Unix do worker e que a chave privada não é legível por outros usuários.
3. Aplique uma política com somente `DescribeInstances`, `StartInstances` e
   `StopInstances`, restringindo start/stop ao ARN da instância.
4. Teste primeiro a consulta de estado e uma ação em janela controlada. Não use
   `--dry-run` como substituto da simulação da interface.

## Ativar systemd

Depois de instalar o pacote e ajustar os caminhos dos arquivos de unidade:

```bash
sudo install -m 0644 deploy/systemd/wake-up-device-ec2.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/wake-up-device-ec2.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now wake-up-device-ec2.timer
systemctl list-timers wake-up-device-ec2.timer
systemctl status wake-up-device-ec2.timer
journalctl -u wake-up-device-ec2.service -n 50 --no-pager
```

O timer executa um tick por minuto. `Persistent=false` impede que o systemd faça
um catch-up implícito; o worker aplica a política persistida. Com recuperação
desabilitada, uma janela perdida não é repetida. Com recuperação habilitada, todas
as ocorrências perdidas são materializadas pelo cursor e processadas em ordem.
O worker marca execuções interrompidas sem reenviar mutações desconhecidas.

## Validação de falhas e segurança

- Remova temporariamente a permissão `ec2:StartInstances` em um ambiente de teste
  e confirme um resultado `permission` sem encerramento do serviço.
- Bloqueie temporariamente a rede e confirme um resultado `network`/`timeout`,
  sem retry infinito; com recuperação desabilitada, não há replay posterior.
- Mate o worker durante uma execução controlada; no próximo tick confirme que o
  run ficou `interrupted` e não foi repetido automaticamente.
- Simule uma resposta perdida depois de uma mutação e confirme um run `unknown` ou
  `interrupted`, sem segunda mutação automática e com a trava em
  `needs_reconciliation`.
- Crie uma inspeção para o run incerto, confirme que ela referencia o run original
  e, somente após um estado definitivo, crie uma nova ação com
  `reconcilesRunId`; confirme que o run original não foi alterado.
- Reinicie o host antes de um horário e confirme que o próximo horário futuro é
  executado. Verifique a política escolhida: sem recuperação o horário perdido é
  ignorado; com recuperação todas as ocorrências perdidas são processadas.
- Execute `systemd-analyze calendar '*-*-* *:*:00'` para validar a expressão do
  timer.

## Validar systemd, memória e continuidade

Antes de instalar as units, execute:

```bash
systemd-analyze verify deploy/systemd/wake-up-device-ec2.service \
  deploy/systemd/wake-up-device-ec2.timer
systemd-analyze calendar --iterations=5 '*-*-* *:*:00'
timedatectl show -p NTPSynchronized --value
```

Depois de ativar o timer, confirme `Persistent=false`, ausência de execuções
sobrepostas, duração normal menor que 45 segundos e despacho até 60 segundos
após o horário configurado. Meça uma execução representativa sem AWS:

```bash
/usr/bin/time -f 'elapsed=%e maxrss_kib=%M' \
  env DB_STORAGE="$DB_STORAGE" \
  .venv/bin/python -m ec2_worker.cli --tick --dry-run
```

Os critérios são RSS abaixo de `65536 KiB`, tick normal abaixo de 45 segundos e
latência de despacho de no máximo 60 segundos. Para o soak, mantenha a unidade
ativa por sete dias, valide os logs/journald, `systemctl show ... -p MemoryPeak`,
`sqlite3 "$DB_STORAGE" 'PRAGMA integrity_check;'` com resultado `ok`, e confirme
que a rotina executou os ticks esperados sem reinicialização manual, OOM ou
corrupção do SQLite.
