const TABLE_CONFIG = {
  "usd-cop": {
    columns: [
      { name: "date", type: "date" },
      { name: "usd", type: "number", placeholder: "0.00" },
      { name: "cop", type: "number", placeholder: "0" },
    ],
  },
  "cop-usdt": {
    columns: [
      { name: "date", type: "date" },
      { name: "cop", type: "number", placeholder: "0" },
      { name: "usdt", type: "number", placeholder: "0.00" },
    ],
  },
  "usdt-usd": {
    columns: [
      { name: "date", type: "date" },
      { name: "usdt", type: "number", placeholder: "0.00" },
      { name: "usd", type: "number", placeholder: "0.00" },
    ],
  },
};

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberParser = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateParser = (value) => {
  if (!value) return null;
  const parsed = new Date(value + "T00:00:00");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addRow = (tableKey, values = {}) => {
  const table = document.querySelector(`[data-table="${tableKey}"] tbody`);
  const config = TABLE_CONFIG[tableKey];
  const row = document.createElement("tr");

  config.columns.forEach((column) => {
    const cell = document.createElement("td");
    const input = document.createElement("input");
    input.type = column.type;
    input.name = column.name;
    input.placeholder = column.placeholder || "";
    if (values[column.name] !== undefined && values[column.name] !== null) {
      input.value = values[column.name];
    }
    input.addEventListener("input", calculate);
    input.addEventListener("input", saveLocalData);
    cell.appendChild(input);
    row.appendChild(cell);
  });

  const actionCell = document.createElement("td");
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "btn btn-secondary";
  removeButton.textContent = "Eliminar";
  removeButton.addEventListener("click", () => {
    row.remove();
    calculate();
    saveLocalData();
  });
  actionCell.appendChild(removeButton);
  row.appendChild(actionCell);

  table.appendChild(row);
};

const readTable = (tableKey) => {
  const rows = document.querySelectorAll(
    `[data-table="${tableKey}"] tbody tr`
  );
  const config = TABLE_CONFIG[tableKey];

  return Array.from(rows)
    .map((row) => {
      const values = {};
      config.columns.forEach((column, index) => {
        const input = row.children[index].querySelector("input");
        if (!input) return;
        values[column.name] =
          column.type === "date" ? input.value : numberParser(input.value);
      });
      return values;
    })
    .filter((row) => Object.values(row).some((value) => value));
};

const formatNumber = (value) => currencyFormatter.format(value || 0);

const formatDays = (days) => (Number.isFinite(days) ? `${days} días` : "-");

const calculate = () => {
  const usdCop = readTable("usd-cop");
  const copUsdt = readTable("cop-usdt");
  const usdtUsd = readTable("usdt-usd");

  const alerts = [];

  const copLots = [];
  usdCop.forEach((entry) => {
    if (!entry.date || entry.usd <= 0 || entry.cop <= 0) {
      return;
    }
    copLots.push({
      date: entry.date,
      amount: entry.cop,
      usdCost: entry.usd,
    });
  });

  const usdtLots = [];
  copUsdt.forEach((entry) => {
    if (!entry.date || entry.cop <= 0 || entry.usdt <= 0) {
      return;
    }

    let remainingCop = entry.cop;
    let totalUsdCost = 0;

    while (remainingCop > 0 && copLots.length) {
      const lot = copLots[0];
      const usedCop = Math.min(remainingCop, lot.amount);
      const usdCostUsed = (usedCop / lot.amount) * lot.usdCost;

      lot.amount -= usedCop;
      lot.usdCost -= usdCostUsed;
      remainingCop -= usedCop;
      totalUsdCost += usdCostUsed;

      if (lot.amount <= 0.0001) {
        copLots.shift();
      }
    }

    if (remainingCop > 0.0001) {
      alerts.push(
        `Faltan ${formatNumber(remainingCop)} COP para cubrir la compra de USDT del ${entry.date}.`
      );
    }

    const effectiveUsdCost = totalUsdCost;
    if (effectiveUsdCost > 0) {
      usdtLots.push({
        date: entry.date,
        amount: entry.usdt,
        usdCost: effectiveUsdCost,
      });
    }
  });

  let totalProceeds = 0;
  let totalBasis = 0;
  let totalGain = 0;
  const fifoRows = [];

  usdtUsd.forEach((entry) => {
    if (!entry.date || entry.usdt <= 0 || entry.usd <= 0) {
      return;
    }

    let remainingUsdt = entry.usdt;
    let basisForSale = 0;

    while (remainingUsdt > 0 && usdtLots.length) {
      const lot = usdtLots[0];
      const usedUsdt = Math.min(remainingUsdt, lot.amount);
      const usdCostUsed = (usedUsdt / lot.amount) * lot.usdCost;

      lot.amount -= usedUsdt;
      lot.usdCost -= usdCostUsed;
      remainingUsdt -= usedUsdt;
      basisForSale += usdCostUsed;

      const holdingDays = (() => {
        const purchaseDate = dateParser(lot.date);
        const saleDate = dateParser(entry.date);
        if (!purchaseDate || !saleDate) return null;
        const diffMs = saleDate.getTime() - purchaseDate.getTime();
        return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      })();

      fifoRows.push({
        saleDate: entry.date,
        usedUsdt,
        usdCost: usdCostUsed,
        usdProceeds: (usedUsdt / entry.usdt) * entry.usd,
        gain: (usedUsdt / entry.usdt) * entry.usd - usdCostUsed,
        holdingDays,
      });

      if (lot.amount <= 0.0001) {
        usdtLots.shift();
      }
    }

    if (remainingUsdt > 0.0001) {
      alerts.push(
        `Faltan ${formatNumber(remainingUsdt)} USDT para cubrir la venta del ${entry.date}.`
      );
    }

    const proceeds = entry.usd;
    const gain = proceeds - basisForSale;
    totalProceeds += proceeds;
    totalBasis += basisForSale;
    totalGain += gain;
  });

  document.querySelector("[data-total=proceeds]").textContent =
    formatNumber(totalProceeds);
  document.querySelector("[data-total=basis]").textContent =
    formatNumber(totalBasis);
  document.querySelector("[data-total=gain]").textContent =
    formatNumber(totalGain);
  document.querySelector("[data-total=cop]").textContent = formatNumber(
    copLots.reduce((sum, lot) => sum + lot.amount, 0)
  );
  document.querySelector("[data-total=usdt]").textContent = formatNumber(
    usdtLots.reduce((sum, lot) => sum + lot.amount, 0)
  );

  const alertBox = document.querySelector("[data-alert]");
  if (alerts.length) {
    alertBox.textContent = alerts.join(" ");
    alertBox.classList.add("visible");
  } else {
    alertBox.textContent = "";
    alertBox.classList.remove("visible");
  }

  const fifoBody = document.querySelector('[data-table="fifo-detail"]');
  fifoBody.innerHTML = "";
  fifoRows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${row.saleDate}</td>
      <td>${formatNumber(row.usedUsdt)}</td>
      <td>${formatNumber(row.usdCost)}</td>
      <td>${formatNumber(row.usdProceeds)}</td>
      <td>${formatNumber(row.gain)}</td>
      <td>${formatDays(row.holdingDays)}</td>
    `;
    fifoBody.appendChild(tr);
  });
};

const STORAGE_KEY = "p2p-fifo-data";
const CLOUD_CONFIG_KEY = "p2p-fifo-cloud-config";

const serializeTables = () => ({
  tables: Object.keys(TABLE_CONFIG).reduce((acc, key) => {
    acc[key] = readTable(key);
    return acc;
  }, {}),
  updatedAt: new Date().toISOString(),
});

const applyTableData = (tableKey, rows = []) => {
  const tableBody = document.querySelector(`[data-table="${tableKey}"] tbody`);
  tableBody.innerHTML = "";
  if (!rows.length) {
    addRow(tableKey);
    return;
  }
  rows.forEach((row) => addRow(tableKey, row));
};

const loadLocalData = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;
  try {
    const parsed = JSON.parse(stored);
    Object.keys(TABLE_CONFIG).forEach((key) => {
      applyTableData(key, parsed?.tables?.[key] || []);
    });
    calculate();
  } catch (error) {
    console.warn("No se pudo leer el respaldo local.", error);
  }
};

const saveLocalData = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeTables()));
};

const updateStatus = (message, isError = false) => {
  const status = document.querySelector("[data-cloud-status]");
  if (!status) return;
  status.textContent = message;
  status.classList.toggle("status-error", isError);
};

const readCloudConfig = () => {
  const stored = localStorage.getItem(CLOUD_CONFIG_KEY);
  if (!stored) {
    return { endpoint: "", apiKey: "" };
  }
  try {
    return JSON.parse(stored);
  } catch (error) {
    console.warn("No se pudo leer la configuración de nube.", error);
    return { endpoint: "", apiKey: "" };
  }
};

const writeCloudConfig = (config) => {
  localStorage.setItem(CLOUD_CONFIG_KEY, JSON.stringify(config));
};

const setCloudHeaders = (apiKey) => {
  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  return headers;
};

const syncToCloud = async () => {
  const endpointInput = document.querySelector("[data-cloud-endpoint]");
  const apiKeyInput = document.querySelector("[data-cloud-key]");
  const endpoint = endpointInput.value.trim();
  const apiKey = apiKeyInput.value.trim();

  if (!endpoint) {
    updateStatus("Agrega la URL de tu almacenamiento en la nube.", true);
    return;
  }

  writeCloudConfig({ endpoint, apiKey });

  try {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: setCloudHeaders(apiKey),
      body: JSON.stringify(serializeTables()),
    });

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }
    updateStatus("Respaldo en la nube actualizado.");
  } catch (error) {
    updateStatus("No se pudo guardar en la nube.", true);
    console.error(error);
  }
};

const loadFromCloud = async () => {
  const endpointInput = document.querySelector("[data-cloud-endpoint]");
  const apiKeyInput = document.querySelector("[data-cloud-key]");
  const endpoint = endpointInput.value.trim();
  const apiKey = apiKeyInput.value.trim();

  if (!endpoint) {
    updateStatus("Agrega la URL de tu almacenamiento en la nube.", true);
    return;
  }

  writeCloudConfig({ endpoint, apiKey });

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: setCloudHeaders(apiKey),
    });

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }
    const data = await response.json();
    Object.keys(TABLE_CONFIG).forEach((key) => {
      applyTableData(key, data?.tables?.[key] || []);
    });
    calculate();
    saveLocalData();
    updateStatus("Datos cargados desde la nube.");
  } catch (error) {
    updateStatus("No se pudo cargar desde la nube.", true);
    console.error(error);
  }
};

const hydrateCloudConfigInputs = () => {
  const { endpoint, apiKey } = readCloudConfig();
  const endpointInput = document.querySelector("[data-cloud-endpoint]");
  const apiKeyInput = document.querySelector("[data-cloud-key]");
  if (endpointInput) endpointInput.value = endpoint;
  if (apiKeyInput) apiKeyInput.value = apiKey;
};

Object.keys(TABLE_CONFIG).forEach((key) => {
  const addButton = document.querySelector(`[data-add="${key}"]`);
  addButton.addEventListener("click", () => {
    addRow(key);
    saveLocalData();
  });
  addRow(key);
});

const localRestoreButton = document.querySelector("[data-local-restore]");
if (localRestoreButton) {
  localRestoreButton.addEventListener("click", () => {
    loadLocalData();
    updateStatus("Datos locales restaurados.");
  });
}

const cloudSaveButton = document.querySelector("[data-cloud-save]");
if (cloudSaveButton) {
  cloudSaveButton.addEventListener("click", syncToCloud);
}

const cloudLoadButton = document.querySelector("[data-cloud-load]");
if (cloudLoadButton) {
  cloudLoadButton.addEventListener("click", loadFromCloud);
}

hydrateCloudConfigInputs();
loadLocalData();
calculate();
