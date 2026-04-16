# API de Dados — Documentação Interna

API privada para acesso aos dados do banco, destinada exclusivamente ao desenvolvedor (user ID 1) para uso em automações e scripts.

---

## Autenticação

Toda requisição aos endpoints de dados deve incluir o header:

```
X-API-Key: <sua_chave>
```

As chaves são geradas pelo frontend em **Admin → API Keys** (visível apenas para o user 1) ou via curl como descrito abaixo.

---

## Gerenciamento de Chaves

Estes endpoints usam autenticação JWT normal (`Authorization: Bearer <token>`).

### Gerar nova chave

```
POST /api-keys
Content-Type: application/json
Authorization: Bearer <token>

{ "name": "Nome da chave" }
```

Resposta (`201`):
```json
{
  "id": 1,
  "name": "Script DAS",
  "key": "a1b2c3d4...64chars",
  "createdAt": "2026-04-16T10:00:00.000Z"
}
```

> A key completa só é retornada neste momento. Guarde-a com segurança.

### Listar chaves

```
GET /api-keys
Authorization: Bearer <token>
```

Resposta (`200`): array de `{ id, name, active, lastUsedAt, createdAt }`

### Revogar chave

```
DELETE /api-keys/:id
Authorization: Bearer <token>
```

---

## Endpoints de Dados

Base URL: `http://localhost:5000`

Todos os endpoints são somente-leitura (`GET`).

---

### `GET /api/data/companies`

Lista todas as empresas.

**Filtros (query string):**

| Parâmetro | Exemplo | Descrição |
|-----------|---------|-----------|
| `regime` | `Simples` | Regime tributário (`Simples`, `Presumido`, `Real`, `MEI`) |
| `status` | `Em dia` | Status da empresa |
| `grupoId` | `3` | ID do grupo |
| `respFiscalId` | `2` | ID do responsável fiscal |
| `respDpId` | `5` | ID do responsável DP |
| `respContabilId` | `4` | ID do responsável contábil |

**Exemplo:**
```bash
curl -H "X-API-Key: <key>" "http://localhost:5000/api/data/companies?regime=Simples&status=Em+dia"
```

---

### `GET /api/data/companies/:id`

Retorna uma empresa específica com impostos, obrigações e automações vinculadas.

**Exemplo:**
```bash
curl -H "X-API-Key: <key>" http://localhost:5000/api/data/companies/42
```

---

### `GET /api/data/users`

Lista usuários ativos (exclui `not-validated`).

**Exemplo:**
```bash
curl -H "X-API-Key: <key>" http://localhost:5000/api/data/users
```

---

### `GET /api/data/automations`

Lista todas as automações com as empresas vinculadas a cada uma.

**Exemplo:**
```bash
curl -H "X-API-Key: <key>" http://localhost:5000/api/data/automations
```

---

### `GET /api/data/taxes`

Lista statuses de impostos.

**Filtros:**

| Parâmetro | Exemplo | Descrição |
|-----------|---------|-----------|
| `month` | `4` | Mês (1–12) |
| `year` | `2026` | Ano |
| `type` | `DAS` | Tipo do imposto (`DAS`, `ICMS`, `ISS`, `PIS/COFINS`, `IRPJ/CSLL`, `IPI`, `IRRF`) |

**Exemplo:**
```bash
curl -H "X-API-Key: <key>" "http://localhost:5000/api/data/taxes?month=4&year=2026&type=DAS"
```

---

### `GET /api/data/obligations`

Lista statuses de obrigações acessórias.

**Filtros:**

| Parâmetro | Exemplo | Descrição |
|-----------|---------|-----------|
| `month` | `4` | Mês (1–12) |
| `year` | `2026` | Ano |

**Exemplo:**
```bash
curl -H "X-API-Key: <key>" "http://localhost:5000/api/data/obligations?month=4&year=2026"
```

---

## Exemplo de Script Python

```python
import requests

API_KEY = "sua_chave_aqui"
BASE_URL = "http://localhost:5000"
HEADERS = {"X-API-Key": API_KEY}

# Buscar empresas do Simples com DAS em atraso
companies = requests.get(
    f"{BASE_URL}/api/data/companies",
    headers=HEADERS,
    params={"regime": "Simples"}
).json()

das = requests.get(
    f"{BASE_URL}/api/data/taxes",
    headers=HEADERS,
    params={"month": 4, "year": 2026, "type": "DAS"}
).json()

print(f"{len(companies)} empresas no Simples")
print(f"{len(das)} registros de DAS em abril/2026")
```

---

## Erros

| Código | Descrição |
|--------|-----------|
| `401` | API Key não fornecida ou inválida/revogada |
| `403` | Operação restrita ao desenvolvedor (user ID 1) |
| `404` | Recurso não encontrado |
| `500` | Erro interno do servidor |
