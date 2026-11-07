"""Product CRUD endpoints with server-side search and pagination."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Category, Product
from app.schemas import ProductCreate, ProductOut, ProductPage, ProductUpdate

router = APIRouter(prefix="/products", tags=["Products"])


def _require_category(db: Session, category_id: int) -> None:
    if db.get(Category, category_id) is None:
        raise HTTPException(status_code=404, detail="Category not found")


def _product_query(q: str | None, category_id: int | None, low_stock: bool | None):
    statement = select(Product)
    if q:
        term = f"%{q.strip()}%"
        statement = statement.where(
            or_(Product.name.ilike(term), Product.sku.ilike(term), Product.barcode.ilike(term))
        )
    if category_id is not None:
        statement = statement.where(Product.category_id == category_id)
    if low_stock is True:
        statement = statement.where(Product.stock <= Product.reorder_level)
    elif low_stock is False:
        statement = statement.where(Product.stock > Product.reorder_level)
    return statement


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, db: Session = Depends(get_db)):
    _require_category(db, payload.category_id)
    product = Product(**payload.model_dump())
    db.add(product)
    try:
        db.commit()
        db.refresh(product)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="SKU or barcode already exists"
        ) from exc
    return product


@router.get("", response_model=ProductPage)
def list_products(
    q: str | None = Query(default=None, max_length=100),
    category_id: int | None = Query(default=None, gt=0),
    low_stock: bool | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    statement = _product_query(q, category_id, low_stock)
    total_statement = select(func.count()).select_from(statement.order_by(None).subquery())
    total = db.scalar(total_statement) or 0
    items = db.scalars(
        statement.order_by(Product.name.asc(), Product.id.asc()).offset(skip).limit(limit)
    ).all()
    return ProductPage(items=items, total=total, skip=skip, limit=limit)


@router.get("/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Provide at least one field to update")
    if "category_id" in changes:
        _require_category(db, changes["category_id"])

    for field, value in changes.items():
        setattr(product, field, value)

    try:
        db.commit()
        db.refresh(product)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="SKU or barcode already exists"
        ) from exc
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return None
