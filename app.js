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
function injectReportPageHTML() {
  if (document.getElementById("reportDetailPage")) return;
  const div = document.createElement("div");
  div.id = "reportDetailPage";
  div.className = "page";
  div.innerHTML = `
    <div style="padding: 15px; background: white; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border);">
      <button onclick="showPage('laporanPage')" style="background:none; border:none; font-size:18px; cursor:pointer;"><i class="fas fa-arrow-left"></i></button>
      <h2 id="reportDetailTitle" style="font-size: 16px; font-weight: bold;">Laporan</h2>
    </div>
    <div style="padding: 15px;">
      <div id="reportSummaryCards" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;"></div>
      <div style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 15px;">
        <p style="font-size: 13px; font-weight: bold; margin-bottom: 8px;">Filter Laporan</p>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <select id="reportFilterPayment" onchange="renderReportData()" style="padding: 8px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px;">
            <option value="Semua">Semua Metode Pembayaran</option>
            <option value="Tunai">Tunai</option>
            <option value="GoPay">GoPay</option>
            <option value="Dana">Dana</option>
            <option value="ShopeePay">ShopeePay</option>
            <option value="QRIS">QRIS</option>
            <option value="Transfer">Transfer</option>
          </select>
          <select id="reportFilterStatus" onchange="renderReportData()" style="padding: 8px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px;">
            <option value="Semua">Semua Status</option>
            <option value="Belum Lunas">Belum Lunas</option>
            <option value="Lunas">Lunas</option>
          </select>
        </div>
      </div>
      <div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <b style="font-size: 14px;">Data Transaksi</b>
          <span id="reportItemCount" style="font-size: 12px; color: var(--muted);">0 transaksi</span>
        </div>
        <div id="reportTransactionsList"></div>
      </div>
    </div>
  `;
  document.body.appendChild(div);
}

