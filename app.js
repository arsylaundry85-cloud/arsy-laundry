const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzzMrj1YcdLvgaBr_fNBAEjHYynN16Zf8iAf34wXldx6m-y08Hb9phvWy6hfiZilctedA/exec";

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
let arsyOutlet = getSafeData("arsyOutlet", { name: "Arsy Laundry", phone: "6281282466642", city: "Kota Surabaya", address: "Jl. Dukuh Kupang, Gg. Lebar, No.76" });
let notaSettings = getSafeData("arsyNotaSettings", { hideLogo: false, hideOutlet: false, hideAddress: false, hideCashier: false, hideCustomer: false, showCategory: false, hideMessage: false, hideParfum: false, hidePowered: false, showEstDay: true, printerName: "RPPO2N", printerMac: "60:6E:41:63:65:00", paperSize: "58" });

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
    renderAll();
  }
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

function formatRupiah(number) { return "Rp " + Number(number).toLocaleString("id-ID"); }
function formatDate(date) { return new Date(date).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }); }

function calculateEstimationDate(dateStr, durationStr) {
  let date = new Date(dateStr);
  if (!durationStr) { date.setDate(date.getDate() + 1); return date; }
  let lower = String(durationStr).toLowerCase();
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

function getSortedServiceNames() {
  return Object.keys(servicePrices).sort((a, b) => {
    let pinA = servicePrices[a].pinned ? 1 : 0;
    let pinB = servicePrices[b].pinned ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    return a.localeCompare(b, 'id', { sensitivity: 'base' });
  });
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
        <button type="submit" class="submit-button" style="background: var(--primary); color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer;">Simpan Transaksi</button>
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
        <button type="submit" class="submit-button" style="background: var(--primary); color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer;">Simpan</button>
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
  renderActiveTransactionItems();
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
  renderActiveTransactionItems();
  document.getElementById("transactionModal").classList.add("show");
}

function closeTransactionModal() { document.getElementById("transactionModal").classList.remove("show"); }

function injectCustomerModules() {
  if (!document.getElementById("customerPage")) {
    const div = document.createElement("div");
    div.id = "customerPage";
    div.className = "page";
    div.innerHTML = `<div style="padding: 15px; background: white; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border);"><button onclick="showPage('dashboardPage')" style="background:none; border:none; font-size:18px; cursor:pointer;"><i class="fas fa-arrow-left"></i></button><h2 style="font-size: 16px; font-weight: bold;">Daftar Pelanggan</h2></div><div style="padding: 15px;" id="customersListContainer"></div>`;
    document.body.appendChild(div);
  }
}

function injectOutletModule() {
  if (!document.getElementById("outletPage")) {
    const div = document.createElement("div");
    div.id = "outletPage";
    div.className = "page";
    div.innerHTML = `<div style="padding: 15px; background: white; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border);"><button onclick="showPage('akunPage')" style="background:none; border:none; font-size:18px; cursor:pointer;"><i class="fas fa-arrow-left"></i></button><h2 style="font-size: 16px; font-weight: bold;">Ubah Data Outlet</h2></div><div style="padding: 15px;"><form id="outletForm" onsubmit="saveOutletForm(event)"><div style="margin-bottom: 12px;"><label style="font-size: 13px; font-weight: bold;">Nama Outlet</label><input type="text" id="outletName" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px;" required></div><button type="submit" class="submit-button" style="background: var(--primary); color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer;">Simpan</button></form></div>`;
    document.body.appendChild(div);
  }
}

function saveOutletForm(e) {
  e.preventDefault();
  arsyOutlet.name = document.getElementById("outletName").value.trim();
  safeStorage.setItem("arsyOutlet", JSON.stringify(arsyOutlet));
  saveData();
  showToast("Outlet disimpan");
  showPage('akunPage');
}

function openOutletPage() {
  if(document.getElementById("outletName")) document.getElementById("outletName").value = arsyOutlet.name;
  showPage('outletPage');
}

function setupAkunOutletLink() {
  document.querySelectorAll("div, span, a, li").forEach(el => {
    if (el.textContent.trim() === "Ubah Data Outlet" && !el.dataset.bound) {
      el.dataset.bound = "true";
      el.onclick = () => openOutletPage();
    }
  });
                                                     }
function saveServicesData() {
  safeStorage.setItem("arsyServices", JSON.stringify(servicePrices));
  saveData(); // <--- FIX UTAMA: Otomatis sinkron dan simpan permanen ke Google Sheet/Cloud
}

function renderServices() {
  const element = document.getElementById("servicesList");
  if(!element) return;
  const sortedNames = getSortedServiceNames();
  element.innerHTML = sortedNames.map(name => {
    const data = servicePrices[name];
    return `
      <div style="background: white; border-radius: 13px; padding: 15px; margin-top: 10px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="openEditServiceModal('${escapeHTML(name)}')">
        <div><b>${escapeHTML(name)}</b><br><small style="color:var(--muted);">${formatRupiah(data.price)} / ${data.unit}</small></div>
        <span style="font-size: 11px; color: var(--primary); font-weight: 500;">Ubah</span>
      </div>
    `;
  }).join("");
}

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
  document.querySelectorAll("input[name='srvProcess']").forEach(cb => {
    cb.checked = (srv.processes || []).includes(cb.value);
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
  
  const processes = [];
  document.querySelectorAll("input[name='srvProcess']:checked").forEach(cb => {
    processes.push(cb.value);
  });

  if (!newName || isNaN(price)) return;
  if (oldName && oldName !== newName) delete servicePrices[oldName];

  servicePrices[newName] = { price, unit, processes, duration, minQty, pinned };
  saveServicesData(); // Memanggil fungsi save yang sudah mencakup sinkronisasi Cloud
  renderServices();
  closeServiceModal();
  showToast("Layanan berhasil disimpan");
}

function deleteCurrentService() {
  const name = document.getElementById("editServiceOldName").value.trim();
  if (!name) return;
  if (confirm(`Hapus layanan "${name}"?`)) {
    delete servicePrices[name];
    saveServicesData();
    renderServices();
    closeServiceModal();
    showToast("Layanan dihapus");
  }
}

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
    });
  }
}

