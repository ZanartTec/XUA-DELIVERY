# Deploy para Demonstração — Xuá Delivery

> Guia para colocar o sistema online (gratuito) para apresentação.

---

## Pré-requisito: Commit e push

```bash
cd d:\xua\XUA-DELIVERY\xua-delivery
git add -A
git commit -m "chore: deploy configs, cleanup, fixes"
git push origin migracao_node
```

---

## PARTE 1 — API no Render (gratuito)

### 1.1. Criar conta/login

Acesse https://render.com e crie uma conta (pode usar GitHub).

### 1.2. Criar Web Service

1. Clique **New > Web Service**
2. Conecte o repositório `ZanartTec/XUA-DELIVERY`
3. Configure:

| Campo | Valor |
|-------|-------|
| Branch | `migracao_node` |
| Root Directory | *(deixe vazio)* |
| Runtime | `Node` |
| Build Command | `npm install && npx prisma generate` |
| Start Command | `npx tsx apps/api/src/server/index.ts` |
| Instance Type | **Free** |

### 1.3. Environment Variables

Adicione no painel **Settings > Environment**:

| Variável | Valor |
|----------|-------|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | *(string de conexão do Prisma Postgres)* |
| `REDIS_URL` | *(string de conexão do Redis Labs)* |
| `JWT_SECRET` | *(chave de 32+ caracteres)* |
| `OTP_SECRET` | *(chave segura qualquer)* |
| `APP_ORIGIN` | *(preencha depois com a URL da Vercel — passo 2.4)* |
| `INTERNAL_SECRET` | *(segredo compartilhado com o frontend)* |
| `INTERNAL_JOB_SECRET` | *(segredo para cron jobs)* |
| `PAYMENT_WEBHOOK_SECRET` | *(segredo do gateway de pagamento)* |
| `PAYMENT_PROVIDER` | `mock` |
| `VAPID_PUBLIC_KEY` | *(chave pública VAPID)* |
| `VAPID_PRIVATE_KEY` | *(chave privada VAPID)* |
| `VAPID_EMAIL` | `mailto:contato@xua.com.br` |

> Os valores reais estão em `apps/api/.env` (não commitado).

### 1.4. Deploy

Clique **Create Web Service**. Aguarde o build (~2-3 min).  
A URL gerada será algo como: `https://xua-api-xxxx.onrender.com`

### 1.5. Verificação

Abra no browser:

```
https://xua-api-xxxx.onrender.com/health
```

Deve retornar `{"status":"ok"}`.

---

## PARTE 2 — Frontend na Vercel (gratuito)

### 2.1. Criar conta/login

Acesse https://vercel.com e crie uma conta (pode usar GitHub).

### 2.2. Importar projeto

1. Clique **Add New Project**
2. Importe o repositório `ZanartTec/XUA-DELIVERY`
3. Configure:

| Campo | Valor |
|-------|-------|
| Framework Preset | **Next.js** |
| Root Directory | `apps/web` |
| Build Command | `npm run build` *(já no vercel.json)* |
| Install Command | `npm install --prefix ../..` *(já no vercel.json)* |

### 2.3. Environment Variables

Adicione no painel **Settings > Environment Variables**:

| Variável | Valor |
|----------|-------|
| `API_URL` | `https://xua-api-xxxx.onrender.com` |
| `NEXT_PUBLIC_API_URL` | `https://xua-api-xxxx.onrender.com` |
| `JWT_SECRET` | *(mesmo valor configurado no Render)* |
| `INTERNAL_SECRET` | *(mesmo valor configurado no Render)* |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | *(mesma chave pública do Render)* |

### 2.4. Deploy

Clique **Deploy**. A URL gerada será algo como: `https://xua-delivery-xxxx.vercel.app`

### 2.5. Atualizar CORS no Render

Volte ao painel do Render e atualize a variável:

```
APP_ORIGIN = https://xua-delivery-xxxx.vercel.app
```

*(sem barra no final)*

---

## PARTE 3 — Verificação final

1. Acesse `https://xua-delivery-xxxx.vercel.app`
2. Crie uma conta em `/register`
3. Faça login
4. Navegue pelo app e teste as funcionalidades

---

## Custos: R$ 0

| Serviço | Plano | Limite |
|---------|-------|--------|
| Render (API) | Free | Hiberna após 15min sem uso, ~750h/mês |
| Vercel (Web) | Hobby | 100GB bandwidth, builds ilimitados |
| Prisma Postgres | Free tier | Já em uso |
| Redis Labs | Free tier | Já em uso, 30MB |

---

## Observações

- **Cold start:** No plano free do Render a API "dorme" após 15 min sem requests. A primeira requisição pode demorar ~30s para a API acordar. Acesse a URL da API ~30s antes da demonstração.
- **Cron jobs:** Os dois cron jobs (`subscription-cron` e `otp-cleanup`) definidos em `render.yaml` **não são criados automaticamente** no plano free. Não são necessários para a demo.
- **HTTPS:** Tanto Render quanto Vercel fornecem HTTPS automático com certificado gratuito.
- **Atualizações:** Cada `git push` na branch `migracao_node` dispara rebuild automático em ambos os serviços.
