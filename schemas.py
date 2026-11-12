from datetime import date, datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=128)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=60)
    password: str = Field(min_length=8, max_length=128)
    email: str | None = Field(default=None, max_length=150)
    role: str = "staff"

    @field_validator("role")
    @classmethod
    def valid_role(cls, value):
        if value not in {"admin", "manager", "staff"}:
            raise ValueError("Role must be admin, manager or staff")
        return value


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserOut(ORMModel):
    id: int
    username: str
    email: str | None
    role: str
    is_active: bool
    created_at: datetime


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)


class CategoryOut(ORMModel):
    id: int
    name: str


class ProductCreate(BaseModel):
    sku: str = Field(min_length=3, max_length=50)
    barcode: str = Field(min_length=3, max_length=100)
    name: str = Field(min_length=2, max_length=100)
    category_id: int
    price: float = Field(ge=0)
    stock: int = Field(default=0, ge=0)
    reorder_level: int = Field(default=10, ge=0)


class ProductUpdate(BaseModel):
    sku: str | None = Field(default=None, min_length=3, max_length=50)
    barcode: str | None = Field(default=None, max_length=100)
    name: str | None = Field(default=None, min_length=2, max_length=150)
    category_id: int | None = None
    price: float | None = Field(default=None, ge=0)
    stock: int | None = Field(default=None, ge=0)
    reorder_level: int | None = Field(default=None, ge=0)


class ProductOut(ORMModel):
    id: int
    sku: str
    barcode: str | None
    name: str
    category_id: int
    price: float
    stock: int
    reorder_level: int


class CustomerCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=150)
    address: str | None = None


class CustomerOut(ORMModel):
    id: int
    name: str
    phone: str | None
    email: str | None
    address: str | None


class SupplierCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    contact_person: str | None = Field(default=None, max_length=120)
    phone: str | None = Field(default=None, max_length=30)
    email: str | None = Field(default=None, max_length=150)
    address: str | None = None


class SupplierOut(ORMModel):
    id: int
    name: str
    contact_person: str | None
    phone: str | None
    email: str | None
    address: str | None


class ProductionCreate(BaseModel):
    product_id: int
    production_date: date = Field(default_factory=date.today)
    quantity: int = Field(gt=0)
    batch_number: str | None = Field(default=None, max_length=60)
    notes: str | None = None


class ProductionOut(ORMModel):
    id: int
    product_id: int
    production_date: date
    quantity: int
    batch_number: str | None
    notes: str | None


class SaleCreate(BaseModel):
    product_id: int
    customer_id: int | None = None
    sale_date: datetime | None = None
    quantity: int = Field(gt=0)
    unit_price: float | None = Field(default=None, ge=0)
    payment_method: str = Field(default="Cash", max_length=30)
    payment_status: str = Field(default="Paid", max_length=20)
    notes: str | None = None


class SaleOut(ORMModel):
    id: int
    product_id: int
    customer_id: int | None
    sale_date: datetime
    quantity: int
    unit_price: float
    total_amount: float
    payment_method: str
    payment_status: str
    notes: str | None


class StockAdjustment(BaseModel):
    product_id: int
    quantity_change: int
    note: str = Field(min_length=3, max_length=500)


class StockMovementOut(ORMModel):
    id: int
    product_id: int
    movement_type: str
    quantity_change: int
    reference_type: str | None
    reference_id: int | None
    note: str | None
    created_at: datetime
