# RetailOS — Product & Inventory Management System

A full-stack retail operations application for managing a product catalogue, inventory, production, sales, customers, suppliers, and team access. RetailOS uses **FastAPI** and **PostgreSQL** for the backend and a responsive **HTML, CSS, and JavaScript** interface served by the same FastAPI application.

> This repository is a local-development / portfolio project. Review the security and database notes before exposing it to the public internet.

## Features

### Dashboard
- Overview of product count, stock units, inventory value, and low-stock products.
- Today's sales and production figures.
- Recent sales and low-stock item summaries.

### Product catalogue
- Manage products with SKU, barcode, category, price, stock quantity, and reorder level.
- Create, view, update, and delete products.
- Filter the product list by category and low-stock status.
- Prevent deletion of products that have sales, production, or stock-movement history.

### Inventory and stock movements
- View current stock and reorder thresholds.
- Record manual stock adjustments with a reason (Admin and Manager roles).
- Maintain a stock movement ledger for opening stock, production, sales, and manual adjustments.
- Prevent adjustments and sales that would make available stock negative.

### Production
- Record production entries against a product.
- Increase product stock when a production entry is recorded.
- Review production records.

### Sales
- Record sales with product, quantity, customer, payment method, and payment status details.
- Check available stock before completing a sale.
- Reduce stock and record the corresponding stock movement when a sale succeeds.
- Review sales records and sales performance.

### Customers and suppliers
- Maintain customer contact records.
- Maintain supplier contact records.

### Reports and exports
- View sales revenue, units sold, units produced, and current stock valuation.
- Review daily revenue trends and product-level stock status.
- Export sales and inventory reports as CSV files from the interface.

### Authentication and access control
- Sign in using a username and password.
- JWT bearer-token authentication for protected API endpoints.
- Password hashing using `pwdlib`.
- Change-password functionality.
- Role-based access for **Admin**, **Manager**, and **Staff** accounts.
- Admins can create team accounts and deactivate accounts.
- The browser stores the session token in `sessionStorage`.

## Technology stack

| Layer | Technologies |
|---|---|
| Backend | Python, FastAPI, Uvicorn |
| Database | PostgreSQL, SQLAlchemy 2.x, Psycopg 3 |
| Validation | Pydantic v2 |
| Authentication | JWT (`python-jose`), `pwdlib` password hashing |
| Frontend | HTML5, CSS3, JavaScript |
| API documentation | FastAPI Swagger UI / OpenAPI |

## Project structure

The active RetailOS v2 application files live at the repository root. The repository also currently contains a nested `Retail-product-management-system/` directory from the earlier version of this project.

```text
.
├── Retail-product-management-system/  # Earlier implementation (separate app)
├── static/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── .env.example
├── .gitignore
├── README.md
├── database.py
├── main.py
├── models.py
├── requirements.txt
├── schemas.py
└── security.py
```

**Run the root-level RetailOS v2 application** by following the setup instructions in this README. Its `main.py` serves the frontend from `static/index.html` and mounts the static assets under `/static`; keep `static/` beside that `main.py`. The nested directory is an earlier, separate implementation with its own entry point and README. Do not mix its setup instructions with the root-level application. If you no longer need the older version, remove the nested directory in a separate cleanup commit after backing it up.

## Prerequisites

- Python **3.10 or later**
- PostgreSQL **14 or later** (or a compatible supported PostgreSQL installation)
- Git

## Local setup (Windows PowerShell)

### 1. Clone the repository

```powershell
git clone https://github.com/akash01-arch/Retail-product-management-system.git
cd Retail-product-management-system
```

### 2. Create and activate a virtual environment

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks script activation, you can use the virtual environment's Python executable directly in the commands below:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
```

### 3. Create the PostgreSQL database

Create a database named `retaildb` if you do not already have one. For example, in `psql`:

```sql
CREATE DATABASE retaildb;
```

If you are using an existing database with product and category data, back it up before running the application and read the **Existing database compatibility** section below.

### 4. Configure environment variables

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Open `.env` and set values for your local PostgreSQL connection and a strong, private JWT secret:

```dotenv
DATABASE_URL=postgresql+psycopg://postgres:YOUR_POSTGRES_PASSWORD@localhost:5432/retaildb
SECRET_KEY=replace-with-a-long-random-secret-value
ACCESS_TOKEN_EXPIRE_MINUTES=480
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=replace-with-a-strong-unique-password
INITIAL_ADMIN_EMAIL=admin@example.com
```

Use your own PostgreSQL username, password, host, and database name. URL-encode special characters in the database password when required by the connection URL. Do not commit `.env` to GitHub. The repository's `.gitignore` excludes it; keep `.env.example` free of real credentials.

The initial administrator account is created only when the `users` table is empty. The values in `.env` are used for that first account; they are not a universal login for an already-populated database. Change the initial password after signing in.

### 5. Install dependencies

```powershell
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

Or, if you did not activate the environment:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

### 6. Start the application

Run this from the project root (the folder containing `main.py`):

```powershell
python -m uvicorn main:app --reload
```

Or without activating the environment:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --reload
```

Open the application:

- **Web interface:** http://127.0.0.1:8000
- **Swagger API documentation:** http://127.0.0.1:8000/docs
- **OpenAPI schema:** http://127.0.0.1:8000/openapi.json
- **Health check:** http://127.0.0.1:8000/api/health

Do not open `static/index.html` directly using a `file:///` URL or a separate Live Server. FastAPI serves the frontend and API from the same origin.

