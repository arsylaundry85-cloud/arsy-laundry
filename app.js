const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzgPz_F6fP_B9Ou5e9yMNtIIeQkAeXjPAX8wwkt4aIAR6ctwzcdyspMpkDHeTNI6BPOIg/exec";

const safeStorage = {
  _memory: {},
  getItem(key) {
    try { return localStorage.getItem(key); }
    catch (e) { return this._memory[key] || null; }
  },
  setItem(key, val) {
    try { localStorage.setItem(key, val); }
    catch (e) { this._memory[key] = String(val); }
  }
};

function getSafeData(key, defaultData) {
  try {
    let data = JSON.parse(safeStorage.getItem(key));
    return data !== null ? data : defaultData;
  } catch (e) {
    return defaultData;
  }
}

let servicePrices = getSafeData("arsyServices", {
  "Cuci Kering": { price: 5000, unit: "kg", processes: ["Cuci", "Pengeringan", "Lipat"], duration: "3 Hari", minQty: 1, pinned: true },
  "Cuci Setrika": { price: 10000, unit: "kg", processes: ["Cuci"], duration: "1 Hari", minQty: 1, pinned: true },
  "Bed Cover": { price: 25000, unit: "pcs", processes: ["Cuci"], duration: "1 Hari", minQty: 1, pinned: false },
  "sepatu": { price: 25000, unit: "set", processes: ["Cuci"], duration: "1 Hari", minQty: 1, pinned: false },
  "karpet": { price: 40000, unit: "m²", processes: ["Cuci"], duration: "1 Hari", minQty: 1, pinned: false },
  "sofa": { price: 50000, unit: "pcs", processes: ["Cuci"], duration: "7 Hari", minQty: 1, pinned: false },
  "Setrika express": { price: 6000, unit: "kg", processes: ["Setrika"], duration: "4 Jam", minQty: 1, pinned: false }
});

Object.keys(servicePrices).forEach(key => {
  if (typeof servicePrices[key] === 'number') {
    servicePrices[key] = { price: servicePrices[key], unit: key === "Bed Cover" ? "pcs" : "kg", processes: ["Cuci"], duration: "1 Hari", minQty: 1, pinned: false };
  } else if (!servicePrices[key].processes) {
    servicePrices[key].processes = ["Cuci"];
    servicePrices[key].duration = "1 Hari";
    servicePrices[key].minQty = 1;
  }
  if (servicePrices[key].pinned === undefined) {
    servicePrices[key].pinned = (key === "Cuci Kering" || key === "Cuci Setrika");
  }
});
let transactions = getSafeData("arsyTransactions", []);
transactions = Array.from(new Map(transactions.map(t => [t.id, t])).values());

let savedCustomers = [];

let arsyOutlet = getSafeData("arsyOutlet", {
  name: "Arsy Laundry",
  phone: "6281282466642",
  city: "Kota Surabaya",
  address: "Jl. Dukuh Kupang, Gg. Lebar, No.76"
});

let notaSettings = getSafeData("arsyNotaSettings", {
  hideLogo: false,
  hideOutlet: false,
  hideAddress: false,
  hideCashier: false,
  hideCustomer: false,
  showCategory: false,
  hideMessage: false,
  hideParfum: false,
  hidePowered: false,
  showEstDay: true,
  printerName: "RPPO2N",
  printerMac: "60:6E:41:63:65:00",
  paperSize: "58"
});

let currentTransactionFilter = 'Semua';
let activeTransactionId = null;
let currentReportType = 'all';
let activeNewTransactionItems = [];
let editingTransactionItemContext = null;

async function loadFromCloud() {
  try {
    let response = await fetch(WEB_APP_URL);
    let cloudData = await response.json();
    
    if (cloudData.transactions && Array.isArray(cloudData.transactions)) {
      const mergedMap = new Map();
      cloudData.transactions.forEach(t => mergedMap.set(t.id, t));
      
      transactions.forEach(t => {
        if (!mergedMap.has(t.id) || new Date(t.date) >= new Date(mergedMap.get(t.id).date)) {
          mergedMap.set(t.id, t);
        }
      });

      transactions = Array.from(mergedMap.values()).sort((a, b) => new Date(b.date) - new Date(a.date));
      safeStorage.setItem("arsyTransactions", JSON.stringify(transactions));
      
      savedCustomers = cloudData.customers || [];
      if (cloudData.services && Object.keys(cloudData.services).length > 0) {
        servicePrices = cloudData.services;
        safeStorage.setItem("arsyServices", JSON.stringify(servicePrices));
      }
      if (cloudData.outlet && Object.keys(cloudData.outlet).length > 0) {
        arsyOutlet = cloudData.outlet;
        safeStorage.setItem("arsyOutlet", JSON.stringify(arsyOutlet));
      }
      if (cloudData.notaSettings && Object.keys(cloudData.notaSettings).length > 0) {
        notaSettings = cloudData.notaSettings;
        safeStorage.setItem("arsyNotaSettings", JSON.stringify(notaSettings));
      }
      renderAll();
    }
  } catch (err) {
    console.log("Gagal memuat dari cloud, menggunakan data lokal.");
    renderAll();
  }
}
document.addEventListener("DOMContentLoaded", function () {
  injectLoginModal();
  injectCustomerModules();
  injectOutletModule();
  injectRichServiceModalHTML();
  injectPaymentModalHTML();
  injectReportPaymentMethodFilter();
  injectTransactionModalHTML();
  injectEditTransactionItemModalHTML();
  injectTransactionSearch();
  
  renderAll();
  loadFromCloud();
  
  setupForm();
  loadNotaSettingsUI();
  setupDashboardInteractions();
  setupAkunOutletLink();
  removeProElements();
});

function injectTransactionSearch() {
  const transactionPage = document.getElementById("transactionsPage");
  if (!transactionPage) return;

  const tabContainer = transactionPage.querySelector(".transaction-tabs-container");
  if (!tabContainer || document.getElementById("transactionSearchInput")) return;

  const searchWrapper = document.createElement("div");
  searchWrapper.style.cssText = "padding: 10px 15px; background: white; border-bottom: 1px solid var(--border);";
  searchWrapper.innerHTML = `
    <div style="position: relative;">
      <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 14px;">🔍</span>
      <input type="text" id="transactionSearchInput" placeholder="Cari nama pelanggan..." 
        style="width: 100%; padding: 10px 10px 10px 35px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; outline: none;"
        onkeyup="renderAllTransactions()">
    </div>
  `;
  tabContainer.insertAdjacentElement("afterend", searchWrapper);
}

function removeProElements() {
  document.querySelectorAll("div, span, a, li, p").forEach(el => {
    if (el.children.length === 0) {
      const text = el.textContent.trim();
      if (text.includes("Perpanjang Randori Pro")) {
        let row = el.closest("div[style*='cursor']") || el.closest("div") || el.parentElement;
        if (row) row.remove();
      }
      if (text.includes("Tgl Berakhir:") || (text.startsWith("Pro") && text.includes("Berakhir"))) {
        el.remove();
      }
    }
  });
}

function saveServicesData() {
  safeStorage.setItem("arsyServices", JSON.stringify(servicePrices));
}
function loadNotaSettingsUI() {
  if(document.getElementById("setHideLogo")) document.getElementById("setHideLogo").checked = notaSettings.hideLogo;
  if(document.getElementById("setHideOutlet")) document.getElementById("setHideOutlet").checked = notaSettings.hideOutlet;
  if(document.getElementById("setHideAddress")) document.getElementById("setHideAddress").checked = notaSettings.hideAddress;
  if(document.getElementById("setHideCashier")) document.getElementById("setHideCashier").checked = notaSettings.hideCashier;
  if(document.getElementById("setHideCustomer")) document.getElementById("setHideCustomer").checked = notaSettings.hideCustomer;
  if(document.getElementById("setShowCategory")) document.getElementById("setShowCategory").checked = notaSettings.showCategory;
  if(document.getElementById("setHideMessage")) document.getElementById("setHideMessage").checked = notaSettings.hideMessage;
  if(document.getElementById("setHideParfum")) document.getElementById("setHideParfum").checked = notaSettings.hideParfum;
  if(document.getElementById("setHidePowered")) document.getElementById("setHidePowered").checked = notaSettings.hidePowered;
  if(document.getElementById("setShowEstDay")) document.getElementById("setShowEstDay").checked = notaSettings.showEstDay;

  if(document.getElementById("printerNameLabel")) document.getElementById("printerNameLabel").textContent = notaSettings.printerName;
  if(document.getElementById("printerMacLabel")) document.getElementById("printerMacLabel").textContent = notaSettings.printerMac;
}

function saveNotaSettings() {
  notaSettings.hideLogo = document.getElementById("setHideLogo").checked;
  notaSettings.hideOutlet = document.getElementById("setHideOutlet").checked;
  notaSettings.hideAddress = document.getElementById("setHideAddress").checked;
  notaSettings.hideCashier = document.getElementById("setHideCashier").checked;
  notaSettings.hideCustomer = document.getElementById("setHideCustomer").checked;
  notaSettings.showCategory = document.getElementById("setShowCategory").checked;
  notaSettings.hideMessage = document.getElementById("setHideMessage").checked;
  notaSettings.hideParfum = document.getElementById("setHideParfum").checked;
  notaSettings.hidePowered = document.getElementById("setHidePowered").checked;
  notaSettings.showEstDay = document.getElementById("setShowEstDay").checked;

  safeStorage.setItem("arsyNotaSettings", JSON.stringify(notaSettings));
  saveData();
  showToast("Pengaturan nota disimpan");
}

async function saveData() {
  transactions = Array.from(new Map(transactions.map(t => [t.id, t])).values());
  safeStorage.setItem("arsyTransactions", JSON.stringify(transactions));
  const payload = {
    action: "saveAll",
    transactions: transactions,
    customers: savedCustomers,
    services: servicePrices,
    outlet: arsyOutlet,
    notaSettings: notaSettings
  };

  try {
    await fetch(WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(JSON.stringify(payload))
    });
  } catch (err) {
    console.log("Sinkronisasi cloud tertunda.");
  }
}

function formatRupiah(number) {
  return "Rp " + Number(number).toLocaleString("id-ID");
}

function formatDate(date) {
  return new Date(date).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}


function calculateEstimationDate(dateStr, durationStr) {
  let date = new Date(dateStr);
  if (!durationStr) {
    date.setDate(date.getDate() + 1);
    return date;
  }
  let lower = String(durationStr).toLowerCase();
  let num = parseInt(lower) || 1;
  if (lower.includes("hari") || lower.includes("day")) {
    date.setDate(date.getDate() + num);
  } else if (lower.includes("jam") || lower.includes("hour")) {
    date.setTime(date.getTime() + num * 3600 * 1000);
  } else if (lower.includes("menit") || lower.includes("minute")) {
    date.setTime(date.getTime() + num * 60 * 1000);
  } else {
    date.setDate(date.getDate() + num);
  }
  return date;
}

function getEstDate(item) {
  if (item.estDate) return item.estDate;
  const itemsList = getTransactionItems(item);
  const firstSrv = itemsList.length > 0 ? servicePrices[itemsList[0].serviceType] : null;
  const durationStr = firstSrv ? firstSrv.duration : "1 Hari";
  return calculateEstimationDate(item.date, durationStr).toISOString();
}

