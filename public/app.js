const statuses = ["Pending", "Assigned", "In Transit", "Delivered"];

const elements = {
  apiStatus: document.getElementById("apiStatus"),
  total: document.getElementById("totalCount"),
  pending: document.getElementById("pendingCount"),
  transit: document.getElementById("transitCount"),
  delivered: document.getElementById("deliveredCount"),
  rows: document.getElementById("deliveryRows"),
  formPanel: document.getElementById("formPanel"),
  form: document.getElementById("deliveryForm"),
  message: document.getElementById("formMessage")
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function statusClass(status) {
  return "status-" + status.toLowerCase().replace(/\s+/g, "-");
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

async function loadDashboard() {
  const data = await request("/api/dashboard");
  elements.total.textContent = data.total;
  elements.pending.textContent = data.pending;
  elements.transit.textContent = data.inTransit;
  elements.delivered.textContent = data.delivered;
}

function renderDeliveries(deliveries) {
  if (!deliveries.length) {
    elements.rows.innerHTML =
      '<tr><td colspan="6">No deliveries yet. Create your first delivery.</td></tr>';
    return;
  }

  elements.rows.innerHTML = deliveries.map(delivery => `
    <tr>
      <td>FC-${String(delivery.id).padStart(4, "0")}</td>
      <td>${escapeHtml(delivery.customer)}</td>
      <td class="route">${escapeHtml(delivery.pickup)} → ${escapeHtml(delivery.destination)}</td>
      <td>${escapeHtml(delivery.driver)}</td>
      <td><span class="status-pill ${statusClass(delivery.status)}">${escapeHtml(delivery.status)}</span></td>
      <td>
        <select class="status-select" data-id="${delivery.id}" aria-label="Update status for order ${delivery.id}">
          ${statuses.map(status => `
            <option value="${status}" ${status === delivery.status ? "selected" : ""}>${status}</option>
          `).join("")}
        </select>
      </td>
    </tr>
  `).join("");
}

async function refresh() {
  try {
    const [health, deliveries] = await Promise.all([
      request("/api/health"),
      request("/api/deliveries")
    ]);

    await loadDashboard();
    renderDeliveries(deliveries);
    elements.apiStatus.textContent = health.status === "healthy" ? "Connected" : "Unavailable";
  } catch (error) {
    elements.apiStatus.textContent = "Unavailable";
    elements.rows.innerHTML =
      `<tr><td colspan="6">${escapeHtml(error.message)}</td></tr>`;
  }
}

document.getElementById("openForm").addEventListener("click", () => {
  elements.formPanel.hidden = false;
  elements.form.scrollIntoView({ behavior: "smooth", block: "start" });
});

document.getElementById("closeForm").addEventListener("click", () => {
  elements.formPanel.hidden = true;
  elements.message.textContent = "";
});

document.getElementById("refreshButton").addEventListener("click", refresh);

elements.form.addEventListener("submit", async event => {
  event.preventDefault();
  elements.message.textContent = "Creating delivery...";

  const formData = new FormData(elements.form);
  const payload = Object.fromEntries(formData.entries());

  try {
    await request("/api/deliveries", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    elements.form.reset();
    elements.message.textContent = "Delivery created successfully.";
    await refresh();
  } catch (error) {
    elements.message.textContent = error.message;
  }
});

elements.rows.addEventListener("change", async event => {
  const select = event.target.closest(".status-select");
  if (!select) return;

  select.disabled = true;

  try {
    await request(`/api/deliveries/${select.dataset.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: select.value })
    });
    await refresh();
  } catch (error) {
    window.alert(error.message);
    await refresh();
  } finally {
    select.disabled = false;
  }
});

refresh();