## User roles

| Role | Typical access |
|---|---|
| **Admin** | Full application access, team account management, catalogue and operational administration. |
| **Manager** | Product and category administration, supplier management, stock adjustments, sales and production operations. |
| **Staff** | View catalogue and inventory, record sales and production, and work with customer records. |

The backend enforces permissions on protected endpoints; hiding a page or button in the frontend is not the only access-control mechanism.

## API overview

Protected business endpoints require an access token obtained from `POST /api/auth/login`. In Swagger UI, use the **Authorize** control and provide the bearer token.

| Module | Method and endpoint | Purpose |
|---|---|---|
| Health | `GET /api/health` | Check API and database connectivity. |
| Authentication | `POST /api/auth/login` | Sign in and obtain a JWT. |
| Authentication | `GET /api/auth/me` | Get the signed-in user. |
| Authentication | `POST /api/auth/change-password` | Change the current user's password. |
| Users | `GET /api/users` | List team accounts (Admin). |
| Users | `POST /api/users` | Create a team account (Admin). |
| Users | `PATCH /api/users/{user_id}/deactivate` | Deactivate a team account (Admin). |
| Categories | `GET /api/categories` | List categories. |
| Categories | `POST /api/categories` | Create a category. |
| Categories | `DELETE /api/categories/{category_id}` | Delete an unused category. |
| Products | `GET /api/products` | List products. |
| Products | `POST /api/products` | Create a product. |
| Products | `PUT /api/products/{product_id}` | Update a product. |
| Products | `DELETE /api/products/{product_id}` | Delete a product when its history allows it. |
| Production | `GET /api/production` | List production entries. |
| Production | `POST /api/production` | Record a production entry. |
| Sales | `GET /api/sales` | List sales. |
| Sales | `POST /api/sales` | Record a sale. |
| Customers | `GET /api/customers` | List customers. |
| Customers | `POST /api/customers` | Create a customer. |
| Customers | `DELETE /api/customers/{customer_id}` | Delete a customer record. |
| Suppliers | `GET /api/suppliers` | List suppliers. |
| Suppliers | `POST /api/suppliers` | Create a supplier. |
| Suppliers | `DELETE /api/suppliers/{supplier_id}` | Delete a supplier record. |
| Inventory | `GET /api/inventory/movements` | View stock movement history. |
| Inventory | `POST /api/inventory/adjustments` | Adjust stock (Admin or Manager). |
| Dashboard | `GET /api/dashboard` | Retrieve dashboard metrics. |
| Reports | `GET /api/reports/summary` | Retrieve sales and production summary metrics. |
| Reports | `GET /api/reports/sales-by-day` | Retrieve daily sales revenue for a selected number of days. |
| Reports | `GET /api/reports/stock` | Retrieve product-level inventory valuation and stock status. |

For request and response schemas, validation rules, and interactive API testing, use `/docs` while the application is running.

## Inventory behaviour

- Creating a product with opening stock records an opening stock movement.
- Recording production increases the product's stock and records a production movement.
- Recording a sale checks available stock, decreases stock, and records a sale movement.
- Manual stock adjustments require an authorized role and a reason.
- Products with sales, production, or stock-movement history are protected from deletion to preserve operational records.

## Existing database compatibility

This version is designed to retain the existing `categories` and `products` tables. The models expect these core columns:

- `categories`: `id`, `name`
- `products`: `id`, `sku`, `barcode`, `name`, `category_id`, `price`, `stock`, `reorder_level`

The application calls SQLAlchemy `Base.metadata.create_all()` during startup. This creates missing tables, but **does not alter existing table definitions or migrate existing columns**. Back up your database before running the upgraded application. If your current schema differs from the columns above, create and test an appropriate migration or update the models before starting the application. Do not assume that `create_all()` will safely migrate an older schema.

## Security and deployment notes

- Keep `.env` out of version control and never publish database passwords, JWT secrets, or real credentials.
- Use a long, randomly generated `SECRET_KEY`; do not rely on a development fallback.
- The current `database.py` in the repository includes a hard-coded fallback database URL. **Before using this repository, remove that fallback and require `DATABASE_URL` to be supplied through the environment.** If the embedded password was ever a real credential, rotate it.
- Change the initial administrator password immediately after first sign-in.
- The current project is intended for local development and demonstration. A public deployment should additionally use HTTPS, a production ASGI server configuration, secure secret management, database backups, logging/monitoring, and a reviewed session/token strategy.
- The browser token is stored in `sessionStorage`; assess your threat model and use an appropriate production authentication/session design before deployment.

## Current scope and limitations

The repository currently includes product and category management, stock tracking, production entries, sales, customer and supplier directories, role-based team access, dashboard metrics, and CSV report exports. It does not currently document or implement purchase-order workflows, supplier invoicing, GST/tax invoicing, multi-branch inventory, barcode-scanner hardware integration, or online payment processing.

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Make and test your changes locally.
4. Commit with a descriptive message.
5. Open a pull request describing the change.

## License

No license file is currently included in this repository. Unless a license is added, all rights remain with the copyright holder; do not assume the project is open source for reuse.

## Repository

[https://github.com/akash01-arch/Retail-product-management-system](https://github.com/akash01-arch/Retail-product-management-system)
