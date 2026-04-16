# API de Dados — Documentação Interna

API privada para acesso aos dados do banco, destinada exclusivamente ao desenvolvedor (user ID 1).

| | URL |
|-|-----|
| **Frontend** | `http://172.19.1.15:3000` |
| **API (base URL)** | `http://172.19.1.15:5000` |

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
`accountingMonthsCount_min` / `accountingMonthsCount_max`

#### Faixas de data
`createdAt_from` / `createdAt_to`,
`statusUpdatedAt_from` / `statusUpdatedAt_to`,
`fiscalCompletedAt_from` / `fiscalCompletedAt_to`,
`dpCompletedAt_from` / `dpCompletedAt_to`,
`contabilCompletedAt_from` / `contabilCompletedAt_to`

### Exemplos

```bash
# Todas as empresas ativas do Simples com responsável fiscal = Heidy
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:5000/api/data/companies?rule=Simples&status=ATIVA&respFiscalName=Heidy"

# Empresas com +30 funcionários, não arquivadas, ordenadas por nome
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:5000/api/data/companies?employeesCount_min=30&isArchived=false&orderBy=name"

# Empresas sem responsável fiscal (campo null)
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:5000/api/data/companies?respFiscalId=null&isArchived=false"

# Buscar por CNPJ parcial
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:5000/api/data/companies?cnpj=22854614"

# Criadas em 2025, página 2
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:5000/api/data/companies?createdAt_from=2025-01-01&createdAt_to=2025-12-31&limit=50&offset=50"
```

---

## `GET /api/data/companies/:id`

Retorna empresa completa com impostos, obrigações, automações, grupo e modo de contato.

```bash
curl -H "X-API-Key: <key>" http://172.19.1.15:5000/api/data/companies/3
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
  "http://172.19.1.15:5000/api/data/users?department=Fiscal&hasBonus=true"

# Busca pelo nome
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:5000/api/data/users?name=beatriz"
```

---

## `GET /api/data/automations`

Retorna automações com lista de empresas vinculadas.

```bash
curl -H "X-API-Key: <key>" http://172.19.1.15:5000/api/data/automations
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
  "http://172.19.1.15:5000/api/data/taxes?month=4&year=2026&type=DAS"
```

---

## `GET /api/data/obligations`

| Parâmetro | Exemplo |
|-----------|---------|
| `month` | `4` |
| `year` | `2026` |

```bash
curl -H "X-API-Key: <key>" \
  "http://172.19.1.15:5000/api/data/obligations?month=4&year=2026"
```

---

## Exemplo Python completo

```python
import requests

KEY = "sua_chave_aqui"
BASE = "http://172.19.1.15:5000"
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
| `401` | API Key ausente, inválida ou revogada |
| `403` | Operação restrita ao user ID 1 |
| `404` | Recurso não encontrado |
| `500` | Erro interno |
