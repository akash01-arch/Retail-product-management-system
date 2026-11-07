"""Create tables or adopt the original CRUD application's existing schema.

This migration is intentionally safe for the user's earlier version, which
created `categories` and `products` with SQLAlchemy metadata at application
startup instead of using Alembic. Existing rows are preserved.
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def _create_categories() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.UniqueConstraint("name", name="uq_categories_name"),
    )


def _create_products() -> None:
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("sku", sa.String(length=50), nullable=False),
        sa.Column("barcode", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("price", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("stock", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reorder_level", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("price > 0", name="ck_products_price_positive"),
        sa.CheckConstraint("stock >= 0", name="ck_products_stock_nonnegative"),
        sa.CheckConstraint("reorder_level >= 0", name="ck_products_reorder_nonnegative"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="RESTRICT"),
        sa.UniqueConstraint("sku", name="uq_products_sku"),
        sa.UniqueConstraint("barcode", name="uq_products_barcode"),
    )
    op.create_index("ix_products_category_id", "products", ["category_id"])
    op.create_index("ix_products_name", "products", ["name"])


def _add_missing_indexes_and_checks() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    indexes = {item["name"] for item in inspector.get_indexes("products")}
    if "ix_products_category_id" not in indexes:
        op.create_index("ix_products_category_id", "products", ["category_id"])
    if "ix_products_name" not in indexes:
        op.create_index("ix_products_name", "products", ["name"])

    checks = {item.get("name") for item in inspector.get_check_constraints("products")}
    if "ck_products_price_positive" not in checks:
        op.create_check_constraint("ck_products_price_positive", "products", "price > 0")
    if "ck_products_stock_nonnegative" not in checks:
        op.create_check_constraint("ck_products_stock_nonnegative", "products", "stock >= 0")
    if "ck_products_reorder_nonnegative" not in checks:
        op.create_check_constraint("ck_products_reorder_nonnegative", "products", "reorder_level >= 0")


def _upgrade_original_postgres_schema() -> None:
    """Bring the original create_all schema closer to the new model schema."""
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"]: column for column in inspector.get_columns("products")}

    # The original project used Float for price and timezone-naive timestamps.
    # Convert them explicitly for PostgreSQL while preserving existing records.
    if bind.dialect.name == "postgresql":
        price_type = columns["price"]["type"]
        if not isinstance(price_type, sa.Numeric) or price_type.precision != 12 or price_type.scale != 2:
            op.alter_column(
                "products", "price", existing_type=price_type,
                type_=sa.Numeric(precision=12, scale=2),
                postgresql_using="ROUND(price::numeric, 2)",
            )

        for column_name in ("created_at", "updated_at"):
            column_type = columns[column_name]["type"]
            if isinstance(column_type, sa.DateTime) and not column_type.timezone:
                op.alter_column(
                    "products", column_name, existing_type=column_type,
                    type_=sa.DateTime(timezone=True),
                    postgresql_using=f"{column_name} AT TIME ZONE 'UTC'",
                )

    # Fill any nullable legacy values before enforcing the current constraints.
    op.execute(sa.text("UPDATE products SET stock = 0 WHERE stock IS NULL"))
    op.execute(sa.text("UPDATE products SET reorder_level = 10 WHERE reorder_level IS NULL"))
    op.execute(sa.text("UPDATE products SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
    op.execute(sa.text("UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE updated_at IS NULL"))

    # Defaults are also applied at database level for inserts made outside the API.
    op.alter_column("products", "stock", existing_type=sa.Integer(), nullable=False, server_default="0")
    op.alter_column("products", "reorder_level", existing_type=sa.Integer(), nullable=False, server_default="10")
    if bind.dialect.name == "postgresql":
        op.alter_column("products", "created_at", nullable=False, server_default=sa.func.now())
        op.alter_column("products", "updated_at", nullable=False, server_default=sa.func.now())

    _add_missing_indexes_and_checks()


def upgrade() -> None:
    existing_tables = set(sa.inspect(op.get_bind()).get_table_names())

    if "categories" not in existing_tables:
        _create_categories()
    if "products" not in existing_tables:
        _create_products()
    else:
        _upgrade_original_postgres_schema()


def downgrade() -> None:
    # The initial migration is used to adopt existing user data as well as to
    # create fresh databases. Automatically dropping these tables could destroy
    # valuable inventory records, so downgrade is deliberately non-destructive.
    pass
