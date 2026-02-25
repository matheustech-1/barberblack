const API_BASE = window.BARBER_API_BASE || "http://127.0.0.1:8080/api";

async function parseJsonSafe(response) {
  const raw = await response.text();
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return {};
  }
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCents(value) {
  return (Number(value || 0) / 100).toFixed(2).replace(".", ",");
}

async function createPixCheckout(appointmentId) {
  const response = await fetch(`${API_BASE}/payments/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      appointmentId,
      provider: "manual_pix"
    })
  });

  const data = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(data.error || `Falha ao iniciar pagamento PIX (HTTP ${response.status})`);
  }

  return data;
}

function setupBookingForm() {
  const form = document.querySelector("form.form");
  if (!form) return;

  const serviceSelect = form.querySelector("select[name='servico']");
  const submitButton = form.querySelector("button[type='submit']");

  const feedback = document.createElement("p");
  feedback.style.marginTop = "12px";
  feedback.style.minHeight = "1.2em";
  form.appendChild(feedback);

  async function loadServices() {
    if (!serviceSelect) return;
    try {
      const response = await fetch(`${API_BASE}/services`);
      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || `Nao foi possivel carregar servicos (HTTP ${response.status})`);
      }

      const services = data.services || [];

      serviceSelect.innerHTML = "<option value=''>Selecione</option>";
      for (const service of services) {
        const option = document.createElement("option");
        option.value = service.id;
        option.textContent = `${service.name} - R$ ${(service.price_cents / 100).toFixed(2).replace('.', ',')}`;
        serviceSelect.appendChild(option);
      }
    } catch (error) {
      feedback.textContent = error.message || "Erro ao carregar servicos. Tente novamente.";
      feedback.style.color = "#ffb4b4";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      name: String(formData.get("nome") || "").trim(),
      phone: String(formData.get("whatsapp") || "").trim(),
      serviceId: String(formData.get("servico") || "").trim(),
      appointmentDate: String(formData.get("data") || "").trim(),
      appointmentTime: String(formData.get("hora") || "").trim(),
      paymentMethod: String(formData.get("pagamento") || "onsite")
    };

    const phoneDigits = normalizePhone(payload.phone);
    if (phoneDigits.length < 10 || phoneDigits.length > 13) {
      feedback.textContent = "WhatsApp invalido. Use DDD + numero.";
      feedback.style.color = "#ffb4b4";
      return;
    }

    submitButton.disabled = true;
    feedback.textContent = "Enviando agendamento...";
    feedback.style.color = "#e0b86b";

    try {
      const response = await fetch(`${API_BASE}/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await parseJsonSafe(response);

      if (!response.ok) {
        throw new Error(data.error || `Falha ao criar agendamento (HTTP ${response.status})`);
      }

      const appointmentId = data?.appointment?.id;
      if (payload.paymentMethod === "pix" && appointmentId) {
        const checkout = await createPixCheckout(appointmentId);
        const payment = checkout.payment || {};
        const instructions = checkout.instructions || {};
        const pixKey = instructions.pixKey ? ` Chave PIX: ${instructions.pixKey}.` : "";

        feedback.textContent = `Agendamento criado. PIX pendente (R$ ${formatCents(payment.amount_cents)}). Ref: ${payment.external_id}.${pixKey}`;
      } else {
        feedback.textContent = "Agendamento enviado com sucesso. Em breve confirmaremos.";
      }

      feedback.style.color = "#9af0a7";
      form.reset();
    } catch (error) {
      feedback.textContent = error.message || "Erro ao enviar agendamento.";
      feedback.style.color = "#ffb4b4";
    } finally {
      submitButton.disabled = false;
    }
  });

  loadServices();
}

setupBookingForm();