function getTransactionItems(item) {
  if (item.items && Array.isArray(item.items) && item.items.length > 0) {
    return item.items;
  }
  return [{
    serviceType: item.serviceType || "Cuci Kering",
    weight: item.weight || 1,
    total: item.total || 0
  }];
}

function isToday(date) {
  if (!date) return false;
  const today = new Date();
  const transactionDate = new Date(date);
  return today.toDateString() === transactionDate.toDateString();
}
function setupCustomerAutocomplete() {
  const input = document.getElementById("customerName");
  if (!input) return;

  let datalist = document.getElementById("customerListOptions");
  if (!datalist) {
    datalist = document.createElement("datalist");
    datalist.id = "customerListOptions";
    input.parentNode.appendChild(datalist);
    input.setAttribute("list", "customerListOptions");
  }

  const namesSet = new Set();
  savedCustomers.forEach(c => { if(c.name) namesSet.add(c.name); });
  transactions.forEach(t => { if(t.customerName) namesSet.add(t.customerName); });

  datalist.innerHTML = Array.from(namesSet).map(name => `<option value="${escapeHTML(name)}">`).join("");
}

function getSortedServiceNames() {
  return Object.keys(servicePrices).sort((a, b) => {
    let pinA = servicePrices[a].pinned ? 1 : 0;
    let pinB = servicePrices[b].pinned ? 1 : 0;
    if (pinA !== pinB) {
      return pinB - pinA;
    }
    return a.localeCompare(b, 'id', { sensitivity: 'base' });
  });
}

