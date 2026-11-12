"""Pydantic request and response schemas."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Category name must contain at least 2 characters")
        return value


class CategoryOut(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class ProductFields(BaseModel):
    sku: str = Field(min_length=3, max_length=50)
    barcode: str = Field(min_length=3, max_length=100)
    name: str = Field(min_length=1, max_length=100)
    category_id: int = Field(gt=0)
    price: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    stock: int = Field(ge=0)
    reorder_level: int = Field(ge=0)

    @field_validator("sku", "barcode", "name")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value


class ProductCreate(ProductFields):
    pass


class ProductUpdate(BaseModel):
    sku: str | None = Field(default=None, min_length=3, max_length=50)
    barcode: str | None = Field(default=None, min_length=3, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    category_id: int | None = Field(default=None, gt=0)
    price: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    stock: int | None = Field(default=None, ge=0)
    reorder_level: int | None = Field(default=None, ge=0)

    @field_validator("sku", "barcode", "name", "category_id", "price", "stock", "reorder_level", mode="before")
    @classmethod
    def reject_null_updates(cls, value):
        if value is None:
            raise ValueError("Use a valid value; null is not allowed for product fields")
        return value

    @field_validator("sku", "barcode", "name")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value


class ProductOut(BaseModel):
    id: int
    sku: str
    barcode: str
    name: str
    category_id: int
    price: Decimal
    stock: int
    reorder_level: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProductPage(BaseModel):
    items: list[ProductOut]
    total: int
    skip: int
    limit: int


class InventorySummary(BaseModel):
    total_products: int
    total_stock_units: int
    inventory_value: Decimal
    low_stock_products: int
