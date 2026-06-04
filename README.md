# World Cup 2026 — Bracket Pool

Турнирная сетка-прогноз ЧМ-2026: вход по корпоративному логину (LDAP через
Keycloak), заполнение сетки (группы → лучшие третьи места → плей-офф до финала и матча за 3-е),
блок бонус-вопросов, общая таблица лидеров с автоподсчётом и тай-брейками, и админ-страница для
ввода официальных результатов.

- **Фронтенд** — статические HTML на **GitHub Pages**.
- **Бэкенд** — один **Cloudflare Worker** + база **D1** (бесплатно).
- **Авторизация** — **Keycloak** (grant `password`/ROPC), вход проксирует Worker.

---

## Как считаются очки

За каждого **верно угаданного участника раунда**:

| Раунд | Очки за команду |
|---|---|
| Round of 32 | 1 |
| Round of 16 | 2 |
| 1/4 (QF) | 3.5 |
| 1/2 (SF) | 5 |
| Участник матча за 3-е место | 6 |
| Участник финала | 6 |
| **Чемпион** | 7.5 |

Максимум за идеальный прогноз — **143.5**. Очко начисляется за каждую команду, которая в прогнозе
дошла до раунда и реально туда дошла (пересечение множеств).

Третьи места расставляются по соперникам строго по **официальной таблице FIFA Annex C** (все 495
комбинаций зашиты в `assets/thirds-table.js`).

### Бонус-вопросы и тай-брейки

Под/над сеткой — 5 вопросов «да/нет» и один числовой («сколько всего голов на турнире»).
Они **не прибавляются к базовому счёту**, а используются только при равенстве очков:

- при равных базовых очках выше тот, у кого больше верных ответов да/нет (по 0.2 за верный);
- если и тут равенство — у кого число голов ближе к фактическому (0.1 самому точному).

Правильные ответы вводит админ; лидерборд считает и разбивает ничьи автоматически. Базовые очки
в шапке при этом не меняются — в строке показываются `bonus N/5` и `goals ΔX`.

---

## Структура

```
index.html          вход по логину/паролю (LDAP → Keycloak)
bracket.html         редактор: бонус-вопросы + сетка; для админа ?user=ЛОГИН — просмотр чужой сетки
leaderboard.html     таблица лидеров (юзернеймы; админу строки кликабельны)
admin.html           официальные результаты + правильные бонус-ответы (только админ)
assets/
  engine.js          данные турнира + подсчёт очков (общий для фронта и Worker)
  thirds-table.js    официальная таблица FIFA Annex C (третьи места, 495 комбинаций)
  bracket.js         редактор сетки (canvas «дерево к центру», пан/зум)
  common.js          шапка, флаги, API, сессия/токен
  config.js          <-- API_BASE (URL воркера) + дедлайн
  app.css, bracket.css
worker/
  worker.js          Cloudflare Worker (API)
  schema.sql         схема D1
wrangler.toml        конфиг воркера (+ настройки Keycloak)
```

---

## API (Worker)

| Метод | Путь | Назначение |
|---|---|---|
| POST | `/api/login` | `{username,password}` → ROPC к Keycloak → `{username, token, refresh_token, expires_in}` |
| POST | `/api/refresh` | `{refresh_token}` → новый access-токен |
| GET | `/api/entry` | (Bearer) свой прогноз: `{username,email,picks,extras,complete,is_admin}` |
| PUT | `/api/entry` | (Bearer) `{picks,complete,extras}` — сохранить (блок после дедлайна) |
| GET | `/api/user/:username` | (Bearer, **админ**) чужой прогноз только для чтения |
| GET | `/api/results` | официальная сетка + правильные бонус-ответы |
| PUT | `/api/results` | (Bearer **админ** или `ADMIN_TOKEN`) `{picks,extras}` |
| GET | `/api/leaderboard` | таблица лидеров со счётом и тай-брейками |

---

## Развёртывание

### Шаг 1. Бэкенд на Cloudflare

Нужны бесплатный аккаунт Cloudflare и Wrangler (`npm i -g wrangler`).