function injectTransactionModalHTML() {
  let modal = document.getElementById("transactionModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "transactionModal";
    modal.className = "modal";
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-content" style="background: white; padding: 20px; border-radius: 16px; width: 90%; max-width: 450px; max-height: 90vh; overflow-y: auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h3 style="font-size:18px; font-weight:bold; color:var(--text);">Transaksi Baru</h3>
        <button type="button" onclick="closeTransactionModal()" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted);">&times;</button>
      </div>
      <form id="transactionForm">
        <div style="margin-bottom: 12px;">
          <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px; color: var(--text);">Nama Pelanggan</label>
          <input type="text" id="customerName" placeholder="Contoh: Budi" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;" required autocomplete="off">
        </div>

        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label style="font-size: 13px; font-weight: bold; color: var(--text);">Layanan Laundry</label>
            <button type="button" onclick="openAddServiceToTransactionModal()" style="background: var(--primary); color: white; border: none; padding: 4px 10px; border-radius: 6px; font-size: 12px; cursor: pointer; font-weight: bold;">+ Tambah Layanan</button>
          </div>
          <div id="transactionItemsContainer" style="border: 1px solid var(--border); border-radius: 8px; padding: 10px; min-height: 70px; max-height: 200px; overflow-y: auto;">
            <div style="color: var(--muted); font-size: 13px; text-align: center; padding: 15px;">Belum ada layanan dipilih</div>
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px; color: var(--text);">Status</label>
          <select id="status" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;">
            <option value="Antrian">Antrian</option>
            <option value="Proses">Proses</option>
            <option value="Siap Diambil">Siap Diambil</option>
            <option value="Selesai">Selesai</option>
            <option value="Batal">Batal</option>
          </select>
        </div>

        <button type="submit" class="submit-button">Simpan Transaksi</button>
      </form>
    </div>
  `;

  if (!document.getElementById("addServiceSelectModal")) {
    let subModal = document.createElement("div");
    subModal.id = "addServiceSelectModal";
    subModal.className = "modal";
    subModal.innerHTML = `
      <div class="modal-content" style="background: white; padding: 20px; border-radius: 16px; width: 90%; max-width: 350px; max-height: 80vh; overflow-y: auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="font-size:16px; font-weight:bold; color:var(--text);">Pilih Layanan</h3>
          <button type="button" onclick="closeAddServiceSelectModal()" style="background:none; border:none; font-size:20px; cursor:pointer; color:var(--muted);">&times;</button>
        </div>
        <div style="margin-bottom: 12px;">
          <input type="text" id="serviceSearchInput" placeholder="Cari nama layanan..." style="width: 100%; padding: 8px 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; outline: none;" onkeyup="filterServiceSelectionList()">
        </div>
        <div id="serviceSelectionList"></div>
      </div>
    `;
    document.body.appendChild(subModal);
  }
}

function openAddServiceToTransactionModal() {
  const container = document.getElementById("serviceSelectionList");
  if (!container) return;
  const sortedNames = getSortedServiceNames();
  container.innerHTML = sortedNames.map(name => {
    const srv = servicePrices[name];
    return `
      <div onclick="addServiceToCurrentTransaction('${escapeHTML(name)}')" style="padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <b style="font-size: 14px; color: var(--text);">${escapeHTML(name)}</b>
          <div style="font-size: 12px; color: var(--muted);">${formatRupiah(srv.price)} / ${srv.unit}</div>
        </div>
        <span style="color: var(--primary); font-size: 13px; font-weight: bold;">+ Pilih</span>
      </div>
    `;
  }).join("");
  document.getElementById("addServiceSelectModal").classList.add("show");
}

function closeAddServiceSelectModal() {
  document.getElementById("addServiceSelectModal").classList.remove("show");
}

function addServiceToCurrentTransaction(serviceName) {
  const srv = servicePrices[serviceName];
  if (!srv) return;
  activeNewTransactionItems.push({
    serviceType: serviceName,
    weight: srv.minQty || 1,
    total: (srv.minQty || 1) * srv.price
  });
  closeAddServiceSelectModal();
  renderActiveTransactionItems();
}

function removeActiveTransactionItem(index) {
  activeNewTransactionItems.splice(index, 1);
  renderActiveTransactionItems();
}

function updateActiveItemWeight(index, val) {
  let w = parseFloat(val.replace(',', '.')) || 0;
  activeNewTransactionItems[index].weight = w;
  const srv = servicePrices[activeNewTransactionItems[index].serviceType];
  activeNewTransactionItems[index].total = Math.round(w * (srv ? srv.price : 0));
  
  const itemTotalEl = document.getElementById(`itemTotalDisplay_${index}`);
  if (itemTotalEl) {
    itemTotalEl.textContent = formatRupiah(activeNewTransactionItems[index].total);
  }
  
  const totalDisplay = document.getElementById("transactionTotalDisplay");
  if (totalDisplay) {
    let grandTotal = activeNewTransactionItems.reduce((sum, it) => sum + it.total, 0);
    totalDisplay.textContent = formatRupiah(grandTotal);
  }
}
function renderActiveTransactionItems(rebuild = true) {
  const container = document.getElementById("transactionItemsContainer");
  const totalDisplay = document.getElementById("transactionTotalDisplay");
  if (!container) return;

  if (activeNewTransactionItems.length === 0) {
    container.innerHTML = `<div style="color: var(--muted); font-size: 13px; text-align: center; padding: 15px;" id="emptyItemsText">Belum ada layanan dipilih</div>`;
    if (totalDisplay) totalDisplay.textContent = formatRupiah(0);
    return;
  }

  let grandTotal = 0;
  container.innerHTML = activeNewTransactionItems.map((item, idx) => {
    grandTotal += item.total;
    const srv = servicePrices[item.serviceType];
    return `
      <div style="background: white; border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin-bottom: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <b style="font-size: 13px; color: var(--primary);">${escapeHTML(item.serviceType)}</b>
          <button type="button" onclick="removeActiveTransactionItem(${idx})" style="background: none; border: none; color: #dc2626; font-size: 14px; cursor: pointer;"><i class="fas fa-trash"></i> Hapus</button>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <input type="number" step="any" value="${item.weight}" oninput="updateActiveItemWeight(${idx}, this.value)" style="width: 70px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; font-size: 13px;">
            <span style="font-size: 12px; color: var(--muted);">${srv ? srv.unit : 'kg'}</span>
          </div>
          <b id="itemTotalDisplay_${idx}" style="font-size: 13px; color: var(--text);">${formatRupiah(item.total)}</b>
        </div>
      </div>
    `;
  }).join("");

  if (totalDisplay) totalDisplay.textContent = formatRupiah(grandTotal);
}

function openTransactionModal() {
  activeNewTransactionItems = [];
  setupCustomerAutocomplete();
  renderActiveTransactionItems();
  const modal = document.getElementById("transactionModal");
  if (modal) modal.classList.add("show");
}

function closeTransactionModal() {
  const modal = document.getElementById("transactionModal");
  if (modal) modal.classList.remove("show");
}

function openEditTransactionItem(txId, itemIdx) {
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;
  const items = getTransactionItems(tx);
  const it = items[itemIdx];
  if (!it) return;

  editingTransactionItemContext = { txId, itemIdx };
  const srv = servicePrices[it.serviceType] || { unit: 'kg', price: it.total / (it.weight || 1) };

  document.getElementById("editItemNameLabel").textContent = `${it.serviceType} (${formatRupiah(srv.price)}/${srv.unit})`;
  document.getElementById("editItemUnitLabel").textContent = srv.unit;
  document.getElementById("editItemWeightInput").value = it.weight;
  calculateEditItemPreview();

  document.getElementById("editTransactionItemModal").classList.add("show");
}

function closeEditTransactionItemModal() {
  document.getElementById("editTransactionItemModal").classList.remove("show");
  editingTransactionItemContext = null;
}

function adjustEditItemWeight(delta) {
  const input = document.getElementById("editItemWeightInput");
  let val = parseFloat(input.value) || 0;
  val = Math.max(0.1, val + delta);
  input.value = val;
  calculateEditItemPreview();
}

function calculateEditItemPreview() {
  if (!editingTransactionItemContext) return;
  const tx = transactions.find(t => t.id === editingTransactionItemContext.txId);
  if (!tx) return;
  const items = getTransactionItems(tx);
  const it = items[editingTransactionItemContext.itemIdx];
  const srv = servicePrices[it.serviceType] || { price: it.total / (it.weight || 1) };

  const weight = parseFloat(document.getElementById("editItemWeightInput").value.replace(',', '.')) || 0;
  const total = Math.round(weight * srv.price);
  document.getElementById("editItemTotalPreview").textContent = formatRupiah(total);
}
function saveEditTransactionItem(e) {
  e.preventDefault();
  if (!editingTransactionItemContext) return;
  const { txId, itemIdx } = editingTransactionItemContext;
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;

  const items = getTransactionItems(tx);
  const it = items[itemIdx];
  const srv = servicePrices[it.serviceType] || { price: it.total / (it.weight || 1) };

  const weight = parseFloat(document.getElementById("editItemWeightInput").value.replace(',', '.')) || 1;
  const total = Math.round(weight * srv.price);

  it.weight = weight;
  it.total = total;

  tx.total = items.reduce((sum, item) => sum + item.total, 0);

  saveData();
  renderAll();
  closeEditTransactionItemModal();
  openTransactionDetail(txId);
  showToast("Layanan berhasil diperbarui");
}

function deleteTransactionItem(txId, itemIdx) {
  const tx = transactions.find(t => t.id === txId);
  if (!tx) return;
  const items = getTransactionItems(tx);
  if (items.length <= 1) {
    showToast("Transaksi harus memiliki minimal 1 layanan");
    return;
  }
  if (confirm("Hapus layanan ini dari transaksi?")) {
    items.splice(itemIdx, 1);
    tx.total = items.reduce((sum, item) => sum + item.total, 0);
    saveData();
    renderAll();
    openTransactionDetail(txId);
    showToast("Layanan berhasil dihapus");
  }
}

function openAddServiceToExistingTransactionModal(txId) {
  activeTransactionId = txId;
  const container = document.getElementById("serviceSelectionList");
  if (!container) return;
  const sortedNames = getSortedServiceNames();
  container.innerHTML = sortedNames.map(name => {
    const srv = servicePrices[name];
    return `
      <div onclick="addServiceToExistingTransactionConfirm('${escapeHTML(name)}')" style="padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <b style="font-size: 14px; color: var(--text);">${escapeHTML(name)}</b>
          <div style="font-size: 12px; color: var(--muted);">${formatRupiah(srv.price)} / ${srv.unit}</div>
        </div>
        <span style="color: var(--primary); font-size: 13px; font-weight: bold;">+ Tambah</span>
      </div>
    `;
  }).join("");
  document.getElementById("addServiceSelectModal").classList.add("show");
}

function addServiceToExistingTransactionConfirm(serviceName) {
  const tx = transactions.find(t => t.id === activeTransactionId);
  if (!tx) return;
  const srv = servicePrices[serviceName];
  if (!srv) return;

  const items = getTransactionItems(tx);
  items.push({
    serviceType: serviceName,
    weight: srv.minQty || 1,
    total: (srv.minQty || 1) * srv.price
  });

  tx.total = items.reduce((sum, item) => sum + item.total, 0);

  closeAddServiceSelectModal();
  saveData();
  renderAll();
  openTransactionDetail(activeTransactionId);
  showToast("Layanan berhasil ditambahkan");
}

function setupForm() {
  const form = document.getElementById("transactionForm");
  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();

      const customerName = document.getElementById("customerName").value.trim();
      const statusSelect = document.getElementById("status");

      if (!customerName) {
        showToast("Mohon lengkapi nama pelanggan");
        return;
      }

      if (activeNewTransactionItems.length === 0) {
        showToast("Mohon tambahkan minimal satu layanan laundry");
        return;
      }

      let grandTotal = activeNewTransactionItems.reduce((sum, it) => sum + it.total, 0);
      const status = statusSelect ? statusSelect.value : "Antrian";

      const transactionDate = new Date();
      const firstSrv = servicePrices[activeNewTransactionItems[0].serviceType];
      const estDate = calculateEstimationDate(transactionDate, firstSrv ? firstSrv.duration : "1 Hari");

      const transaction = {
        id: Date.now(),
        customerName: customerName,
        customerPhone: "", 
        serviceType: activeNewTransactionItems[0].serviceType,
        weight: activeNewTransactionItems[0].weight,
        items: JSON.parse(JSON.stringify(activeNewTransactionItems)),
        status: status,
        total: grandTotal,
        date: transactionDate.toISOString(),
        estDate: estDate.toISOString(),
        paymentStatus: "Belum Lunas",
        paidAmount: 0,
        paymentMethod: "-",
        paymentDate: null
      };

      transactions.unshift(transaction);
      transactions = Array.from(new Map(transactions.map(t => [t.id, t])).values());
      saveData();
      form.reset();
      activeNewTransactionItems = [];
      closeTransactionModal();
      renderAll();
      openTransactionDetail(transaction.id);
      showToast("Transaksi berhasil disimpan");
    });
  }

  const cancelForm = document.getElementById("cancelForm");
  if (cancelForm) {
    cancelForm.addEventListener("submit", function(e) {
      e.preventDefault();
      const reason = document.getElementById("cancelReason").value.trim();
      const item = transactions.find(t => t.id === activeTransactionId);
      if (item) {
        item.status = "Batal";
        item.cancelReason = reason;
        saveData();
        renderAll();
        closeCancelModal();
        openTransactionDetail(activeTransactionId);
        showToast("Transaksi berhasil dibatalkan");
      }
    });
  }
}
function renderAll() {
  updateDashboard();
  renderRecentTransactions();
  renderAllTransactions();
  renderCustomers();
  renderServices();
  updateReports();
  filterReportsData();
  setupCustomerAutocomplete();
  removeProElements();
}

function updateDashboard() {
  transactions = Array.from(new Map(transactions.map(t => [t.id, t])).values());
  const todayData = transactions.filter(item => isToday(item.date) && item.status !== "Batal");
  
  const todayValidIncome = transactions
    .filter(item => item.status !== "Batal" && (item.paymentStatus === "Lunas" || (item.paidAmount && item.paidAmount > 0)) && isToday(item.paymentDate || item.date))
    .reduce((sum, item) => sum + (item.paymentStatus === "Lunas" ? item.total : (item.paidAmount || 0)), 0);
  
  const pending = transactions.filter(item => {
    if (item.status === "Batal") return false;
    const st = item.status ? item.status.toLowerCase().trim() : '';
    return st === "antrian" || st === "pending" || st === "proses" || st === "diproses" || st === "siap diambil" || st === "diambil";
  }).length;
  
  const customerMap = new Map();
  transactions.forEach(t => customerMap.set(t.customerName, true));
  savedCustomers.forEach(c => customerMap.set(c.name, true));

  if(document.getElementById("todayIncome")) document.getElementById("todayIncome").textContent = formatRupiah(todayValidIncome);
  if(document.getElementById("todayTransactions")) document.getElementById("todayTransactions").textContent = todayData.length;
  if(document.getElementById("pendingTransactions")) document.getElementById("pendingTransactions").textContent = pending;
  if(document.getElementById("totalCustomers")) document.getElementById("totalCustomers").textContent = customerMap.size;

  setupDashboardInteractions();
}

function transactionHTML(item) {
  const statusClass = item.status ? item.status.toLowerCase().replace(/\s+/g, '-') : 'pending';
  const paymentStatus = item.paymentStatus || 'Belum Lunas';
  const isLunas = paymentStatus === 'Lunas';
  const isDP = paymentStatus === 'DP';
  const payBadgeText = isDP ? `DP (${formatRupiah(item.paidAmount || 0)})` : paymentStatus;
  
  return `
    <div class="transaction-item" onclick="openTransactionDetail(${item.id})" style="cursor: pointer; background: white; margin-top: 10px; border-radius: 13px; padding: 15px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
      <div class="item-main">
        <h3 style="font-size: 15px; color: var(--primary);">TRX/${item.id}</h3>
        <p style="font-weight: bold; color: var(--text); margin-top: 2px;">${escapeHTML(item.customerName)}</p>
        <span class="status status-${statusClass}" style="margin-top: 6px; display: inline-block;">${item.status}</span>
      </div>
      <div class="item-price" style="text-align: right;">
        ${formatRupiah(item.total)}
        <br>
        <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: ${isLunas ? '#dcfce7' : (isDP ? '#fef9c3' : '#fee2e2')}; color: ${isLunas ? '#16a34a' : (isDP ? '#ca8a04' : '#dc2626')}; font-weight: bold; display: inline-block; margin-top: 4px;">
          ${payBadgeText}
        </span>
        <br>
        <small style="color: var(--muted); font-size: 11px;">${formatDate(item.date)}</small>
      </div>
    </div>
  `;
}

function renderRecentTransactions() {
  const element = document.getElementById("recentTransactions");
  if(!element) return;
  const recent = transactions.slice(0, 5);
  if (recent.length === 0) {
    element.innerHTML = `<div class="empty-state">Belum ada transaksi</div>`;
    return;
  }
  element.innerHTML = recent.map(transactionHTML).join("");
}

function filterTransactionsTab(status, element) {
  currentTransactionFilter = status;
  document.querySelectorAll('.trans-tab').forEach(btn => {
    btn.style.background = '#f4f7fb';
    btn.style.color = '#718096';
  });
  element.style.background = '#e1edff';
  element.style.color = '#1769e0';
  renderAllTransactions();
}

function renderAllTransactions() {
  const element = document.getElementById("allTransactions");
  if (!element) return;

  let filtered = transactions;
  
  if (currentTransactionFilter && currentTransactionFilter !== 'Semua') {
    const filterTarget = currentTransactionFilter.toLowerCase().trim();
    filtered = filtered.filter(item => {
      const itemStatus = item.status ? item.status.toLowerCase().trim() : '';
      if (filterTarget === 'antrian') return itemStatus.includes('antrian') || itemStatus.includes('pending');
      if (filterTarget === 'proses') return itemStatus.includes('proses');
      if (filterTarget === 'siap diambil') return itemStatus.includes('siap') || itemStatus.includes('diambil');
      if (filterTarget === 'selesai') return itemStatus.includes('selesai') || itemStatus.includes('lunas');
      if (filterTarget === 'batal') return itemStatus.includes('batal');
      return itemStatus === filterTarget;
    });
  }

  const searchInput = document.getElementById("transactionSearchInput");
  if (searchInput && searchInput.value) {
    const query = searchInput.value.toLowerCase().trim();
    filtered = filtered.filter(item => 
      item.customerName && item.customerName.toLowerCase().includes(query)
    );
  }

  if (filtered.length === 0) {
    element.innerHTML = `<div class="empty-state">Belum ada transaksi pada kategori ini</div>`;
    return;
  }

  element.innerHTML = filtered.map(transactionHTML).join("");
}
function injectCustomerModules() {
  if (!document.getElementById("customerPage")) {
    const div = document.createElement("div");
    div.id = "customerPage";
    div.className = "page";
    div.innerHTML = `
      <div style="padding: 15px; background: white; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border);">
        <button onclick="showPage('dashboardPage')" style="background:none; border:none; font-size:18px; cursor:pointer;"><i class="fas fa-arrow-left"></i></button>
        <h2 style="font-size: 16px; font-weight: bold; color: var(--text);">Daftar Pelanggan</h2>
      </div>
      <div style="padding: 15px;" id="customersListContainer"></div>
    `;
    document.body.appendChild(div);
  }

  if (!document.getElementById("customerDetailPage")) {
    const div = document.createElement("div");
    div.id = "customerDetailPage";
    div.className = "page";
    div.innerHTML = `
      <div style="padding: 15px; background: white; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border);">
        <button onclick="showPage('customerPage')" style="background:none; border:none; font-size:18px; cursor:pointer;"><i class="fas fa-arrow-left"></i></button>
        <h2 id="customerDetailTitle" style="font-size: 16px; font-weight: bold; color: var(--text);">Riwayat Pelanggan</h2>
      </div>
      <div style="padding: 15px;" id="customerDetailContent"></div>
    `;
    document.body.appendChild(div);
  }

  if (!document.getElementById("dashboardDetailPage")) {
    const div = document.createElement("div");
    div.id = "dashboardDetailPage";
    div.className = "page";
    div.innerHTML = `
      <div style="padding: 15px; background: white; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border);">
        <button onclick="showPage('dashboardPage')" style="background:none; border:none; font-size:18px; cursor:pointer;"><i class="fas fa-arrow-left"></i></button>
        <h2 id="dashDetailTitle" style="font-size: 16px; font-weight: bold; color: var(--text);">Rincian</h2>
      </div>
      <div style="padding: 15px;" id="dashDetailContent"></div>
    `;
    document.body.appendChild(div);
  }
}

function injectOutletModule() {
  if (!document.getElementById("outletPage")) {
    const div = document.createElement("div");
    div.id = "outletPage";
    div.className = "page";
    div.innerHTML = `
      <div style="padding: 15px; background: white; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border);">
        <button onclick="showPage('akunPage')" style="background:none; border:none; font-size:18px; cursor:pointer;"><i class="fas fa-arrow-left"></i></button>
        <h2 style="font-size: 16px; font-weight: bold; color: var(--text);">Ubah Data Outlet</h2>
      </div>
      <div style="padding: 15px;">
        <form id="outletForm" onsubmit="saveOutletForm(event)">
          <div style="margin-bottom: 12px;">
            <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">Nama Outlet</label>
            <input type="text" id="outletName" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;" required>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">No. Handphone</label>
            <input type="text" id="outletPhone" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;" required>
          </div>
          <div style="margin-bottom: 12px;">
            <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">Kota/Kabupaten</label>
            <input type="text" id="outletCity" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;" required>
          </div>
          <div style="margin-bottom: 16px;">
            <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">Alamat</label>
            <textarea id="outletAddress" rows="3" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;" required></textarea>
          </div>
          <button type="submit" class="submit-button" style="background: var(--primary); color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer;">Simpan</button>
        </form>
      </div>
    `;
    document.body.appendChild(div);
  }
}

function loadOutletDataUI() {
  if(document.getElementById("outletName")) document.getElementById("outletName").value = arsyOutlet.name;
  if(document.getElementById("outletPhone")) document.getElementById("outletPhone").value = arsyOutlet.phone;
  if(document.getElementById("outletCity")) document.getElementById("outletCity").value = arsyOutlet.city;
  if(document.getElementById("outletAddress")) document.getElementById("outletAddress").value = arsyOutlet.address;
}

function saveOutletForm(e) {
  e.preventDefault();
  arsyOutlet.name = document.getElementById("outletName").value.trim();
  arsyOutlet.phone = document.getElementById("outletPhone").value.trim();
  arsyOutlet.city = document.getElementById("outletCity").value.trim();
  arsyOutlet.address = document.getElementById("outletAddress").value.trim();
  safeStorage.setItem("arsyOutlet", JSON.stringify(arsyOutlet));
  saveData();
  showToast("Data outlet berhasil disimpan");
  showPage('akunPage');
}

function openOutletPage() {
  loadOutletDataUI();
  showPage('outletPage');
}

function setupAkunOutletLink() {
  document.querySelectorAll("div, span, a, li").forEach(el => {
    if (el.textContent.trim() === "Ubah Data Outlet" && !el.dataset.bound) {
      el.dataset.bound = "true";
      el.style.cursor = "pointer";
      el.onclick = () => openOutletPage();
    }
  });
}

function renderCustomers() {
  const container = document.getElementById("customersListContainer");
  if (!container) return;

  const customerMap = new Map();
  savedCustomers.forEach(c => {
    customerMap.set(c.name, { name: c.name, count: 0, totalSpent: 0 });
  });
  transactions.forEach(t => {
    if (!t.customerName) return;
    if (!customerMap.has(t.customerName)) {
      customerMap.set(t.customerName, { name: t.customerName, count: 0, totalSpent: 0 });
    }
    const data = customerMap.get(t.customerName);
    data.count++;
    if (t.status !== "Batal") {
      data.totalSpent += t.total;
    }
  });

  const customers = Array.from(customerMap.values()).sort((a, b) => 
    a.name.localeCompare(b.name, 'id', { sensitivity: 'base' })
  );

  if (customers.length === 0) {
    container.innerHTML = `<div class="empty-state" style="text-align:center; padding:30px; color:var(--muted);">Belum ada data pelanggan</div>`;
    return;
  }

  container.innerHTML = customers.map(c => `
    <div style="background: white; border-radius: 13px; padding: 15px; margin-top: 10px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="openCustomerDetail('${escapeHTML(c.name)}')">
      <div>
        <h3 style="font-size: 15px; font-weight: bold; color: var(--text);">${escapeHTML(c.name)}</h3>
        <p style="font-size: 12px; color: var(--muted); margin-top: 2px;">${c.count} transaksi • Total: ${formatRupiah(c.totalSpent)}</p>
      </div>
      <div style="color: var(--primary); font-size: 13px; font-weight: 500;">Detail &rarr;</div>
    </div>
  `).join("");
}

function openCustomerDetail(name) {
  const titleEl = document.getElementById("customerDetailTitle");
  if (titleEl) titleEl.textContent = `Riwayat: ${name}`;
  
  const contentEl = document.getElementById("customerDetailContent");
  if (!contentEl) return;

  const custTransactions = transactions.filter(t => t.customerName === name);
  const totalSpent = custTransactions.filter(t => t.status !== "Batal").reduce((sum, t) => sum + t.total, 0);

  contentEl.innerHTML = `
    <div style="background: white; padding: 15px; border-radius: 13px; border: 1px solid var(--border); margin-bottom: 16px;">
      <p style="font-size: 12px; color: var(--muted); font-weight: bold;">NAMA PELANGGAN</p>
      <h3 style="font-size: 18px; font-weight: bold; color: var(--primary); margin-top: 4px;">${escapeHTML(name)}</h3>
      <p style="font-size: 13px; color: var(--text); margin-top: 8px;">Total Transaksi: <b>${custTransactions.length}</b></p>
      <p style="font-size: 13px; color: var(--text); margin-top: 4px;">Total Belanja: <b>${formatRupiah(totalSpent)}</b></p>
    </div>
    <h4 style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: var(--text);">Daftar Transaksi</h4>
    ${custTransactions.length === 0 ? '<div class="empty-state">Belum ada transaksi</div>' : custTransactions.map(transactionHTML).join("")}
    
    <button type="button" class="submit-button" style="background: #dc2626; color: white; width: 100%; font-weight: bold; margin-top: 20px; border: none; padding: 12px; border-radius: 8px; cursor: pointer;" onclick="deleteCustomer('${escapeHTML(name)}')">
      <i class="fas fa-trash"></i> Hapus Pelanggan
    </button>
  `;

  showPage("customerDetailPage");
}

function deleteCustomer(name) {
  if (confirm(`Hapus pelanggan "${name}" beserta seluruh riwayat transaksinya?`)) {
    savedCustomers = savedCustomers.filter(c => c.name !== name);
    transactions = transactions.filter(t => t.customerName !== name);
    saveData();
    renderAll();
    showPage('customerPage');
    showToast("Pelanggan berhasil dihapus");
  }
                                                                                                        }
function openDashboardDetail(type) {
  const titleEl = document.getElementById("dashDetailTitle");
  const contentEl = document.getElementById("dashDetailContent");
  if (!contentEl) return;

  let filtered = [];
  let titleText = "";
  let summaryHTML = "";

  if (type === 'omset') {
    titleText = "Rincian Omset Hari Ini";
    filtered = transactions.filter(item => item.status !== "Batal" && (item.paymentStatus === "Lunas" || (item.paidAmount && item.paidAmount > 0)) && isToday(item.paymentDate || item.date));
    let totalOmset = filtered.reduce((sum, item) => sum + (item.paymentStatus === "Lunas" ? item.total : (item.paidAmount || 0)), 0);
    summaryHTML = `
      <div style="background: white; padding: 15px; border-radius: 13px; border: 1px solid var(--border); margin-bottom: 16px;">
        <p style="font-size: 12px; color: var(--muted); font-weight: bold;">RINGKASAN OMSET HARI INI</p>
        <div style="display: flex; justify-content: space-between; margin-top: 8px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
          <span style="font-size: 13px; color: var(--text);">Total Transaksi Bayar:</span>
          <b style="font-size: 13px; color: var(--text);">${filtered.length} Transaksi</b>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 8px;">
          <span style="font-size: 13px; color: var(--text);">Total Pembayaran:</span>
          <b style="font-size: 15px; color: var(--primary);">${formatRupiah(totalOmset)}</b>
        </div>
      </div>
    `;
  } else if (type === 'transaksi') {
    titleText = "Rincian Transaksi Hari Ini";
    filtered = transactions.filter(item => isToday(item.date) && item.status !== "Batal");
    let totalNominal = filtered.reduce((sum, item) => sum + item.total, 0);
    summaryHTML = `
      <div style="background: white; padding: 15px; border-radius: 13px; border: 1px solid var(--border); margin-bottom: 16px;">
        <p style="font-size: 12px; color: var(--muted); font-weight: bold;">RINGKASAN TRANSAKSI HARI INI</p>
        <div style="display: flex; justify-content: space-between; margin-top: 8px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
          <span style="font-size: 13px; color: var(--text);">Total Transaksi:</span>
          <b style="font-size: 13px; color: var(--text);">${filtered.length} Transaksi</b>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 8px;">
          <span style="font-size: 13px; color: var(--text);">Total Pembayaran:</span>
          <b style="font-size: 15px; color: var(--primary);">${formatRupiah(totalNominal)}</b>
        </div>
      </div>
    `;
  } else if (type === 'pending') {
    titleText = "Rincian Belum Selesai";
    filtered = transactions.filter(item => {
      if (item.status === "Batal") return false;
      const st = item.status ? item.status.toLowerCase().trim() : '';
      return st === "antrian" || st === "pending" || st === "proses" || st === "diproses" || st === "siap diambil" || st === "diambil";
    });
    let totalNominal = filtered.reduce((sum, item) => sum + item.total, 0);
    summaryHTML = `
      <div style="background: white; padding: 15px; border-radius: 13px; border: 1px solid var(--border); margin-bottom: 16px;">
        <p style="font-size: 12px; color: var(--muted); font-weight: bold;">RINGKASAN BELUM SELESAI</p>
        <div style="display: flex; justify-content: space-between; margin-top: 8px; border-bottom: 1px solid var(--border); padding-bottom: 8px;">
          <span style="font-size: 13px; color: var(--text);">Total Transaksi:</span>
          <b style="font-size: 13px; color: var(--text);">${filtered.length} Transaksi</b>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 8px;">
          <span style="font-size: 13px; color: var(--text);">Total Pembayaran:</span>
          <b style="font-size: 15px; color: var(--primary);">${formatRupiah(totalNominal)}</b>
        </div>
      </div>
    `;
  }

  if (titleEl) titleEl.textContent = titleText;
  contentEl.innerHTML = `
    ${summaryHTML}
    <h4 style="font-size: 14px; font-weight: bold; margin-bottom: 10px; color: var(--text);">Daftar Transaksi</h4>
    ${filtered.length === 0 ? '<div class="empty-state">Belum ada data transaksi</div>' : filtered.map(transactionHTML).join("")}
  `;

  showPage("dashboardDetailPage");
}

function setupDashboardInteractions() {
  const targets = [
    { id: 'todayIncome', handler: () => openDashboardDetail('omset') },
    { id: 'todayTransactions', handler: () => openDashboardDetail('transaksi') },
    { id: 'pendingTransactions', handler: () => openDashboardDetail('pending') },
    { id: 'totalCustomers', handler: () => showPage('customerPage') }
  ];

  targets.forEach(({ id, handler }) => {
    const el = document.getElementById(id);
    if (!el) return;
    
    const card = el.parentElement.parentElement.children.length <= 3 ? el.parentElement.parentElement : el.parentElement;
    if (card) {
      card.style.cursor = 'pointer';
      card.onclick = (e) => {
        e.stopPropagation();
        handler();
      };
    }
  });
}

function renderServices() {
  const element = document.getElementById("servicesList");
  if(!element) return;
  const sortedNames = getSortedServiceNames();
  element.innerHTML = sortedNames.map(name => {
    const data = servicePrices[name];
    const processStr = data.processes ? data.processes.join(" - ") : "Cuci";
    const pinBadge = data.pinned ? `<span style="font-size: 10px; background: #e1edff; color: var(--primary); padding: 2px 6px; border-radius: 4px; margin-left: 6px; font-weight: bold;">Disematkan</span>` : "";
    return `
      <div class="service-item" style="background: white; border-radius: 13px; padding: 15px; margin-top: 10px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="openEditServiceModal('${escapeHTML(name)}')">
        <div class="item-main">
          <h3 style="font-size: 15px; font-weight: bold; color: var(--text);">${escapeHTML(name)} ${pinBadge}</h3>
          <p style="font-size: 12px; color: var(--muted); margin-top: 2px;">${processStr}</p>
          <small style="color: var(--muted); font-size: 11px;">Min. ${data.minQty || 1} ${data.unit} • ${data.duration || '1 Hari'}</small>
        </div>
        <div class="item-price" style="text-align: right;">
          <b style="color: var(--primary);">${formatRupiah(data.price)} / ${data.unit}</b>
          <br>
          <span style="font-size: 11px; color: var(--primary); font-weight: 500;">Ketuk untuk ubah</span>
        </div>
      </div>
    `;
  }).join("");
}

function injectRichServiceModalHTML() {
  const modalEl = document.getElementById("serviceModal");
  if (!modalEl) return;
  modalEl.innerHTML = `
    <div class="modal-content" style="background: white; padding: 20px; border-radius: 16px; width: 90%; max-width: 400px; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h3 id="serviceModalTitle" style="font-size:18px; font-weight:bold; color:var(--text);">Tambah Layanan</h3>
        <button type="button" onclick="closeServiceModal()" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted);">&times;</button>
      </div>
      <form id="richServiceForm" onsubmit="saveRichService(event)">
        <input type="hidden" id="editServiceOldName" value="">
        
        <div style="margin-bottom:12px;">
          <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:4px; color:var(--text);">Nama Layanan</label>
          <input type="text" id="srvName" placeholder="Contoh: Cuci Kering" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; font-size:14px;" required>
        </div>

        <div style="margin-bottom:12px;">
          <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:6px; color:var(--text);">Proses Laundry</label>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <label style="font-size:13px; display:flex; align-items:center; gap:6px;"><input type="checkbox" name="srvProcess" value="Cuci"> Cuci</label>
            <label style="font-size:13px; display:flex; align-items:center; gap:6px;"><input type="checkbox" name="srvProcess" value="Pengeringan"> Pengeringan</label>
            <label style="font-size:13px; display:flex; align-items:center; gap:6px;"><input type="checkbox" name="srvProcess" value="Setrika"> Setrika</label>
            <label style="font-size:13px; display:flex; align-items:center; gap:6px;"><input type="checkbox" name="srvProcess" value="Lipat"> Lipat</label>
            <label style="font-size:13px; display:flex; align-items:center; gap:6px;"><input type="checkbox" name="srvProcess" value="Packing"> Packing</label>
          </div>
        </div>

        <div style="display:flex; gap:10px; margin-bottom:12px;">
          <div style="flex:1;">
            <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:4px; color:var(--text);">Harga (Rp)</label>
            <input type="number" id="srvPrice" placeholder="0" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; font-size:14px;" required>
          </div>
          <div style="flex:1;">
            <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:4px; color:var(--text);">Satuan</label>
            <select id="srvUnit" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; font-size:14px;">
              <option value="kg">kg</option>
              <option value="pcs">pcs</option>
              <option value="set">set</option>
              <option value="m²">m²</option>
            </select>
          </div>
        </div>

        <div style="display:flex; gap:10px; margin-bottom:12px;">
          <div style="flex:1;">
            <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:4px; color:var(--text);">Durasi</label>
            <input type="text" id="srvDuration" placeholder="Contoh: 1 Hari" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; font-size:14px;">
          </div>
          <div style="flex:1;">
            <label style="font-size:13px; font-weight:bold; display:block; margin-bottom:4px; color:var(--text);">Min. Kuantitas</label>
            <input type="number" id="srvMinQty" value="1" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; font-size:14px;">
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="font-size: 13px; display: flex; align-items: center; gap: 8px; font-weight: bold; cursor: pointer;">
            <input type="checkbox" id="srvPinned" style="width: 18px; height: 18px;"> Sematkan di Urutan Atas (Favorit/Utama)
          </label>
        </div>

        <div style="display:flex; gap:10px;">
          <button type="submit" class="submit-button" style="flex:2; background:var(--primary); color:white; padding:12px; border-radius:8px; font-weight:bold; border:none; cursor:pointer;">Simpan</button>
          <button type="button" id="btnDeleteService" class="submit-button" style="flex:1; background:#dc2626; color:white; padding:12px; border-radius:8px; font-weight:bold; border:none; cursor:pointer; display:none;" onclick="deleteCurrentService()">Hapus</button>
        </div>
      </form>
    </div>
  `;
}
function injectPaymentModalHTML() {
  let modalEl = document.getElementById("paymentModal");
  if (!modalEl) {
    modalEl = document.createElement("div");
    modalEl.id = "paymentModal";
    modalEl.className = "modal";
    document.body.appendChild(modalEl);
  }
  modalEl.innerHTML = `
    <div class="modal-content" style="background: white; padding: 20px; border-radius: 16px; width: 90%; max-width: 400px; max-height: 90vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h3 style="font-size:18px; font-weight:bold; color:var(--text);">Pembayaran</h3>
        <button type="button" onclick="closePaymentModal()" style="background:none; border:none; font-size:22px; cursor:pointer; color:var(--muted);">&times;</button>
      </div>
      <form id="paymentForm">
        <div style="margin-bottom: 12px;">
          <label style="font-size: 13px; color: var(--muted); display: block;">Total Tagihan / Sisa</label>
          <h3 id="payTotalText" style="font-size: 18px; font-weight: bold; color: var(--primary);">Rp 0</h3>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px; color: var(--text);">Status Pembayaran</label>
          <select id="payStatusSelect" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;" onchange="handlePayStatusChange()">
            <option value="DP">DP</option>
            <option value="Lunas">Lunas</option>
          </select>
        </div>

        <div style="margin-bottom: 12px;">
          <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px; color: var(--text);">Metode Pembayaran</label>
          <select id="payMethodSelect" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;">
            <option value="Tunai">Tunai</option>
            <option value="GoPay">GoPay</option>
            <option value="Dana">Dana</option>
            <option value="ShopeePay">ShopeePay</option>
            <option value="QRIS">QRIS</option>
            <option value="Transfer">Transfer</option>
            <option value="Deposit">Deposit</option>
          </select>
        </div>

        <div style="margin-bottom: 12px;" id="payAmountContainer">
          <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px; color: var(--text);">Jumlah Pembayaran (DP)</label>
          <input type="number" id="payAmountInput" placeholder="0" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;">
        </div>

        <button type="submit" class="submit-button" style="background: var(--success); color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer;">Bayar</button>
      </form>
    </div>
  `;
}

function openPaymentModal(id) {
  activeTransactionId = id;
  const item = transactions.find(t => t.id === id);
  if (!item) return;

  const remaining = item.total - (item.paidAmount || 0);
  const payTotalText = document.getElementById("payTotalText");
  if(payTotalText) payTotalText.textContent = formatRupiah(remaining > 0 ? remaining : item.total);

  const payAmountInput = document.getElementById("payAmountInput");
  if(payAmountInput) payAmountInput.value = remaining > 0 ? remaining : item.total;

    const payStatusSelect = document.getElementById("payStatusSelect");
  if(payStatusSelect) {
    payStatusSelect.value = item.paymentStatus || "Belum Lunas";
    handlePayStatusChange();
  }


  const payMethodSelect = document.getElementById("payMethodSelect");
  if (payMethodSelect && item.paymentMethod && item.paymentMethod !== "-") {
    payMethodSelect.value = item.paymentMethod;
  }

  document.getElementById("paymentModal").classList.add("show");
}

function handlePayStatusChange() {
  const status = document.getElementById("payStatusSelect").value;
  const container = document.getElementById("payAmountContainer");
  const item = transactions.find(t => t.id === activeTransactionId);
  if (!item || !container) return;
  const remaining = item.total - (item.paidAmount || 0);

  if (status === "Lunas") {
    container.style.display = "none";
    const payAmountInput = document.getElementById("payAmountInput");
    if(payAmountInput) payAmountInput.value = remaining > 0 ? remaining : item.total;
  } else {
    container.style.display = "block";
    const payAmountInput = document.getElementById("payAmountInput");
    if(payAmountInput) payAmountInput.value = remaining > 0 ? remaining : item.total;
  }
}

function closePaymentModal() {
  document.getElementById("paymentModal").classList.remove("show");
}

document.addEventListener("DOMContentLoaded", function () {
  const payForm = document.getElementById("paymentForm");
  if (payForm) {
    payForm.addEventListener("submit", function (e) {
      e.preventDefault();
      const item = transactions.find(t => t.id === activeTransactionId);
      if (item) {
        const payStatus = document.getElementById("payStatusSelect").value;
        const payMethod = document.getElementById("payMethodSelect").value;
        const inputAmount = Number(document.getElementById("payAmountInput").value) || 0;

        item.paymentMethod = payMethod;

                if (payStatus === "Lunas") {
          item.paidAmount = item.total;
          item.paymentStatus = "Lunas";
          item.paymentDate = new Date().toISOString();
        } else if (payStatus === "Belum Lunas") {
          item.paidAmount = 0;
          item.paymentStatus = "Belum Lunas";
          item.paymentDate = null;
        } else {
          const currentPaid = item.paidAmount || 0;
          item.paidAmount = currentPaid + inputAmount;
          if (item.paidAmount >= item.total) {
            item.paidAmount = item.total;
            item.paymentStatus = "Lunas";
            item.paymentDate = new Date().toISOString();
          } else {
            item.paymentStatus = "DP";
            item.paymentDate = new Date().toISOString();
          }
        }


        saveData();
        renderAll();
        closePaymentModal();
        openTransactionDetail(activeTransactionId);
        showToast("Pembayaran berhasil disimpan");
      }
    });
  }
});

function openServiceModal() {
  const modal = document.getElementById("serviceModal");
  if (!modal) return;
  document.getElementById("serviceModalTitle").textContent = "Tambah Layanan";
  document.getElementById("editServiceOldName").value = "";
  document.getElementById("srvName").value = "";
  document.getElementById("srvPrice").value = "";
  document.getElementById("srvDuration").value = "1 Hari";
  document.getElementById("srvMinQty").value = "1";
  document.getElementById("srvUnit").value = "kg";
  document.getElementById("srvPinned").checked = false;
  document.querySelectorAll("input[name='srvProcess']").forEach(cb => cb.checked = false);
  document.getElementById("btnDeleteService").style.display = "none";
  modal.classList.add("show");
}

function openAddServiceToTransactionModal() {
  const searchInput = document.getElementById("serviceSearchInput");
  if (searchInput) searchInput.value = "";
  
  filterServiceSelectionList();
  document.getElementById("addServiceSelectModal").classList.add("show");
}

function filterServiceSelectionList() {
  const query = document.getElementById("serviceSearchInput") ? document.getElementById("serviceSearchInput").value.toLowerCase().trim() : "";
  const container = document.getElementById("serviceSelectionList");
  if (!container) return;

  const sortedNames = getSortedServiceNames().filter(name => name.toLowerCase().includes(query));
  
  if (sortedNames.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--muted); font-size: 13px;">Layanan tidak ditemukan</div>`;
    return;
  }

  container.innerHTML = sortedNames.map(name => {
    const srv = servicePrices[name];
    return `
      <div onclick="addServiceToCurrentTransaction('${escapeHTML(name)}')" style="padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <b style="font-size: 14px; color: var(--text);">${escapeHTML(name)}</b>
          <div style="font-size: 12px; color: var(--muted);">${formatRupiah(srv.price)} / ${srv.unit}</div>
        </div>
        <span style="color: var(--primary); font-size: 13px; font-weight: bold;">+ Pilih</span>
      </div>
    `;
  }).join("");
}


