# RetailOS — Product & Inventory Management System

A full-stack upgrade of the existing Product Management System, retaining the existing FastAPI + PostgreSQL stack and the core `categories` and `products` records.

## Modules included

- **Secure sign-in:** JWT sessions, Argon2 password hashing, change-password screen.
- **Role-based access:** `admin`, `manager`, and `staff`.
- **Dashboard:** product count, stock units, inventory valuation, low-stock count, today's sales/production, recent sales and a 7-day revenue chart.
- **Products and categories:** create, read, update, delete (deletion is blocked when history or product references exist).
- **Production:** record a production batch; quantity is added to current product stock.
- **Sales:** record sale, customer, quantity and payment; stock is reduced automatically after checking availability.
- **Inventory:** current stock, reorder thresholds, manual adjustments and a stock movement ledger.
- **Business directory:** customers and suppliers.
- **Reports:** stock valuation, sales/production summary, 14-day revenue trend and CSV exports.
- **API documentation:** Swagger UI at `/docs`.

## Project structure

```text
retail_management_upgrade/
├── main.py
├── database.py
├── models.py
├── schemas.py
├── security.py
├── requirements.txt
├── .env.example
├── README.md
└── static/
    ├── index.html
    ├── styles.css
    └── app.js
```

## Important: protect your existing database first

Before replacing project files, make a backup of your current `retaildb` database using pgAdmin or `pg_dump`. This project is designed to preserve the existing `categories` and `products` tables and add new tables (`users`, `customers`, `suppliers`, `production_entries`, `sales`, and `stock_movements`). It does not intentionally drop or truncate any existing records.

The existing `categories` table is expected to have `id` and `name`. The existing `products` table is expected to have `id`, `sku`, `barcode`, `name`, `category_id`, `price`, `stock`, and `reorder_level`, matching the previous project frontend/API. If your actual database column names differ, adjust `models.py` before running this version.

`Base.metadata.create_all()` creates missing tables but does not modify existing table columns. Do not use this as a substitute for a migration if your current schema is different.

## Windows setup (PowerShell)

### 1. Copy the new project files

Copy/replace the Python files in your project root:

- `main.py`
- `database.py`
- `models.py`
- `schemas.py`
- `security.py`
- `requirements.txt`

Create a folder named `static` in the same project root and copy these three files into it:

- `static/index.html`
- `static/styles.css`
- `static/app.js`

Keep the project files together. `main.py` and `static/` must be at the same directory level.

### 2. Configure the database and first administrator

From the project root:

```powershell
Copy-Item .env.example .env
```

Open `.env` and update `DATABASE_URL` with the **same PostgreSQL database and credentials your existing project already uses**. Example format:

```text
DATABASE_URL=postgresql+psycopg://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/retaildb
```

Do not create a new database unless that is what you intend. If your PostgreSQL password contains special URL characters (such as `@`, `#`, `/`, or `:`), URL-encode those characters in the connection URL.

Set a private `SECRET_KEY` and change the initial admin password in `.env`. The example values are for local setup only:

```text
SECRET_KEY=replace-this-with-a-long-random-secret-key
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=ChangeMe123!
INITIAL_ADMIN_EMAIL=admin@example.com
```

The first admin account is created only when the `users` table is empty. If users already exist, no default account is added.

### 3. Install packages

Use the existing virtual environment if it is named `venv`:

```powershell
.\venv\Scripts\python.exe -m pip install --upgrade pip
.\venv\Scripts\python.exe -m pip install -r requirements.txt
```

If your virtual environment has another name, replace `venv` with that folder name. You do not need to activate it in PowerShell.

### 4. Start the application

Run from the project root:

```powershell
.\venv\Scripts\python.exe -m uvicorn main:app --reload
```

Open the application at:

**http://127.0.0.1:8000**

Do not open `index.html` using `file:///` and do not use Live Server for this version. FastAPI now serves the frontend and API from the same origin, so the earlier local-file and CORS connection issue is avoided.

API documentation:

**http://127.0.0.1:8000/docs**

### 5. First sign-in

Use the username and password configured in `.env` (the example values are `admin` and `ChangeMe123!`). Change the password from the key-shaped account button in the top bar immediately after signing in.

Create additional accounts from **Team & access**:

| Role | Permissions |
|---|---|
| Admin | Full access, user administration, catalogue and operations |
| Manager | Catalogue, categories, inventory adjustments, suppliers and operations |
| Staff | Read catalogue/inventory; create production entries and sales; manage customers |

## How stock is updated

- Creating a product can set opening stock. An opening movement is written to the stock ledger when opening stock is greater than zero.
- Recording production increases the product's stock and writes a production movement.
- Recording a sale checks available stock, reduces product stock and writes a sale movement in the same database transaction.
- A manual stock adjustment is restricted to Admin/Manager and requires a reason.
- Products with production, sales or stock movement history cannot be deleted, preserving report accuracy.

## API routes

All business routes require a bearer token, obtained from `POST /api/auth/login`.

| Module | Routes |
|---|---|
| Authentication | `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/change-password` |
| Users | `GET /api/users`, `POST /api/users`, `PATCH /api/users/{id}/deactivate` |
| Categories | `GET/POST /api/categories`, `DELETE /api/categories/{id}` |
| Products | `GET/POST /api/products`, `PUT/DELETE /api/products/{id}` |
| Production | `GET/POST /api/production` |
| Sales | `GET/POST /api/sales` |
| Customers | `GET/POST /api/customers`, `DELETE /api/customers/{id}` |
| Suppliers | `GET/POST /api/suppliers`, `DELETE /api/suppliers/{id}` |
| Inventory | `GET /api/inventory/movements`, `POST /api/inventory/adjustments` |
| Dashboard | `GET /api/dashboard` |
| Reports | `GET /api/reports/summary`, `/api/reports/sales-by-day`, `/api/reports/stock` |

## Notes and current boundaries

- This is a local business-management starter, not a production deployment recipe. Before public deployment, use HTTPS, a strong secret key, environment-based secrets, database backups, and a production server configuration.
- User sessions are stored in the browser's session storage and expire according to `ACCESS_TOKEN_EXPIRE_MINUTES`.
- This version has customer and supplier directories, but does not yet include purchase orders, supplier invoices, tax/GST invoices, multi-branch stock, barcode scanning hardware, or online payments.
- No existing project password or PostgreSQL credential is embedded in these files. Configure credentials only in your local `.env` file.
