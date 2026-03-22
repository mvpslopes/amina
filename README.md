# ÂMINA — Loja online

Site da marca + **painel interno** para cadastro de produtos, coleções e usuários.

## Requisitos

- [Node.js](https://nodejs.org/) 18+

## Instalação

```bash
npm install
```

## Rodar o servidor (site + painel)

```bash
npm start
```

- **Vitrine:** http://localhost:3000/
- **Painel interno:** http://localhost:3000/admin/ (redireciona para o dashboard; sem login vai para login via JS)

A vitrine carrega os produtos em **`GET /api/public/products`**. Abrir só o ficheiro `index.html` em disco (`file://`) **não mostra** o catálogo — use sempre `npm start` ou o URL publicado. Em subpastas (ex.: `https://site.com/amina/`), o `js/config.js` calcula a base da API automaticamente; em cenários raros defina `window.AMINA_API_BASE` antes de carregar o config (ver comentários no ficheiro).

### Variáveis de ambiente (opcional)

Copie `.env.example` para `.env` e ajuste.

| Variável        | Descrição                                      |
|-----------------|------------------------------------------------|
| `PORT`          | Porta (padrão `3000`)                          |
| `JWT_SECRET`    | Chave para assinar tokens — **obrigatório em produção** |
| `DATABASE_PATH` | Caminho do SQLite (só se **não** usar MySQL)   |

#### MySQL (Hostinger / hospedagem)

Se você definiu **`MYSQL_HOST`**, **`MYSQL_USER`**, **`MYSQL_PASSWORD`** e **`MYSQL_DATABASE`**, o app usa **MySQL** e ignora o SQLite. Na primeira subida, o servidor também pode criar as tabelas automaticamente (`CREATE TABLE IF NOT EXISTS`).

**Criar tabelas manualmente (phpMyAdmin):** importe ou cole o script em [`sql/mysql-schema.sql`](sql/mysql-schema.sql) com o banco já selecionado. Depois disso, ao subir o Node, só falta o **seed** do usuário root (feito automaticamente no primeiro `npm start` se ainda não existir `marcus.lopes`).

Exemplo (valores do painel da hospedagem):

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=u179630068_amina_user
MYSQL_DATABASE=u179630068_amina_bd
MYSQL_PASSWORD=sua_senha
```

> **Não commite** o arquivo `.env` nem senhas no Git. Se a senha vazou, altere no painel da hospedagem.

O host costuma ser `localhost` quando o Node roda no **mesmo servidor** que o MySQL. Se o MySQL for remoto, use o hostname que o painel indicar.

## Perfis de acesso

| Perfil            | Produtos & coleções | Criar usuários |
|-------------------|----------------------|----------------|
| **Root**          | Sim (editar)         | Sim (admin ou operador) |
| **Administrador** | Sim (editar)         | Não            |
| **Operador**      | Só visualizar        | Não            |

Novos usuários são criados pelo **Root** no painel, com escolha do perfil **Administrador** ou **Operador**. Em bases **MySQL** já existentes, execute uma vez o script [`sql/migration-add-operador-role.sql`](sql/migration-add-operador-role.sql) (o `npm start` com MySQL também tenta aplicar o `ALTER` automaticamente).

## Vitrine — pedido por WhatsApp

O carrinho abre o WhatsApp com o resumo do pedido. O número (só dígitos, DDI 55) fica em [`js/config.js`](js/config.js) (`AMINA_WHATSAPP`). Pode sobrescrever antes de carregar o config em `index.html` se precisar.

O usuário **root** inicial é criado automaticamente na primeira execução (credenciais fornecidas separadamente ao time — não commitar senhas).

## API (interna, com JWT)

Todas as rotas abaixo exigem header `Authorization: Bearer <token>` exceto login e rotas públicas.

- `POST /api/auth/login` — `{ "username", "password" }`
- `GET /api/auth/me`
- `GET|POST /api/users` — **apenas Root** (POST cria perfil `admin` ou `operador`)
- `DELETE /api/users/:id` — **Root** (não remove root)
- `GET /api/products` e `GET /api/collections` — Root, Admin e Operador
- `POST|PUT|DELETE /api/products` e coleções — **Root e Admin** (Operador: 403)
- `POST /api/upload` — **Root e Admin** (multipart `file`)

### Catálogo público (sem login)

Útil para a vitrine consumir depois:

- `GET /api/public/products`
- `GET /api/public/collections`

## Dados

- **SQLite (local):** pasta `data/` (ignorada no Git)
- **MySQL (produção):** banco na hospedagem; tabelas criadas na primeira execução com `npm start`
- **Uploads:** pasta `uploads/` (ignorada no Git)

## Deploy

Em produção: `JWT_SECRET` forte, HTTPS, e backup do banco (dump MySQL ou cópia do `amina.db` se usar SQLite).

### Hospedagem só PHP (ex.: Hostinger)

1. No PC: copie `api/config.example.php` → **`api/config.local.php`**, preencha **senha MySQL real**, `jwt_secret` e dados do banco (ficheiro está no `.gitignore` — **não vai para o Git**). **Sempre use este ficheiro como fonte:** cada `npm run build` apaga e recria `dist/`; sem `api/config.local.php` a senha volta ao exemplo.
2. Gere o pacote: **`npm run build`** → pasta **`dist/`** (site, `admin/`, `api/`, `sql/`, `uploads/`). Se só tinhas a senha na `dist/` antiga, o build copia-a primeiro para `api/config.local.php`.
3. Envie o conteúdo de **`dist/`** para `public_html` (ver detalhes em **[`LEIA-ME-DEPLOY.txt`](LEIA-ME-DEPLOY.txt)**).

**Importante:** em `config.local.php` **troque sempre** o placeholder `'SUA_SENHA_MYSQL'` pela senha do hPanel. Se esse texto permanecer, o login falha com “Falha na conexão com o banco”.

O script de build **preserva** `api/config.local.php` se já existir no projeto (copia para `dist/api/` e **não** substitui pelo exemplo). **Não publique** o zip da `dist/` com credenciais em repositórios abertos.

Diagnóstico MySQL: [`api/env-check.php`](api/env-check.php) e ficheiro vazio `api/db-debug.flag` (ver `LEIA-ME-DEPLOY.txt`). Documentação da API PHP: [`api/README.md`](api/README.md).

**Hospedagem Node:** use `npm start` e o servidor em `server/` (não use a pasta `api/` PHP na mesma URL sem proxy).

**Painel em outro domínio que a API:** edite `admin/js/config.js` → `window.AMINA_API_BASE`.

**Hostinger:** plano compartilhado PHP + MySQL encaixa com a pasta `api/`; Node exigiria VPS ou serviço com Node.