function openEditServiceModal(name) {
  const srv = servicePrices[name];
  if (!srv) return;
  const modal = document.getElementById("serviceModal");
  if (!modal) return;
  
  document.getElementById("serviceModalTitle").textContent = "Ubah Layanan";
  document.getElementById("editServiceOldName").value = name;
  document.getElementById("srvName").value = name;
  document.getElementById("srvPrice").value = srv.price;
  document.getElementById("srvDuration").value = srv.duration || "1 Hari";
  document.getElementById("srvMinQty").value = srv.minQty || 1;
  document.getElementById("srvUnit").value = srv.unit || "kg";
  document.getElementById("srvPinned").checked = !!srv.pinned;
  
  const processes = srv.processes || [];
  document.querySelectorAll("input[name='srvProcess']").forEach(cb => {
    cb.checked = processes.includes(cb.value);
  });

  document.getElementById("btnDeleteService").style.display = "block";
  modal.classList.add("show");
}

function closeServiceModal() {
  const modal = document.getElementById("serviceModal");
  if (modal) modal.classList.remove("show");
}

function saveRichService(e) {
  e.preventDefault();
  const oldName = document.getElementById("editServiceOldName").value.trim();
  const newName = document.getElementById("srvName").value.trim();
  const price = Number(document.getElementById("srvPrice").value);
  const unit = document.getElementById("srvUnit").value;
  const duration = document.getElementById("srvDuration").value.trim() || "1 Hari";
  const minQty = Number(document.getElementById("srvMinQty").value) || 1;
  const pinned = document.getElementById("srvPinned").checked;
  
  const processOrder = ["Cuci", "Pengeringan", "Setrika", "Lipat", "Packing"];
  const processes = [];
  document.querySelectorAll("input[name='srvProcess']:checked").forEach(cb => {
    processes.push(cb.value);
  });
  processes.sort((a, b) => processOrder.indexOf(a) - processOrder.indexOf(b));

  if (!newName || isNaN(price)) {
    showToast("Mohon lengkapi nama dan harga layanan");
    return;
  }

  if (oldName && oldName !== newName) {
    delete servicePrices[oldName];
  }

  servicePrices[newName] = {
    price: price,
    unit: unit,
    processes: processes,
    duration: duration,
    minQty: minQty,
    pinned: pinned
  };

  saveData();
  renderServices();
  closeServiceModal();
  showToast("Layanan berhasil diperbarui");
}

