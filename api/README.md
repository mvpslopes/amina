# API PHP (Hostinger e Apache)

Substitui o backend Node quando a hospedagem é **só PHP + MySQL**. O painel em `admin/` continua igual (JavaScript chama `/api/...`).

## Instalação rápida

### Opção A — pacote completo (`npm run build`)

Na raiz do projeto: **`npm run build`** gera **`dist/`** (vitrine, `admin/`, `api/`, `sql/`, `uploads/`). Envie o conteúdo de `dist/` para `public_html`. Passo a passo: **`LEIA-ME-DEPLOY.txt`** na raiz do repositório.

Se existir **`api/config.local.php`** no seu PC (com senha e `jwt_secret`), o build **copia** esse ficheiro para `dist/api/` e **não** o substitui pelo exemplo.

### Opção B — só a API

1. Envie a pasta **`api/`** inteira para o servidor (ex.: `public_html/api/`).
2. Crie a pasta **`uploads/`** no mesmo nível da pasta `api/` (ex.: `public_html/uploads/`) com permissão de escrita (755 ou 775).
3. Copie `config.example.php` → **`config.local.php`** e preencha MySQL + `jwt_secret`.
4. No phpMyAdmin, se ainda não tiver usuário root, rode `sql/seed-root-user.sql`.
5. Teste no navegador: `https://SEU-DOMINIO.com/api/public/products` → deve retornar `[]` ou JSON.

### `config.local.php` — erros comuns

- **Nunca deixe** `'pass' => 'SUA_SENHA_MYSQL'` em produção: use a senha real do hPanel (aspas duplas se a senha tiver `#`, `'`, etc.).
- No hPanel, o utilizador MySQL tem de estar **associado** ao banco (permissões).
- Host: `127.0.0.1` ou `localhost` (o `bootstrap.php` tenta ambos).

### Erro 500 em `/api/auth/login`

- Confirme que **`config.local.php`** existe e o **`jwt_secret`** tem **pelo menos 16 caracteres**.
- **`env-check.php`:** abra `/api/env-check.php` — confirma PHP, `pdo_mysql` e se o config é legível. Com ficheiro vazio **`api/db-debug.flag`** no servidor, o mesmo URL mostra `db.last_error` (mensagem PDO). Apague o `.flag` depois.
- **`expose_mysql_error`**, **`db-debug.flag`** ou `SetEnv AMINA_DEBUG_DB 1`: ver comentários em `bootstrap.php` e `LEIA-ME-DEPLOY.txt`.
- **`test-db-connection.php`** + `db_diagnostic_key` no config (ver `LEIA-ME-DEPLOY.txt`).

## URLs

| Método | Caminho | Auth |
|--------|---------|------|
| POST | `/api/auth/login` | Não |
| GET | `/api/auth/me` | Sim |
| GET/POST/PUT/DELETE | `/api/products`, `/api/collections` | Sim |
| GET/POST | `/api/users` | Root |
| DELETE | `/api/users/:id` | Root |
| POST | `/api/upload` | Sim |
| GET | `/api/analytics/summary?days=7` | Sim |
| GET | `/api/public/products` | Não |
| GET | `/api/public/collections` | Não |

## Apache

O arquivo **`api/.htaccess`** ativa o `mod_rewrite`. Se der 404 nas rotas, confira no painel se **mod_rewrite** está ativo.

## `jwt_secret`

Deve ser uma string longa e **igual** em todos os ambientes se quiser reutilizar tokens (geralmente não). Troque em produção.

## Node.js

Se no futuro voltar a usar Node, pode remover ou ignorar esta pasta `api/` e rodar só o `server/` — não use os dois ao mesmo tempo na mesma URL sem ajustar proxy.
