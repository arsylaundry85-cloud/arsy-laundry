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
      transactions = cloudData.transactions;
      safeStorage.setItem("arsyTransactions", JSON.stringify(transactions));
      savedCustomers = cloudData.customers || [];
      if (cloudData.services) { servicePrices = cloudData.services; safeStorage.setItem("arsyServices", JSON.stringify(servicePrices)); }
      if (cloudData.outlet) { arsyOutlet = cloudData.outlet; safeStorage.setItem("arsyOutlet", JSON.stringify(arsyOutlet)); }
      if (cloudData.notaSettings) { notaSettings = cloudData.notaSettings; safeStorage.setItem("arsyNotaSettings", JSON.stringify(notaSettings)); }
      renderAll();
    }
  } catch (err) {
    console.log("Menggunakan data lokal.");
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

function setupTransactionSearch() {
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
}

async function saveData() {
  transactions = Array.from(new Map(transactions.map(t => [t.id, t])).values());
  safeStorage.setItem("arsyTransactions", JSON.stringify(transactions));
  const payload = { action: "saveAll", transactions, customers: savedCustomers, services: servicePrices, outlet: arsyOutlet, notaSettings };
  try {
    await fetch(WEB_APP_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(JSON.stringify(payload))
    });
  } catch (err) {}
}

