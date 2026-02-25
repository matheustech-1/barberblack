const API_BASE = window.BARBER_API_BASE || "http://127.0.0.1:8080/api";
const TOKEN_KEY = "barber_admin_token";

const loginForm = document.getElementById("admin-login-form");
const feedback = document.getElementById("admin-feedback");
const authState = document.getElementById("admin-auth-state");
const loadButton = document.getElementById("load-appointments");
const logoutButton = document.getElementById("logout-admin");
const tableBody = document.querySelector("#appointments-table tbody");

const STATUS_ACTIONS = [
  { value: "confirmed", label: "Confirmar", css: "is-confirm" },
  { value: "cancelled", label: "Cancelar", css: "is-cancel" },
  { value: "completed", label: "Concluir", css: "is-complete" }
];

async function parseJsonSafe(response) {
  const raw = await response.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return {};
  }
}

function friendlyFetchError(error, fallbackMessage) {
  const rawMessage = String(error?.message || "");
  const isFetchFailure =
    error instanceof TypeError || /Failed to fetch/i.test(rawMessage);

  if (isFetchFailure) {
    return "Nao foi possivel conectar com a API. Verifique URL e /api/health.";
  }

  return rawMessage || fallbackMessage;
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function renderAuthState() {
  authState.textContent = getToken() ? "Autenticado" : "Nao autenticado";
  authState.style.color = getToken() ? "#9af0a7" : "#ffb4b4";
}

function actionsHtml(appointmentId, currentStatus) {
  return STATUS_ACTIONS.map((action) => {
    const disabled = currentStatus === action.value ? "disabled" : "";
    return `<button class="status-btn ${action.css}" type="button" data-id="${appointmentId}" data-status="${action.value}" ${disabled}>${action.label}</button>`;
  }).join("");
}

function renderRows(appointments) {
  tableBody.innerHTML = "";

  if (!appointments.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 7;
    td.textContent = "Sem agendamentos.";
    tr.appendChild(td);
    tableBody.appendChild(tr);
    return;
  }

  for (const item of appointments) {
    const tr = document.createElement("tr");
    const date = new Date(item.appointment_date).toLocaleDateString("pt-BR");

    tr.innerHTML = `
      <td>${item.customer_name || "-"}</td>
      <td>${item.customer_phone || "-"}</td>
      <td>${item.service_name || "-"}</td>
      <td>${date}</td>
      <td>${String(item.appointment_time || "").slice(0, 5)}</td>
      <td>${item.status || "-"}</td>
      <td><div class="status-actions">${actionsHtml(item.id, item.status)}</div></td>
    `;

    tableBody.appendChild(tr);
  }
}

async function updateAppointmentStatus(appointmentId, status, buttonElement) {
  const token = getToken();
  if (!token) {
    feedback.textContent = "Sessao expirada. Faca login novamente.";
    feedback.style.color = "#ffb4b4";
    return;
  }

  const originalText = buttonElement.textContent;
  buttonElement.disabled = true;
  buttonElement.textContent = "Enviando...";

  try {
    const response = await fetch(`${API_BASE}/admin/appointments/${appointmentId}/status`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status })
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      if (response.status === 401) {
        clearToken();
        renderAuthState();
      }
      throw new Error(data.error || `Falha ao atualizar status (HTTP ${response.status})`);
    }

    feedback.textContent = "Status atualizado com sucesso.";
    feedback.style.color = "#9af0a7";
    await loadAppointments();
  } catch (error) {
    feedback.textContent = friendlyFetchError(
      error,
      "Erro ao atualizar status."
    );
    feedback.style.color = "#ffb4b4";
    buttonElement.disabled = false;
    buttonElement.textContent = originalText;
  }
}

async function loadAppointments() {
  const token = getToken();
  if (!token) {
    feedback.textContent = "Faca login para ver os agendamentos.";
    feedback.style.color = "#ffb4b4";
    return;
  }

  feedback.textContent = "Carregando agendamentos...";
  feedback.style.color = "#e0b86b";

  try {
    const response = await fetch(`${API_BASE}/admin/appointments`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      if (response.status === 401) {
        clearToken();
        renderAuthState();
      }
      throw new Error(data.error || `Falha ao carregar agendamentos (HTTP ${response.status})`);
    }

    renderRows(data.appointments || []);
    feedback.textContent = "Agendamentos carregados.";
    feedback.style.color = "#9af0a7";
  } catch (error) {
    feedback.textContent = friendlyFetchError(
      error,
      "Erro ao carregar agendamentos."
    );
    feedback.style.color = "#ffb4b4";
  }
}

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const formData = new FormData(loginForm);
  const payload = {
    username: String(formData.get("username") || "").trim(),
    password: String(formData.get("password") || "").trim()
  };

  feedback.textContent = "Autenticando...";
  feedback.style.color = "#e0b86b";

  try {
    const response = await fetch(`${API_BASE}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await parseJsonSafe(response);

    if (!response.ok) {
      throw new Error(data.error || `Falha no login (HTTP ${response.status})`);
    }

    setToken(data.token);
    renderAuthState();
    feedback.textContent = "Login realizado.";
    feedback.style.color = "#9af0a7";
    loginForm.reset();
    loadAppointments();
  } catch (error) {
    feedback.textContent = friendlyFetchError(
      error,
      "Erro no login."
    );
    feedback.style.color = "#ffb4b4";
  }
});

tableBody?.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const button = target.closest("button[data-id][data-status]");
  if (!(button instanceof HTMLButtonElement)) return;

  const appointmentId = button.dataset.id;
  const status = button.dataset.status;

  if (!appointmentId || !status) return;
  updateAppointmentStatus(appointmentId, status, button);
});

loadButton?.addEventListener("click", loadAppointments);

logoutButton?.addEventListener("click", () => {
  clearToken();
  renderAuthState();
  tableBody.innerHTML = "";
  feedback.textContent = "Sessao encerrada.";
  feedback.style.color = "#e0b86b";
});

renderAuthState();
if (getToken()) {
  loadAppointments();
}
