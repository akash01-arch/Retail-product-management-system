/* RetailOS frontend. The API is served from the same FastAPI origin. */
const API = "/api";
const state = {
  token: sessionStorage.getItem("retailos_token"),
  user: null,
  page: "dashboard",
  products: [],
  categories: [],
  customers: [],
  suppliers: [],
  toastTimer: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
}[ch]));
const money = (value) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 2
}).format(Number(value || 0));
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const roleLabel = (role) => ({ admin: "ADMIN", manager: "MANAGER", staff: "STAFF" }[role] || String(role).toUpperCase());

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
  let response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers });
  } catch (error) {
    throw new Error("Cannot reach the backend. Open this site through http://127.0.0.1:8000 and keep FastAPI running.");
  }
  const raw = await response.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); } catch { data = raw; }
  }
  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      logout(false);
      throw new Error("Your session expired. Please sign in again.");
    }
    const detail = data && typeof data === "object" ? data.detail : data;
    throw new Error(Array.isArray(detail) ? detail.map((x) => x.msg).join(", ") : (detail || `Request failed (${response.status})`));
  }
  return data;
}

function notify(message, type = "success") {
  const toast = $("#toast");
  toast.textContent = message;
  toast.className = `toast ${type === "error" ? "error" : ""}`;
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.add("hidden"), 3800);
}

function showLogin(message = "") {
  $("#appShell").classList.add("hidden");
  $("#loginScreen").classList.remove("hidden");
  const error = $("#loginError");
  error.textContent = message;
  error.classList.toggle("hidden", !message);
  $("#loginUsername").focus();
}

function showApp() {
  $("#loginScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  $("#userName").textContent = state.user.username;
  $("#userRole").textContent = roleLabel(state.user.role);
  $("#userAvatar").textContent = (state.user.username || "A").slice(0, 1).toUpperCase();
  $$(".admin-only").forEach((el) => el.classList.toggle("hidden", state.user.role !== "admin"));
  if (state.user.role !== "admin" && state.page === "users") state.page = "dashboard";
  navigate(state.page);
}

function logout(show = true) {
  sessionStorage.removeItem("retailos_token");
  state.token = null;
  state.user = null;
  if (show) notify("You have signed out.");
  showLogin();
}

async function login(event) {
  event.preventDefault();
  const button = $("#loginForm button[type=submit]");
  const errorBox = $("#loginError");
  button.disabled = true;
  button.textContent = "Signing in…";
  errorBox.classList.add("hidden");
  try {
    const result = await api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username: $("#loginUsername").value.trim(), password: $("#loginPassword").value })
    });
    state.token = result.access_token;
    sessionStorage.setItem("retailos_token", state.token);
    state.user = result.user;
    showApp();
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.classList.remove("hidden");
  } finally {
    button.disabled = false;
    button.innerHTML = 'Sign in <span>→</span>';
  }
}

function navigate(page) {
  state.page = page;
  $("#breadcrumbCurrent").textContent = page === "dashboard" ? "Overview" : page[0].toUpperCase() + page.slice(1);
  $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  $("#sidebar").classList.remove("open");
  renderPage().catch((error) => notify(error.message, "error"));
}

async function renderPage() {
  const root = $("#pageContent");
  root.innerHTML = '<div class="panel empty-state">Loading workspace data…</div>';
  switch (state.page) {
    case "dashboard": return renderDashboard(root);
    case "products": return renderProducts(root);
    case "categories": return renderCategories(root);
    case "production": return renderProduction(root);
    case "sales": return renderSales(root);
    case "inventory": return renderInventory(root);
    case "customers": return renderCustomers(root);
    case "suppliers": return renderSuppliers(root);
    case "reports": return renderReports(root);
    case "users": return renderUsers(root);
    default: state.page = "dashboard"; return renderDashboard(root);
  }
}

