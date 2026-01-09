const TABLE_CONFIG = {
  "usd-cop": {
    label: "Compra USD → COP",
    columns: [
      { name: "date", type: "date", label: "Fecha" },
      { name: "usd", type: "number", placeholder: "0.00", label: "USD usados" },
      { name: "cop", type: "number", placeholder: "0", label: "COP recibidos" },
    ],
  },
  "cop-usdt": {
    label: "Compra COP → USDT",
    columns: [
      { name: "date", type: "date", label: "Fecha" },
      { name: "cop", type: "number", placeholder: "0", label: "COP usados" },
      { name: "usdt", type: "number", placeholder: "0.00", label: "USDT recibidos" },
    ],
  },
  "usdt-usd": {
    label: "Venta USDT → USD",
    columns: [
      { name: "date", type: "date", label: "Fecha" },
      { name: "usdt", type: "number", placeholder: "0.00", label: "USDT vendidos" },
      { name: "usd", type: "number", placeholder: "0.00", label: "USD recibidos" },
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

const clearForm = (form, key) => {
  TABLE_CONFIG[key].columns.forEach((column) => {
    const input = form.querySelector(`[name="${column.name}"]`);
    if (input) {
      input.value = "";
    }
  });
};

const readEntryFromForm = (form, key) => {
  const entry = {};
  let valid = true;

  TABLE_CONFIG[key].columns.forEach((column) => {
    const input = form.querySelector(`[name="${column.name}"]`);
    if (!input) {
      valid = false;
      return;
    }

    if (column.type === "date") {
      entry[column.name] = input.value;
      if (!input.value) {
        valid = false;
      }
    } else {
      const parsed = numberParser(input.value);
      entry[column.name] = parsed;
      if (!Number.isFinite(parsed) || parsed <= 0) {
        valid = false;
      }
    }
  });

  return valid ? entry : null;
};

const createEntrySummaryList = (key, entry) => {
  const list = document.createElement("ul");
  TABLE_CONFIG[key].columns.forEach((column) => {
    const value = entry[column.name];
    const display =
      column.type === "number" ? formatNumber(value) : value || "-";
    const item = document.createElement("li");
    item.innerHTML = `<strong>${column.label}:</strong> ${display}`;
    list.appendChild(item);
  });
  return list;
};

const renderLastTransactions = (data) => {
  TABLE_KEYS.forEach((key) => {
    const container = document.querySelector(`[data-last="${key}"]`);
    if (!container) return;
    container.innerHTML = "";

    const title = document.createElement("strong");
    title.textContent = "Última transacción registrada";
    container.appendChild(title);

    const entry = data[key][data[key].length - 1];
    if (!entry) {
      const empty = document.createElement("div");
      empty.className = "empty-row";
      empty.textContent = "Sin transacciones registradas.";
      container.appendChild(empty);
      return;
    }

    container.appendChild(createEntrySummaryList(key, entry));
  });
};

const sortEntriesByDate = (entries) =>
  [...entries].sort((a, b) => {
    const dateA = dateParser(a.date)?.getTime() ?? 0;
    const dateB = dateParser(b.date)?.getTime() ?? 0;
    return dateA - dateB;
  });

const formatEntryLine = (key, entry) => {
  const parts = TABLE_CONFIG[key].columns.map((column) => {
    const value = entry[column.name];
    const display =
      column.type === "number" ? formatNumber(value) : value || "-";
    return `${column.label}: ${display}`;
  });
  return parts.join(" • ");
};

const renderHistoryLists = (data) => {
  TABLE_KEYS.forEach((key) => {
    const list = document.querySelector(`[data-list="${key}"]`);
    if (!list) return;
    list.innerHTML = "";

    const sortedEntries = sortEntriesByDate(data[key]);
    sortedEntries.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = formatEntryLine(key, entry);
      list.appendChild(item);
    });
  });

  const globalList = document.querySelector('[data-list="all"]');
  if (globalList) {
    globalList.innerHTML = "";
    const combined = TABLE_KEYS.flatMap((key) =>
      data[key].map((entry) => ({ key, entry }))
    );
    const sortedCombined = combined.sort((a, b) => {
      const dateA = dateParser(a.entry.date)?.getTime() ?? 0;
      const dateB = dateParser(b.entry.date)?.getTime() ?? 0;
      return dateA - dateB;
    });

    sortedCombined.forEach(({ key, entry }) => {
      const item = document.createElement("li");
      item.textContent = `${TABLE_CONFIG[key].label} — ${formatEntryLine(
        key,
        entry
      )}`;
      globalList.appendChild(item);
    });
  }
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
  renderHistoryLists(storedData);
  calculate(storedData);
} else {
  TABLE_KEYS.forEach((key) => {
    const form = document.querySelector(`[data-form="${key}"]`);
    const addButton = form?.querySelector("[data-action=add]");

    addButton?.addEventListener("click", () => {
      const data = loadData();
      const entry = readEntryFromForm(form, key);
      if (!entry) {
        return;
      }
      data[key].push(entry);
      saveData(data);
      clearForm(form, key);
      renderLastTransactions(data);
      calculate(data);
    });
  });

  renderLastTransactions(storedData);
  calculate(storedData);
}
