# Retail Inventory Management System

A full-stack web application for managing retail products, categories, and inventory. Built using Python, FastAPI, PostgreSQL, SQLAlchemy, HTML, CSS, and JavaScript.

The application provides a central interface to manage product records, monitor stock levels, view inventory summaries, and export inventory reports.

## Features

- **Product Management:** Add, view, update, and delete products.
- **Category Management:** Create and manage product categories.
- **Inventory Dashboard:** View total products, total stock units, inventory value, and low-stock products.
- **Product Search:** Search products by name, SKU, barcode, or category.
- **Stock Monitoring:** Identify products that have reached or fallen below their reorder level.
- **Inventory Report:** View product-wise inventory details and stock status.
- **CSV Export:** Download inventory data as a CSV file.
- **Database Integration:** Store and manage product and category information using PostgreSQL.
- **REST API:** Handle frontend requests through FastAPI endpoints.

## Technologies Used

| Technology | Purpose |
|---|---|
| Python | Backend development |
| FastAPI | REST API development |
| PostgreSQL | Relational database |
| SQLAlchemy | Database ORM |
| Pydantic | Data validation |
| HTML5 | Frontend structure |
| CSS3 | Frontend styling |
| JavaScript | Frontend functionality |
| Git & GitHub | Version control |

## Project Structure

```text
retail-inventory-management-system/
│
├── app/
│   └── Backend application modules
│
├── migrations/
│   └── Database migration files
│
├── tests/
│   └── API test files
│
├── .env.example
├── .gitignore
├── alembic.ini
├── index.html
├── main.py
├── requirements.txt
├── script.js
└── README.md
```

## Database Design

The application uses PostgreSQL with two main entities:

**1. Categories**

- `id` – Category ID (Primary Key)
- `name` – Category name

**2. Products**

- `id` – Product ID (Primary Key)
- `sku` – Stock Keeping Unit
- `barcode` – Product barcode
- `name` – Product name
- `category_id` – Category reference (Foreign Key)
- `price` – Product price
- `stock` – Available stock quantity
- `reorder_level` – Minimum stock threshold
- `created_at` – Record creation date
- `updated_at` – Last update date

Each product belongs to a category. A category cannot be deleted while products are assigned to it.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | API welcome message |
| GET | `/health` | Check API status |
| POST | `/categories` | Create a category |
| GET | `/categories` | Retrieve categories |
| DELETE | `/categories/{category_id}` | Delete a category |
| POST | `/products` | Add a product |
| GET | `/products` | Retrieve products |
| GET | `/products/{product_id}` | Retrieve a product by ID |
| PUT | `/products/{product_id}` | Update a product |
| DELETE | `/products/{product_id}` | Delete a product |

## Installation and Setup

### 1. Clone the repository

```bash
git clone https://github.com/akash01-arch/retail-inventory-management-system.git
```

```bash
cd retail-inventory-management-system
```

### 2. Create a virtual environment

```powershell
python -m venv .venv
```

Activate it:

```powershell
.\.venv\Scripts\Activate.ps1
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Create the PostgreSQL database

Create a database named:

```sql
CREATE DATABASE retaildb;
```

### 5. Configure environment variables

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Update the database connection string inside `.env` with your PostgreSQL username and password.

Do not upload your actual `.env` file to GitHub.

### 6. Run the backend

```bash
python -m uvicorn main:app --reload
```

Backend URL:

http://127.0.0.1:8000

API documentation:

http://127.0.0.1:8000/docs

### 7. Run the frontend

Open a second terminal in the project root:

```bash
python -m http.server 5500
```

Open the application in your browser:

http://127.0.0.1:5500

## Inventory Calculations

The dashboard uses the following calculations:

**Total Inventory Value**

Unit Price × Available Stock

**Low-Stock Identification**

Available Stock ≤ Reorder Level

**Total Stock Units**

Sum of the stock quantities of all products.

## Project Purpose

This project was developed to gain practical experience in full-stack application development, REST API development, database integration, and inventory management.

It demonstrates the integration of a frontend application with a Python backend and a PostgreSQL relational database.

## Author

**Akash More**

BCA Data Science Student | Aspiring Software Developer

GitHub: https://github.com/akash01-arch