function deleteCurrentService() {
  const name = document.getElementById("editServiceOldName").value.trim();
  if (!name) return;
  if (confirm(`Hapus layanan "${name}"?`)) {
    delete servicePrices[name];
    saveData();
    renderServices();
    closeServiceModal();
    showToast("Layanan berhasil dihapus");
  }
}

function updateReports() {
  const validTransactions = transactions.filter(item => item.status !== "Batal");
  const totalIncome = validTransactions
    .filter(item => item.paymentStatus === "Lunas" || (item.paidAmount && item.paidAmount > 0))
    .reduce((sum, item) => sum + (item.paymentStatus === "Lunas" ? item.total : (item.paidAmount || 0)), 0);
  const completed = transactions.filter(item => item.status === "Selesai").length;
  const cancelled = transactions.filter(item => item.status === "Batal").length;

  if (document.getElementById("reportIncome")) {
    document.getElementById("reportIncome").textContent = formatRupiah(totalIncome);
    document.getElementById("reportTotal").textContent = validTransactions.length;
    document.getElementById("reportCompleted").textContent = completed;
    document.getElementById("reportCancelled").textContent = cancelled;
  }
}

function injectReportPaymentMethodFilter() {
  const filterContainer = document.querySelector("#reportStatusFilter")?.parentElement?.parentElement || document.querySelector(".filter-container") || document.querySelector("div[style*='padding: 15px']");
  if (!filterContainer || document.getElementById("reportPaymentMethodFilter")) return;

  const wrapper = document.createElement("div");
  wrapper.style.marginBottom = "10px";
  wrapper.innerHTML = `
    <select id="reportPaymentMethodFilter" onchange="filterReportsData()" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px; background: white;">
      <option value="semua">Semua Metode Pembayaran</option>
      <option value="Tunai">Tunai</option>
      <option value="GoPay">GoPay</option>
      <option value="Dana">Dana</option>
      <option value="ShopeePay">ShopeePay</option>
      <option value="QRIS">QRIS</option>
      <option value="Transfer">Transfer</option>
      <option value="Deposit">Deposit</option>
    </select>
  `;
  const statusEl = document.getElementById("reportStatusFilter");
  if (statusEl && statusEl.parentElement) {
    statusEl.parentElement.insertAdjacentElement("beforebegin", wrapper);
    
    statusEl.innerHTML = `
      <option value="semua">Semua Status</option>
      <option value="Belum Lunas">Belum Lunas</option>
      <option value="DP">DP</option>
      <option value="Lunas">Lunas</option>
    `;
  }
}
  function filterReportsData() {
  const startDate = document.getElementById("reportStartDate");
  const endDate = document.getElementById("reportEndDate");
  const statusVal = document.getElementById("reportStatusFilter");
  const methodVal = document.getElementById("reportPaymentMethodFilter");
  if(!startDate || !endDate || !statusVal) return;

  let filtered = transactions.filter(item => {
    let matchStatus = true;
    let matchDate = true;
    let matchMethod = true;
    
    if (currentReportType === 'lunas') {
      if (item.paymentStatus !== 'Lunas') return false;
    } else if (currentReportType === 'selesai') {
      if (item.status.toLowerCase() !== 'selesai') return false;
    } else if (currentReportType === 'batal') {
      if (item.status.toLowerCase() !== 'batal') return false;
    } else {
      if (statusVal.value && statusVal.value !== 'semua') {
        const payStatus = item.paymentStatus || 'Belum Lunas';
        matchStatus = payStatus.toLowerCase() === statusVal.value.toLowerCase();
      }
    }

    if (methodVal && methodVal.value && methodVal.value !== 'semua') {
      matchMethod = item.paymentMethod && item.paymentMethod.toLowerCase() === methodVal.value.toLowerCase();
    }
    
    if (startDate.value || endDate.value) {
      const d = new Date(item.date);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const itemDateStr = `${yyyy}-${mm}-${dd}`;

      if (startDate.value && itemDateStr < startDate.value) matchDate = false;
      if (endDate.value && itemDateStr > endDate.value) matchDate = false;
    }
    
    return matchStatus && matchDate && matchMethod;
  });

  const tbody = document.getElementById("reportTableBody");
  const countSpan = document.getElementById("reportTransactionCount");
  if (countSpan) countSpan.textContent = `${filtered.length} transaksi`;
  const footerEl = document.getElementById("reportSummaryFooter");

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="report-empty">Belum ada data transaksi</div></td></tr>`;
    if (footerEl) footerEl.style.display = "none";
    return;
  }

  const validFiltered = filtered.filter(item => item.status !== "Batal");
  const subtotal = validFiltered.reduce((sum, item) => sum + item.total, 0);
  let unitTotals = {};
  validFiltered.forEach(item => {
    const itemsList = getTransactionItems(item);
    itemsList.forEach(it => {
      const srv = servicePrices[it.serviceType];
      const unit = srv ? srv.unit : "kg";
      unitTotals[unit] = (unitTotals[unit] || 0) + Number(it.weight || 0);
    });
  });

  let unitSummaryText = Object.entries(unitTotals).map(([unit, val]) => `${val} ${unit}`).join(", ");
  let rowsHTML = filtered.map(item => {
    const itemsList = getTransactionItems(item);
    let desc = itemsList.length === 1 ? `${itemsList[0].serviceType} (${itemsList[0].weight})` : `${itemsList.length} layanan`;
    let methodBadge = item.paymentMethod && item.paymentMethod !== "-" ? `<br><small style="color:var(--primary); font-weight:bold;">${escapeHTML(item.paymentMethod)}</small>` : "";
    return `
      <tr onclick="openTransactionDetail(${item.id})" style="cursor: pointer;">
        <td>
          <strong style="display: block; font-size: 14px; color: var(--text);">${escapeHTML(item.customerName)}</strong>
          <small style="color: var(--muted);">${escapeHTML(desc)}</small>
          ${methodBadge}
        </td>
        <td><b>${formatRupiah(item.total)}</b></td>
        <td><span class="report-status ${item.status.toLowerCase().replace(/\s+/g, '-')}">${item.status}</span></td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = rowsHTML;
  if (footerEl) {
    footerEl.style.display = "block";
    footerEl.innerHTML = `
      <p style="font-size: 13px; color: var(--muted); margin-bottom: 4px;">${unitSummaryText || '0 kg'}</p>
      <p style="font-size: 14px; font-weight: bold; color: var(--text); margin-bottom: 6px;">Total (${filtered.length} transaksi)</p>
      <h3 style="font-size: 18px; color: var(--primary); font-weight: bold;">${formatRupiah(subtotal)}</h3>
    `;
  }
}

