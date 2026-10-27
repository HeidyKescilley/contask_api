# API de Dados — Documentação Interna

API privada para consulta e alteração em lote de dados do banco, destinada exclusivamente ao desenvolvedor (user ID 1).

| | URL |
|-|-----|
| **Frontend** | `http://172.19.1.15:3000` |
| **API (base URL)** | `http://172.19.1.15:8800` |

---

## Autenticação

Toda requisição aos endpoints de dados deve incluir o header:

```
X-API-Key: <sua_chave>
```

Chaves são gerenciadas pelo frontend em **Admin → API Keys** (visível apenas para user 1).

---

## Gerenciamento de Chaves

Usam autenticação JWT normal (`Authorization: Bearer <token>`).

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/api-keys` | Gera nova chave — body: `{ "name": "..." }` |
| `GET` | `/api-keys` | Lista chaves |
| `DELETE` | `/api-keys/:id` | Revoga chave |

> A key completa só é retornada no `POST`. Guarde-a — não aparece novamente.

---

## Convenções de Filtros

Todos os endpoints `GET /api/data/*` aceitam filtros via query string:

| Tipo | Parâmetro | Comportamento |
|------|-----------|---------------|
| **Texto** | `?name=maria` | LIKE parcial, case-insensitive (`%maria%`) |
| **Exato** | `?status=ATIVA` | Igualdade exata |
| **Booleano** | `?isArchived=false` | Aceita `true/false` ou `1/0` |
| **Nulo** | `?respFiscalId=null` | Filtra registros onde o campo é NULL |
| **Faixa numérica** | `?employeesCount_min=10&employeesCount_max=50` | Entre 10 e 50 |
| **Faixa de data** | `?createdAt_from=2025-01-01&createdAt_to=2025-12-31` | Formato `YYYY-MM-DD` |
| **Nome do resp.** | `?respFiscalName=heidy` | LIKE no nome do usuário relacionado |

### Paginação e ordenação (todos os endpoints)

| Parâmetro | Padrão | Descrição |
|-----------|--------|-----------|
| `limit` | `500` | Máximo de registros (teto: 1000) |
| `offset` | `0` | Pular N registros |
| `orderBy` | `name` | Campo para ordenar |
| `order` | `ASC` | `ASC` ou `DESC` |

A resposta sempre inclui `{ total, limit, offset, data: [...] }`.

---

## `GET /api/data/companies`

### Filtros disponíveis

#### Exatos / enum
| Parâmetro | Valores de exemplo |
|-----------|--------------------|
| `id` | `42` |
| `num` | `1307` |
| `rule` | `Simples` · `Presumido` · `Real` · `MEI` |
| `classi` | `ICMS` · `ISS` · `ICMS/ISS` |
| `status` | `ATIVA` · `DISTRATO` · `PARALISADA` · `SUSPENSA` |
| `uf` | `DF` · `SP` · `MG` … |
| `branchNumber` | `1` |
| `respFiscalId` | `1` (ID do usuário) |
| `respDpId` | `8` |
| `respContabilId` | `13` |
| `grupoId` | `3` |
| `contactModeId` | `1` |

#### Busca parcial (texto)
`name`, `cnpj`, `ie`, `email`, `phone`, `contact`, `obs`, `important_info`

#### Por nome do responsável (join)
`respFiscalName`, `respDpName`, `respContabilName`

#### Booleanos
`isArchived`, `isHeadquarters`, `openedByUs`,
`isZeroedFiscal`, `sentToClientFiscal`,
`isZeroedDp`, `sentToClientDp`, `declarationsCompletedDp`, `hasNoDpObligations`,
`isZeroedContabil`

#### Faixas numéricas
`bonusValue_min` / `bonusValue_max`,
`employeesCount_min` / `employeesCount_max`,
`contabilNota_min` / `contabilNota_max`

#### Faixas de data
`createdAt_from` / `createdAt_to`,
`statusUpdatedAt_from` / `statusUpdatedAt_to`,
`fiscalCompletedAt_from` / `fiscalCompletedAt_to`,
`dpCompletedAt_from` / `dpCompletedAt_to`,
`contabilCompletedAt_from` / `contabilCompletedAt_to`

#### Certificado digital
Cada empresa retorna `certificateStatus` (`verde` · `amarelo` · `vermelho` · `cinza`), `certificateValid` (true para verde/amarelo),
`certificateValidFrom`, `certificateValidUntil` e `certificateDaysLeft`.

| Parâmetro | Descrição |
|-----------|-----------|
| `certificateStatus` | `verde` (válido, >15 dias) · `amarelo` (vence em até 15 dias) · `vermelho` (vencido) · `cinza` (sem certificado). Apelidos: `valido`, `vencendo`, `vencido`, `sem_certificado`. Aceita lista: `verde,amarelo` |
| `certificateValidUntil_from` / `certificateValidUntil_to` | Faixa de validade (YYYY-MM-DD) |

### Exemplos

```bash
# Todas as empresas ativas do Simples com responsável fiscal = Heidy
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:8800/api/data/companies?rule=Simples&status=ATIVA&respFiscalName=Heidy"

# Empresas com +30 funcionários, não arquivadas, ordenadas por nome
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:8800/api/data/companies?employeesCount_min=30&isArchived=false&orderBy=name"

# Empresas sem responsável fiscal (campo null)
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:8800/api/data/companies?respFiscalId=null&isArchived=false"

# Buscar por CNPJ parcial
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:8800/api/data/companies?cnpj=22854614"

# Criadas em 2025, página 2
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:8800/api/data/companies?createdAt_from=2025-01-01&createdAt_to=2025-12-31&limit=50&offset=50"
```

---

## `PATCH /api/data/companies/bulk`

Altera campos de **várias empresas de uma vez**. Escolha as empresas por `filter` (mesmos parâmetros do `GET /companies`), por `cnpjs` (lista, com ou sem pontuação) e/ou `ids`. Quando mais de um critério é informado, todos precisam ser atendidos (AND).

Body (JSON, `Content-Type: application/json`):

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `filter` | objeto | Filtros como no `GET /companies`, ex.: `{ "rule": "Simples", "respFiscalId": 3 }` |
| `cnpjs` | array | CNPJs exatos, ex.: `["22.854.614/0001-00", "12345678000199"]` |
| `ids` | array | IDs das empresas |
| `set` | objeto | **Obrigatório.** Campos a alterar e novos valores. `null` limpa o campo (exceto os obrigatórios) |
| `dryRun` | boolean | `true` apenas lista as empresas afetadas, sem gravar |

Regras de segurança:
- É obrigatório informar `filter`, `cnpjs` ou `ids`; não é possível alterar todas as empresas sem critério.
- Se o critério atingir mais de **1000** empresas, a operação é recusada.
- Recomenda-se rodar primeiro com `"dryRun": true`.

Campos permitidos em `set`:

| Tipo | Campos |
|------|--------|
| Texto | `phone`, `email`*, `contact`, `ie`*, `uf`, `obs`, `important_info`, `branchNumber`, `contractInit`, `rule`*, `classi`* |
| Inteiro / FK | `respFiscalId`, `respDpId`, `respContabilId`, `contactModeId`, `grupoId`, `bonusValue`, `employeesCount`, `contabilNota` (1–5) |
| Booleano | `openedByUs`, `isArchived`*, `isHeadquarters`* |

\* não aceita `null`. Não podem ser alterados em lote: `id`, `cnpj`, `name`, `num` e `status` (a mudança de status gera histórico e deve usar a rota própria).

Resposta: `{ dryRun, matched, updated, set, companies: [{ id, name, cnpj }] }`. Erros de validação retornam `400` com `message`.

```bash
# 1) Simular: trocar o telefone da empresa com este CNPJ
curl -X PATCH -H "X-API-Key: <key>" -H "Content-Type: application/json" \
  http://172.19.1.15:8800/api/data/companies/bulk \
  -d '{"cnpjs":["22854614000100"],"set":{"phone":"(61) 99999-0000"},"dryRun":true}'

# 2) Aplicar (mesmo body, sem dryRun)
curl -X PATCH -H "X-API-Key: <key>" -H "Content-Type: application/json" \
  http://172.19.1.15:8800/api/data/companies/bulk \
  -d '{"cnpjs":["22854614000100"],"set":{"phone":"(61) 99999-0000"}}'

# Passar todas as empresas ativas do Simples do resp. fiscal 3 para o 5
curl -X PATCH -H "X-API-Key: <key>" -H "Content-Type: application/json" \
  http://172.19.1.15:8800/api/data/companies/bulk \
  -d '{"filter":{"rule":"Simples","status":"ATIVA","respFiscalId":3},"set":{"respFiscalId":5}}'

# Filtro parcial por CNPJ (raiz) + vários campos
curl -X PATCH -H "X-API-Key: <key>" -H "Content-Type: application/json" \
  http://172.19.1.15:8800/api/data/companies/bulk \
  -d '{"filter":{"cnpj":"22854614"},"set":{"phone":"(61) 3333-0000","email":"novo@cliente.com"}}'
```

> Os CNPJs são gravados sem pontuação. Em `cnpjs` a pontuação é ignorada; em `filter.cnpj` a busca é parcial (LIKE), então use apenas dígitos.

---

## Telefones e contatos da empresa

Cada empresa pode ter **vários telefones**, e cada telefone guarda o **nome do contato** associado (o contato fica ligado ao número). O campo antigo `phone`/`contact` da empresa continua existindo; os novos telefones vêm em `phones: [{ id, number, contactName }]` no `GET /companies` e no `GET /companies/:id`.

Regras: `number` aceita máscara e precisa ter de 8 a 15 dígitos (com DDD); não pode haver o mesmo número duas vezes na mesma empresa (`409`); `contactName` é opcional.

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/data/companies/:id/phones` | Lista os telefones da empresa |
| `POST` | `/api/data/companies/:id/phones` | Adiciona um telefone `{ "number", "contactName" }` ou vários `{ "phones": [...] }` |
| `PATCH` | `/api/data/companies/:id/phones/:phoneId` | Altera `number` e/ou `contactName` (só o que for enviado) |
| `PUT` | `/api/data/companies/:id/phones` | Substitui a lista inteira: `{ "phones": [{ "id"?, "number", "contactName" }] }`. Com `id` atualiza; sem `id` cria; o que não vier na lista é removido |
| `DELETE` | `/api/data/companies/:id/phones/:phoneId` | Remove o telefone (e o contato ligado a ele) |

As mesmas rotas existem com login normal (JWT) em `/company/:id/phones...`, usadas pelo frontend.

Filtros novos no `GET /companies`: `phoneNumber` (dígitos, busca parcial) e `phoneContact` (nome do contato, busca parcial).

```bash
# Adicionar dois telefones com contato
curl -X POST -H "X-API-Key: <key>" -H "Content-Type: application/json" \
  http://172.19.1.15:8800/api/data/companies/3/phones \
  -d '{"phones":[{"number":"(61) 99999-0001","contactName":"Maria"},{"number":"61 3333-0002","contactName":"Financeiro"}]}'

# Trocar só o nome do contato
curl -X PATCH -H "X-API-Key: <key>" -H "Content-Type: application/json" \
  http://172.19.1.15:8800/api/data/companies/3/phones/7 \
  -d '{"contactName":"Maria Souza"}'

# Trocar só o número (o contato continua ligado)
curl -X PATCH -H "X-API-Key: <key>" -H "Content-Type: application/json" \
  http://172.19.1.15:8800/api/data/companies/3/phones/7 \
  -d '{"number":"61 98888-7777"}'

# Empresas que têm um contato chamado "maria"
curl -H "X-API-Key: <key>" "http://172.19.1.15:8800/api/data/companies?phoneContact=maria"
```

---

## `GET /api/data/companies/:id`

Retorna empresa completa com impostos, obrigações, automações, grupo e modo de contato.

```bash
curl -H "X-API-Key: <key>" http://172.19.1.15:8800/api/data/companies/3
```

---

## `GET /api/data/users`

### Filtros disponíveis

| Parâmetro | Tipo | Exemplo |
|-----------|------|---------|
| `id` | exato | `1` |
| `name` | parcial | `heidy` |
| `email` | parcial | `contelb` |
| `department` | exato | `Fiscal` · `Pessoal` · `Contábil` · `Financeiro` · `Processual` · `Outros` |
| `role` | exato | `admin` · `user` · `not-validated` |
| `ramal` | parcial | `9731` |
| `hasBonus` | booleano | `true` |
| `birthday_from` / `birthday_to` | data | `1990-01-01` |
| `createdAt_from` / `createdAt_to` | data | `2025-01-01` |

Senhas **nunca** são retornadas.

```bash
# Todos do Fiscal com bonus
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:8800/api/data/users?department=Fiscal&hasBonus=true"

# Busca pelo nome
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:8800/api/data/users?name=beatriz"
```

---

## `GET /api/data/automations`

Retorna automações com lista de empresas vinculadas.

```bash
curl -H "X-API-Key: <key>" http://172.19.1.15:8800/api/data/automations
```

---

## `GET /api/data/taxes`

| Parâmetro | Exemplo | Descrição |
|-----------|---------|-----------|
| `month` | `4` | Mês (1–12) |
| `year` | `2026` | Ano |
| `type` | `DAS` | `DAS` · `ICMS` · `ISS` · `PIS/COFINS` · `IRPJ/CSLL` · `IPI` · `IRRF` |

```bash
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:8800/api/data/taxes?month=4&year=2026&type=DAS"
```

---

## `GET /api/data/obligations`

| Parâmetro | Exemplo |
|-----------|---------|
| `month` | `4` |
| `year` | `2026` |

```bash
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:8800/api/data/obligations?month=4&year=2026"
```

---

## Exemplo Python completo

```python
import requests

KEY = "sua_chave_aqui"
BASE = "http://172.19.1.15:8800"
H = {"X-API-Key": KEY}

# Empresas do Simples ativas com resp. fiscal = Heidy, com bônus
companies = requests.get(f"{BASE}/api/data/companies", headers=H, params={
    "rule": "Simples",
    "status": "ATIVA",
    "respFiscalName": "Heidy",
    "isArchived": "false",
    "limit": 1000,
}).json()

print(f"{companies['total']} empresas encontradas")
for c in companies["data"]:
    print(c["name"], c["cnpj"])

# Usuários do Fiscal
users = requests.get(f"{BASE}/api/data/users", headers=H, params={
    "department": "Fiscal",
    "hasBonus": "true",
}).json()

for u in users["data"]:
    print(u["name"], u["email"])
```

---

## Códigos de erro

| Código | Descrição |
|--------|-----------|
| `400` | Body inválido na atualização em lote (sem critério, campo não permitido, valor inválido ou mais de 1000 empresas) |
| `401` | API Key ausente, inválida ou revogada |
| `403` | Operação restrita ao user ID 1 |
| `404` | Recurso não encontrado |
| `500` | Erro interno |
