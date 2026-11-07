# Retail Product Management System

A portfolio project for a fresher-level Python / FastAPI developer. It provides product and category CRUD, inventory summary metrics, server-side search and pagination, and CSV export.

## Technology stack

- **Backend:** Python 3.10+, FastAPI, Pydantic v2
- **Database:** PostgreSQL, SQLAlchemy 2.x
- **Migrations:** Alembic
- **Frontend:** HTML, CSS and vanilla JavaScript
- **Testing:** pytest and FastAPI TestClient

## Main features

- Create, view, update and delete products.
- Create and delete categories. A category cannot be deleted while products use it.
- Validate required fields, numeric ranges and duplicate SKU / barcode values.
- Store prices as `NUMERIC(12, 2)` / Python `Decimal` rather than floating-point values.
- Search by product name, SKU or barcode on the server.
- Paginate product results (20 records per page; API maximum is 100).
- View dashboard metrics calculated by the API across the full inventory.
- Export all matching inventory records to CSV, not only the current browser page.
- Keep secrets in `.env`, which is excluded from Git.
- Manage database schema changes using Alembic migrations.

## Project structure

```text
retail-crud/
├── app/
│   ├── routers/
│   │   ├── categories.py
│   │   ├── products.py
│   │   └── reports.py
│   ├── core.py
│   ├── database.py
│   ├── main.py
│   ├── models.py
│   └── schemas.py
├── migrations/
│   ├── versions/0001_initial_schema.py
│   ├── env.py
│   └── script.py.mako
├── tests/
│   ├── conftest.py
│   └── test_api.py
├── .env.example
├── .gitignore
├── alembic.ini
├── index.html
├── main.py
├── requirements.txt
├── script.js
└── README.md
```

## Windows PowerShell setup

Run these commands from the project root directory (the directory that contains `main.py` and `requirements.txt`).

### 1. Create and activate a virtual environment

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation, you can skip activation and call the environment's Python executable directly:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Otherwise install dependencies with:

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 2. Create the PostgreSQL database

Make sure PostgreSQL is running. Create a database named `retaildb` using pgAdmin or `psql`:

```sql
CREATE DATABASE retaildb;
```

### 3. Configure environment variables

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Open `.env` and replace `CHANGE_ME` with your local PostgreSQL password. Do not commit `.env` to Git. If your password contains URL-special characters such as `@`, `:`, `/` or `#`, URL-encode those characters in `DATABASE_URL`.

### 4. Back up your database and apply migrations

Before applying a schema migration to a database that contains your current project data, take a backup:

```powershell
pg_dump -U postgres -d retaildb -F c -f retaildb_backup.dump
```

Then run:

```powershell
python -m alembic upgrade head
```

The included initial migration detects the existing `categories` and `products` tables created by your earlier version. It keeps the existing rows, converts the old floating-point price column to `NUMERIC(12, 2)` on PostgreSQL, updates timestamp types, and adds database-level inventory checks and indexes. On a new database, it creates the tables from scratch. Review the migration and keep the backup before applying it to important data.

Do not use `Base.metadata.create_all()` for normal development; make future schema changes through new Alembic migrations.

### 5. Start the FastAPI backend

```powershell
python -m uvicorn main:app --reload
```

Backend: <http://127.0.0.1:8000>  
Swagger API docs: <http://127.0.0.1:8000/docs>  
Database health: <http://127.0.0.1:8000/health/db>

### 6. Start the frontend

Open a **second PowerShell terminal** in the project root and run:

```powershell
python -m http.server 5500
```

Open <http://127.0.0.1:5500>. Serving the page through a local HTTP server avoids browser restrictions that can occur when opening `index.html` directly as a `file://` URL.

## Run tests

The automated tests use an isolated in-memory SQLite database, so they do not modify your PostgreSQL data.

```powershell
python -m pytest -v
```

## Important API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | Basic application health |
| GET | `/health/db` | Database connection health |
| POST | `/categories` | Create category |
| GET | `/categories` | List categories |
| DELETE | `/categories/{category_id}` | Delete unused category |
| POST | `/products` | Create product |
| GET | `/products` | Search / filter / paginate products |
| GET | `/products/{product_id}` | Get one product |
| PUT | `/products/{product_id}` | Update product fields |
| DELETE | `/products/{product_id}` | Delete product |
| GET | `/reports/summary` | Dashboard inventory metrics |
| GET | `/reports/inventory.csv` | Download inventory CSV |

Product list query parameters: `q`, `category_id`, `low_stock`, `skip`, and `limit`.

Example:

```text
GET /products?q=mouse&low_stock=true&skip=0&limit=20
```

## Before presenting this as production-ready

This is a stronger portfolio / fresher project, not a fully production-hardened retail system. Next improvements should include user authentication and role-based permissions, stock movement history instead of directly editing stock, audit logging, structured application logging, database backups, CI/CD, Docker deployment, and production secret management. Do not claim these features are implemented until you build and test them.
