from contextlib import asynccontextmanager
from datetime import date, datetime, time, timezone
from pathlib import Path
import os

from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordBearer
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import BASE_DIR, Base, SessionLocal, engine, get_db
from models import (
    Category, Customer, Product, ProductionEntry, Sale, StockMovement, Supplier, User,
)
from schemas import (
    CategoryCreate, CategoryOut, CustomerCreate, CustomerOut, LoginRequest,
    PasswordChange, ProductCreate, ProductOut, ProductUpdate, ProductionCreate,
    ProductionOut, SaleCreate, SaleOut, StockAdjustment, StockMovementOut,
    SupplierCreate, SupplierOut, UserCreate, UserOut,
)
from security import create_access_token, decode_access_token, hash_password, verify_password

STATIC_DIR = BASE_DIR / "static"
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def initialize_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).count() == 0:
            username = os.getenv("INITIAL_ADMIN_USERNAME", "admin")
            password = os.getenv("INITIAL_ADMIN_PASSWORD", "")
            email = os.getenv("INITIAL_ADMIN_EMAIL") or None
            if not password:
                raise RuntimeError(
                    "No admin user exists. Set INITIAL_ADMIN_USERNAME and "
                    "INITIAL_ADMIN_PASSWORD in your .env file, then restart the app."
                )
            db.add(User(
                username=username,
                email=email,
                hashed_password=hash_password(password),
                role="admin",
                is_active=True,
            ))
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="Retail Management System API",
    description="Inventory, products, production, sales and user management.",
    version="2.0.0",
    lifespan=lifespan,
)


@app.get("/", include_in_schema=False)
def serve_frontend():
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "connected"}


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub", ""))
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired session")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is inactive or unavailable")
    return user


def require_roles(*roles: str):
    def role_dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You do not have permission to perform this action")
        return user
    return role_dependency


def add_stock_movement(
    db: Session,
    product_id: int,
    movement_type: str,
    quantity_change: int,
    user_id: int | None,
    note: str | None = None,
    reference_type: str | None = None,
    reference_id: int | None = None,
):
    db.add(StockMovement(
        product_id=product_id,
        movement_type=movement_type,
        quantity_change=quantity_change,
        note=note,
        reference_type=reference_type,
        reference_id=reference_id,
        created_by=user_id,
    ))


# ------------------------------- Authentication -------------------------------
@app.post("/api/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated")
    return {
        "access_token": create_access_token(user.id, user.role),
        "token_type": "bearer",
        "user": UserOut.model_validate(user).model_dump(mode="json"),
    }


@app.get("/api/auth/me", response_model=UserOut)
def get_me(user: User = Depends(get_current_user)):
    return user


