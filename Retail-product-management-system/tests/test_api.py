def create_category(client, name="Electronics"):
    response = client.post("/categories", json={"name": name})
    assert response.status_code == 201
    return response.json()


def create_product(client, category_id, **overrides):
    payload = {
        "sku": "SKU-1001",
        "barcode": "8901001001",
        "name": "Wireless Mouse",
        "category_id": category_id,
        "price": "799.00",
        "stock": 5,
        "reorder_level": 10,
    }
    payload.update(overrides)
    return client.post("/products", json=payload)


def test_health_endpoint(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_and_list_category(client):
    category = create_category(client, "  Electronics  ")
    response = client.get("/categories")
    assert response.status_code == 200
    assert response.json() == [category]
    assert category["name"] == "Electronics"


def test_duplicate_category_returns_conflict(client):
    create_category(client)
    response = client.post("/categories", json={"name": "Electronics"})
    assert response.status_code == 409


def test_product_crud_and_inventory_summary(client):
    category = create_category(client)
    created = create_product(client, category["id"])
    assert created.status_code == 201
    product = created.json()
    assert product["sku"] == "SKU-1001"
    assert product["price"] == "799.00"

    listing = client.get("/products")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1
    assert len(listing.json()["items"]) == 1

    summary = client.get("/reports/summary").json()
    assert summary["total_products"] == 1
    assert summary["total_stock_units"] == 5
    assert summary["inventory_value"] == "3995.00"
    assert summary["low_stock_products"] == 1

    updated = client.put(
        f"/products/{product['id']}", json={"stock": 25}
    )
    assert updated.status_code == 200
    assert updated.json()["stock"] == 25

    deleted = client.delete(f"/products/{product['id']}")
    assert deleted.status_code == 204
    assert client.get("/products").json()["total"] == 0


def test_product_validation_and_duplicate_sku(client):
    category = create_category(client)
    first = create_product(client, category["id"])
    assert first.status_code == 201

    duplicate = create_product(
        client, category["id"], barcode="8901001002", name="Different Product"
    )
    assert duplicate.status_code == 409

    invalid = create_product(
        client, category["id"], sku="SKU-1002", barcode="8901001003", price="0"
    )
    assert invalid.status_code == 422


def test_search_pagination_and_category_delete_protection(client):
    category = create_category(client)
    create_product(client, category["id"])
    create_product(
        client,
        category["id"],
        sku="SKU-2002",
        barcode="8902002002",
        name="USB Keyboard",
        stock=30,
    )

    search = client.get("/products", params={"q": "keyboard"})
    assert search.status_code == 200
    assert search.json()["total"] == 1
    assert search.json()["items"][0]["name"] == "USB Keyboard"

    low_stock = client.get("/products", params={"low_stock": "true"})
    assert low_stock.json()["total"] == 1

    page = client.get("/products", params={"skip": 0, "limit": 1})
    assert page.json()["limit"] == 1
    assert len(page.json()["items"]) == 1

    blocked_delete = client.delete(f"/categories/{category['id']}")
    assert blocked_delete.status_code == 409


def test_csv_export_contains_inventory_rows(client):
    category = create_category(client)
    create_product(client, category["id"])

    response = client.get("/reports/inventory.csv")
    assert response.status_code == 200
    assert "text/csv" in response.headers["content-type"]
    assert "Wireless Mouse" in response.text
    assert "Electronics" in response.text
