-- ============================================================================
-- Seed de producao: usuario admin da distribuidora Sao Luiz + 2 consumidores
--
-- PRE-REQUISITO: execute antes "seed_distributor_sao_luiz_jf.sql" (cria a
-- distribuidora pelo CNPJ 22.118.673/0001-83 e a zona "Juiz de Fora" usada
-- abaixo para resolver o zone_id dos enderecos).
--
-- Senha: todos os 3 usuarios abaixo recebem o MESMO hash bcrypt informado
-- pelo usuario ($2b$12$...). Comunique a senha em texto plano por um canal
-- seguro e oriente a troca no primeiro acesso (o sistema nao tem flag de
-- "forcar troca de senha" hoje).
--
-- Usuario admin da distribuidora: dados de contato sao PLACEHOLDER
-- (PREENCHER_*) a pedido do usuario ("generico") -- troque antes de divulgar
-- o login.
--
-- Idempotente: re-executar nao duplica (chave de dedupe = email).
-- ============================================================================

BEGIN;

-- 1) Usuario administrador da distribuidora Sao Luiz
WITH dist AS (
  SELECT id FROM "03_mst_distributors" WHERE cnpj = '22.118.673/0001-83'
)
INSERT INTO "01_mst_consumers" (
  id, name, email, phone, password_hash, role, distributor_id, updated_at
)
SELECT
  gen_random_uuid(),
  'Administrador São Luiz',
  'PREENCHER_EMAIL_ADMIN_DISTRIBUIDORA',
  'PREENCHER_TELEFONE_ADMIN_DISTRIBUIDORA',
  '$2b$12$5yZJAeyAGaiZDumjpg4c9eHkxbYo5hZ3eD3IAap477uv83vypq8JO',
  'distributor_admin',
  dist.id,
  now()
FROM dist
WHERE NOT EXISTS (
  SELECT 1 FROM "01_mst_consumers" WHERE email = 'PREENCHER_EMAIL_ADMIN_DISTRIBUIDORA'
);

-- 2) Consumidora Aline de Almeida Januário + endereço
WITH ins_aline AS (
  INSERT INTO "01_mst_consumers" (id, name, email, document, password_hash, role, updated_at)
  SELECT
    gen_random_uuid(),
    'Aline de Almeida Januário',
    'aline@aguaxua.com.br',
    '05366497663',
    '$2b$12$5yZJAeyAGaiZDumjpg4c9eHkxbYo5hZ3eD3IAap477uv83vypq8JO',
    'consumer',
    now()
  WHERE NOT EXISTS (SELECT 1 FROM "01_mst_consumers" WHERE email = 'aline@aguaxua.com.br')
  RETURNING id
),
aline AS (
  SELECT id FROM ins_aline
  UNION ALL
  SELECT id FROM "01_mst_consumers"
  WHERE email = 'aline@aguaxua.com.br' AND NOT EXISTS (SELECT 1 FROM ins_aline)
),
zone AS (
  SELECT z.id FROM "04_mst_zones" z
  JOIN "03_mst_distributors" d ON d.id = z.distributor_id
  WHERE d.cnpj = '22.118.673/0001-83' AND z.name = 'Juiz de Fora'
)
INSERT INTO "02_mst_addresses" (
  id, consumer_id, street, number, neighborhood, city, state, zip_code, zone_id, is_default, updated_at
)
SELECT
  gen_random_uuid(), aline.id,
  'Rua Detetive Agapito Marques', '19', 'Recanto dos Lagos',
  'Juiz de Fora', 'MG', '36048-740', zone.id, true, now()
FROM aline, zone
WHERE NOT EXISTS (
  SELECT 1 FROM "02_mst_addresses" WHERE consumer_id = aline.id AND zip_code = '36048-740'
);

-- 3) Consumidor Giancarlo Ribeiro Nardy + endereço
WITH ins_gian AS (
  INSERT INTO "01_mst_consumers" (id, name, email, phone, document, password_hash, role, updated_at)
  SELECT
    gen_random_uuid(),
    'Giancarlo Ribeiro Nardy',
    'giancarlonardy@gmail.com',
    '(32) 98416-4334',
    '64573826653',
    '$2b$12$5yZJAeyAGaiZDumjpg4c9eHkxbYo5hZ3eD3IAap477uv83vypq8JO',
    'consumer',
    now()
  WHERE NOT EXISTS (SELECT 1 FROM "01_mst_consumers" WHERE email = 'giancarlonardy@gmail.com')
  RETURNING id
),
gian AS (
  SELECT id FROM ins_gian
  UNION ALL
  SELECT id FROM "01_mst_consumers"
  WHERE email = 'giancarlonardy@gmail.com' AND NOT EXISTS (SELECT 1 FROM ins_gian)
),
zone AS (
  SELECT z.id FROM "04_mst_zones" z
  JOIN "03_mst_distributors" d ON d.id = z.distributor_id
  WHERE d.cnpj = '22.118.673/0001-83' AND z.name = 'Juiz de Fora'
)
INSERT INTO "02_mst_addresses" (
  id, consumer_id, street, number, complement, neighborhood, city, state, zip_code, zone_id, is_default, updated_at
)
SELECT
  gen_random_uuid(), gian.id,
  'Rua Engenheiro José Carlos Moraes Sarmento', '115', '304', 'Santa Catarina',
  'Juiz de Fora', 'MG', '36036-100', zone.id, true, now()
FROM gian, zone
WHERE NOT EXISTS (
  SELECT 1 FROM "02_mst_addresses" WHERE consumer_id = gian.id AND zip_code = '36036-100'
);

COMMIT;