function renderAll() {
  updateDashboard();
  renderRecentTransactions();
  renderAllTransactions();
  renderServices();
  removeProElements();
}

function updateDashboard() {
  transactions = Array.from(new Map(transactions.map(t => [t.id, t])).values());
  const todayData = transactions.filter(item => isToday(item.date) && item.status !== "Batal");
  const todayValidIncome = transactions
    .filter(item => item.status !== "Batal" && (item.paymentStatus === "Lunas" || item.paidAmount > 0) && isToday(item.paymentDate || item.date))
    .reduce((sum, item) => sum + (item.paymentStatus === "Lunas" ? item.total : item.paidAmount), 0);
  const pending = transactions.filter(item => item.status !== "Batal" && !item.status.toLowerCase().includes("selesai")).length;
  
  const customerMap = new Map();
  transactions.forEach(t => customerMap.set(t.customerName, true));

  if(document.getElementById("todayIncome")) document.getElementById("todayIncome").textContent = formatRupiah(todayValidIncome);
  if(document.getElementById("todayTransactions")) document.getElementById("todayTransactions").textContent = todayData.length;
  if(document.getElementById("pendingTransactions")) document.getElementById("pendingTransactions").textContent = pending;
  if(document.getElementById("totalCustomers")) document.getElementById("totalCustomers").textContent = customerMap.size;
}

function transactionHTML(item) {
  const statusClass = item.status ? item.status.toLowerCase().replace(/\s+/g, '-') : 'pending';
  const isLunas = item.paymentStatus === 'Lunas';
  return `
    <div onclick="openTransactionDetail(${item.id})" style="cursor: pointer; background: white; margin-top: 10px; border-radius: 13px; padding: 15px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center;">
      <div>
        <h3 style="font-size: 15px; color: var(--primary);">TRX/${item.id}</h3>
        <p style="font-weight: bold; margin-top: 2px;">${escapeHTML(item.customerName)}</p>
        <span class="status status-${statusClass}" style="margin-top: 6px; display: inline-block;">${item.status}</span>
      </div>
      <div style="text-align: right;">
        <b>${formatRupiah(item.total)}</b><br>
        <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: ${isLunas ? '#dcfce7' : '#fee2e2'}; color: ${isLunas ? '#16a34a' : '#dc2626'}; font-weight: bold; display: inline-block; margin-top: 4px;">${item.paymentStatus || 'Belum Lunas'}</span>
      </div>
    </div>
  `;
}

function renderRecentTransactions() {
  const element = document.getElementById("recentTransactions");
  if(element) element.innerHTML = transactions.slice(0, 5).map(transactionHTML).join("") || `<div class="empty-state">Belum ada transaksi</div>`;
}

function renderAllTransactions() {
  const element = document.getElementById("allTransactions");
  if (!element) return;
  let filtered = transactions;
  if (currentTransactionFilter !== 'Semua') {
    filtered = filtered.filter(item => item.status && item.status.toLowerCase().includes(currentTransactionFilter.toLowerCase()));
  }
  element.innerHTML = filtered.map(transactionHTML).join("") || `<div class="empty-state">Tidak ada transaksi</div>`;
}

function showPage(pageId) {
  document.querySelectorAll(".modal").forEach(m => m.classList.remove("show"));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const target = document.getElementById(pageId);
  if (target) target.classList.add("active");
  window.scrollTo(0, 0);
}

function openTransactionDetail(id) {
  activeTransactionId = id;
  const item = transactions.find(t => t.id === id);
  if (!item) return;
  const container = document.getElementById("detailContent");
  if (!container) return;

  container.innerHTML = `
    <div class="report-card" style="margin-bottom: 16px;">
      <p><b>No. Transaksi:</b> TRX/${item.id}</p>
      <p><b>Pelanggan:</b> ${escapeHTML(item.customerName)}</p>
      <p><b>Total:</b> ${formatRupiah(item.total)}</p>
      <p><b>Status:</b> ${item.status}</p>
    </div>
    <button type="button" class="submit-button" style="background: var(--primary); color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer;" onclick="showPage('transactionsPage')">Kembali</button>
  `;
  showPage("transactionDetailPage");
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2500);
}

function escapeHTML(text) {
  return String(text).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

document.addEventListener("DOMContentLoaded", function () {
  injectCustomerModules();
  injectOutletModule();
  injectTransactionModalHTML();
  renderAll();
  loadFromCloud();
  setupForm();
  setupAkunOutletLink();
});
            