function heading(title, description, action = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${action}</div></div>`;
}
function panel(title, subtitle, body, extra = "") {
  return `<section class="panel"><div class="panel-head"><div><h3 class="panel-title">${title}</h3>${subtitle ? `<p class="panel-subtitle">${subtitle}</p>` : ""}</div>${extra}</div>${body}</section>`;
}
function emptyRow(cols, text = "No records found.") {
  return `<tr><td colspan="${cols}" class="empty-state">${text}</td></tr>`;
}
function productName(id) { return state.products.find((p) => Number(p.id) === Number(id))?.name || `Product #${id}`; }
function categoryName(id) { return state.categories.find((c) => Number(c.id) === Number(id))?.name || "Uncategorised"; }
function customerName(id) { return state.customers.find((c) => Number(c.id) === Number(id))?.name || "Walk-in customer"; }
function productOptions(selected = "") {
  return `<option value="">Select a product</option>${state.products.map((p) => `<option value="${p.id}" ${String(selected) === String(p.id) ? "selected" : ""}>${escapeHtml(p.name)} · ${escapeHtml(p.sku)} · Stock ${p.stock}</option>`).join("")}`;
}
function categoryOptions(selected = "") {
  return `<option value="">Select category</option>${state.categories.map((c) => `<option value="${c.id}" ${String(selected) === String(c.id) ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}`;
}
function customerOptions(selected = "") {
  return `<option value="">Walk-in customer</option>${state.customers.map((c) => `<option value="${c.id}" ${String(selected) === String(c.id) ? "selected" : ""}>${escapeHtml(c.name)}</option>`).join("")}`;
}

async function ensureCatalogue() {
  const [products, categories, customers] = await Promise.all([
    api("/products"), api("/categories"), api("/customers")
  ]);
  state.products = products;
  state.categories = categories;
  state.customers = customers;
}

async function renderDashboard(root) {
  const [data, chart, products, categories] = await Promise.all([api("/dashboard"), api("/reports/sales-by-day?days=7"), api("/products"), api("/categories")]);
  state.products = products; state.categories = categories;
  const max = Math.max(1, ...chart.map((d) => Number(d.revenue)));
  const bars = chart.map((d) => {
    const pct = d.revenue ? Math.max(4, Number(d.revenue) / max * 100) : 2;
    const label = new Date(`${d.date}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short" });
    return `<div class="bar-column" title="${escapeHtml(d.date)} · ${money(d.revenue)}"><div class="bar" style="height:${pct}%"></div><span class="bar-label">${label}</span></div>`;
  }).join("");
  const recent = (data.recent_sales || []).map((s) => `<tr><td><span class="table-primary">#S-${s.id}</span><div class="table-secondary">${new Date(s.sale_date).toLocaleString("en-IN")}</div></td><td>${escapeHtml(productName(s.product_id))}</td><td>${s.quantity}</td><td class="table-primary">${money(s.total_amount)}</td></tr>`).join("") || emptyRow(4, "No sales have been recorded yet.");
  const low = (data.low_stock_items || []).map((p) => `<tr><td><span class="table-primary">${escapeHtml(p.name)}</span><div class="table-secondary">${escapeHtml(p.sku)}</div></td><td>${p.stock}</td><td>${p.reorder_level}</td><td><span class="pill pill-orange">Reorder</span></td></tr>`).join("") || emptyRow(4, "No low-stock products. Nice work!");
  root.innerHTML = heading("Good day, " + escapeHtml(state.user.username) + " 👋", "Here’s what’s happening in your business today.", '<button class="btn btn-secondary" data-action="refresh">↻ Refresh</button><button class="btn btn-primary" data-action="quick-sale">＋ New sale</button>') +
    `<div class="metric-grid">
      <div class="metric-card"><div class="metric-top">Total products <span class="metric-icon">▤</span></div><div class="metric-value">${Number(data.total_products).toLocaleString("en-IN")}</div><div class="metric-note">Active catalogue items</div></div>
      <div class="metric-card"><div class="metric-top">Stock units <span class="metric-icon green">▣</span></div><div class="metric-value">${Number(data.total_stock).toLocaleString("en-IN")}</div><div class="metric-note">Units currently available</div></div>
      <div class="metric-card"><div class="metric-top">Inventory value <span class="metric-icon orange">₹</span></div><div class="metric-value">${money(data.inventory_value)}</div><div class="metric-note">Based on current stock × price</div></div>
      <div class="metric-card"><div class="metric-top">Low-stock products <span class="metric-icon red">!</span></div><div class="metric-value">${data.low_stock_products}</div><div class="metric-note">At or below reorder level</div></div>
    </div>
    <div class="dashboard-grid">
      <section class="panel"><div class="panel-head"><div><h3 class="panel-title">Sales performance</h3><p class="panel-subtitle">Daily revenue over the last 7 days</p></div><span class="chart-legend"><i></i> Revenue</span></div><div class="bar-chart">${bars}</div></section>
      <section class="panel"><div class="panel-head"><div><h3 class="panel-title">Today at a glance</h3><p class="panel-subtitle">Daily operations snapshot</p></div><span class="pill pill-green">Today</span></div><div class="quick-stat-list"><div class="quick-stat"><span>Sales revenue</span><b>${money(data.sales_today)}</b></div><div class="quick-stat"><span>Sales transactions</span><b>${data.transactions_today}</b></div><div class="quick-stat"><span>Units produced</span><b>${data.production_today}</b></div><div class="quick-stat"><span>Catalogue categories</span><b>${state.categories.length || "—"}</b></div></div></section>
    </div>
    <div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h3 class="panel-title">Recent sales</h3><p class="panel-subtitle">Latest completed transactions</p></div><button class="btn btn-secondary btn-small" data-page="sales">View all</button></div><div class="table-wrap"><table><thead><tr><th>Transaction</th><th>Product</th><th>Qty</th><th>Amount</th></tr></thead><tbody>${recent}</tbody></table></div></section>
    <section class="panel"><div class="panel-head"><div><h3 class="panel-title">Stock attention</h3><p class="panel-subtitle">Products that need replenishment</p></div><button class="btn btn-secondary btn-small" data-page="inventory">Inventory</button></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>On hand</th><th>Reorder at</th><th>Status</th></tr></thead><tbody>${low}</tbody></table></div></section></div>`;
}

