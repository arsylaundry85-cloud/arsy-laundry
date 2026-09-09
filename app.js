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
      transactions = cloudData.transactions;
      safeStorage.setItem("arsyTransactions", JSON.stringify(transactions));
      savedCustomers = cloudData.customers || [];
      if (cloudData.services) { servicePrices = cloudData.services; safeStorage.setItem("arsyServices", JSON.stringify(servicePrices)); }
      if (cloudData.outlet) { arsyOutlet = cloudData.outlet; safeStorage.setItem("arsyOutlet", JSON.stringify(arsyOutlet)); }
      if (cloudData.notaSettings) { notaSettings = cloudData.notaSettings; safeStorage.setItem("arsyNotaSettings", JSON.stringify(notaSettings)); }
      renderAll();
    }
  } catch (err) {}
}