@app.post("/api/auth/change-password")
def change_password(
    payload: PasswordChange,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.hashed_password = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated successfully"}


# -------------------------------- User management -------------------------------
@app.get("/api/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    return db.query(User).order_by(User.id.desc()).all()


@app.post("/api/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_roles("admin")),
):
    user = User(
        username=payload.username.strip(),
        email=payload.email.strip() if payload.email else None,
        hashed_password=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Username or email already exists")
    return user


@app.patch("/api/users/{user_id}/deactivate")
def deactivate_user(
    user_id: int,
    current_user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account")
    target.is_active = False
    db.commit()
    return {"message": "User deactivated"}


# --------------------------------- Categories -----------------------------------
@app.get("/api/categories", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return db.query(Category).order_by(Category.name.asc()).all()


@app.post("/api/categories", response_model=CategoryOut, status_code=201)
def create_category(
    payload: CategoryCreate,
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles("admin", "manager")),
):
    name = payload.name.strip()
    if db.query(Category).filter(func.lower(Category.name) == name.lower()).first():
        raise HTTPException(status_code=409, detail="Category already exists")
    category = Category(name=name)
    db.add(category)
    try:
        db.commit()
        db.refresh(category)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Category already exists")
    return category


@app.delete("/api/categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles("admin", "manager")),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    if db.query(Product).filter(Product.category_id == category_id).first():
        raise HTTPException(status_code=409, detail="This category is assigned to products and cannot be deleted")
    db.delete(category)
    db.commit()
    return {"message": "Category deleted"}


# ---------------------------------- Products ------------------------------------
@app.get("/api/products", response_model=list[ProductOut])
def list_products(
    search: str | None = None,
    category_id: int | None = None,
    low_stock: bool = False,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(Product)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(or_(Product.name.ilike(term), Product.sku.ilike(term), Product.barcode.ilike(term)))
    if category_id:
        query = query.filter(Product.category_id == category_id)
    if low_stock:
        query = query.filter(Product.stock <= Product.reorder_level)
    return query.order_by(Product.id.desc()).all()


@app.post("/api/products", response_model=ProductOut, status_code=201)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "manager")),
):
    if not db.query(Category).filter(Category.id == payload.category_id).first():
        raise HTTPException(status_code=404, detail="Selected category was not found")
    product = Product(**payload.model_dump())
    db.add(product)
    try:
        db.flush()
        if product.stock > 0:
            add_stock_movement(db, product.id, "opening", product.stock, user.id, "Opening stock")
        db.commit()
        db.refresh(product)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="SKU or barcode already exists")
    return product


@app.put("/api/products/{product_id}", response_model=ProductOut)
def update_product(
    product_id: int,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "manager")),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    updates = payload.model_dump(exclude_unset=True)
    if "category_id" in updates and not db.query(Category).filter(Category.id == updates["category_id"]).first():
        raise HTTPException(status_code=404, detail="Selected category was not found")
    old_stock = product.stock
    for key, value in updates.items():
        setattr(product, key, value)
    stock_delta = product.stock - old_stock
    try:
        if stock_delta:
            add_stock_movement(db, product.id, "adjustment", stock_delta, user.id, "Stock updated from product form")
        db.commit()
        db.refresh(product)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="SKU or barcode already exists")
    return product


@app.delete("/api/products/{product_id}")
def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    _user: User = Depends(require_roles("admin", "manager")),
):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    has_history = (
        db.query(ProductionEntry).filter(ProductionEntry.product_id == product_id).first()
        or db.query(Sale).filter(Sale.product_id == product_id).first()
        or db.query(StockMovement).filter(StockMovement.product_id == product_id).first()
    )
    if has_history:
        raise HTTPException(status_code=409, detail="Product has inventory history and cannot be deleted. Keep it for accurate reports.")
    db.delete(product)
    db.commit()
    return {"message": "Product deleted"}


# --------------------------------- Production -----------------------------------
@app.get("/api/production", response_model=list[ProductionOut])
def list_production(
    start_date: date | None = None,
    end_date: date | None = None,
    product_id: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(ProductionEntry)
    if start_date:
        query = query.filter(ProductionEntry.production_date >= start_date)
    if end_date:
        query = query.filter(ProductionEntry.production_date <= end_date)
    if product_id:
        query = query.filter(ProductionEntry.product_id == product_id)
    return query.order_by(ProductionEntry.production_date.desc(), ProductionEntry.id.desc()).limit(500).all()


@app.post("/api/production", response_model=ProductionOut, status_code=201)
def create_production(
    payload: ProductionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "manager", "staff")),
):
    product = db.query(Product).filter(Product.id == payload.product_id).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    entry = ProductionEntry(**payload.model_dump(), created_by=user.id)
    db.add(entry)
    product.stock += payload.quantity
    try:
        db.flush()
        add_stock_movement(db, product.id, "production", payload.quantity, user.id,
                           payload.notes or "Stock received from production", "production", entry.id)
        db.commit()
        db.refresh(entry)
    except Exception:
        db.rollback()
        raise
    return entry