function exportReport() { window.print(); }

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  const target = document.getElementById(pageId);
  if (target) target.classList.add("active");

  document.querySelectorAll(".nav-button[data-page]").forEach(button => {
    button.classList.remove("active");
    if (button.dataset.page === pageId) button.classList.add("active");
  });
  window.scrollTo(0, 0);
  const menu = document.getElementById("detailMenuDropdown");
  if(menu) menu.style.display = "none";
  if (pageId !== 'reportDetailPage') {
    currentReportType = 'all';
  }
  
  if (pageId === 'transactionsPage') {
    const searchInput = document.getElementById("transactionSearchInput");
    if (searchInput) searchInput.value = "";
    renderAllTransactions();
  }
  
  removeProElements();
}

function openReportDetail(type, title) {
  currentReportType = type || 'all';
  const titleEl = document.getElementById("reportDetailTitle");
  if(titleEl) titleEl.textContent = title;
  showPage("reportDetailPage");
  const statusFilter = document.getElementById("reportStatusFilter");
  if (statusFilter) {
    statusFilter.value = 'semua';
  }
  const methodVal = document.getElementById("reportPaymentMethodFilter");
  if (methodVal) methodVal.value = 'semua';
  filterReportsData();
}

function toggleDetailMenu() {
  const menu = document.getElementById("detailMenuDropdown");
  if (menu) menu.style.display = menu.style.display === "block" ? "none" : "block";
}

function openCancelModal() {
  const menu = document.getElementById("detailMenuDropdown");
  if(menu) menu.style.display = "none";
  document.getElementById("cancelModal").classList.add("show");
}