async function renderProducts(root) {
  const [products, categories] = await Promise.all([api("/products"), api("/categories")]);
  state.products = products; state.categories = categories;
  root.innerHTML = heading("Products", "Manage your catalogue, pricing and stock thresholds.", state.user.role === "staff" ? "" : `<button class="btn btn-primary" data-action="add-product">＋ Add product</button>`) +
    `<section class="panel"><div class="table-toolbar"><div><h3 class="panel-title">Product catalogue <span class="pill pill-blue">${products.length} items</span></h3><p class="panel-subtitle">Product details are saved directly in PostgreSQL.</p></div><div class="search-box"><span>⌕</span><input id="productSearch" placeholder="Search product, SKU or barcode" /></div></div><div class="table-wrap"><table><thead><tr><th>Product</th><th>SKU / Barcode</th><th>Category</th><th>Price</th><th>Stock</th><th>Reorder</th><th>Status</th><th>Actions</th></tr></thead><tbody id="productTable">${productRows(products)}</tbody></table></div></section>`;
  $("#productSearch").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = products.filter((p) => [p.name, p.sku, p.barcode].some((v) => String(v || "").toLowerCase().includes(q)));
    $("#productTable").innerHTML = productRows(filtered);
  });
}
function productRows(products) {
  if (!products.length) return emptyRow(8, "No products match your search.");
  return products.map((p) => `<tr><td><span class="table-primary">${escapeHtml(p.name)}</span><div class="table-secondary">Product ID #${p.id}</div></td><td>${escapeHtml(p.sku)}<div class="table-secondary">${escapeHtml(p.barcode || "No barcode")}</div></td><td>${escapeHtml(categoryName(p.category_id))}</td><td>${money(p.price)}</td><td><b>${p.stock}</b> units</td><td>${p.reorder_level}</td><td><span class="pill ${p.stock <= p.reorder_level ? "pill-orange" : "pill-green"}">${p.stock <= p.reorder_level ? "Low stock" : "In stock"}</span></td><td>${state.user.role === "staff" ? "" : `<button class="btn btn-secondary btn-small" data-action="edit-product" data-id="${p.id}">Edit</button> <button class="btn btn-danger btn-small" data-action="delete-product" data-id="${p.id}">Delete</button>`}</td></tr>`).join("");
}

