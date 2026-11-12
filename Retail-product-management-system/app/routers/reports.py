"""Inventory dashboard and CSV reporting endpoints."""

import csv
from decimal import Decimal
from io import StringIO

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Product
from app.schemas import InventorySummary
from app.routers.products import _product_query

router = APIRouter(prefix="/reports", tags=["Reports"])


@router.get("/summary", response_model=InventorySummary)
def inventory_summary(db: Session = Depends(get_db)):
    statement = select(
        func.count(Product.id),
        func.coalesce(func.sum(Product.stock), 0),
        func.coalesce(func.sum(Product.price * Product.stock), Decimal("0.00")),
        func.coalesce(
            func.sum(case((Product.stock <= Product.reorder_level, 1), else_=0)), 0
        ),
    )
    total_products, total_stock, inventory_value, low_stock = db.execute(statement).one()
    return InventorySummary(
        total_products=total_products,
        total_stock_units=total_stock,
        inventory_value=inventory_value,
        low_stock_products=low_stock,
    )


def _safe_csv_value(value):
    """Reduce spreadsheet formula-injection risk for text cells."""
    text = "" if value is None else str(value)
    if text.startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + text
    return text


@router.get("/inventory.csv")
def export_inventory_csv(
    q: str | None = Query(default=None, max_length=100),
    category_id: int | None = Query(default=None, gt=0),
    low_stock: bool | None = None,
    db: Session = Depends(get_db),
):
    statement = (
        _product_query(q, category_id, low_stock)
        .add_columns(Category.name)
        .join(Category, Product.category_id == Category.id)
        .order_by(Product.name.asc(), Product.id.asc())
    )
    rows = db.execute(statement).all()

    output = StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow([
        "ID", "SKU", "Barcode", "Product Name", "Category", "Unit Price",
        "Stock", "Reorder Level", "Inventory Value", "Status",
    ])
    for product, category_name in rows:
        stock = int(product.stock)
        value = product.price * stock
        writer.writerow([
            product.id,
            _safe_csv_value(product.sku),
            _safe_csv_value(product.barcode),
            _safe_csv_value(product.name),
            _safe_csv_value(category_name),
            str(product.price),
            stock,
            product.reorder_level,
            str(value),
            "Low Stock" if stock <= product.reorder_level else "In Stock",
        ])

    output.seek(0)
    return StreamingResponse(
        iter(["\ufeff" + output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=retail_inventory_report.csv"},
    )
