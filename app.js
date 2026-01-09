const TABLE_CONFIG = {
  "usd-cop": {
    columns: [
      { name: "date", type: "date" },
      { name: "usd", type: "number", placeholder: "0.00" },
      { name: "cop", type: "number", placeholder: "0", format: "cop" },
    ],
  },
  "cop-usdt": {
    columns: [
      { name: "date", type: "date" },
      { name: "cop", type: "number", placeholder: "0", format: "cop" },
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

const TABLE_KEYS = Object.keys(TABLE_CONFIG);
const STORAGE_KEY = "p2p-transactions";

const currencyFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const copInputFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const parseNumberValue = (value) => {
  if (!value) return null;
  const sanitized = value.replace(/,/g, "");
  const parsed = Number.parseFloat(sanitized);
  return Number.isFinite(parsed) ? parsed : null;
};

const numberParser = (value) => {
  const parsed = parseNumberValue(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateParser = (value) => {
  if (!value) return null;
  const parsed = new Date(value + "T00:00:00");
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatNumber = (value) => currencyFormatter.format(value || 0);

const formatDays = (days) => (Number.isFinite(days) ? `${days} días` : "-");

const emptyData = () =>
  TABLE_KEYS.reduce((acc, key) => {
    acc[key] = [];
    return acc;
  }, {});

const loadData = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return emptyData();
  try {
    const parsed = JSON.parse(stored);
    return TABLE_KEYS.reduce((acc, key) => {
      acc[key] = Array.isArray(parsed[key]) ? parsed[key] : [];
      return acc;
    }, {});
  } catch (error) {
    return emptyData();
  }
};

const saveData = (data) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
        const input = row.children[index]?.querySelector("input");
        if (!input) return;
        values[column.name] =
          column.type === "date" ? input.value : numberParser(input.value);
      });
      return values;
    })
    .filter((row) => Object.values(row).some((value) => value));
};

const addRow = (tableKey, entry = {}) => {
  const table = document.querySelector(`[data-table="${tableKey}"] tbody`);
  const config = TABLE_CONFIG[tableKey];
  const row = document.createElement("tr");

  config.columns.forEach((column) => {
    const cell = document.createElement("td");
    const input = document.createElement("input");
    input.type = column.format === "cop" ? "text" : column.type;
    input.name = column.name;
    input.placeholder = column.placeholder || "";
    if (entry[column.name]) {
      input.value = entry[column.name];
    }
    input.addEventListener("input", syncFromInputs);
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
    syncFromInputs();
  });
  actionCell.appendChild(removeButton);
  row.appendChild(actionCell);

  table.appendChild(row);
};

const renderHistoryTables = (data) => {
  TABLE_KEYS.forEach((key) => {
    const tbody = document.querySelector(`[data-table="${key}"] tbody`);
    tbody.innerHTML = "";
    if (data[key].length === 0) {
      addRow(key);
      return;
    }
    data[key].forEach((entry) => addRow(key, entry));
  });
};

const renderSummaryTables = (data) => {
  TABLE_KEYS.forEach((key) => {
    const tbody = document.querySelector(`[data-table="${key}"] tbody`);
    const columns = TABLE_CONFIG[key].columns;
    tbody.innerHTML = "";
    const lastEntry = data[key][data[key].length - 1];

    if (!lastEntry) {
      const row = document.createElement("tr");
      row.className = "empty-row";
      const cell = document.createElement("td");
      cell.colSpan = columns.length;
      cell.textContent = "Sin transacciones registradas";
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    const row = document.createElement("tr");
    columns.forEach((column) => {
      const cell = document.createElement("td");
      const value = lastEntry[column.name];
      cell.textContent =
        column.type === "number" ? formatNumber(value) : value || "-";
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
};

const collectAllTables = () =>
  TABLE_KEYS.reduce((acc, key) => {
    acc[key] = readTable(key);
    return acc;
  }, {});

const syncFromInputs = () => {
  const data = collectAllTables();
  saveData(data);
  calculate(data);
};

const calculate = (data) => {
  const usdCop = data["usd-cop"] || [];
  const copUsdt = data["cop-usdt"] || [];
  const usdtUsd = data["usdt-usd"] || [];

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

  const proceedsEl = document.querySelector("[data-total=proceeds]");
  const basisEl = document.querySelector("[data-total=basis]");
  const gainEl = document.querySelector("[data-total=gain]");
  const copEl = document.querySelector("[data-total=cop]");
  const usdtEl = document.querySelector("[data-total=usdt]");

  if (proceedsEl) proceedsEl.textContent = formatNumber(totalProceeds);
  if (basisEl) basisEl.textContent = formatNumber(totalBasis);
  if (gainEl) gainEl.textContent = formatNumber(totalGain);
  if (copEl)
    copEl.textContent = formatNumber(
      copLots.reduce((sum, lot) => sum + lot.amount, 0)
    );
  if (usdtEl)
    usdtEl.textContent = formatNumber(
      usdtLots.reduce((sum, lot) => sum + lot.amount, 0)
    );

  const alertBox = document.querySelector("[data-alert]");
  if (alertBox) {
    if (alerts.length) {
      alertBox.textContent = alerts.join(" ");
      alertBox.classList.add("visible");
    } else {
      alertBox.textContent = "";
      alertBox.classList.remove("visible");
    }
  }

  const fifoBody = document.querySelector('[data-table="fifo-detail"]');
  if (fifoBody) {
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
  }
};

const pageType = document.body?.dataset.page || "main";
const storedData = loadData();

if (pageType === "history") {
  renderHistoryTables(storedData);
  TABLE_KEYS.forEach((key) => {
    const addButton = document.querySelector(`[data-add="${key}"]`);
    addButton?.addEventListener("click", () => {
      addRow(key);
      syncFromInputs();
    });
  });
  syncFromInputs();
} else {
  renderSummaryTables(storedData);
  calculate(storedData);
}
