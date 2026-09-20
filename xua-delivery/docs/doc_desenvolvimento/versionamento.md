# Versionamento automático

O Xuá Delivery usa **semantic-release**: a versão nunca é editada à mão. Ela é
calculada a partir das mensagens de commit (Conventional Commits) a cada push
nas branches de release.

## Como a versão é decidida

| Commit                                    | Efeito            |
| ----------------------------------------- | ----------------- |
| `fix:`, `perf:`, `refactor:`, `docs:`, `build:` | patch (1.2.**3**) |
| `feat:`                                   | minor (1.**3**.0) |
| `BREAKING CHANGE:` no corpo, ou `feat!:`  | major (**2**.0.0) |
| `chore:`, `test:`, `ci:`, `style:`        | nenhum release    |

Regras em [`.releaserc.json`](../../.releaserc.json).

## Branches

- **`main`** → release estável, tag `vX.Y.Z`.
- **`develop`** → prerelease, tag `vX.Y.Z-beta.N` (canal `beta`).

## O que acontece no push

O workflow [`.github/workflows/release.yml`](../../../.github/workflows/release.yml)
(na raiz do repositório, já que o projeto vive em `xua-delivery/`) roda
`npx semantic-release`, que:

1. lê os commits desde a última tag e calcula a próxima versão;
2. atualiza o `CHANGELOG.md`;
3. propaga a versão para os `package.json` da raiz e dos workspaces
   (`scripts/sync-version.mjs`);
4. cria a tag e o GitHub Release com as notas;
5. faz o commit `chore(release): vX.Y.Z [skip ci]` de volta na branch.

Usa o `GITHUB_TOKEN` padrão do Actions — não há secret para configurar.
Nada é publicado no npm (o repositório é privado); `@semantic-release/npm` não
está na pipeline de propósito.

## Escrevendo commits

O hook `commit-msg` (husky + commitlint) valida o formato localmente:

```
<tipo>(<escopo opcional>): <descrição no imperativo>

<corpo opcional>

BREAKING CHANGE: <descrição, quando houver>
```

Exemplos:

```
feat(orders): adicionar filtro por janela de entrega
fix(payments): tratar webhook duplicado do Mercado Pago
feat(auth)!: exigir OTP no login de motorista
```

Se o hook não estiver ativo após um `git clone`, rode `npm install` (o script
`prepare` instala o husky).

## Comandos úteis

```bash
npm run release:dry   # simula o próximo release sem publicar nada
```
