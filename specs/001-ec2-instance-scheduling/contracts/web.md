# Web Contract: Automação EC2

Este contrato estende a interface server-rendered existente. Os formulários usam
`application/x-www-form-urlencoded`, como as telas atuais; não é necessário
habilitar multipart ou `express.json()` para o MVP.

Todas as rotas abaixo, exceto as rotas de login/callback, exigem uma sessão OIDC
válida. Qualquer identidade autenticada pelo provedor configurado é operador no
MVP; não existe allowlist local de usuários, grupos ou roles.

## Autenticação OIDC

| Método e rota | Comportamento |
| --- | --- |
| `GET /auth/login` | Cria `state`, `nonce` e verifier PKCE vinculados à sessão e redireciona ao provedor. |
| `GET /auth/callback` | Valida issuer, state, nonce, PKCE, assinatura, audience, expiração e subject; cria sessão server-side. |
| `POST /auth/logout` | Destrói a sessão local e tenta logout OIDC com callback fixo. |

Cookies de sessão são opacos, `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, sem
tokens em `localStorage`. Falha de discovery, callback ou validação não cria sessão.
Rotas HTML redirecionam para login; endpoints JSON protegidos respondem `401`.
Todos os POST e DELETE exigem token CSRF, inclusive logout e ações `fetch`.

## `GET /ec2`

Renderiza a tela de automação com:

- configuração atual da instância, região, fuso e política de recuperação;
- horários habilitados agrupados por dia;
- estado conhecido mais recente e horário da última consulta;
- próxima ação calculada no fuso `America/Sao_Paulo`;
- últimas execuções com status, ação, origem e mensagem segura.

Se não houver configuração, a tela exibe o formulário vazio e não tenta acessar a
AWS. Valores exibidos são escapados pela renderização EJS.

## `POST /ec2/config`

Recebe formulário com:

| Campo | Regra |
| --- | --- |
| `instanceId` | Obrigatório; formato de ID EC2. |
| `region` | Obrigatório; deve existir em `config/aws-ec2-regions.json` e ser uma região EC2 suportada. A validação é local e não chama a AWS. |
| `timezone` | Deve ser `America/Sao_Paulo` no MVP. |
| `recoveryEnabled` | Checkbox `0`/`1`; padrão desativado. Quando habilitado, processa todas as ocorrências perdidas. |

Em sucesso, atualiza `revision`, preserva histórico e redireciona para
`/ec2?updated=1`. Em erro, responde `422`, mantém os valores enviados e mostra
mensagem em pt-BR. A operação não aceita credenciais ou alvo AWS no formulário.

## `POST /ec2/schedules`

Recebe:

| Campo | Regra |
| --- | --- |
| `action` | `start` ou `stop`. |
| `weekday` | Inteiro de `1` a `7`. |
| `localTime` | `HH:MM` válido. |
| `enabled` | `0`/`1`. |

O controller valida a combinação, aplica `UNIQUE(action, weekday)` e redireciona
para `/ec2?updated=1`. Conflitos ou dados inválidos retornam `422` sem destruir a
agenda válida anterior.

## `POST /ec2/actions/start` e `POST /ec2/actions/stop`

Recebem `requestId` UUID, opcionalmente `mode=simulation` e, após reconciliação,
opcionalmente `reconcilesRunId`; o padrão de `mode` é `real`. O Node lê a
configuração persistida, cria um `ec2_run` com snapshot do alvo e retorna:

```http
HTTP/1.1 202 Accepted
Content-Type: application/json
```

```json
{
  "runId": 42,
  "status": "queued",
  "mode": "real",
  "message": "Solicitação registrada para processamento."
}
```

Não há chamada AWS síncrona durante a requisição web. Repetir o mesmo `requestId`
com a mesma ação, modo e alvo retorna o `runId` já criado, sem inserir outro run.
Reutilizar o mesmo `requestId` com intenção diferente retorna `409`. Um
`requestId` diferente para uma mutação real protegida por transição `active` ou
`needs_reconciliation` também retorna `409`; simulações e inspeções não adquirem
essa trava. Simulações podem ser enfileiradas mesmo sem credenciais AWS e nunca
criam um cliente Boto3.

`reconcilesRunId` só pode referenciar um run `unknown` ou `interrupted` (ou a
inspeção que o reconciliou), do mesmo alvo, e não altera o run anterior. O
controller rejeita a referência se não houver uma inspeção válida ou se o run
anterior não pertencer ao snapshot atual.

## `POST /ec2/status/refresh`

Cria uma execução manual de ação `inspect` para consultar a AWS sem alterar a
instância. Retorna `202 Accepted` com o `runId`; a interface consulta o resultado
persistido depois que o worker processar a fila. A requisição não aceita instance
ID ou região.

## `GET /ec2/status`

Retorna JSON para atualização da tela:

```json
{
  "configured": true,
  "instanceId": "i-0123456789abcdef0",
  "region": "sa-east-1",
  "observedState": "running",
  "observedAt": "2026-11-08T11:00:00Z",
  "nextAction": {
    "action": "stop",
    "localDate": "2026-11-08",
    "localTime": "19:00"
  }
}
```

O estado é o último resultado persistido, não uma promessa de consulta em tempo
real. Para obter uma leitura nova, a interface usa `POST /ec2/status/refresh` e
atualiza a tela após o `runId` terminar. Uma inspeção usada para reconciliação
referencia o run incerto e libera a trava somente quando observar estado
definitivo. Quando não houver resultado, responde `configured: false` ou informa
erro seguro sem expor detalhes de credenciais.

## `GET /ec2/runs`

Retorna ou renderiza histórico paginado de `ec2_run`, limitado por padrão às
últimas 50 execuções. Filtros permitidos são `status`, `source`, `mode` e intervalo
de datas. Os status exibidos incluem `unknown` e `conflict`, além de
`reconcilesRunId` quando houver vínculo. Nenhum valor de `error_message` pode
conter tokens, chaves ou headers. Uma execução `unknown` ou `interrupted` não
oferece retry automático; o operador consulta o estado e cria uma nova ação
somente após reconciliação manual, mantendo o run original imutável.

## Mensagens e segurança

- IDs de rota, campos de formulário e query strings são validados no servidor.
- O alvo usado pelo worker vem exclusivamente do snapshot criado a partir de
  `ec2_config`; a requisição não pode escolher um ID arbitrário.
- O web app exige OIDC e CSRF, mas continua restrito à rede confiável até a
  configuração de TLS, issuer e callback seguros no deployment.
- A UI deve distinguir `requested`, `observed`, `noop`, `skipped`, `simulated`,
  `failed`, `interrupted`, `unknown` e `conflict`, sem afirmar que a EC2 atingiu
  o estado final após a solicitação.