function formatRupiah(number) { return "Rp " + Number(number).toLocaleString("id-ID"); }
function formatDate(date) { return new Date(date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }

function calculateEstimationDate(dateStr, durationStr) {
  let date = new Date(dateStr);
  let lower = String(durationStr || "1 Hari").toLowerCase();
  let num = parseInt(lower) || 1;
  if (lower.includes("hari") || lower.includes("day")) date.setDate(date.getDate() + num);
  else if (lower.includes("jam")) date.setTime(date.getTime() + num * 3600 * 1000);
  else date.setDate(date.getDate() + num);
  return date;
}

function getEstDate(item) {
  if (item.estDate) return item.estDate;
  const itemsList = getTransactionItems(item);
  const firstSrv = itemsList.length > 0 ? servicePrices[itemsList[0].serviceType] : null;
  return calculateEstimationDate(item.date, firstSrv ? firstSrv.duration : "1 Hari").toISOString();
}

function getTransactionItems(item) {
  if (item.items && Array.isArray(item.items) && item.items.length > 0) return item.items;
  return [{ serviceType: item.serviceType || "Cuci Kering", weight: item.weight || 1, total: item.total || 0 }];
}

function isToday(date) {
  if (!date) return false;
  return new Date().toDateString() === new Date(date).toDateString();
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
    if (pinA !== pinB) return pinB - pinA;
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
        <h3 style="font-size:18px; font-weight:bold;">Transaksi Baru</h3>
        <button type="button" onclick="closeTransactionModal()" style="background:none; border:none; font-size:22px; cursor:pointer;">&times;</button>
      </div>
      <form id="transactionForm">
        <div style="margin-bottom: 12px;">
          <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">Nama Pelanggan</label>
          <input type="text" id="customerName" placeholder="Contoh: Budi" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;" required autocomplete="off">
        </div>
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <label style="font-size: 13px; font-weight: bold;">Layanan Laundry</label>
            <button type="button" onclick="openAddServiceToTransactionModal()" style="background: #e1edff; color: var(--primary); border: none; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer;">+ Tambah Layanan</button>
          </div>
          <div id="transactionItemsContainer" style="border: 1px solid var(--border); border-radius: 8px; padding: 10px; background: #f8fafc; min-height: 70px;">
            <div style="color: var(--muted); font-size: 13px; text-align: center; padding: 15px;">Belum ada layanan dipilih</div>
          </div>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">Status</label>
          <select id="status" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;">
            <option value="Antrian">Antrian</option>
            <option value="Proses">Proses</option>
            <option value="Siap Diambil">Siap Diambil</option>
            <option value="Selesai">Selesai</option>
          </select>
        </div>
        <div style="background: #f8fafc; padding: 12px; border-radius: 8px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-weight: bold; font-size: 14px;">Total</span>
          <b id="transactionTotalDisplay" style="color: var(--primary); font-size: 16px;">Rp 0</b>
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
          <h3 style="font-size:16px; font-weight:bold;">Pilih Layanan</h3>
          <button type="button" onclick="closeAddServiceSelectModal()" style="background:none; border:none; font-size:20px; cursor:pointer;">&times;</button>
        </div>
        <div id="serviceSelectionList"></div>
      </div>
    `;
    document.body.appendChild(subModal);
  }
}

function injectEditTransactionItemModalHTML() {
  if (document.getElementById("editTransactionItemModal")) return;
  const modal = document.createElement("div");
  modal.id = "editTransactionItemModal";
  modal.className = "modal";
  modal.innerHTML = `
    <div class="modal-content" style="background: white; padding: 20px; border-radius: 16px; width: 90%; max-width: 360px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h3 style="font-size:18px; font-weight:bold;">Ubah Layanan</h3>
        <button type="button" onclick="closeEditTransactionItemModal()" style="background:none; border:none; font-size:22px; cursor:pointer;">&times;</button>
      </div>
      <form id="editTransactionItemForm" onsubmit="saveEditTransactionItem(event)">
        <div style="margin-bottom: 12px;"><label style="font-size: 13px; color: var(--muted);" id="editItemNameLabel">Layanan</label></div>
        <div style="margin-bottom: 16px;">
          <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">Berat / Jumlah (<span id="editItemUnitLabel">kg</span>)</label>
          <input type="number" step="any" id="editItemWeightInput" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 16px; text-align: center;" required>
        </div>
        <button type="submit" class="submit-button">Simpan</button>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
}

function openAddServiceToTransactionModal() {
  const container = document.getElementById("serviceSelectionList");
  if (!container) return;
  container.innerHTML = getSortedServiceNames().map(name => {
    const srv = servicePrices[name];
    return `
      <div onclick="addServiceToCurrentTransaction('${escapeHTML(name)}')" style="padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
        <div><b>${escapeHTML(name)}</b><div style="font-size: 12px; color: var(--muted);">${formatRupiah(srv.price)} / ${srv.unit}</div></div>
        <span style="color: var(--primary); font-size: 13px; font-weight: bold;">+ Pilih</span>
      </div>
    `;
  }).join("");
  document.getElementById("addServiceSelectModal").classList.add("show");
}

function closeAddServiceSelectModal() { document.getElementById("addServiceSelectModal").classList.remove("show"); }

function addServiceToCurrentTransaction(serviceName) {
  const srv = servicePrices[serviceName];
  if (!srv) return;
  activeNewTransactionItems.push({ serviceType: serviceName, weight: srv.minQty || 1, total: (srv.minQty || 1) * srv.price });
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
  renderActiveTransactionItems(false);
}

function renderActiveTransactionItems() {
  const container = document.getElementById("transactionItemsContainer");
  const totalDisplay = document.getElementById("transactionTotalDisplay");
  if (!container) return;

  if (activeNewTransactionItems.length === 0) {
    container.innerHTML = `<div style="color: var(--muted); font-size: 13px; text-align: center; padding: 15px;">Belum ada layanan dipilih</div>`;
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
          <button type="button" onclick="removeActiveTransactionItem(${idx})" style="background: none; border: none; color: #dc2626; font-size: 13px; cursor: pointer;">Hapus</button>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <input type="number" step="any" value="${item.weight}" oninput="updateActiveItemWeight(${idx}, this.value)" style="width: 80px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px;">
          <b style="font-size: 13px;">${formatRupiah(item.total)}</b>
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
  document.getElementById("transactionModal").classList.add("show");
}

function closeTransactionModal() { document.getElementById("transactionModal").classList.remove("show"); }

function setupForm() {
  const form = document.getElementById("transactionForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const customerName = document.getElementById("customerName").value.trim();
      if (!customerName || activeNewTransactionItems.length === 0) return;

      const grandTotal = activeNewTransactionItems.reduce((sum, it) => sum + it.total, 0);
      const transaction = {
        id: Date.now(),
        customerName,
        items: JSON.parse(JSON.stringify(activeNewTransactionItems)),
        status: document.getElementById("status").value,
        total: grandTotal,
        date: new Date().toISOString(),
        paymentStatus: "Belum Lunas",
        paidAmount: 0,
        paymentMethod: "-"
      };

      transactions.unshift(transaction);
      saveData();
      form.reset();
      activeNewTransactionItems = [];
      closeTransactionModal();
      renderAll();
      openTransactionDetail(transaction.id);
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
}

function updateDashboard() {
  transactions = Array.from(new Map(transactions.map(t => [t.id, t])).values());
  const todayData = transactions.filter(item => isToday(item.date) && item.status !== "Batal");
  cons
