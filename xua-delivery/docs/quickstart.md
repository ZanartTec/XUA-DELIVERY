# Xuá Delivery — Quickstart

> Como rodar e testar o projeto localmente.

---

## Pré-requisitos

- **Node.js** 22 LTS
- **Docker** + Docker Compose (para PostgreSQL e Redis)
- **Git**

---

## 1. Clonar e instalar

```bash
git clone <repo-url>
cd xua-delivery
npm install
```

## 2. Subir infraestrutura (PostgreSQL 16 + Redis 7)

```bash
docker compose up -d
```

Aguardar healthcheck:
```bash
docker compose ps  # Status: healthy
```

Serviços:
- **PostgreSQL**: `localhost:5432` — DB: `xua_delivery`, User: `xua`, Pass: `xua_secret_change_me`
- **Redis**: `localhost:6379`

## 3. Configurar variáveis de ambiente

Criar `.env` na raiz do projeto:
```env
DATABASE_URL=postgresql://xua:xua_secret_change_me@localhost:5432/xua_delivery
REDIS_URL=redis://localhost:6379
JWT_SECRET=minha-chave-secreta-minimo-32-caracteres-aqui
OTP_SECRET=outra-chave-secreta-para-hmac-otp-256bits
PAYMENT_WEBHOOK_SECRET=chave-hmac-do-gateway-pagamento
```

## 4. Executar migrations e seed

```bash
npx prisma migrate deploy
npx prisma db seed
```

O seed cria:
- 1 Produto: Galão de Água 20L (R$ 25,00 + R$ 10,00 caução)
- 1 Distribuidora: Distribuidora Xuá SP
- 1 Zona: Centro-SP com 2 coberturas (CEPs 01310-100, 01303-001)
- 5 Usuários (todos com senha: `senha123`):
  - `joao@xua.com.br` (consumer)
  - `admin@xua.com.br` (distributor_admin)
  - `driver@xua.com.br` (driver)
  - `ops@xua.com.br` (ops)
  - `support@xua.com.br` (support)
- 1 Endereço: Rua das Flores, 123 — Centro/SP
- Capacidade: próximos 7 dias (manhã + tarde, 20 slots cada)
- 1 Pedido de exemplo: status CONFIRMED, 1x Galão 20L, pagamento PIX capturado

## 5. Rodar o servidor

```bash
npx ts-node server.ts
```

Acesse: `http://localhost:3000`

O custom server inicializa:
- Next.js App Router (SSR/CSR)
- Socket.io (mesmo processo, porta 3000)
- Cron: assinaturas (06h São Paulo) + OTP cleanup (cada 15min)

## 6. Acessar por perfil

| Perfil | Login | Redireciona para |
|---|---|---|
| Consumidor | `joao@xua.com.br` / `senha123` | `/catalog` |
| Distribuidor | `admin@xua.com.br` / `senha123` | `/distributor/queue` |
| Motorista | `driver@xua.com.br` / `senha123` | `/driver/deliveries` |
| Ops | `ops@xua.com.br` / `senha123` | `/ops/kpis` |
| Suporte | `support@xua.com.br` / `senha123` | `/ops/support` |

## 7. Testar API manualmente

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"joao@xua.com.br","password":"senha123"}' \
  -c cookies.txt

# Listar pedidos (usando cookie)
curl http://localhost:3000/api/orders -b cookies.txt

# Criar pedido
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "address_id": "00000000-0000-0000-0000-000000000200",
    "distributor_id": "00000000-0000-0000-0000-000000000010",
    "zone_id": "00000000-0000-0000-0000-000000000020",
    "delivery_date": "2026-03-22",
    "delivery_window": "MORNING",
    "items": [{
      "product_id": "00000000-0000-0000-0000-000000000001",
      "product_name": "Galão de Água 20L",
      "unit_price_cents": 2500,
      "quantity": 2
    }]
  }'

# Ver capacidade
curl "http://localhost:3000/api/zones/00000000-0000-0000-0000-000000000020/capacity?date=2026-03-22" \
  -b cookies.txt
```

## 8. Prisma Studio (visualizar dados)

```bash
npx prisma studio
```

Acesse: `http://localhost:5555`

---

## Troubleshooting

| Problema | Solução |
|---|---|
| `FATAL: REDIS_URL não definido` | Verificar `.env` está na raiz do projeto e Redis rodando |
| `FATAL: JWT_SECRET não definido` | Definir `JWT_SECRET` no `.env` |
| `EPERM: rmdir .next` (Windows) | Parar processos `node`, deletar `.next/`, rebuildar |
| `P1001: Can't reach database` | Verificar Docker está rodando: `docker compose ps` |
| `Socket.io não inicializado` | Rodar via `npx ts-node server.ts` (não `next dev`) |