# ------------------------------------ Sales -------------------------------------
@app.get("/api/sales", response_model=list[SaleOut])
def list_sales(
    start_date: date | None = None,
    end_date: date | None = None,
    product_id: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(Sale)
    if start_date:
        query = query.filter(Sale.sale_date >= datetime.combine(start_date, time.min, tzinfo=timezone.utc))
    if end_date:
        query = query.filter(Sale.sale_date < datetime.combine(end_date, time.max, tzinfo=timezone.utc))
    if product_id:
        query = query.filter(Sale.product_id == product_id)
    return query.order_by(Sale.sale_date.desc(), Sale.id.desc()).limit(1000).all()


@app.post("/api/sales", response_model=SaleOut, status_code=201)
def create_sale(
    payload: SaleCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "manager", "staff")),
):
    product = db.query(Product).filter(Product.id == payload.product_id).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.stock < payload.quantity:
        raise HTTPException(status_code=409, detail=f"Insufficient stock. Available quantity: {product.stock}")
    if payload.customer_id and not db.query(Customer).filter(Customer.id == payload.customer_id).first():
        raise HTTPException(status_code=404, detail="Customer not found")

    unit_price = payload.unit_price if payload.unit_price is not None else product.price
    sale = Sale(
        product_id=payload.product_id,
        customer_id=payload.customer_id,
        sale_date=payload.sale_date or datetime.now(timezone.utc),
        quantity=payload.quantity,
        unit_price=unit_price,
        total_amount=round(unit_price * payload.quantity, 2),
        payment_method=payload.payment_method,
        payment_status=payload.payment_status,
        notes=payload.notes,
        created_by=user.id,
    )
    product.stock -= payload.quantity
    db.add(sale)
    try:
        db.flush()
        add_stock_movement(db, product.id, "sale", -payload.quantity, user.id,
                           f"Sale #{sale.id}", "sale", sale.id)
        db.commit()
        db.refresh(sale)
    except Exception:
        db.rollback()
        raise
    return sale