function closeCancelModal() { document.getElementById("cancelModal").classList.remove("show"); }

function openPrinterSettingModal() {
  document.getElementById("printerSettingModal").classList.add("show");
}
function closePrinterSettingModal() {
  document.getElementById("printerSettingModal").classList.remove("show");
}

function savePrinterSettingsModal() {
  notaSettings.printerName = document.getElementById("inputPrinterName").value;
  safeStorage.setItem("arsyNotaSettings", JSON.stringify(notaSettings));
  closePrinterSettingModal();
  loadNotaSettingsUI();
  showToast("Pengaturan printer disimpan");
}

function disconnectPrinter() {
  showToast("Printer diputus");
  closePrinterSettingModal();
}

function testPrinterConnection() {
  showToast("Printer terhubung & siap mencetak");
}

async function requestBluetoothPrinter() {
  try {
    const device = await navigator.bluetooth.requestDevice({ 
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']
    });
    notaSettings.printerName = device.name || "Bluetooth Printer";
    notaSettings.printerMac = device.id || "60:6E:41:63:65:00";
    safeStorage.setItem("arsyNotaSettings", JSON.stringify(notaSettings));
    loadNotaSettingsUI();
    showToast("Printer berhasil dihubungkan!");
  } catch (err) {
    showToast("Gagal menyambungkan Bluetooth");
  }
}

function openPreviewNotaModal() {
  const sampleItem = transactions.length > 0 ? transactions[0] : {
    id: 26090300999,
    customerName: "aksa putra eryanto",
    items: [{ serviceType: "Bed Cover", weight: 1, total: 25000 }],
    total: 25000,
    paidAmount: 250,
    paymentStatus: "DP",
    paymentMethod: "ShopeePay",
    date: new Date().toISOString(),
    estDate: new Date(Date.now() + 86400000).toISOString(),
    status: "Antrian"
  };

  let html = "";
  if(!notaSettings.hideLogo) html += `<div style="text-align:center; font-weight:bold; font-size:14px;">[ LOGO ${escapeHTML(arsyOutlet.name)} ]</div><br>`;
  
  if(!notaSettings.hideOutlet) html += `<b style="font-size: 18px; display: block;">${escapeHTML(arsyOutlet.name)}</b><span style="font-size: 13px;">${escapeHTML(arsyOutlet.address)}, ${escapeHTML(arsyOutlet.city)}<br>${escapeHTML(arsyOutlet.phone)}</span><br>`;
  
  html += `--------------------------------<br>`;
  
  if(!notaSettings.hideCustomer) html += `<b style="font-size: 16px; display: block;">${escapeHTML(sampleItem.customerName)}</b><br>`;
  
  html += `No. Transaksi: TRX/${sampleItem.id}<br>`;
  html += `Waktu: ${formatDate(sampleItem.date)}<br>`;
  if(!notaSettings.hideCashier) html += `Kasir: Arif<br>`;
  if(notaSettings.showEstDay) html += `Est. Selesai: ${formatDate(getEstDate(sampleItem))}<br>`;
  html += `--------------------------------<br>`;
  html += `<b>Layanan:</b><br>`;
  
  const sampleItems = getTransactionItems(sampleItem);
  sampleItems.forEach(it => {
    html += `${it.serviceType}<br>${it.weight} x ${formatRupiah(it.total / it.weight)} : ${formatRupiah(it.total)}<br>`;
  });

  html += `--------------------------------<br>`;
  html += `<b>Total: ${formatRupiah(sampleItem.total)}</b><br>`;
  
  if (sampleItem.paymentStatus === "DP" && sampleItem.paidAmount > 0) {
    let remaining = sampleItem.total - sampleItem.paidAmount;
    html += `Dibayar (DP): ${formatRupiah(sampleItem.paidAmount)}<br>`;
    html += `Sisa Tagihan: ${formatRupiah(remaining)}<br>`;
  }

  html += `Status: ${sampleItem.paymentStatus || 'Belum Lunas'}<br>`;
  if (sampleItem.paymentMethod && sampleItem.paymentMethod !== "-") {
    html += `Metode Pembayaran: ${escapeHTML(sampleItem.paymentMethod)}<br>`;
  }
  if(!notaSettings.hidePowered) html += `<br><div style="text-align:center; font-size:10px; color:#666;">Powered by ${escapeHTML(arsyOutlet.name)}</div>`;

  document.getElementById("previewNotaBody").innerHTML = html;
  document.getElementById("previewNotaModal").classList.add("show");
}

function closePreviewNotaModal() {
  document.getElementById("previewNotaModal").classList.remove("show");
}

document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", function (event) {
        if (event.target === this) this.classList.remove("show");
    });
});

function showToast(message) {
  const toast = document.getElementById("toast");
  if(!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(function () { toast.classList.remove("show"); }, 2500);
}

function escapeHTML(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
                                                             }
function generateWhatsAppReceiptText(item) {
  let text = "";
  if (!notaSettings.hideLogo) text += `*[ LOGO ${arsyOutlet.name} ]*\n\n`;
  if (!notaSettings.hideOutlet) text += `*${arsyOutlet.name}*\n${arsyOutlet.address}, ${arsyOutlet.city}\n${arsyOutlet.phone}\n`;
  text += `--------------------------------\n`;
  if (!notaSettings.hideCustomer) text += `*Pelanggan: ${item.customerName}*\n`;
  text += `No. Transaksi: TRX/${item.id}\n`;
  text += `Waktu: ${formatDate(item.date)}\n`;
  if (!notaSettings.hideCashier) text += `Kasir: Arif\n`;
  if (notaSettings.showEstDay) text += `Est. Selesai: ${formatDate(getEstDate(item))}\n`;
  text += `--------------------------------\n`;
  text += `*Layanan:*\n`;
  
  const itemsList = getTransactionItems(item);
  itemsList.forEach(it => {
    let berat = Number(it.weight) || 1;
    let hargaPerUnit = it.total / berat;
    text += `${it.serviceType}\n${berat} x ${formatRupiah(hargaPerUnit)} = ${formatRupiah(it.total)}\n`;
  });

  text += `--------------------------------\n`;
  text += `*Total: ${formatRupiah(item.total)}*\n`;
  
  if (item.paymentStatus === "DP" && item.paidAmount > 0) {
    let remaining = item.total - item.paidAmount;
    text += `Dibayar (DP): ${formatRupiah(item.paidAmount)}\n`;
    text += `Sisa Tagihan: ${formatRupiah(remaining)}\n`;
  }

  text += `Status: ${item.paymentStatus || 'Belum Lunas'}\n`;
  if (item.paymentMethod && item.paymentMethod !== "-") {
    text += `Metode Pembayaran: ${item.paymentMethod}\n`;
  }
  if (!notaSettings.hidePowered) text += `\n_Powered by ${arsyOutlet.name}_`;
  return text;
}

function sendWhatsAppReceipt(id) {
  const item = transactions.find(t => t.id === id);
  if (!item) return;
  const text = generateWhatsAppReceiptText(item);
  
  const url = `intent://send?text=${encodeURIComponent(text)}#Intent;package=com.whatsapp.w4b;scheme=whatsapp;end`;
  window.open(url, '_top'); 
}

function openTransactionDetail(id) {
  activeTransactionId = id;
  const item = transactions.find(t => t.id === id);
  if (!item) return;

  const container = document.getElementById("detailContent");
  const isLunas = item.paymentStatus === "Lunas";
  const isDP = item.paymentStatus === "DP";
  const isBatal = item.status === "Batal";
  const remaining = item.total - (item.paidAmount || 0);
  const hideNextButton = (isBatal || item.status === "Selesai") ? "display: none;" : "";

  let batalInfoHTML = "";
  if (isBatal && item.cancelReason) {
    batalInfoHTML = `
      <div class="report-card" style="margin-bottom: 16px; border-left: 4px solid #dc2626;">
        <p class="report-label" style="color: #dc2626;">ALASAN PEMBATALAN</p>
        <p style="margin-top: 4px; font-weight: bold; color: var(--text);">${escapeHTML(item.cancelReason)}</p>
      </div>
    `;
  }

  const transactionItems = getTransactionItems(item);

  let itemsHTML = transactionItems.map((it, idx) => {
    const unitPrice = it.weight ? (it.total / it.weight) : it.total;
    const srv = servicePrices[it.serviceType] || { unit: 'kg' };
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; padding-bottom: 10px; border-bottom: 1px solid var(--border);">
        <div>
          <strong>${escapeHTML(it.serviceType)}</strong>
          <p style="font-size: 12px; color: var(--muted);">${it.weight} ${srv.unit} x ${formatRupiah(unitPrice)} : <b>${formatRupiah(it.total)}</b></p>
        </div>
        <div style="display: flex; gap: 8px;">
          <button type="button" onclick="openEditTransactionItem(${item.id}, ${idx})" style="background: #e1edff; color: var(--primary); border: none; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i class="fas fa-edit"></i></button>
          <button type="button" onclick="deleteTransactionItem(${item.id}, ${idx})" style="background: #fee2e2; color: #dc2626; border: none; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center;"><i class="fas fa-trash"></i></button>
        </div>
      </div>
    `;
  }).join("");

  container.innerHTML = `
    <div class="report-card" style="margin-bottom: 16px;">
      <p><b>No. Transaksi:</b> TRX/${item.id}</p>
      <p><b>Status Pengerjaan:</b> <span class="report-status ${item.status.toLowerCase().replace(/\s+/g, '-')}">${item.status}</span></p>
      <p><b>Kasir:</b> Arif</p>
      <p><b>Estimasi Selesai:</b> ${formatDate(getEstDate(item))}</p>
    </div>

    ${batalInfoHTML}

    <div class="report-card" style="margin-bottom: 16px;">
      <p class="report-label">INFO PELANGGAN</p>
      <strong style="font-size: 16px; color: var(--primary);">${escapeHTML(item.customerName)}</strong>
    </div>

    <div class="report-card" style="margin-bottom: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <p class="report-label" style="margin: 0;">LAYANAN LAUNDRY</p>
        <button type="button" onclick="openAddServiceToExistingTransactionModal(${item.id})" style="background: #e1edff; color: var(--primary); border: none; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer;">+ Tambah Layanan</button>
      </div>
      ${itemsHTML}
    </div>

    <button type="button" class="submit-button" style="margin-bottom: 12px; background: ${getItemNextButtonColor(item.status)}; ${hideNextButton}" onclick="proceedNextStatus(${item.id})">
      ${getItemNextButtonText(item.status)}
    </button>

    <div class="report-card" style="margin-bottom: 16px;">
      <p class="report-label">INFO PEMBAYARAN</p>
      <div style="display: flex; justify-content: space-between; margin: 6px 0;">
        <span>Total Transaksi</span>
        <b>${formatRupiah(item.total)}</b>
      </div>
      ${isDP ? `
      <div style="display: flex; justify-content: space-between; margin: 6px 0;">
        <span>Jumlah Dibayar (DP)</span>
        <b>${formatRupiah(item.paidAmount || 0)}</b>
      </div>
      <div style="display: flex; justify-content: space-between; margin: 6px 0;">
        <span>Sisa Tagihan</span>
        <b style="color: #dc2626;">${formatRupiah(remaining)}</b>
      </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; margin: 6px 0;">
        <span>Status Pembayaran</span>
        <span class="report-status ${isLunas ? 'lunas' : 'pending'}">${isDP ? 'DP' : (item.paymentStatus || 'Belum Lunas')}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin: 6px 0;">
        <span>Metode Pembayaran</span>
        <b>${escapeHTML(item.paymentMethod || '-')}</b>
      </div>
    </div>

        <button type="button" class="submit-button" style="background: var(--success); margin-bottom: 12px;" onclick="openPaymentModal(${item.id})">
      Bayar
    </button>

    ${(isLunas || isDP) ? `
    <button type="button" class="submit-button" style="background: #dc2626; margin-bottom: 12px;" onclick="openCancelPaymentModal(${item.id})">
      Batalkan Pembayaran
    </button>` : ''}


    <div style="display: flex; gap: 10px; margin-bottom: 10px;">
      <button type="button" class="submit-button" style="flex: 1; background: #475569;" onclick="printReceipt(${item.id})">Cetak Nota</button>
      <button type="button" class="submit-button" style="flex: 1; background: #475569;" onclick="printReceipt(${item.id})">Cetak Label</button>
    </div>
    <button type="button" class="submit-button" style="background: #25d366; color: white; width: 100%; font-weight: bold;" onclick="sendWhatsAppReceipt(${item.id})">
      <i class="fab fa-whatsapp"></i> Kirim Nota WhatsApp
    </button>
  `;

  showPage("transactionDetailPage");
}

async function printReceipt(id) {
  const item = transactions.find(t => t.id === id);
  if (!item) return;

  try {
    showToast("Pilih printer Bluetooth...");
    
    const device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2']
    });

    const server = await device.gatt.connect();
    const services = await server.getPrimaryServices();
    let characteristic = null;

    for (const service of services) {
      const chars = await service.getCharacteristics();
      for (const char of chars) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          characteristic = char;
          break;
        }
      }
      if (characteristic) break;
    }

    if (!characteristic) {
      throw new Error("Karakteristik printer tidak ditemukan");
    }

    let encoder = new TextEncoder();
    let commands = [];

    commands.push(new Uint8Array([0x1B, 0x40]));
    commands.push(new Uint8Array([0x1B, 0x61, 0x01])); 
    
    if (!notaSettings.hideLogo) {
      commands.push(encoder.encode(`[ LOGO ${arsyOutlet.name} ]\n\n`));
    }

    if (!notaSettings.hideOutlet) {
      commands.push(new Uint8Array([0x1D, 0x21, 0x11])); 
      commands.push(encoder.encode(arsyOutlet.name + "\n"));
      commands.push(new Uint8Array([0x1D, 0x21, 0x00])); 
    }

    if (!notaSettings.hideAddress) {
      commands.push(encoder.encode(`${arsyOutlet.address}, ${arsyOutlet.city}\n`));
      commands.push(encoder.encode(arsyOutlet.phone + "\n"));
    }

    if (!notaSettings.hideOutlet || !notaSettings.hideAddress) {
      commands.push(encoder.encode("--------------------------------\n"));
    }

    commands.push(new Uint8Array([0x1B, 0x61, 0x00])); 
    
    if (!notaSettings.hideCustomer) {
      commands.push(new Uint8Array([0x1D, 0x21, 0x11]));
      commands.push(encoder.encode(`${item.customerName}\n`));
      commands.push(new Uint8Array([0x1D, 0x21, 0x00]));
    }
    
    commands.push(encoder.encode(`No. Transaksi: TRX/${item.id}\n`));
    commands.push(encoder.encode(`Waktu: ${formatDate(item.date)}\n`));
    
    if (!notaSettings.hideCashier) {
      commands.push(encoder.encode(`Kasir: Arif\n`));
    }

    if (notaSettings.showEstDay) {
      commands.push(encoder.encode(`Est. Selesai: ${formatDate(getEstDate(item))}\n`));
    }

    commands.push(encoder.encode("--------------------------------\n"));
    commands.push(encoder.encode("Layanan:\n"));

    const receiptItems = getTransactionItems(item);
    receiptItems.forEach(it => {
      commands.push(encoder.encode(`${it.serviceType}\n`));
      let berat = Number(it.weight) || 1;
      let hargaPerUnit = it.total / berat;
      commands.push(encoder.encode(`${berat} x ${formatRupiah(hargaPerUnit)} : ${formatRupiah(item.total)}\n`));
    });
    
    commands.push(encoder.encode("--------------------------------\n"));

    commands.push(new Uint8Array([0x1B, 0x45, 0x01])); 
    commands.push(encoder.encode(`Total: ${formatRupiah(item.total)}\n`));

    if (item.paymentStatus === "DP" && item.paidAmount > 0) {
      let remaining = item.total - item.paidAmount;
      commands.push(encoder.encode(`Dibayar (DP): ${formatRupiah(item.paidAmount)}\n`));
      commands.push(encoder.encode(`Sisa Tagihan: ${formatRupiah(remaining)}\n`));
    }

    commands.push(new Uint8Array([0x1B, 0x45, 0x00])); 
    commands.push(encoder.encode(`Status: ${item.paymentStatus || 'Belum Lunas'}\n`));
    if (item.paymentMethod && item.paymentMethod !== "-") {
      commands.push(encoder.encode(`Metode Pembayaran: ${item.paymentMethod}\n`));
    }
    
    commands.push(new Uint8Array([0x1B, 0x61, 0x01])); 
    if (!notaSettings.hidePowered) {
      commands.push(encoder.encode(`\nPowered by ${arsyOutlet.name}\n`));
    }
    commands.push(encoder.encode("\n\n\n")); 

    let totalLength = commands.reduce((acc, arr) => acc + arr.length, 0);
    let payload = new Uint8Array(totalLength);
    let offset = 0;
    for (let cmd of commands) {
      payload.set(cmd, offset);
      offset += cmd.length;
    }

    let maxChunk = 100;
    for (let i = 0; i < payload.length; i += maxChunk) {
      let chunk = payload.slice(i, i + maxChunk);
      await characteristic.writeValue(chunk);
      await new Promise(resolve => setTimeout(resolve, 50)); 
    }

    showToast("Nota berhasil dicetak penuh!");
    server.disconnect();

  } catch (error) {
    console.error(error);
    showToast("Gagal mencetak: Pilih printer Bluetooth terlebih dahulu");
  }
}