```bash
wrangler login

# 1) база D1
wrangler d1 create wc2026
#   -> скопируй database_id в wrangler.toml

# 2) схема
wrangler d1 execute wc2026 --remote --file=worker/schema.sql

# 3) секреты
wrangler secret put ADMIN_TOKEN          # запасной токен для admin.html
# wrangler secret put KC_CLIENT_SECRET   # ТОЛЬКО если клиент Keycloak confidential

# 4) деплой
wrangler deploy
#   -> URL вида https://wc2026-pool.<subdomain>.workers.dev
```

В `wrangler.toml` проверь переменные:
```toml
DEADLINE_ISO    = "2026-06-10T21:00:00Z"   # 23:00 CET == 21:00 UTC
ALLOW_ORIGIN    = "https://USERNAME.github.io"  # лучше указать свой домен Pages
KC_TOKEN_URL    = "https://auth.rustat-service.ru/realms/rustat/protocol/openid-connect/token"
KC_USERINFO_URL = "https://auth.rustat-service.ru/realms/rustat/protocol/openid-connect/userinfo"
KC_CLIENT_ID    = "wc2026-pool"
```

### Шаг 2. Keycloak

- У клиента **`wc2026-pool`** включить **Direct Access Grants** (ROPC).
- Если клиент **confidential** — задать секрет: `wrangler secret put KC_CLIENT_SECRET`
  (для public-клиента секрет не нужен).
- Время жизни сессии (Realm → Sessions): чтобы вход жил долго, держи **Access Token Lifespan**,
  **SSO Session Idle** и **SSO Session Max** согласованными (например, все ~24ч). Worker проверяет
  токен через `/userinfo`, поэтому токен не переживёт пользовательскую сессию.

### Шаг 3. Фронтенд на GitHub Pages

1. Залей файлы репозитория на GitHub.
2. В `assets/config.js` укажи URL воркера:
   ```js
   API_BASE: "https://wc2026-pool.<subdomain>.workers.dev",
   DEADLINE_ISO: "2026-06-10T21:00:00Z",
   DEADLINE_LABEL: "23:00 CET · 10 Jun 2026",
   ```
3. Settings → Pages → Source: **Deploy from a branch**, ветка `main`, папка `/ (root)`.
   Сайт появится на `https://USERNAME.github.io/REPO/` (деплоится сам после пуша, без кнопки Deploy).

### Шаг 4. Назначить админов

Админ может вводить официальные результаты (`admin.html`, вкладка «Save results») и смотреть чужие
сетки из лидерборда. Флаг ставится в БД (юзер должен хотя бы раз войти, чтобы строка появилась):

```bash
wrangler d1 execute wc2026 --remote --command "UPDATE entries SET is_admin=1 WHERE username='ИВАНОВ';"
```

---

## Миграции существующей базы

Если база уже создавалась на более ранней версии — добавь недостающие колонки (idempotent-ы можно
выполнять безопасно; существующие колонки выдадут ошибку «duplicate column», это нормально):

```bash
wrangler d1 execute wc2026 --remote --command "ALTER TABLE entries ADD COLUMN extras TEXT;"
wrangler d1 execute wc2026 --remote --command "ALTER TABLE entries ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;"
wrangler d1 execute wc2026 --remote --command "ALTER TABLE results ADD COLUMN extras TEXT;"
```

> Переход со старой схемы `entries(id/name)` на `username`: один раз
> `DROP TABLE IF EXISTS entries;` затем `--file=worker/schema.sql` (тестовые записи обнулятся,
> таблица `results` не трогается).

---

## Эксплуатация

- Раздай участникам ссылку на `index.html`. Они входят по LDAP-логину и заполняют прогноз;
  правки доступны до дедлайна с любого устройства (повторный вход разрешён).
- По ходу турнира админ на `admin.html` вносит фактические результаты и правильные бонус-ответы —
  таблица лидеров пересчитывается автоматически (частичные результаты допустимы).

## Дедлайн и часовой пояс

`DEADLINE_ISO` — в UTC. `23:00 CET` (UTC+1) = `21:00Z`. Блокировка на стороне Worker: после дедлайна
сохранение прогнозов отклоняется. Значение в `config.js` (для отображения) и в `wrangler.toml`
(жёсткая блокировка) должны совпадать.

## Лимиты

Бесплатных тарифов Cloudflare Workers + D1 для пула на десятки/сотни участников хватает с запасом;
точные текущие цифры — в документации Cloudflare.