# -------------------------------- Customers -------------------------------------
@app.get("/api/customers", response_model=list[CustomerOut])
def list_customers(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return db.query(Customer).order_by(Customer.name.asc()).all()


@app.post("/api/customers", response_model=CustomerOut, status_code=201)
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    customer = Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@app.delete("/api/customers/{customer_id}")
def delete_customer(customer_id: int, db: Session = Depends(get_db), _user: User = Depends(require_roles("admin", "manager"))):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(customer)
    db.commit()
    return {"message": "Customer deleted"}


# -------------------------------- Suppliers -------------------------------------
@app.get("/api/suppliers", response_model=list[SupplierOut])
def list_suppliers(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    return db.query(Supplier).order_by(Supplier.name.asc()).all()


@app.post("/api/suppliers", response_model=SupplierOut, status_code=201)
def create_supplier(payload: SupplierCreate, db: Session = Depends(get_db), _user: User = Depends(require_roles("admin", "manager"))):
    supplier = Supplier(**payload.model_dump())
    db.add(supplier)
    db.commit()
    db.refresh(supplier)
    return supplier


@app.delete("/api/suppliers/{supplier_id}")
def delete_supplier(supplier_id: int, db: Session = Depends(get_db), _user: User = Depends(require_roles("admin", "manager"))):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    db.delete(supplier)
    db.commit()
    return {"message": "Supplier deleted"}


# ------------------------------ Inventory ledger -------------------------------
@app.get("/api/inventory/movements", response_model=list[StockMovementOut])
def list_stock_movements(
    product_id: int | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = db.query(StockMovement)
    if product_id:
        query = query.filter(StockMovement.product_id == product_id)
    return query.order_by(StockMovement.created_at.desc(), StockMovement.id.desc()).limit(500).all()


@app.post("/api/inventory/adjustments")
def adjust_stock(
    payload: StockAdjustment,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "manager")),
):
    product = db.query(Product).filter(Product.id == payload.product_id).with_for_update().first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if product.stock + payload.quantity_change < 0:
        raise HTTPException(status_code=409, detail="Adjustment would make stock negative")
    product.stock += payload.quantity_change
    add_stock_movement(db, product.id, "adjustment", payload.quantity_change, user.id, payload.note)
    db.commit()
    return {"message": "Stock adjusted", "current_stock": product.stock}


# --------------------------------- Dashboard ------------------------------------
@app.get("/api/dashboard")
def dashboard(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    today = date.today()
    total_products = db.query(func.count(Product.id)).scalar() or 0
    total_stock = db.query(func.coalesce(func.sum(Product.stock), 0)).scalar() or 0
    stock_value = db.query(func.coalesce(func.sum(Product.price * Product.stock), 0)).scalar() or 0
    low_stock = db.query(func.count(Product.id)).filter(Product.stock <= Product.reorder_level).scalar() or 0
    sales_today = db.query(func.coalesce(func.sum(Sale.total_amount), 0)).filter(func.date(Sale.sale_date) == today).scalar() or 0
    transactions_today = db.query(func.count(Sale.id)).filter(func.date(Sale.sale_date) == today).scalar() or 0
    production_today = db.query(func.coalesce(func.sum(ProductionEntry.quantity), 0)).filter(ProductionEntry.production_date == today).scalar() or 0
    recent_sales = db.query(Sale).order_by(Sale.sale_date.desc()).limit(6).all()
    low_items = db.query(Product).filter(Product.stock <= Product.reorder_level).order_by(Product.stock.asc()).limit(8).all()
    return {
        "total_products": total_products,
        "total_stock": int(total_stock),
        "inventory_value": round(float(stock_value), 2),
        "low_stock_products": low_stock,
        "sales_today": round(float(sales_today), 2),
        "transactions_today": transactions_today,
        "production_today": int(production_today),
        "recent_sales": [
            {"id": s.id, "product_id": s.product_id, "quantity": s.quantity,
             "total_amount": s.total_amount, "sale_date": s.sale_date}
            for s in recent_sales
        ],
        "low_stock_items": [
            {"id": p.id, "name": p.name, "sku": p.sku, "stock": p.stock,
             "reorder_level": p.reorder_level}
            for p in low_items
        ],
    }


@app.get("/api/reports/summary")
def report_summary(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    sales_query = db.query(Sale)
    production_query = db.query(ProductionEntry)
    if start_date:
        sales_query = sales_query.filter(Sale.sale_date >= datetime.combine(start_date, time.min, tzinfo=timezone.utc))
        production_query = production_query.filter(ProductionEntry.production_date >= start_date)
    if end_date:
        sales_query = sales_query.filter(Sale.sale_date < datetime.combine(end_date, time.max, tzinfo=timezone.utc))
        production_query = production_query.filter(ProductionEntry.production_date <= end_date)
    sales_total = sales_query.with_entities(func.coalesce(func.sum(Sale.total_amount), 0)).scalar() or 0
    units_sold = sales_query.with_entities(func.coalesce(func.sum(Sale.quantity), 0)).scalar() or 0
    production_total = production_query.with_entities(func.coalesce(func.sum(ProductionEntry.quantity), 0)).scalar() or 0
    return {
        "sales_revenue": round(float(sales_total), 2),
        "units_sold": int(units_sold),
        "units_produced": int(production_total),
        "products": db.query(Product).count(),
        "stock_units": int(db.query(func.coalesce(func.sum(Product.stock), 0)).scalar() or 0),
    }


@app.get("/api/reports/sales-by-day")
def sales_by_day(
    days: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    start = datetime.combine(date.today(), time.min, tzinfo=timezone.utc)
    from datetime import timedelta
    start = start - timedelta(days=days - 1)
    rows = (
        db.query(func.date(Sale.sale_date).label("day"), func.coalesce(func.sum(Sale.total_amount), 0).label("revenue"))
        .filter(Sale.sale_date >= start)
        .group_by(func.date(Sale.sale_date))
        .order_by(func.date(Sale.sale_date).asc())
        .all()
    )
    result = {str(row.day): float(row.revenue) for row in rows}
    return [
        {"date": date.fromordinal(date.today().toordinal() - offset).isoformat(),
         "revenue": round(result.get(date.fromordinal(date.today().toordinal() - offset).isoformat(), 0), 2)}
        for offset in range(days - 1, -1, -1)
    ]


@app.get("/api/reports/stock")
def stock_report(db: Session = Depends(get_db), _user: User = Depends(get_current_user)):
    items = db.query(Product).order_by(Product.name.asc()).all()
    return [
        {"product_id": p.id, "sku": p.sku, "name": p.name, "category_id": p.category_id,
         "price": p.price, "stock": p.stock, "reorder_level": p.reorder_level,
         "inventory_value": round(p.price * p.stock, 2),
         "status": "Low Stock" if p.stock <= p.reorder_level else "In Stock"}
        for p in items
    ]