function getItemNextButtonText(status) {
  const st = status ? status.toLowerCase().trim() : '';
  if (st === "antrian" || st === "pending") return "Proses Transaksi";
  if (st === "proses" || st === "diproses") return "Transaksi Siap Diambil";
  if (st.includes("siap") || st.includes("ambil")) return "Selesaikan Transaksi";
  return "Selesai";
}

function getItemNextButtonColor(status) {
  const st = status ? status.toLowerCase().trim() : '';
  if (st === "antrian" || st === "pending") return "#287be8"; 
  if (st === "proses" || st === "diproses") return "#f59e0b"; 
  if (st.includes("siap") || st.includes("ambil")) return "#159447"; 
  return "#718096"; 
}

function proceedNextStatus(id) {
  const item = transactions.find(t => t.id === id);
  if (!item) return;

  const st = item.status ? item.status.toLowerCase().trim() : '';
  if (st === "antrian" || st === "pending") item.status = "Proses";
  else if (st === "proses" || st === "diproses") item.status = "Siap Diambil";
  else if (st.includes("siap") || st.includes("ambil")) item.status = "Selesai";
  else return;

  saveData();
  renderAll();
  openTransactionDetail(id);
  showToast("Status diperbarui: " + item.status);
}

function injectLoginModal() {
  if (document.getElementById("loginScreen")) return;
  const isLoggedIn = safeStorage.getItem("arsyIsLoggedIn") === "true";
  
  const div = document.createElement("div");
  div.id = "loginScreen";
  div.style.cssText = `position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: #f8fafc; z-index: 99999; display: ${isLoggedIn ? 'none' : 'flex'}; justify-content: center; align-items: center; padding: 20px;`;
  div.innerHTML = `
    <div style="background: white; padding: 25px; border-radius: 16px; width: 100%; max-width: 360px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); text-align: center;">
      <h2 style="font-size: 20px; font-weight: bold; color: var(--text); margin-bottom: 6px;">Arsy Laundry</h2>
      <p style="font-size: 13px; color: var(--muted); margin-bottom: 20px;">Masukkan PIN rahasia untuk masuk</p>
      <input type="password" id="pinInput" placeholder="PIN" style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; font-size: 16px; text-align: center; letter-spacing: 4px; margin-bottom: 15px;" maxlength="6">
      <button onclick="verifyPin()" style="background: #1769e0; color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; font-size: 14px;">Masuk</button>
    </div>
  `;
  document.body.appendChild(div);
}

function verifyPin() {
  const pinInputEl = document.getElementById("pinInput") || document.getElementById("pinInput5");
  const pin = pinInputEl ? pinInputEl.value.trim() : "";
  const RAHASIA_PIN = "1985";
  
  if (pin === RAHASIA_PIN) {
    safeStorage.setItem("arsyIsLoggedIn", "true");
    const screen = document.getElementById("loginScreen");
    if(screen) screen.style.display = "none";
    showToast("Login berhasil");
  } else {
    showToast("PIN salah!");
  }
      }
function openCancelPaymentModal(id) {
  activeTransactionId = id;
  const item = transactions.find(t => t.id === id);
  if (!item) return;
  
  if (confirm("Batalkan pembayaran untuk transaksi ini? Status akan kembali menjadi Belum Lunas.")) {
    item.paymentStatus = "Belum Lunas";
    item.paidAmount = 0;
    item.paymentMethod = "-";
    item.paymentDate = null;
    
    saveData();
    renderAll();
    openTransactionDetail(id);
    showToast("Pembayaran berhasil dibatalkan");
  }
}

function openAddServiceToTransactionModal() {
  const searchInput = document.getElementById("serviceSearchInput");
  if (searchInput) {
    searchInput.value = "";
  }
  
  const modal = document.getElementById("addServiceSelectModal");
  if (modal) {
    modal.classList.add("show");
    if (typeof filterServiceSelectionList === "function") {
      filterServiceSelectionList();
    }
  }
}

function filterServiceSelectionList() {
  try {
    const searchInput = document.getElementById("serviceSearchInput");
    const query = searchInput && searchInput.value ? searchInput.value.toLowerCase().trim() : "";
    const container = document.getElementById("serviceSelectionList");
    if (!container) return;

    const pricesObj = typeof servicePrices !== "undefined" ? servicePrices : {};
    const names = Object.keys(pricesObj);
    const sortedNames = names.filter(name => name.toLowerCase().includes(query));

    if (sortedNames.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 20px; color: #888; font-size: 13px;">Layanan tidak ditemukan</div>`;
      return;
    }

    container.innerHTML = sortedNames.map(name => {
      const srv = pricesObj[name] || {};
      const priceStr = typeof formatRupiah === "function" ? formatRupiah(srv.price || 0) : (srv.price || 0);
      return `
        <div onclick="addServiceToCurrentTransaction('${name.replace(/'/g, "\\'")}')" style="padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <b style="font-size: 14px; color: #333;">${name}</b>
            <div style="font-size: 12px; color: #666;">${priceStr} / ${srv.unit || ''}</div>
          </div>
          <span style="color: #007bff; font-size: 13px; font-weight: bold;">+ Pilih</span>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("Filter error:", err);
  }
}