function injectServiceModalHTML() {
  let modal = document.getElementById("serviceModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "serviceModal";
    modal.className = "modal";
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="modal-content" style="background: white; padding: 20px; border-radius: 16px; width: 90%; max-width: 400px; max-height: 90vh; overflow-y: auto;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
        <h3 id="serviceModalTitle" style="font-size:18px; font-weight:bold;">Tambah Layanan</h3>
        <button type="button" onclick="closeServiceModal()" style="background:none; border:none; font-size:22px; cursor:pointer;">&times;</button>
      </div>
      <form onsubmit="saveRichService(event)">
        <input type="hidden" id="editServiceOldName">
        <div style="margin-bottom: 12px;">
          <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">Nama Layanan</label>
          <input type="text" id="srvName" placeholder="Contoh: Cuci Kering" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;" required autocomplete="off">
        </div>
        <div style="margin-bottom: 12px;">
          <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 6px;">Proses Laundry</label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 13px;">
            <label style="display: flex; align-items: center; gap: 6px;"><input type="checkbox" name="srvProcess" value="Cuci"> Cuci</label>
            <label style="display: flex; align-items: center; gap: 6px;"><input type="checkbox" name="srvProcess" value="Pengeringan"> Pengeringan</label>
            <label style="display: flex; align-items: center; gap: 6px;"><input type="checkbox" name="srvProcess" value="Setrika"> Setrika</label>
            <label style="display: flex; align-items: center; gap: 6px;"><input type="checkbox" name="srvProcess" value="Lipat"> Lipat</label>
            <label style="display: flex; align-items: center; gap: 6px;"><input type="checkbox" name="srvProcess" value="Packing"> Packing</label>
          </div>
        </div>
        <div style="margin-bottom: 12px; display: flex; gap: 10px;">
          <div style="flex: 2;">
            <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">Harga (Rp)</label>
            <input type="number" id="srvPrice" placeholder="0" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;" required>
          </div>
          <div style="flex: 1;">
            <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">Satuan</label>
            <select id="srvUnit" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;">
              <option value="kg">kg</option>
              <option value="pcs">pcs</option>
              <option value="m²">m²</option>
              <option value="set">set</option>
              <option value="lembar">lembar</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom: 12px; display: flex; gap: 10px;">
          <div style="flex: 1;">
            <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">Durasi</label>
            <input type="text" id="srvDuration" value="1 Hari" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;">
          </div>
          <div style="flex: 1;">
            <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">Min. Kuantitas</label>
            <input type="number" id="srvMinQty" value="1" step="any" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;">
          </div>
        </div>
        <div style="margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="srvPinned" style="width: 18px; height: 18px;">
          <label for="srvPinned" style="font-size: 13px; font-weight: bold; cursor: pointer;">Sematkan di Urutan Atas (Favorit/Utama)</label>
        </div>
        <div style="display: flex; gap: 10px;">
          <button type="button" id="btnDeleteService" onclick="deleteCurrentService()" style="display: none; background: #fee2e2; color: #dc2626; border: none; padding: 12px; border-radius: 8px; font-weight: bold; cursor: pointer; flex: 1;">Hapus</button>
          <button type="submit" class="submit-button" style="background: var(--primary); color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; flex: 2;">Simpan</button>
        </div>
      </form>
    </div>
  `;
}
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
          <label style="font-size: 13px; font-weight: bold; display: block; margin-bottom: 4px;">Nomor WhatsApp Pelanggan (Opsional)</label>
          <input type="text" id="customerPhoneInput" placeholder="Contoh: 628123456789" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 14px;" autocomplete="off">
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

  if (!document.getElementById("paymentModal")) {
    let payModal = document.createElement("div");
    payModal.id = "paymentModal";
    payModal.className = "modal";
    payModal.innerHTML = `
      <div class="modal-content" style="background: white; padding: 20px; border-radius: 16px; width: 90%; max-width: 380px; max-height: 85vh; overflow-y: auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
          <h3 style="font-size:16px; font-weight:bold;">Pembayaran</h3>
          <button type="button" onclick="closePaymentModal()" style="background:none; border:none; font-size:20px; cursor:pointer;">&times;</button>
        </div>
        <div style="margin-bottom: 12px;">
          <p style="font-size: 12px; color: var(--muted);">Total Tagihan / Sisa</p>
          <b id="payModalTotal" style="font-size: 16px; color: var(--primary);">Rp 0</b>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="font-size: 12px; font-weight: bold; display: block; margin-bottom: 4px;">Status Pembayaran</label>
          <select id="payStatusSelect" onchange="togglePayAmountField()" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; background: white;">
            <option value="Lunas">Lunas</option>
            <option value="DP">DP</option>
          </select>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="font-size: 12px; font-weight: bold; display: block; margin-bottom: 4px;">Metode Pembayaran</label>
          <select id="payMethodSelect" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px; background: white;">
            <option value="Tunai">Tunai</option>
            <option value="GoPay">GoPay</option>
            <option value="Dana">Dana</option>
            <option value="ShopeePay">ShopeePay</option>
            <option value="QRIS">QRIS</option>
            <option value="Transfer">Transfer</option>
            <option value="Deposit">Deposit</option>
          </select>
        </div>
        <div id="payAmountWrapper" style="margin-bottom: 16px; display: none;">
          <label style="font-size: 12px; font-weight: bold; display: block; margin-bottom: 4px;">Jumlah Pembayaran (DP)</label>
          <input type="number" id="payAmountInput" style="width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: 8px; font-size: 13px;">
        </div>
        <button type="button" onclick="processPaymentSubmit()" style="background: #16a34a; color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer;">Bayar</button>
      </div>
    `;
    document.body.appendChild(payModal);
  }

  if (!document.getElementById("itemEditModal")) {
    let editModal = document.createElement("div");
    editModal.id = "itemEditModal";
    editModal.className = "modal";
    editModal.innerHTML = `
      <div class="modal-content" style="background: white; padding: 20px; border-radius: 16px; width: 90%; max-width: 350px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
          <h3 id="itemEditTitle" style="font-size:16px; font-weight:bold;">Ubah Layanan</h3>
          <button type="button" onclick="closeItemEditModal()" style="background:none; border:none; font-size:20px; cursor:pointer;">&times;</button>
        </div>
        <div style="margin-bottom: 15px;">
          <label id="itemEditLabel" style="font-size: 12px; color: var(--muted); display: block; margin-bottom: 6px;"></label>
          <div style="display: flex; align-items: center; gap: 10px;">
            <button type="button" onclick="adjustItemEditWeight(-1)" style="padding: 8px 14px; background: #e2e8f0; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">-</button>
            <input type="number" id="itemEditWeightInput" step="any" oninput="calculateItemEditTotal()" style="flex: 1; padding: 8px; text-align: center; border: 1px solid var(--border); border-radius: 6px; font-size: 14px;">
            <button type="button" onclick="adjustItemEditWeight(1)" style="padding: 8px 14px; background: #e2e8f0; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">+</button>
          </div>
        </div>
        <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 13px; font-weight: bold;">Estimasi Total:</span>
          <b id="itemEditTotalDisplay" style="color: var(--primary); font-size: 15px;">Rp 0</b>
        </div>
        <div style="display: flex; gap: 10px;">
          <button type="button" onclick="closeItemEditModal()" style="flex: 1; padding: 10px; border: 1px solid var(--border); background: white; border-radius: 8px; font-weight: bold; cursor: pointer;">Batal</button>
          <button type="button" onclick="saveItemEdit()" style="flex: 1; padding: 10px; background: var(--primary); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">Simpan</button>
        </div>
      </div>
    `;
    document.body.appendChild(editModal);
  }
}
function injectCustomerModules() {
  if (!document.getElementById("customerPage")) {
    const div = document.createElement("div");
    div.id = "customerPage";
    div.className = "page";
    div.innerHTML = `<div style="padding: 15px; background: white; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border);"><button onclick="showPage('dashboardPage')" style="background:none; border:none; font-size:18px; cursor:pointer;"><i class="fas fa-arrow-left"></i></button><h2 style="font-size: 16px; font-weight: bold;">Daftar Pelanggan</h2></div><div style="padding: 15px;" id="customersListContainer"></div>`;
    document.body.appendChild(div);
  }

  if (!document.getElementById("dashboardDetailPage")) {
    const div = document.createElement("div");
    div.id = "dashboardDetailPage";
    div.className = "page";
    div.innerHTML = `<div style="padding: 15px; background: white; display: flex; align-items: center; gap: 12px; border-bottom: 1px solid var(--border);"><button onclick="showPage('dashboardPage')" style="background:none; border:none; font-size:18px; cursor:pointer;"><i class="fas fa-arrow-left"></i></button><h2 id="dashDetailTitle" style="font-size: 16px; font-weight: bold;">Rincian</h2></div><div style="padding: 15px;" id="dashDetailContent"></div>`;
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
  saveData();
}

function renderServices() {
  const element = document.getElementById("servicesList");
  if(!element) return;
  const sortedNames = getSortedServiceNames();
  element.innerHTML = sortedNames.map(name => {
    const data = servicePrices[name];
    const processesStr = (data.processes || []).join(" - ");
    const subtitle = processesStr ? `${processesStr} • Min. ${data.minQty || 1} ${data.unit} • ${data.duration || '1 Hari'}` : `${formatRupiah(data.price)} / ${data.unit}`;
    return `
      <div style="background: white; border-radius: 13px; padding: 15px; margin-top: 10px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; cursor: pointer;" onclick="openEditServiceModal('${escapeHTML(name)}')">
        <div>
          <b>${escapeHTML(name)}</b><br>
          <span style="color:var(--primary); font-weight:bold; font-size:13px;">${formatRupiah(data.price)} / ${data.unit}</span><br>
          <small style="color:var(--muted);">${escapeHTML(subtitle)}</small>
        </div>
        <span style="font-size: 12px; color: var(--primary); font-weight: bold;">Ubah</span>
      </div>
    `;
  }).join("");
}

function openServiceModal() {
  injectServiceModalHTML();
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
  const btnDelete = document.getElementById("btnDeleteService");
  if (btnDelete) btnDelete.style.display = "none";
  modal.classList.add("show");
}

function openEditServiceModal(name) {
  injectServiceModalHTML();
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
  const btnDelete = document.getElementById("btnDeleteService");
  if (btnDelete) btnDelete.style.display = "block";
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
  saveServicesData(); 
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
  if(document.getElementById("customerPhoneInput")) document.getElementById("customerPhoneInput").value = "";
  document.getElementById("transactionModal").classList.add("show");
}

function closeTransactionModal() { document.getElementById("transactionModal").classList.remove("show"); }

function setupForm() {
  const form = document.getElementById("transactionForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const customerName = document.getElementById("customerName").value.trim();
      const customerPhone = document.getElementById("customerPhoneInput") ? document.getElementById("customerPhoneInput").value.trim() : "";
      if (!customerName || activeNewTransactionItems.length === 0) return;

      const grandTotal = activeNewTransactionItems.reduce((sum, it) => sum + it.total, 0);
      const transaction = {
        id: Date.now(),
        customerName,
        customerPhone,
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
function openTransactionDetail(id) {
  activeTransactionId = id;
  const item = transactions.find(t => t.id === id);
  if (!item) return;
  const container = document.getElementById("detailContent");
  if (!container) return;

  const itemsList = getTransactionItems(item);
  const estStr = formatDate(getEstDate(item));

  let nextStatusBtn = "";
  if (item.status === "Antrian") {
    nextStatusBtn = `<button type="button" onclick="updateTransactionStatus(${item.id}, 'Proses')" style="background: var(--primary); color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; margin-bottom: 12px;">Proses Transaksi</button>`;
  } else if (item.status === "Proses") {
    nextStatusBtn = `<button type="button" onclick="updateTransactionStatus(${item.id}, 'Siap Diambil')" style="background: var(--primary); color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; margin-bottom: 12px;">Transaksi Siap Diambil</button>`;
  } else if (item.status === "Siap Diambil") {
    nextStatusBtn = `<button type="button" onclick="updateTransactionStatus(${item.id}, 'Selesai')" style="background: #16a34a; color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; margin-bottom: 12px;">Selesaikan Transaksi</button>`;
  }

  container.innerHTML = `
    <div style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 15px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h3 style="font-size: 15px; color: var(--primary);">Detail Transaksi</h3>
        <button onclick="openCancelTransactionPrompt(${item.id})" style="background: none; border: none; color: #dc2626; font-size: 12px; font-weight: bold; cursor: pointer;">Batalkan Transaksi</button>
      </div>
      <p style="font-size: 13px; margin-bottom: 4px;"><b>No. Transaksi:</b> TRX/${item.id}</p>
      <p style="font-size: 13px; margin-bottom: 4px;"><b>Status Pengerjaan:</b> <span style="color: var(--primary); font-weight: bold;">${item.status}</span></p>
      <p style="font-size: 13px; margin-bottom: 4px;"><b>Kasir:</b> Arif</p>
      <p style="font-size: 13px;"><b>Estimasi Selesai:</b> ${estStr}</p>
    </div>

    <div style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 15px; margin-bottom: 12px;">
      <p style="font-size: 13px; color: var(--muted); font-weight: bold; margin-bottom: 6px;">INFO PELANGGAN</p>
      <b style="font-size: 15px;">${escapeHTML(item.customerName)}</b>
      <p style="font-size: 12px; color: var(--muted); margin-top: 2px;">No. WhatsApp: ${item.customerPhone ? escapeHTML(item.customerPhone) : '-'}</p>
    </div>

    <div style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 15px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <p style="font-size: 13px; color: var(--muted); font-weight: bold;">LAYANAN LAUNDRY</p>
        <button type="button" onclick="openAddServiceExisting(${item.id})" style="background: #e1edff; color: var(--primary); border: none; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; cursor: pointer;">+ Tambah Layanan</button>
      </div>
      <div id="detailItemsList">
        ${itemsList.map((it, idx) => {
          const srv = servicePrices[it.serviceType];
          return `
            <div style="border-bottom: 1px solid var(--border); padding-bottom: 8px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <b>${escapeHTML(it.serviceType)}</b>
                <div style="font-size: 12px; color: var(--muted);">${it.weight} ${srv ? srv.unit : 'kg'} x ${formatRupiah(srv ? srv.price : 0)} = ${formatRupiah(it.total)}</div>
              </div>
              <div style="display: flex; gap: 8px;">
                <button onclick="openItemEditModal(${item.id}, ${idx})" style="background: #f1f5f9; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: bold;">Edit</button>
                <button onclick="removeTransactionItem(${item.id}, ${idx})" style="background: #fee2e2; color: #dc2626; border: none; padding: 4px 8px; border-radius: 6px; font-size: 11px; cursor: pointer; font-weight: bold;">Hapus</button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>

    <div style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 15px; margin-bottom: 16px;">
      <p style="font-size: 13px; color: var(--muted); font-weight: bold; margin-bottom: 6px;">INFO PEMBAYARAN</p>
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="font-size: 13px;">Total Transaksi</span><b style="font-size: 13px;">${formatRupiah(item.total)}</b></div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="font-size: 13px;">Status Pembayaran</span><span style="font-size: 12px; font-weight: bold; color: ${item.paymentStatus === 'Lunas' ? '#16a34a' : '#dc2626'};">${item.paymentStatus || 'Belum Lunas'}</span></div>
      <div style="display: flex; justify-content: space-between;"><span style="font-size: 13px;">Metode Pembayaran</span><b style="font-size: 13px;">${item.paymentMethod || '-'}</b></div>
    </div>

    ${nextStatusBtn}

    <button type="button" onclick="openPaymentModal(${item.id})" style="background: #16a34a; color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; margin-bottom: 8px;">Bayar</button>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
      <button type="button" onclick="printNota(${item.id})" style="background: white; border: 1px solid var(--border); padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px;">Cetak Nota</button>
      <button type="button" onclick="printLabel(${item.id})" style="background: white; border: 1px solid var(--border); padding: 10px; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 13px;">Cetak Label</button>
    </div>
    <button type="button" onclick="sendWhatsAppNota(${item.id})" style="background: #25d366; color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer; margin-bottom: 12px;">Kirim Nota WhatsApp</button>
    <button type="button" class="submit-button" style="background: #64748b; color: white; width: 100%; padding: 12px; border-radius: 8px; font-weight: bold; border: none; cursor: pointer;" onclick="showPage('transactionsPage')">Kembali</button>
  `;
  showPage("transactionDetailPage");
}

function updateTransactionStatus(id, newStatus) {
  let item = transactions.find(t => t.id === id);
  if (!item) return;
  item.status = newStatus;
  saveData();
  openTransactionDetail(id);
  showToast(`Status diperbarui: ${newStatus}`);
}

function openCancelTransactionPrompt(id) {
  if (confirm("Batalkan transaksi ini?")) {
    let item = transactions.find(t => t.id === id);
    if (item) {
      item.status = "Batal";
      saveData();
      showToast("Transaksi dibatalkan");
      showPage("transactionsPage");
      renderAll();
    }
  }
}

function removeTransactionItem(txId, itemIdx) {
  let item = transactions.find(t => t.id === txId);
  if (!item) return;
  let itemsList = getTransactionItems(item);
  if (itemsList.length <= 1) {
    showToast("Transaksi harus memiliki minimal 1 layanan");
    return;
  }
  itemsList.splice(itemIdx, 1);
  item.items = itemsList;
  item.total = itemsList.reduce((sum, it) => sum + it.total, 0);
  saveData();
  openTransactionDetail(txId);
  showToast("Layanan dihapus");
}

let activeEditingItemContext = null;

function openItemEditModal(txId, itemIdx) {
  let item = transactions.find(t => t.id === txId);
  if (!item) return;
  let itemsList = getTransactionItems(item);
  let targetItem = itemsList[itemIdx];
  let srv = servicePrices[targetItem.serviceType];
  
  activeEditingItemContext = { txId, itemIdx };
  document.getElementById("itemEditTitle").textContent = `Ubah ${targetItem.serviceType}`;
  document.getElementById("itemEditLabel").textContent = `Berat / Jumlah (${srv ? srv.unit : 'kg'})`;
  document.getElementById("itemEditWeightInput").value = targetItem.weight;
  calculateItemEditTotal();
  document.getElementById("itemEditModal").classList.add("show");
}

function closeItemEditModal() {
  document.getElementById("itemEditModal").classList.remove("show");
}

function adjustItemEditWeight(amount) {
  let input = document.getElementById("itemEditWeightInput");
  let val = (parseFloat(input.value) || 0) + amount;
  if (val < 0.1) val = 0.1;
  input.value = val;
  calculateItemEditTotal();
}

function calculateItemEditTotal() {
  if (!activeEditingItemContext) return;
  let item = transactions.find(t => t.id === activeEditingItemContext.txId);
  let itemsList = getTransactionItems(item);
  let targetItem = itemsList[activeEditingItemContext.itemIdx];
  let srv = servicePrices[targetItem.serviceType];
  let weight = parseFloat(document.getElementById("itemEditWeightInput").value) || 0;
  let total = Math.round(weight * (srv ? srv.price : 0));
  document.getElementById("itemEditTotalDisplay").textContent = formatRupiah(total);
}

function saveItemEdit() {
  if (!activeEditingItemContext) return;
  let item = transactions.find(t => t.id === activeEditingItemContext.txId);
  let itemsList = getTransactionItems(item);
  let targetItem = itemsList[activeEditingItemContext.itemIdx];
  let srv = servicePrices[targetItem.serviceType];
  let weight = parseFloat(document.getElementById("itemEditWeightInput").value) || 0;
  
  targetItem.weight = weight;
  targetItem.total = Math.round(weight * (srv ? srv.price : 0));
  item.items = itemsList;
  item.total = itemsList.reduce((sum, it) => sum + it.total, 0);

  saveData();
  closeItemEditModal();
  openTransactionDetail(item.id);
  showToast("Layanan diperbarui");
}

function openAddServiceExisting(txId) {
  let item = transactions.find(t => t.id === txId);
  if (!item) return;
  const container = document.getElementById("serviceSelectionList");
  if (!container) return;
  container.innerHTML = getSortedServiceNames().map(name => {
    const srv = servicePrices[name];
    return `
      <div onclick="confirmAddServiceExisting(${txId}, '${escapeHTML(name)}')" style="padding: 12px; border-bottom: 1px solid var(--border); cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
        <div><b>${escapeHTML(name)}</b><div style="font-size: 12px; color: var(--muted);">${formatRupiah(srv.price)} / ${srv.unit}</div></div>
        <span style="color: var(--primary); font-size: 13px; font-weight: bold;">+ Pilih</span>
      </div>
    `;
  }).join("");
  document.getElementById("addServiceSelectModal").classList.add("show");
}

function confirmAddServiceExisting(txId, serviceName) {
  let item = transactions.find(t => t.id === txId);
  if (!item) return;
  let itemsList = getTransactionItems(item);
  let srv = servicePrices[serviceName];
  itemsList.push({ serviceType: serviceName, weight: srv.minQty || 1, total: (srv.minQty || 1) * srv.price });
  item.items = itemsList;
  item.total = itemsList.reduce((sum, it) => sum + it.total, 0);
  saveData();
  closeAddServiceSelectModal();
  openTransactionDetail(txId);
  showToast("Layanan ditambahkan");
}
let activePaymentTxId = null;

function openPaymentModal(txId) {
  activePaymentTxId = txId;
  let item = transactions.find(t => t.id === txId);
  if (!item) return;
  document.getElementById("payModalTotal").textContent = formatRupiah(item.total);
  document.getElementById("payStatusSelect").value = item.paymentStatus === 'Lunas' ? 'Lunas' : 'DP';
  document.getElementById("payMethodSelect").value = item.paymentMethod !== '-' ? item.paymentMethod : 'Tunai';
  togglePayAmountField();
  document.getElementById("paymentModal").classList.add("show");
}

function closePaymentModal() {
  document.getElementById("paymentModal").classList.remove("show");
}

function togglePayAmountField() {
  let status = document.getElementById("payStatusSelect").value;
  let wrapper = document.getElementById("payAmountWrapper");
  if (status === 'DP') {
    wrapper.style.display = 'block';
    let item = transactions.find(t => t.id === activePaymentTxId);
    if (item) document.getElementById("payAmountInput").value = item.paidAmount || (item.total / 2);
  } else {
    wrapper.style.display = 'none';
  }
}

function processPaymentSubmit() {
  let item = transactions.find(t => t.id === activePaymentTxId);
  if (!item) return;
  let status = document.getElementById("payStatusSelect").value;
  let method = document.getElementById("payMethodSelect").value;
  
  item.paymentStatus = status === 'Lunas' ? 'Lunas' : 'DP';
  item.paymentMethod = method;
  item.paidAmount = status === 'Lunas' ? item.total : (parseFloat(document.getElementById("payAmountInput").value) || 0);
  item.paymentDate = new Date().toISOString();

  saveData();
  closePaymentModal();
  openTransactionDetail(item.id);
  showToast("Pembayaran disimpan");
}

function printNota(txId) {
  showToast("Aktifkan Bluetooth: Menghubungkan printer...");
}

function printLabel(txId) {
  showToast("Aktifkan Bluetooth: Menghubungkan printer...");
}

function sendWhatsAppNota(txId) {
  let item = transactions.find(t => t.id === txId);
  if (!item) return;

  // Jika nomor HP kosong, tanyakan sekali lewat prompt lalu simpan otomatis ke transaksi
  let phone = item.customerPhone;
  if (!phone) {
    phone = prompt(`Masukkan nomor WhatsApp ${item.customerName} (Contoh: 628123456789):`, "");
    if (!phone) return;
    phone = phone.trim().replace(/^0/, "62").replace(/[^0-9]/g, "");
    item.customerPhone = phone;
    saveData();
  } else {
    phone = phone.trim().replace(/^0/, "62").replace(/[^0-9]/g, "");
  }

  let itemsList = getTransactionItems(item);
  let layananText = itemsList.map(it => {
    let srv = servicePrices[it.serviceType];
    let unitPrice = srv ? srv.price : (it.total / (it.weight || 1));
    return `${it.serviceType}\n${it.weight} x ${formatRupiah(unitPrice)} = ${formatRupiah(it.total)}`;
  }).join("\n--------------------------------\n");

  let estStr = formatDate(getEstDate(item));
  let paidAmt = item.paymentStatus === 'Lunas' ? item.total : (item.paidAmount || 0);
  let sisaTagihan = item.paymentStatus === 'Lunas' ? 0 : (item.total - paidAmt);

  let msg = `*[ LOGO Arsy Laundry ]*\n\n` +
            `*${arsyOutlet.name}*\n` +
            `${arsyOutlet.address}, ${arsyOutlet.city}\n` +
            `${arsyOutlet.phone}\n` +
            `--------------------------------\n` +
            `*Pelanggan: ${item.customerName}*\n` +
            `No. Transaksi: TRX/${item.id}\n` +
            `Waktu: ${formatDate(item.date)}\n` +
            `Kasir: Arif\n` +
            `Est. Selesai: ${estStr}\n` +
            `--------------------------------\n` +
            `*Layanan:*\n` +
            `${layananText}\n` +
            `--------------------------------\n` +
            `*Total: ${formatRupiah(item.total)}*\n` +
            `Dibayar (${item.paymentStatus}): ${formatRupiah(paidAmt)}\n` +
            `Sisa Tagihan: ${formatRupiah(sisaTagihan)}\n` +
            `Status: ${item.paymentStatus || 'Belum Lunas'}\n` +
            `Metode Pembayaran: ${item.paymentMethod || '-'}\n\n` +
            `_Powered by ${arsyOutlet.name}_`;

  const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}
let activeReportType = 'omset';

function openReportDetail(type) {
  activeReportType = type;
  injectReportPageHTML();
  const titleEl = document.getElementById("reportDetailTitle");
  if (!titleEl) return;

  const titles = {
    'omset': 'Laporan Omset Transaksi',
    'masuk': 'Laporan Transaksi Masuk',
    'lunas': 'Laporan Transaksi Lunas',
    'selesai': 'Laporan Transaksi Selesai',
    'batal': 'Laporan Transaksi Batal',
    'pembayaran': 'Laporan Pembayaran'
  };
  titleEl.textContent = titles[type] || 'Laporan';
  
  if(document.getElementById("reportFilterPayment")) document.getElementById("reportFilterPayment").value = "Semua";
  if(document.getElementById("reportFilterStatus")) document.getElementById("reportFilterStatus").value = "Semua";

  renderReportData();
  showPage('reportDetailPage');
}

function renderReportData() {
  const type = activeReportType;
  const payFilter = document.getElementById("reportFilterPayment")?.value || "Semua";
  const statFilter = document.getElementById("reportFilterStatus")?.value || "Semua";

  let filtered = transactions;
  if (type === 'omset') {
    filtered = filtered.filter(item => item.status !== "Batal" && (item.paymentStatus === "Lunas" || (item.paidAmount && item.paidAmount > 0)));
  } else if (type === 'lunas') {
    filtered = filtered.filter(item => item.paymentStatus === "Lunas" && item.status !== "Batal");
  } else if (type === 'selesai') {
    filtered = filtered.filter(item => item.status && item.status.toLowerCase().includes("selesai"));
  } else if (type === 'batal') {
    filtered = filtered.filter(item => item.status === "Batal");
  } else if (type === 'pembayaran') {
    filtered = filtered.filter(item => item.status !== "Batal");
  }

  if (payFilter !== 'Semua') {
    filtered = filtered.filter(item => item.paymentMethod === payFilter);
  }
  if (statFilter !== 'Semua') {
    filtered = filtered.filter(item => item.paymentStatus === statFilter);
  }

  let totalPendapatan = filtered.reduce((sum, item) => sum + (item.paymentStatus === 'Lunas' ? item.total : (item.paidAmount || 0)), 0);
  let selesaiLunasCount = transactions.filter(item => item.status !== "Batal" && (item.paymentStatus === 'Lunas' || item.status.toLowerCase().includes("selesai"))).length;
  let batalCount = transactions.filter(item => item.status === "Batal").length;

  const cardsContainer = document.getElementById("reportSummaryCards");
  if (cardsContainer) {
    cardsContainer.innerHTML = `
      <div style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 12px;">
        <p style="font-size: 11px; color: var(--muted); font-weight: bold;">TOTAL PENDAPATAN</p>
        <b style="font-size: 15px; color: var(--primary);">${formatRupiah(totalPendapatan)}</b>
      </div>
      <div style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 12px;">
        <p style="font-size: 11px; color: var(--muted); font-weight: bold;">TOTAL TRANSAKSI</p>
        <b style="font-size: 15px;">${transactions.length}</b>
      </div>
      <div style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 12px;">
        <p style="font-size: 11px; color: var(--muted); font-weight: bold;">SELESAI / LUNAS</p>
        <b style="font-size: 15px; color: #16a34a;">${selesaiLunasCount}</b>
      </div>
      <div style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 12px;">
        <p style="font-size: 11px; color: var(--muted); font-weight: bold;">BATAL</p>
        <b style="font-size: 15px; color: #dc2626;">${batalCount}</b>
      </div>
    `;
  }

  const countEl = document.getElementById("reportItemCount");
  if (countEl) countEl.textContent = `${filtered.length} transaksi`;

  const listContainer = document.getElementById("reportTransactionsList");
  if (listContainer) {
    listContainer.innerHTML = filtered.length === 0 ? '<div class="empty-state">Tidak ada transaksi</div>' : filtered.map(item => {
      const itemsList = getTransactionItems(item);
      const serviceSummary = itemsList.map(it => `${it.serviceType} (${it.weight})`).join(", ");
      return `
        <div onclick="openTransactionDetail(${item.id})" style="background: white; border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <b style="font-size: 14px; color: var(--primary);">${escapeHTML(item.customerName)}</b>
            <div style="font-size: 12px; color: var(--muted); margin-top: 2px;">${escapeHTML(serviceSummary)}</div>
            <span style="font-size: 11px; color: #16a34a; font-weight: bold; display: inline-block; margin-top: 4px;">${item.paymentMethod || 'Tunai'}</span>
          </div>
          <div style="text-align: right;">
            <b style="font-size: 14px;">${formatRupiah(item.total)}</b><br>
            <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${item.paymentStatus === 'Lunas' ? '#dcfce7' : '#fee2e2'}; color: ${item.paymentStatus === 'Lunas' ? '#16a34a' : '#dc2626'}; font-weight: bold; display: inline-block; margin-top: 4px;">${item.paymentStatus || 'Belum Lunas'}</span>
          </div>
        </div>
      `;
    }).join("");
  }
}

function setupReportInteractions() {
  const reportPage = document.getElementById("laporanPage");
  if (!reportPage) return;
  reportPage.querySelectorAll("div").forEach(el => {
    const text = el.textContent.trim();
    if (text.includes("Laporan Omset Transaksi") && !el.dataset.bound) {
      el.dataset.bound = "true";
      el.style.cursor = "pointer";
      el.onclick = () => openReportDetail('omset');
    } else if (text.includes("Laporan Transaksi Masuk") && !el.dataset.bound) {
      el.dataset.bound = "true";
      el.style.cursor = "pointer";
      el.onclick = () => openReportDetail('masuk');
    } else if (text.includes("Laporan Transaksi Lunas") && !el.dataset.bound) {
      el.dataset.bound = "true";
      el.style.cursor = "pointer";
      el.onclick = () => openReportDetail('lunas');
    } else if (text.includes("Laporan Transaksi Selesai") && !el.dataset.bound) {
      el.dataset.bound = "true";
      el.style.cursor = "pointer";
      el.onclick = () => openReportDetail('selesai');
    } else if (text.includes("Laporan Transaksi Batal") && !el.dataset.bound) {
      el.dataset.bound = "true";
      el.style.cursor = "pointer";
      el.onclick = () => openReportDetail('batal');
    } else if (text.includes("Laporan Pembayaran") && !el.dataset.bound) {
      el.dataset.bound = "true";
      el.style.cursor = "pointer";
      el.onclick = () => openReportDetail('pembayaran');
    }
  });
}

function setupServiceInteractions() {
  const dashPage = document.getElementById("dashboardPage");
  if (!dashPage) return;
  dashPage.querySelectorAll("div, span, a, p").forEach(el => {
    const text = el.textContent.trim();
    if (text === "Layanan" && !el.dataset.boundService) {
      let card = el.closest("div[style*='cursor']") || el.closest("div");
      if (card) {
        el.dataset.boundService = "true";
        card.style.cursor = "pointer";
        card.onclick = (e) => {
          e.stopPropagation();
          openServiceModal();
        };
      }
    }
  });
}

function setupTransactionTabs() {
  const transactionPage = document.getElementById("transactionsPage");
  if (!transactionPage) return;
  const tabs = transactionPage.querySelectorAll(".transaction-tabs-container button, .transaction-tabs-container div, [style*='display: flex'] button");
  tabs.forEach(tab => {
    if (!tab.dataset.boundTab) {
      tab.dataset.boundTab = "true";
      tab.style.cursor = "pointer";
      tab.onclick = () => {
        const text = tab.textContent.trim();
        if (["Semua", "Antrian", "Proses", "Siap Diambil", "Selesai"].includes(text)) {
          currentTransactionFilter = text;
          renderAllTransactions();
        }
      };
    }
  });
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
    summaryHTML = `<div style="background: white; padding: 15px; border-radius: 13px; border: 1px solid var(--border); margin-bottom: 16px;"><p style="font-size: 12px; color: var(--muted); font-weight: bold;">RINGKASAN OMSET</p><b style="font-size: 16px; color: var(--primary);">${formatRupiah(totalOmset)}</b> (${filtered.length} Transaksi)</div>`;
  } else if (type === 'transaksi') {
    titleText = "Rincian Transaksi Hari Ini";
    filtered = transactions.filter(item => isToday(item.date) && item.status !== "Batal");
    summaryHTML = `<div style="background: white; padding: 15px; border-radius: 13px; border: 1px solid var(--border); margin-bottom: 16px;"><p style="font-size: 12px; color: var(--muted); font-weight: bold;">RINGKASAN TRANSAKSI</p><b style="font-size: 16px; color: var(--primary);">${filtered.length} Transaksi Hari Ini</b></div>`;
  } else if (type === 'pending') {
    titleText = "Rincian Belum Selesai";
    filtered = transactions.filter(item => item.status !== "Batal" && !item.status.toLowerCase().includes("selesai"));
    summaryHTML = `<div style="background: white; padding: 15px; border-radius: 13px; border: 1px solid var(--border); margin-bottom: 16px;"><p style="font-size: 12px; color: var(--muted); font-weight: bold;">RINGKASAN BELUM SELESAI</p><b style="font-size: 16px; color: var(--primary);">${filtered.length} Transaksi</b></div>`;
  }

  if (titleEl) titleEl.textContent = titleText;
  contentEl.innerHTML = `${summaryHTML}<h4 style="font-size: 14px; font-weight: bold; margin-bottom: 10px;">Daftar Transaksi</h4>${filtered.length === 0 ? '<div class="empty-state">Belum ada data</div>' : filtered.map(transactionHTML).join("")}`;
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

function showPage(pageId) {
  document.querySelectorAll(".modal").forEach(m => m.classList.remove("show"));
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  const target = document.getElementById(pageId);
  if (target) target.classList.add("active");
  window.scrollTo(0, 0);
  if (pageId === 'transactionsPage') {
    const searchInput = document.getElementById("transactionSearchInput");
    if (searchInput) searchInput.value = "";
    renderAllTransactions();
  }
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

function renderAll() {
  updateDashboard();
  renderRecentTransactions();
  renderAllTransactions();
  renderServices();
  setupDashboardInteractions();
  setupReportInteractions();
  setupServiceInteractions();
  setupTransactionTabs();
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
  const searchInput = document.getElementById("transactionSearchInput");
  if (searchInput && searchInput.value) {
    const q = searchInput.value.toLowerCase().trim();
    filtered = filtered.filter(item => item.customerName && item.customerName.toLowerCase().includes(q));
  }
  element.innerHTML = filtered.map(transactionHTML).join("") || `<div class="empty-state">Tidak ada transaksi</div>`;
}

document.addEventListener("DOMContentLoaded", function () {
  injectCustomerModules();
  injectOutletModule();
  injectTransactionModalHTML();
  injectServiceModalHTML();
  injectTransactionSearch();
  injectReportPageHTML();
  renderAll();
  loadFromCloud();
  setupForm();
  setupAkunOutletLink();
  setupDashboardInteractions();
  setupReportInteractions();
  setupServiceInteractions();
  setupTransactionTabs();
});
  