async function renderCategories(root) {
  const [categories, products] = await Promise.all([api("/categories"), api("/products")]);
  state.categories = categories; state.products = products;
  const rows = categories.map((c) => `<tr><td>#${c.id}</td><td class="table-primary">${escapeHtml(c.name)}</td><td>${products.filter((p) => p.category_id === c.id).length}</td><td>${state.user.role === "staff" ? "—" : `<button class="btn btn-danger btn-small" data-action="delete-category" data-id="${c.id}">Delete</button>`}</td></tr>`).join("") || emptyRow(4, "No categories created yet.");
  root.innerHTML = heading("Categories", "Organise products into clear, searchable groups.", state.user.role === "staff" ? "" : '<button class="btn btn-primary" data-action="add-category">＋ Add category</button>') + panel("Category directory", "Categories help organise products in your catalogue.", `<div class="table-wrap"><table><thead><tr><th>Category ID</th><th>Name</th><th>Products</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

async function renderProduction(root) {
  await ensureCatalogue();
  const entries = await api("/production");
  const rows = entries.map((e) => `<tr><td class="table-primary">#PR-${e.id}</td><td>${new Date(`${e.production_date}T00:00:00`).toLocaleDateString("en-IN")}</td><td class="table-primary">${escapeHtml(productName(e.product_id))}</td><td><b>${e.quantity}</b></td><td>${escapeHtml(e.batch_number || "—")}</td><td>${escapeHtml(e.notes || "—")}</td></tr>`).join("") || emptyRow(6, "No production entries have been recorded.");
  root.innerHTML = heading("Production", "Record finished goods and automatically add them to available stock.", '<button class="btn btn-primary" data-action="add-production">＋ Record production</button>') + panel("Production register", "Every production entry updates stock and creates an inventory movement.", `<div class="table-wrap"><table><thead><tr><th>Reference</th><th>Date</th><th>Product</th><th>Quantity</th><th>Batch</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

async function renderSales(root) {
  await ensureCatalogue();
  const sales = await api("/sales");
  const rows = sales.map((s) => `<tr><td class="table-primary">#S-${s.id}<div class="table-secondary">${new Date(s.sale_date).toLocaleString("en-IN")}</div></td><td>${escapeHtml(productName(s.product_id))}</td><td>${escapeHtml(customerName(s.customer_id))}</td><td>${s.quantity}</td><td>${money(s.unit_price)}</td><td class="table-primary">${money(s.total_amount)}</td><td><span class="pill ${s.payment_status === "Paid" ? "pill-green" : "pill-orange"}">${escapeHtml(s.payment_status)}</span></td></tr>`).join("") || emptyRow(7, "No sales recorded yet.");
  const total = sales.reduce((sum, s) => sum + Number(s.total_amount), 0);
  root.innerHTML = heading("Sales", "Create sales transactions and track revenue. Stock is reduced automatically.", '<button class="btn btn-primary" data-action="add-sale">＋ New sale</button>') +
    `<div class="metric-grid"><div class="metric-card"><div class="metric-top">All-time revenue <span class="metric-icon green">₹</span></div><div class="metric-value">${money(total)}</div><div class="metric-note">Sum of recorded sales</div></div><div class="metric-card"><div class="metric-top">Transactions <span class="metric-icon">↗</span></div><div class="metric-value">${sales.length}</div><div class="metric-note">Recorded sale entries</div></div><div class="metric-card"><div class="metric-top">Units sold <span class="metric-icon orange">▤</span></div><div class="metric-value">${sales.reduce((sum, s) => sum + s.quantity, 0)}</div><div class="metric-note">Total units moved out</div></div><div class="metric-card"><div class="metric-top">Average order <span class="metric-icon">◉</span></div><div class="metric-value">${money(sales.length ? total / sales.length : 0)}</div><div class="metric-note">Average transaction value</div></div></div>` + panel("Sales register", "Sales are checked against available stock before they are saved.", `<div class="table-wrap"><table><thead><tr><th>Transaction</th><th>Product</th><th>Customer</th><th>Qty</th><th>Unit price</th><th>Total</th><th>Payment</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

async function renderInventory(root) {
  const [products, movements, categories] = await Promise.all([api("/products"), api("/inventory/movements"), api("/categories")]);
  state.products = products; state.categories = categories;
  const rows = products.map((p) => `<tr><td class="table-primary">${escapeHtml(p.name)}<div class="table-secondary">${escapeHtml(p.sku)}</div></td><td>${escapeHtml(categoryName(p.category_id))}</td><td>${p.stock}</td><td>${p.reorder_level}</td><td>${money(p.price * p.stock)}</td><td><span class="pill ${p.stock <= p.reorder_level ? "pill-orange" : "pill-green"}">${p.stock <= p.reorder_level ? "Reorder" : "Healthy"}</span></td><td>${state.user.role === "staff" ? "—" : `<button class="btn btn-secondary btn-small" data-action="adjust-stock" data-id="${p.id}">Adjust</button>`}</td></tr>`).join("") || emptyRow(7);
  const movementRows = movements.slice(0, 20).map((m) => `<tr><td>${new Date(m.created_at).toLocaleString("en-IN")}</td><td>${escapeHtml(productName(m.product_id))}</td><td>${escapeHtml(m.movement_type)}</td><td><b class="${m.quantity_change < 0 ? "text-red" : "text-green"}">${m.quantity_change > 0 ? "+" : ""}${m.quantity_change}</b></td><td>${escapeHtml(m.note || "—")}</td></tr>`).join("") || emptyRow(5, "Inventory movements will appear here.");
  root.innerHTML = heading("Inventory", "Monitor on-hand quantity, reorder levels and stock movement history.", '<button class="btn btn-secondary" data-action="refresh">↻ Refresh</button>') + panel("Stock on hand", "Use adjustments only for verified stock corrections.", `<div class="table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Available</th><th>Reorder at</th><th>Stock value</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`) + panel("Movement history", "Opening stock, production receipts, sales and manual adjustments.", `<div class="table-wrap"><table><thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Change</th><th>Note</th></tr></thead><tbody>${movementRows}</tbody></table></div>`);
}

async function renderCustomers(root) {
  const customers = await api("/customers"); state.customers = customers;
  const rows = customers.map((c) => `<tr><td class="table-primary">${escapeHtml(c.name)}</td><td>${escapeHtml(c.phone || "—")}</td><td>${escapeHtml(c.email || "—")}</td><td>${escapeHtml(c.address || "—")}</td><td>${state.user.role === "staff" ? "—" : `<button class="btn btn-danger btn-small" data-action="delete-customer" data-id="${c.id}">Delete</button>`}</td></tr>`).join("") || emptyRow(5, "No customers added yet.");
  root.innerHTML = heading("Customers", "Keep customer details together for faster sales entry.", '<button class="btn btn-primary" data-action="add-customer">＋ Add customer</button>') + panel("Customer directory", `${customers.length} customer records`, `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

async function renderSuppliers(root) {
  const suppliers = await api("/suppliers"); state.suppliers = suppliers;
  const rows = suppliers.map((s) => `<tr><td class="table-primary">${escapeHtml(s.name)}</td><td>${escapeHtml(s.contact_person || "—")}</td><td>${escapeHtml(s.phone || "—")}</td><td>${escapeHtml(s.email || "—")}</td><td>${escapeHtml(s.address || "—")}</td><td>${state.user.role === "staff" ? "—" : `<button class="btn btn-danger btn-small" data-action="delete-supplier" data-id="${s.id}">Delete</button>`}</td></tr>`).join("") || emptyRow(6, "No suppliers added yet.");
  root.innerHTML = heading("Suppliers", "Maintain contact information for your supplier network.", state.user.role === "staff" ? "" : '<button class="btn btn-primary" data-action="add-supplier">＋ Add supplier</button>') + panel("Supplier directory", `${suppliers.length} supplier records`, `<div class="table-wrap"><table><thead><tr><th>Supplier</th><th>Contact person</th><th>Phone</th><th>Email</th><th>Address</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

async function renderReports(root) {
  const [summary, stock, chart, sales] = await Promise.all([api("/reports/summary"), api("/reports/stock"), api("/reports/sales-by-day?days=14"), api("/sales")]);
  state.products = await api("/products"); state.categories = await api("/categories");
  const rows = stock.map((p) => `<tr><td>${escapeHtml(p.name)}</td><td>${escapeHtml(p.sku)}</td><td>${escapeHtml(categoryName(p.category_id))}</td><td>${money(p.price)}</td><td>${p.stock}</td><td>${money(p.inventory_value)}</td><td><span class="pill ${p.status === "Low Stock" ? "pill-orange" : "pill-green"}">${p.status}</span></td></tr>`).join("") || emptyRow(7);
  const max = Math.max(1, ...chart.map((d) => Number(d.revenue)));
  const bars = chart.map((d) => `<div class="bar-column" title="${d.date} · ${money(d.revenue)}"><div class="bar" style="height:${d.revenue ? Math.max(4, d.revenue / max * 100) : 2}%"></div><span class="bar-label">${new Date(`${d.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span></div>`).join("");
  root.innerHTML = heading("Reports & analytics", "Review sales performance and current inventory position.", '<button class="btn btn-secondary" data-action="export-stock">↓ Export inventory CSV</button><button class="btn btn-primary" data-action="export-sales">↓ Export sales CSV</button>') +
    `<div class="metric-grid"><div class="metric-card"><div class="metric-top">Sales revenue <span class="metric-icon green">₹</span></div><div class="metric-value">${money(summary.sales_revenue)}</div><div class="metric-note">All recorded transactions</div></div><div class="metric-card"><div class="metric-top">Units sold <span class="metric-icon">↗</span></div><div class="metric-value">${summary.units_sold}</div><div class="metric-note">Total sales quantity</div></div><div class="metric-card"><div class="metric-top">Units produced <span class="metric-icon orange">⚙</span></div><div class="metric-value">${summary.units_produced}</div><div class="metric-note">Total production quantity</div></div><div class="metric-card"><div class="metric-top">Stock value <span class="metric-icon">▣</span></div><div class="metric-value">${money(stock.reduce((sum, p) => sum + p.inventory_value, 0))}</div><div class="metric-note">Current inventory valuation</div></div></div>` +
    panel("Revenue trend", "Daily sales revenue across the last 14 days.", `<div class="bar-chart">${bars}</div>`) + panel("Inventory report", "A live stock valuation by product.", `<div class="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Unit price</th><th>Stock</th><th>Inventory value</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`);
  state.salesForExport = sales;
  state.stockForExport = stock;
}

async function renderUsers(root) {
  if (state.user.role !== "admin") throw new Error("Only administrators can manage team access.");
  const users = await api("/users");
  const rows = users.map((u) => `<tr><td class="table-primary">${escapeHtml(u.username)}</td><td>${escapeHtml(u.email || "—")}</td><td><span class="pill pill-blue">${roleLabel(u.role)}</span></td><td><span class="pill ${u.is_active ? "pill-green" : "pill-red"}">${u.is_active ? "Active" : "Inactive"}</span></td><td>${new Date(u.created_at).toLocaleDateString("en-IN")}</td><td>${u.is_active && u.id !== state.user.id ? `<button class="btn btn-danger btn-small" data-action="deactivate-user" data-id="${u.id}">Deactivate</button>` : "—"}</td></tr>`).join("") || emptyRow(6);
  root.innerHTML = heading("Team & access", "Create team accounts and assign the right level of access.", '<button class="btn btn-primary" data-action="add-user">＋ Invite user</button>') + panel("Workspace users", "Admin has full access. Managers maintain operations. Staff can record production and sales.", `<div class="table-wrap"><table><thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}

function openModal(title, eyebrow, html) {
  $("#modalTitle").textContent = title;
  $("#modalEyebrow").textContent = eyebrow;
  $("#modalBody").innerHTML = `<div class="modal-content">${html}</div>`;
  $("#appModal").showModal();
}
function closeModal() { $("#appModal").close(); }
function modalForm(fields, submitLabel = "Save record") {
  return `<form id="recordForm">${fields}<div class="form-actions"><button type="button" class="btn btn-secondary" id="cancelModal">Cancel</button><button type="submit" class="btn btn-primary">${submitLabel}</button></div></form>`;
}
function field(label, name, type = "text", value = "", extra = "", full = false) {
  return `<div class="field ${full ? "full" : ""}"><label for="f_${name}">${label}</label><input id="f_${name}" name="${name}" type="${type}" value="${escapeHtml(value)}" ${extra} /></div>`;
}
function selectField(label, name, options, required = true) {
  return `<div class="field"><label for="f_${name}">${label}</label><select id="f_${name}" name="${name}" ${required ? "required" : ""}>${options}</select></div>`;
}
function textAreaField(label, name, value = "") {
  return `<div class="field full"><label for="f_${name}">${label}</label><textarea id="f_${name}" name="${name}">${escapeHtml(value)}</textarea></div>`;
}

function addProductForm(product = null) {
  const p = product || {};
  openModal(product ? "Edit product" : "Add product", "PRODUCT CATALOGUE", modalForm(
    `<div class="form-grid">${field("Product name", "name", "text", p.name || "", 'required maxlength="150"')}${field("SKU", "sku", "text", p.sku || "", 'required minlength="3" maxlength="50"')}${field("Barcode", "barcode", "text", p.barcode || "", 'required minlength="3" maxlength="100"')}${selectField("Category", "category_id", categoryOptions(p.category_id))}${field("Selling price (₹)", "price", "number", p.price ?? "", 'required min="0" step="0.01"')}${field("Current stock", "stock", "number", p.stock ?? 0, 'required min="0" step="1"')}${field("Reorder level", "reorder_level", "number", p.reorder_level ?? 10, 'required min="0" step="1"')}</div>`, product ? "Update product" : "Create product"
  ));
  $("#recordForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const fd = new FormData(event.currentTarget);
    const payload = { sku: fd.get("sku").trim(), barcode: fd.get("barcode").trim() || null, name: fd.get("name").trim(), category_id: Number(fd.get("category_id")), price: Number(fd.get("price")), stock: Number(fd.get("stock")), reorder_level: Number(fd.get("reorder_level")) };
    try { await api(product ? `/products/${product.id}` : "/products", { method: product ? "PUT" : "POST", body: JSON.stringify(payload) }); closeModal(); notify(product ? "Product updated." : "Product created."); renderPage(); }
    catch (error) { notify(error.message, "error"); }
  });
  wireModalCancel();
}

function addCategoryForm() {
  openModal("Create category", "PRODUCT CATALOGUE", modalForm(`<div class="form-grid">${field("Category name", "name", "text", "", 'required minlength="2" maxlength="100"', true)}</div>`, "Create category"));
  $("#recordForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const name = new FormData(event.currentTarget).get("name").trim();
    try { await api("/categories", { method: "POST", body: JSON.stringify({ name }) }); closeModal(); notify("Category created."); renderPage(); }
    catch (error) { notify(error.message, "error"); }
  }); wireModalCancel();
}

function addProductionForm() {
  if (!state.products.length) { notify("Create a product before recording production.", "error"); return; }
  openModal("Record production", "OPERATIONS · PRODUCTION", modalForm(`<div class="form-grid">${selectField("Product", "product_id", productOptions())}${field("Production date", "production_date", "date", localDate(), "required")}${field("Quantity produced", "quantity", "number", "", 'required min="1" step="1"')}${field("Batch number", "batch_number", "text", "", 'maxlength="60"')}${textAreaField("Notes", "notes")}</div>`, "Save production"));
  $("#recordForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const fd = new FormData(event.currentTarget);
    const payload = { product_id: Number(fd.get("product_id")), production_date: fd.get("production_date"), quantity: Number(fd.get("quantity")), batch_number: fd.get("batch_number") || null, notes: fd.get("notes") || null };
    try { await api("/production", { method: "POST", body: JSON.stringify(payload) }); closeModal(); notify("Production recorded and stock increased."); renderPage(); }
    catch (error) { notify(error.message, "error"); }
  }); wireModalCancel();
}

function addSaleForm() {
  if (!state.products.some((p) => p.stock > 0)) { notify("No products currently have available stock.", "error"); return; }
  openModal("Create sale", "OPERATIONS · SALES", modalForm(`<div class="form-grid">${selectField("Product", "product_id", productOptions())}${selectField("Customer", "customer_id", customerOptions(), false)}${field("Quantity", "quantity", "number", "1", 'required min="1" step="1"')}${field("Unit price (₹)", "unit_price", "number", "", 'required min="0" step="0.01"')}${selectField("Payment method", "payment_method", '<option>Cash</option><option>UPI</option><option>Card</option><option>Bank transfer</option><option>Other</option>')}${selectField("Payment status", "payment_status", '<option>Paid</option><option>Pending</option>')}${textAreaField("Notes", "notes")}</div><p class="field-help">The selected product price is suggested automatically. Stock is reduced only after the sale is accepted.</p>`, "Save sale"));
  const productSelect = $("#f_product_id"); const priceInput = $("#f_unit_price");
  const syncPrice = () => { const p = state.products.find((x) => x.id === Number(productSelect.value)); if (p) priceInput.value = p.price; };
  productSelect.addEventListener("change", syncPrice); syncPrice();
  $("#recordForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const fd = new FormData(event.currentTarget);
    const payload = { product_id: Number(fd.get("product_id")), customer_id: fd.get("customer_id") ? Number(fd.get("customer_id")) : null, quantity: Number(fd.get("quantity")), unit_price: Number(fd.get("unit_price")), payment_method: fd.get("payment_method"), payment_status: fd.get("payment_status"), notes: fd.get("notes") || null };
    try { await api("/sales", { method: "POST", body: JSON.stringify(payload) }); closeModal(); notify("Sale saved and stock updated."); renderPage(); }
    catch (error) { notify(error.message, "error"); }
  }); wireModalCancel();
}

function addAdjustmentForm(productId) {
  const product = state.products.find((p) => p.id === Number(productId)); if (!product) return;
  openModal("Adjust stock", "INVENTORY CONTROL", modalForm(`<p class="muted" style="font-size:11px;margin-top:0">${escapeHtml(product.name)} · Current stock: <b>${product.stock}</b></p><div class="form-grid">${field("Quantity change (+ or -)", "quantity_change", "number", "", 'required step="1"', true)}${textAreaField("Reason for adjustment", "note")}</div>`, "Apply adjustment"));
  $("#recordForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const fd = new FormData(event.currentTarget);
    try { await api("/inventory/adjustments", { method: "POST", body: JSON.stringify({ product_id: product.id, quantity_change: Number(fd.get("quantity_change")), note: fd.get("note") }) }); closeModal(); notify("Stock adjustment saved."); renderPage(); }
    catch (error) { notify(error.message, "error"); }
  }); wireModalCancel();
}

function addCustomerForm() {
  openModal("Add customer", "BUSINESS DIRECTORY", modalForm(`<div class="form-grid">${field("Customer name", "name", "text", "", "required")}${field("Phone", "phone", "tel")}${field("Email", "email", "email")}${textAreaField("Address", "address")}</div>`, "Save customer"));
  $("#recordForm").addEventListener("submit", async (event) => { event.preventDefault(); const fd = new FormData(event.currentTarget); const payload = Object.fromEntries(fd.entries()); try { await api("/customers", { method: "POST", body: JSON.stringify(payload) }); closeModal(); notify("Customer saved."); renderPage(); } catch (e) { notify(e.message, "error"); } }); wireModalCancel();
}
function addSupplierForm() {
  openModal("Add supplier", "BUSINESS DIRECTORY", modalForm(`<div class="form-grid">${field("Supplier name", "name", "text", "", "required")}${field("Contact person", "contact_person")}${field("Phone", "phone", "tel")}${field("Email", "email", "email")}${textAreaField("Address", "address")}</div>`, "Save supplier"));
  $("#recordForm").addEventListener("submit", async (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget).entries()); try { await api("/suppliers", { method: "POST", body: JSON.stringify(payload) }); closeModal(); notify("Supplier saved."); renderPage(); } catch (e) { notify(e.message, "error"); } }); wireModalCancel();
}
function addUserForm() {
  openModal("Invite team member", "TEAM & ACCESS", modalForm(`<div class="form-grid">${field("Username", "username", "text", "", 'required minlength="3" maxlength="60"')}${field("Email", "email", "email")}${field("Temporary password", "password", "password", "", 'required minlength="8"')}${selectField("Role", "role", '<option value="staff">Staff · Production and sales</option><option value="manager">Manager · Operations management</option><option value="admin">Admin · Full access</option>')}</div>`, "Create account"));
  $("#recordForm").addEventListener("submit", async (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget).entries()); try { await api("/users", { method: "POST", body: JSON.stringify(payload) }); closeModal(); notify("Team account created."); renderPage(); } catch (e) { notify(e.message, "error"); } }); wireModalCancel();
}
function changePasswordForm() {
  openModal("Change password", "ACCOUNT SECURITY", modalForm(`<div class="form-grid">${field("Current password", "current_password", "password", "", "required", true)}${field("New password (minimum 8 characters)", "new_password", "password", "", 'required minlength="8"', true)}</div>`, "Update password"));
  $("#recordForm").addEventListener("submit", async (event) => { event.preventDefault(); const payload = Object.fromEntries(new FormData(event.currentTarget).entries()); try { await api("/auth/change-password", { method: "POST", body: JSON.stringify(payload) }); closeModal(); notify("Password changed successfully."); } catch (e) { notify(e.message, "error"); } }); wireModalCancel();
}
function wireModalCancel() { $("#cancelModal")?.addEventListener("click", closeModal); }

async function handleAction(action, id) {
  switch (action) {
    case "refresh": return renderPage();
    case "add-product": await ensureCatalogue(); return addProductForm();
    case "edit-product": await ensureCatalogue(); { const p = state.products.find((x) => x.id === Number(id)); if (p) return addProductForm(p); } break;
    case "delete-product": if (confirm("Delete this product? Products with sales, production or stock history cannot be deleted.")) { try { await api(`/products/${id}`, { method: "DELETE" }); notify("Product deleted."); renderPage(); } catch (e) { notify(e.message, "error"); } } break;
    case "add-category": return addCategoryForm();
    case "delete-category": if (confirm("Delete this category? It must not be assigned to any product.")) { try { await api(`/categories/${id}`, { method: "DELETE" }); notify("Category deleted."); renderPage(); } catch (e) { notify(e.message, "error"); } } break;
    case "add-production": await ensureCatalogue(); return addProductionForm();
    case "add-sale": case "quick-sale": await ensureCatalogue(); return addSaleForm();
    case "adjust-stock": await ensureCatalogue(); return addAdjustmentForm(id);
    case "add-customer": return addCustomerForm();
    case "delete-customer": if (confirm("Delete this customer? Past sales will remain in reports.")) { try { await api(`/customers/${id}`, { method: "DELETE" }); notify("Customer deleted."); renderPage(); } catch (e) { notify(e.message, "error"); } } break;
    case "add-supplier": return addSupplierForm();
    case "delete-supplier": if (confirm("Delete this supplier?")) { try { await api(`/suppliers/${id}`, { method: "DELETE" }); notify("Supplier deleted."); renderPage(); } catch (e) { notify(e.message, "error"); } } break;
    case "add-user": return addUserForm();
    case "deactivate-user": if (confirm("Deactivate this user? They will no longer be able to sign in.")) { try { await api(`/users/${id}/deactivate`, { method: "PATCH" }); notify("User deactivated."); renderPage(); } catch (e) { notify(e.message, "error"); } } break;
    case "export-stock": return downloadCsv("inventory_report.csv", ["Product ID", "SKU", "Name", "Category", "Price", "Stock", "Reorder level", "Inventory value", "Status"], (state.stockForExport || []).map((p) => [p.product_id, p.sku, p.name, categoryName(p.category_id), p.price, p.stock, p.reorder_level, p.inventory_value, p.status]));
    case "export-sales": return downloadCsv("sales_report.csv", ["Sale ID", "Date", "Product", "Customer ID", "Quantity", "Unit price", "Total", "Payment method", "Payment status"], (state.salesForExport || []).map((s) => [s.id, s.sale_date, productName(s.product_id), s.customer_id, s.quantity, s.unit_price, s.total_amount, s.payment_method, s.payment_status]));
  }
}

function downloadCsv(filename, headers, rows) {
  const content = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
}

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-page]");
  if (nav) { navigate(nav.dataset.page); return; }
  const action = event.target.closest("[data-action]");
  if (action) handleAction(action.dataset.action, action.dataset.id).catch((e) => notify(e.message, "error"));
});

$("#loginForm").addEventListener("submit", login);
$("#logoutButton").addEventListener("click", () => logout());
$("#changePasswordButton").addEventListener("click", changePasswordForm);
$("#modalClose").addEventListener("click", closeModal);
$("#appModal").addEventListener("click", (event) => {
  if (event.target === $("#appModal")) closeModal();
});
$("#mobileMenuButton").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

(async function boot() {
  if (!state.token) { showLogin(); return; }
  try {
    state.user = await api("/auth/me");
    showApp();
  } catch (error) {
    sessionStorage.removeItem("retailos_token");
    state.token = null;
    showLogin(error.message.includes("Cannot reach") ? error.message : "Please sign in to continue.");
  }
})();
