# Runbook de reinicio local (Mercado Pago + ngrok)

Use este guia sempre que o computador reiniciar e os links publicos do ngrok expirarem.

## 1. Entrar na pasta do projeto

```powershell
cd D:\xua\XUA-DELIVERY\xua-delivery
```

## 2. Subir servicos locais (3 terminais)

Terminal 1 (API):

```powershell
npm run dev:api:stable
```

Terminal 2 (worker):

```powershell
npm run dev:worker:stable
```

Terminal 3 (frontend):

```powershell
npm run dev:web
```

## 3. Subir ngrok para API (porta 4000)

Abra um quarto terminal e rode:

```powershell
ngrok http 4000 --log stdout
```

Se o comando ngrok nao estiver no PATH, use:

```powershell
& 'C:\Users\ledaz\AppData\Local\Microsoft\WinGet\Packages\Ngrok.Ngrok_Microsoft.Winget.Source_8wekyb3d8bbwe\ngrok.exe' http 4000 --log stdout
```

## 4. Criar segundo tunel ngrok para frontend (porta 3001)

Em outro terminal:

```powershell
$payload = @{ name = 'web'; addr = 'http://localhost:3001'; proto = 'http'; inspect = $true } | ConvertTo-Json -Compress
Invoke-RestMethod -Uri 'http://localhost:4040/api/tunnels' -Method Post -ContentType 'application/json' -Body $payload
```

## 5. Descobrir as URLs publicas atuais

```powershell
$tunnels = Invoke-RestMethod -Uri 'http://localhost:4040/api/tunnels'
$tunnels.tunnels | Select-Object name, public_url, @{Name='addr';Expression={$_.config.addr}} | Format-Table -AutoSize
```

Identifique:

- API_URL_PUBLICA: tunel com addr http://localhost:4000
- WEB_URL_PUBLICA: tunel com addr http://localhost:3001

## 6. Atualizar arquivos de ambiente

Abra o arquivo [apps/api/.env](../../apps/api/.env) e ajuste:

```dotenv
APP_ORIGIN=WEB_URL_PUBLICA
MERCADOPAGO_NOTIFICATION_URL=API_URL_PUBLICA/api/payments/webhook
MERCADOPAGO_BACK_URL_SUCCESS=WEB_URL_PUBLICA/checkout/confirmation
MERCADOPAGO_BACK_URL_FAILURE=WEB_URL_PUBLICA/checkout/confirmation
MERCADOPAGO_BACK_URL_PENDING=WEB_URL_PUBLICA/checkout/confirmation
```

Abra o arquivo [apps/web/.env.local](../../apps/web/.env.local) e ajuste:

```dotenv
NEXT_PUBLIC_API_URL=API_URL_PUBLICA
DEV_PUBLIC_ORIGIN=WEB_URL_PUBLICA
```

## 7. Reiniciar API e frontend para recarregar env

No terminal da API:

```powershell
# pressione Ctrl + C
npm run dev:api:stable
```

No terminal do frontend:

```powershell
# pressione Ctrl + C
npm run dev:web
```

Opcional: reiniciar worker tambem.

```powershell
# pressione Ctrl + C
npm run dev:worker:stable
```

## 8. Validacao rapida

```powershell
curl.exe -i API_URL_PUBLICA/health
curl.exe -I WEB_URL_PUBLICA/login
```

Esperado:

- API /health responde HTTP 200
- WEB /login responde HTTP 200

## 9. Teste ponta a ponta

1. Acesse WEB_URL_PUBLICA/login
2. Faca login e va ate checkout/payment
3. Conclua pagamento no Mercado Pago
4. Verifique logs:
   - API: POST /api/orders 201 e POST /api/payments/charge 201
   - Worker: processamento da fila payment-webhooks apos webhook

## 10. Encerrar tudo no fim

Pare cada terminal com Ctrl + C.
