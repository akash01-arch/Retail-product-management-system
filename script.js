"use strict";

// Override this value if the API is hosted at a different address.
const API_BASE = window.RETAIL_API_BASE || "http://127.0.0.1:8000";
const PAGE_SIZE = 20;
const $ = (selector) => document.querySelector(selector);

const state = {
  categories: [],
  products: [],
  total: 0,
  skip: 0,
  query: "",
};

async function apiRequest(endpoint, options = {}) {
  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(`Cannot connect to the API at ${API_BASE}. Confirm that FastAPI is running.`);
  }

  if (response.status === 204) return null;

  const responseText = await response.text();
  let data = null;
  try {
    data = responseText ? JSON.parse(responseText) : null;
  } catch {
    data = responseText;
  }

  if (!response.ok) {
    const detail = data?.detail || data?.message || responseText;
    const message = Array.isArray(detail)
      ? detail.map((item) => item.msg || JSON.stringify(item)).join(", ")
      : detail;
    throw new Error(message || `Request failed with status ${response.status}`);
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function money(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

function showMessage(message, type = "success") {
  const box = $("#message");
  if (!box) return;
  box.textContent = message;
  box.className = `message show ${type}`;
  window.clearTimeout(showMessage.timeout);
  showMessage.timeout = window.setTimeout(() => { box.className = "message"; }, 5000);
}

function getCategoryName(categoryId) {
  const category = state.categories.find((item) => Number(item.id) === Number(categoryId));
  return category ? category.name : "Uncategorized";
}

function renderCategories() {
  const table = $("#categoryRows");
  const select = $("#category_id");
  table.innerHTML = state.categories.map((category) => `
    <tr>
      <td>${category.id}</td>
      <td>${escapeHtml(category.name)}</td>
      <td><button class="btn-delete btn-small" type="button" data-delete-category="${category.id}">Delete</button></td>
    </tr>
  `).join("") || `<tr><td colspan="3" class="empty">No categories found.</td></tr>`;

  const selectedValue = select.value;
  select.innerHTML = `<option value="">Select a category</option>${state.categories.map((category) => `
    <option value="${category.id}">${escapeHtml(category.name)}</option>
  `).join("")}`;
  if (state.categories.some((category) => String(category.id) === selectedValue)) {
    select.value = selectedValue;
  }
}

async function loadCategories() {
  state.categories = await apiRequest("/categories");
  renderCategories();
}

async function loadProducts() {
  const params = new URLSearchParams({ skip: String(state.skip), limit: String(PAGE_SIZE) });
  if (state.query) params.set("q", state.query);
  const page = await apiRequest(`/products?${params.toString()}`);
  state.products = page.items;
  state.total = page.total;
  renderProducts();
}

async function loadSummary() {
  const summary = await apiRequest("/reports/summary");
  $("#totalProducts").textContent = summary.total_products;
  $("#totalStock").textContent = Number(summary.total_stock_units).toLocaleString("en-IN");
  $("#inventoryValue").textContent = money(summary.inventory_value);
  $("#lowStock").textContent = summary.low_stock_products;
}

function renderProducts() {
  const table = $("#rows");
  table.innerHTML = state.products.map((product) => `
    <tr>
      <td>${product.id}</td>
      <td>${escapeHtml(product.sku)}</td>
      <td>${escapeHtml(product.name)}</td>
      <td>${escapeHtml(getCategoryName(product.category_id))}</td>
      <td>${money(product.price)}</td>
      <td>${Number(product.stock)}</td>
      <td>${Number(product.reorder_level)}</td>
      <td>
        <button class="btn-edit btn-small" type="button" data-edit-product="${product.id}">Edit</button>
        <button class="btn-view btn-small" type="button" data-view-product="${product.id}">View</button>
        <button class="btn-delete btn-small" type="button" data-delete-product="${product.id}">Delete</button>
      </td>
    </tr>
  `).join("") || `<tr><td colspan="8" class="empty">No products found.</td></tr>`;

  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  const currentPage = Math.floor(state.skip / PAGE_SIZE) + 1;
  $("#pageInfo").textContent = `Page ${currentPage} of ${totalPages} (${state.total} products)`;
  $("#previousPageButton").disabled = state.skip === 0;
  $("#nextPageButton").disabled = state.skip + PAGE_SIZE >= state.total;
  renderInventoryReport();
}

function renderInventoryReport() {
  $("#reportRows").innerHTML = state.products.map((product) => {
    const stock = Number(product.stock || 0);
    const lowStock = stock <= Number(product.reorder_level || 0);
    const totalValue = Number(product.price || 0) * stock;
    return `
      <tr>
        <td>${escapeHtml(product.name)}</td>
        <td>${escapeHtml(product.sku)}</td>
        <td>${escapeHtml(getCategoryName(product.category_id))}</td>
        <td>${money(product.price)}</td>
        <td>${stock}</td>
        <td>${money(totalValue)}</td>
        <td><span class="status ${lowStock ? "status-low" : "status-ok"}">${lowStock ? "Low Stock" : "In Stock"}</span></td>
      </tr>
    `;
  }).join("") || `<tr><td colspan="7" class="empty">No inventory data available.</td></tr>`;
}

async function saveCategory(event) {
  event.preventDefault();
  const input = $("#newCategory");
  const name = input.value.trim();
  if (name.length < 2) {
    showMessage("Category name must contain at least 2 characters.", "error");
    return;
  }
  const button = $("#addCategoryButton");
  try {
    button.disabled = true;
    await apiRequest("/categories", { method: "POST", body: JSON.stringify({ name }) });
    $("#categoryForm").reset();
    await loadCategories();
    showMessage("Category created successfully.");
  } catch (error) {
    showMessage(`Category error: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function deleteCategory(id) {
  if (!window.confirm("Delete this category? Categories assigned to products cannot be deleted.")) return;
  try {
    await apiRequest(`/categories/${id}`, { method: "DELETE" });
    await loadCategories();
    showMessage("Category deleted successfully.");
  } catch (error) {
    showMessage(`Cannot delete category: ${error.message}`, "error");
  }
}

function resetProductForm() {
  $("#productForm").reset();
  $("#id").value = "";
  $("#formTitle").textContent = "Add Product";
  $("#saveButton").textContent = "Save Product";
  $("#reorder_level").value = 10;
}

async function saveProduct(event) {
  event.preventDefault();
  const id = $("#id").value;
  const payload = {
    sku: $("#sku").value.trim(),
    barcode: $("#barcode").value.trim(),
    name: $("#name").value.trim(),
    category_id: Number($("#category_id").value),
    // Keep price as a string so decimal input is not unnecessarily rounded in JavaScript.
    price: $("#price").value,
    stock: Number($("#stock").value),
    reorder_level: Number($("#reorder_level").value),
  };
  if (!payload.category_id || !payload.sku || !payload.barcode || !payload.name ||
      !payload.price || payload.stock < 0 || payload.reorder_level < 0) {
    showMessage("Please enter valid product details.", "error");
    return;
  }

  const button = $("#saveButton");
  try {
    button.disabled = true;
    if (id) {
      await apiRequest(`/products/${id}`, { method: "PUT", body: JSON.stringify(payload) });
      showMessage("Product updated successfully.");
    } else {
      await apiRequest("/products", { method: "POST", body: JSON.stringify(payload) });
      showMessage("Product added successfully.");
    }
    resetProductForm();
    await Promise.all([loadProducts(), loadSummary()]);
  } catch (error) {
    showMessage(`Product error: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

function editProduct(id) {
  const product = state.products.find((item) => Number(item.id) === Number(id));
  if (!product) return;
  $("#id").value = product.id;
  $("#sku").value = product.sku;
  $("#barcode").value = product.barcode;
  $("#name").value = product.name;
  $("#category_id").value = product.category_id;
  $("#price").value = product.price;
  $("#stock").value = product.stock;
  $("#reorder_level").value = product.reorder_level;
  $("#formTitle").textContent = "Edit Product";
  $("#saveButton").textContent = "Update Product";
  $("#productForm").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function deleteProduct(id) {
  if (!window.confirm("Are you sure you want to delete this product?")) return;
  try {
    await apiRequest(`/products/${id}`, { method: "DELETE" });
    // If the last item on a page was deleted, move to the previous page.
    if (state.products.length === 1 && state.skip > 0) state.skip = Math.max(0, state.skip - PAGE_SIZE);
    await Promise.all([loadProducts(), loadSummary()]);
    showMessage("Product deleted successfully.");
  } catch (error) {
    showMessage(`Delete error: ${error.message}`, "error");
  }
}

function viewProduct(id) {
  const product = state.products.find((item) => Number(item.id) === Number(id));
  if (!product) return;
  const details = {
    ...product,
    category: getCategoryName(product.category_id),
    price: money(product.price),
  };
  $("#detailsContent").textContent = JSON.stringify(details, null, 2);
  $("#detailsDialog").showModal();
}

async function exportProducts() {
  const params = new URLSearchParams();
  if (state.query) params.set("q", state.query);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const button = $("#downloadButton");
  try {
    button.disabled = true;
    const response = await fetch(`${API_BASE}/reports/inventory.csv${suffix}`);
    if (!response.ok) {
      let message = `Export failed with status ${response.status}`;
      try { const body = await response.json(); message = body.detail || message; } catch { /* no JSON body */ }
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "retail_inventory_report.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showMessage("Inventory CSV downloaded successfully.");
  } catch (error) {
    showMessage(`Export error: ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

async function refreshData() {
  const button = $("#refreshButton");
  try {
    button.disabled = true;
    await loadCategories();
    await Promise.all([loadProducts(), loadSummary()]);
    showMessage("Data loaded successfully from PostgreSQL.");
  } catch (error) {
    console.error("Backend error:", error);
    showMessage(`Could not load data. ${error.message}`, "error");
  } finally {
    button.disabled = false;
  }
}

function changePage(direction) {
  const nextSkip = state.skip + direction * PAGE_SIZE;
  if (nextSkip < 0 || nextSkip >= state.total) return;
  state.skip = nextSkip;
  loadProducts().catch((error) => showMessage(error.message, "error"));
}

let searchTimer;
document.addEventListener("DOMContentLoaded", () => {
  $("#productForm").addEventListener("submit", saveProduct);
  $("#categoryForm").addEventListener("submit", saveCategory);
  $("#clearButton").addEventListener("click", resetProductForm);
  $("#refreshButton").addEventListener("click", refreshData);
  $("#downloadButton").addEventListener("click", exportProducts);
  $("#previousPageButton").addEventListener("click", () => changePage(-1));
  $("#nextPageButton").addEventListener("click", () => changePage(1));
  $("#closeDetailsButton").addEventListener("click", () => $("#detailsDialog").close());

  $("#searchText").addEventListener("input", (event) => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.query = event.target.value.trim();
      state.skip = 0;
      loadProducts().catch((error) => showMessage(error.message, "error"));
    }, 300);
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const editButton = event.target.closest("[data-edit-product]");
    const deleteButton = event.target.closest("[data-delete-product]");
    const viewButton = event.target.closest("[data-view-product]");
    const categoryButton = event.target.closest("[data-delete-category]");
    if (editButton) editProduct(editButton.dataset.editProduct);
    if (deleteButton) deleteProduct(deleteButton.dataset.deleteProduct);
    if (viewButton) viewProduct(viewButton.dataset.viewProduct);
    if (categoryButton) deleteCategory(categoryButton.dataset.deleteCategory);
  });

  refreshData();
});
