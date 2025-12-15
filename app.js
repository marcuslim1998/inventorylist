/**
 * Inventory Management Logic (Refactored Round 2)
 * - Smart Scanning (Location Context vs Item Search)
 * - Item Logic (Qty, Opened, Shelf Life)
 * - Location Tree View & CRUD
 */

// --- STATE MANAGEMENT ---
const AppState = {
    items: [],
    categories: ['Food', 'Facial', 'General', 'Medicine', 'Stationery'],
    locationStructure: {},

    // UI State
    sortBy: 'date',
    filters: {
        house: '',
        room: '',
        storage: '',
        category: '',
        showZero: false,
        expired: false,
        soon: false
    },

    // Scanner
    scannerTarget: null,
    html5QrCode: null,
    isScanning: false
};

const Storage = {
    save: () => {
        localStorage.setItem('inventory_data', JSON.stringify({
            items: AppState.items,
            categories: AppState.categories,
            locationStructure: AppState.locationStructure
        }));
    },
    load: () => {
        const data = localStorage.getItem('inventory_data');
        if (data) {
            const parsed = JSON.parse(data);
            AppState.items = parsed.items || [];
            AppState.categories = parsed.categories || ['Food', 'Facial', 'General', 'Medicine', 'Stationery'];
            AppState.locationStructure = parsed.locationStructure || {};
        }
    }
};

// --- DOM ELEMENTS ---
const views = {
    inventory: document.getElementById('view-inventory'),
    addItem: document.getElementById('view-add-item'),
    locations: document.getElementById('view-locations')
};

const navItems = document.querySelectorAll('.nav-item');

// Inventory View Elements
const inventoryList = document.getElementById('inventory-list');
const searchInput = document.getElementById('inventory-search');
const btnToggleFilters = document.getElementById('btn-toggle-filters');
const filterPanel = document.getElementById('filter-panel');
const sortChips = document.querySelectorAll('.chip');
const filterCheckboxes = document.querySelectorAll('input[name="filter-status"]');

// New Filters
const filterInputs = {
    house: document.getElementById('filter-house'),
    room: document.getElementById('filter-room'),
    storage: document.getElementById('filter-storage'),
    category: document.getElementById('filter-category'),
    zero: document.getElementById('filter-zero'),
    clear: document.getElementById('btn-clear-all-filters')
};

// Add Form Elements
const form = {
    inputs: document.getElementById('add-item-form'),
    barcode: document.getElementById('item-barcode'),
    name: document.getElementById('item-name'),
    quantity: document.getElementById('item-quantity'),
    isOpened: document.getElementById('item-opened'),
    openedMeta: document.getElementById('opened-meta-fields'),
    openedDate: document.getElementById('item-opened-date'),
    shelfLife: document.getElementById('item-shelf-life'),
    category: document.getElementById('item-category'),
    house: document.getElementById('loc-house'),
    room: document.getElementById('loc-room'),
    storage: document.getElementById('loc-storage'),
    expiry: document.getElementById('item-expiry'),

    // Buttons inside form
    btnScanBarcode: document.getElementById('btn-scan-input'),
    btnAddCat: document.getElementById('btn-add-category'),
    btnAddHouse: document.getElementById('btn-add-house'),
    btnScanLocation: document.getElementById('btn-scan-location-input')
};

// Location View Elements
const locationTreeContainer = document.getElementById('location-tree-container');
const btnAddRoot = document.getElementById('btn-add-root');
const btnAddHouse = document.getElementById('btn-add-house'); // Hierarchy form button

// Scanner Overlay
const scannerOverlay = document.getElementById('scanner-overlay');
const scannerStatus = document.getElementById('scanner-status');
const btnCloseScanner = document.getElementById('btn-close-scanner');


// --- INITIALIZATION ---
function init() {
    Storage.load();
    setupNavigation();
    setupInventoryUI();
    setupForm();
    setupScannerUI();
    setupLocationsUI(); // Also re-inits filters

    renderInventory();
    renderLocationTree();
    if (window.feather) feather.replace();
}

function setupNavigation() {
    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');

            // Visual Active State
            navItems.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // View Switching
            Object.values(views).forEach(v => v.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');

            // specific init
            if (targetId === 'view-add-item') initAddForm();
            if (targetId === 'view-locations') renderLocationTree();
        });
    });
}

// --- INVENTORY UI ---
function setupInventoryUI() {
    // Toolbar
    document.getElementById('btn-scan-header').addEventListener('click', () => startScanning('smart-scan'));

    // Filter Panel Toggle
    btnToggleFilters.addEventListener('click', () => {
        filterPanel.classList.toggle('hidden');
    });

    // Sort Chips
    sortChips.forEach(chip => {
        chip.addEventListener('click', () => {
            sortChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            AppState.sortBy = chip.getAttribute('data-sort');
            renderInventory();
        });
    });

    // Checkbox Filters (Status)
    filterCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            AppState.filters[cb.value] = cb.checked;
            renderInventory();
        });
    });

    // Core Filters (House, Room, Storage, Category, Zero)
    const bindFilter = (el, key) => {
        el.addEventListener('change', () => {
            AppState.filters[key] = (key === 'showZero') ? el.checked : el.value;
            // If House changes, reset Room/Storage? 
            if (key === 'house') { populateFilterDropdowns('room'); populateFilterDropdowns('storage'); }
            if (key === 'room') { populateFilterDropdowns('storage'); }
            renderInventory();
        });
    };

    bindFilter(filterInputs.house, 'house');
    bindFilter(filterInputs.room, 'room');
    bindFilter(filterInputs.storage, 'storage');
    bindFilter(filterInputs.category, 'category');

    filterInputs.zero.addEventListener('change', () => {
        AppState.filters.showZero = filterInputs.zero.checked;
        renderInventory();
    });

    filterInputs.clear.addEventListener('click', () => {
        AppState.filters.house = '';
        AppState.filters.room = '';
        AppState.filters.storage = '';
        AppState.filters.category = '';
        AppState.filters.showZero = false;
        AppState.filters.expired = false;
        AppState.filters.soon = false;

        // Reset Inputs
        filterInputs.house.value = '';
        filterInputs.room.innerHTML = '<option value="">All Rooms</option>';
        filterInputs.storage.innerHTML = '<option value="">All Storages</option>';
        filterInputs.category.value = '';
        filterInputs.zero.checked = false;
        filterCheckboxes.forEach(c => c.checked = false);

        renderInventory();
    });

    searchInput.addEventListener('input', renderInventory);

    populateFilterDropdowns('init');
}

function populateFilterDropdowns(level) {
    const struct = AppState.locationStructure;

    if (level === 'init' || level === 'house') {
        const cur = filterInputs.house.value;
        filterInputs.house.innerHTML = '<option value="">All Houses</option>';
        Object.keys(struct).sort().forEach(h => filterInputs.house.add(new Option(h, h)));
        filterInputs.house.value = cur;

        // Also Categories
        if (level === 'init') {
            filterInputs.category.innerHTML = '<option value="">All Categories</option>';
            AppState.categories.forEach(c => filterInputs.category.add(new Option(c, c)));
        }
    }

    const h = filterInputs.house.value;
    if (level === 'init' || (level === 'room' && h)) {
        filterInputs.room.innerHTML = '<option value="">All Rooms</option>';
        if (h && struct[h]) {
            Object.keys(struct[h]).sort().forEach(r => filterInputs.room.add(new Option(r, r)));
        }
    }

    const r = filterInputs.room.value;
    if (level === 'init' || (level === 'storage' && h && r)) {
        filterInputs.storage.innerHTML = '<option value="">All Storages</option>';
        if (h && r && struct[h][r]) {
            struct[h][r].sort().forEach(s => filterInputs.storage.add(new Option(s, s)));
        }
    }
}

function renderInventory() {
    inventoryList.innerHTML = '';

    // Filter Logic
    let filtered = AppState.items.filter(item => {
        // 1. Text Search
        const term = searchInput.value.toLowerCase();
        if (term && !item.name.toLowerCase().includes(term) && !item.barcode.includes(term)) {
            return false;
        }

        // 2. Granular Location & Category
        if (AppState.filters.house && item.location.house !== AppState.filters.house) return false;
        if (AppState.filters.room && item.location.room !== AppState.filters.room) return false;
        if (AppState.filters.storage && item.location.storage !== AppState.filters.storage) return false;
        if (AppState.filters.category && item.category !== AppState.filters.category) return false;

        // 3. Zero Quantity
        if (!AppState.filters.showZero && (item.quantity || 0) <= 0) return false;

        // 4. Status Filters
        const effDate = getEffectiveExpiry(item);
        const daysLeft = effDate ? getDaysUntil(effDate) : 9999;
        if (AppState.filters.expired && daysLeft >= 0) return false;
        if (AppState.filters.soon && (daysLeft < 0 || daysLeft > 30)) return false;

        return true;
    });

    // Sort Logic
    filtered.sort((a, b) => {
        if (AppState.sortBy === 'date') return new Date(b.createdAt) - new Date(a.createdAt);
        if (AppState.sortBy === 'location') {
            const la = a.location ? `${a.location.house}${a.location.room}${a.location.storage}` : 'zzz';
            const lb = b.location ? `${b.location.house}${b.location.room}${b.location.storage}` : 'zzz';
            return la.localeCompare(lb);
        }
        if (AppState.sortBy === 'expiry') {
            const da = getEffectiveExpiry(a);
            const db = getEffectiveExpiry(b);
            if (!da) return 1;
            if (!db) return -1;
            return da - db;
        }
        if (AppState.sortBy === 'category') return a.category.localeCompare(b.category);
        return 0;
    });

    if (filtered.length === 0) {
        inventoryList.innerHTML = `<div class="empty-state"><p>No items found.</p></div>`;
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'inventory-item';

        // Expiry Status
        const effDate = getEffectiveExpiry(item);
        let expiryHtml = '';
        if (effDate) {
            const daysLeft = getDaysUntil(effDate);
            let cls = 'ok'; let label = 'Exp';
            if (daysLeft < 0) cls = 'expired';
            else if (daysLeft < 30) cls = 'soon';

            if (item.isOpened) label = 'Eff. Exp';
            const dateStr = effDate.toISOString().split('T')[0];
            expiryHtml = `<span class="expiry-tag ${cls}">${label}: ${dateStr}</span>`;
        }

        // Location Display Logic: Hide House if we are filtering by it
        const loc = item.location || {};
        let locDisplay = `<div>${escapeHtml(loc.house || '-')}</div>`;
        if (AppState.filters.house && AppState.filters.house === loc.house) {
            locDisplay = ''; // Hide house if redundant
        }

        card.innerHTML = `
            <div class="header">
                <div>
                   <h3>${escapeHtml(item.name)}</h3>
                   <small class="barcode">${escapeHtml(item.barcode)}</small>
                </div>
                <!-- Quantity Controls -->
                <div class="qty-control">
                    <button class="icon-btn-small minus" onclick="updateQuantity('${item.id}', -1)">-</button>
                    <span class="qty-val">x${item.quantity || 0}</span>
                    <button class="icon-btn-small plus" onclick="updateQuantity('${item.id}', 1)">+</button>
                </div>
            </div>
            <div class="meta-row">
                 <div class="loc-col" style="text-align:left; font-size:11px; color:var(--primary-color)">
                    ${locDisplay}
                    <div>${escapeHtml(loc.room || '')}</div>
                    <div>${escapeHtml(loc.storage || '')}</div>
                </div>
                <div class="meta-right">
                    <span>${escapeHtml(item.category)} ${item.isOpened ? '(Opened)' : ''}</span>
                    ${expiryHtml}
                </div>
            </div>
        `;
        inventoryList.appendChild(card);
    });

    if (window.feather) feather.replace();
}

// Global scope for onclick
window.updateQuantity = function (id, delta) {
    const item = AppState.items.find(i => i.id === id);
    if (item) {
        item.quantity = (item.quantity || 0) + delta;
        if (item.quantity < 0) item.quantity = 0;
        Storage.save();
        renderInventory();
    }
};

function getEffectiveExpiry(item) {
    let dates = [];
    if (item.expiry) dates.push(new Date(item.expiry));

    if (item.isOpened && item.openedDate && item.shelfLife) {
        const openD = new Date(item.openedDate);
        // Add months
        openD.setMonth(openD.getMonth() + parseInt(item.shelfLife));
        dates.push(openD);
    }

    if (dates.length === 0) return null;
    return new Date(Math.min(...dates));
}

function getDaysUntil(dateObj) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dateObj.setHours(0, 0, 0, 0);
    return Math.ceil((dateObj - today) / (86400000));
}


// --- ADD ITEM FORM ---
function initAddForm() {
    form.category.innerHTML = '<option value="">Select Category...</option>';
    AppState.categories.forEach(c => form.category.add(new Option(c, c)));

    updateHierarchySelects('house');

    // Auto-fill opened date if checked
    form.isOpened.addEventListener('change', () => {
        if (form.isOpened.checked) {
            form.openedMeta.classList.remove('hidden');
            if (!form.openedDate.value) {
                form.openedDate.valueAsDate = new Date();
            }
        } else {
            form.openedMeta.classList.add('hidden');
        }
    });

    // Add Hierarchy Logic (Same as before but ensures refresh on tab switch)
    form.house.onchange = () => updateHierarchySelects('house');
    form.room.onchange = () => updateHierarchySelects('room');
}

function updateHierarchySelects(level) {
    const struct = AppState.locationStructure;

    if (level === 'house') {
        const cur = form.house.value;
        form.house.innerHTML = '<option value="">Select House...</option>';
        Object.keys(struct).sort().forEach(h => form.house.add(new Option(h, h)));
        if (cur && struct[cur]) form.house.value = cur;

        form.room.innerHTML = '<option value="">Select Room...</option>';
        form.room.disabled = true;
        form.storage.innerHTML = '<option value="">Select Storage...</option>';
        form.storage.disabled = true;

        if (form.house.value) updateHierarchySelects('room');
    }
    if (level === 'room') {
        const h = form.house.value;
        if (!h) return;
        const cur = form.room.value;
        form.room.innerHTML = '<option value="">Select Room...</option>';
        form.room.disabled = false;
        Object.keys(struct[h]).sort().forEach(r => form.room.add(new Option(r, r)));
        if (cur && struct[h][cur]) form.room.value = cur;

        form.storage.innerHTML = '<option value="">Select Storage...</option>';
        form.storage.disabled = true;

        if (form.room.value) updateHierarchySelects('storage');
    }
    if (level === 'storage') {
        const h = form.house.value;
        const r = form.room.value;
        if (!h || !r) return;
        const cur = form.storage.value;
        form.storage.innerHTML = '<option value="">Select Storage...</option>';
        form.storage.disabled = false;
        struct[h][r].sort().forEach(s => form.storage.add(new Option(s, s)));
        if (cur) form.storage.value = cur;
    }
}

function setupForm() {
    // Buttons for Adding Attributes (Category, House) - Simplified for brevity, assume similar to before
    form.btnAddCat.onclick = () => {
        const n = prompt("New Category:");
        if (n) { AppState.categories.push(n); Storage.save(); initAddForm(); form.category.value = n; }
    };

    // Form Submit
    document.getElementById('add-item-form')?.addEventListener('submit', (e) => {
        e.preventDefault();

        // Defensive Checks for Inputs
        if (!form.name || !form.category || !form.house || !form.room || !form.storage) {
            alert("Error: Missing form inputs. Please reload.");
            return;
        }

        const nameVal = form.name.value.trim();
        const catVal = form.category.value;
        const loc = {
            house: form.house.value,
            room: form.room.value,
            storage: form.storage.value
        };

        // Explicit Validation with Clear Messages
        if (!nameVal) {
            alert("Please enter an Item Name.");
            form.name.focus();
            return;
        }

        // Category and Location are optional
        // We save them as empty strings/objects if missing.

        const qty = parseInt(form.quantity?.value) || 1;

        const newItem = {
            id: Date.now().toString(),
            barcode: form.barcode?.value.trim() || "",
            name: nameVal,
            category: catVal,
            quantity: qty,
            isOpened: form.isOpened?.checked || false,
            openedDate: form.isOpened?.checked ? form.openedDate?.value : null,
            shelfLife: form.isOpened?.checked ? form.shelfLife?.value : null,
            expiry: form.expiry?.value || "",
            location: loc,
            createdAt: new Date().toISOString()
        };

        AppState.items.push(newItem);
        Storage.save();
        alert("Item saved successfully!");

        // Reset critical fields
        form.name.value = '';
        if (form.barcode) form.barcode.value = '';
        if (form.expiry) form.expiry.value = '';
        // Keep Location & Category for easier entry of multiple items
    });
}


// --- LOCATION TREE & CRUD ---
function setupLocationsUI() {
    // Top-level adds
    btnAddRoot.onclick = () => {
        const h = prompt("New House Name:");
        if (h && !AppState.locationStructure[h]) {
            AppState.locationStructure[h] = {};
            Storage.save();
            renderLocationTree();
            populateFilterDropdowns('house');
            updateHierarchySelects('house');
        }
    };

    // Data Management
    document.getElementById('btn-export-data').onclick = exportData;
    document.getElementById('btn-import-data').onclick = () => document.getElementById('file-import-input').click();

    document.getElementById('file-import-input').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                // Validate basic structure
                if (data.items && data.locationStructure && data.categories) {
                    if (confirm("This will OVERWRITE all current data. Are you sure?")) {
                        AppState.items = data.items;
                        AppState.locationStructure = data.locationStructure;
                        AppState.categories = data.categories;
                        Storage.save();
                        alert("Data restored successfully! App will reload.");
                        location.reload();
                    }
                } else {
                    alert("Invalid backup file format.");
                }
            } catch (err) {
                alert("Error parsing file: " + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset
    };
}

function exportData() {
    const data = {
        items: AppState.items,
        locationStructure: AppState.locationStructure,
        categories: AppState.categories,
        exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function renderLocationTree() {
    locationTreeContainer.innerHTML = '';
    const struct = AppState.locationStructure;

    // Sort Houses
    Object.keys(struct).sort().forEach(house => {
        const houseNode = createTreeNode(house, 'house');
        const houseList = document.createElement('div');
        houseList.style.paddingLeft = '16px';

        // Rooms
        const rooms = struct[house];
        if (rooms) {
            Object.keys(rooms).sort().forEach(room => {
                const roomNode = createTreeNode(room, 'room', house);
                const roomList = document.createElement('div');
                roomList.style.paddingLeft = '16px';

                // Storages
                const storages = rooms[room];
                if (storages) {
                    storages.sort().forEach(storage => {
                        const storageNode = createTreeNode(storage, 'storage', house, room);
                        roomList.appendChild(storageNode);
                    });
                }
                houseList.appendChild(roomNode);
                houseList.appendChild(roomList);
            });
        }

        locationTreeContainer.appendChild(houseNode);
        locationTreeContainer.appendChild(houseList);
    });

    if (window.feather) feather.replace();
}

function createTreeNode(name, type, parentHouse, parentRoom) {
    const div = document.createElement('div');
    div.className = `tree-node`;

    // Path for QR
    let path = name;
    if (type === 'room') path = `${parentHouse} > ${name}`;
    if (type === 'storage') path = `${parentHouse} > ${parentRoom} > ${name}`;

    let qrBtn = '';
    if (type === 'storage') {
        qrBtn = `<button class="icon-btn-small" onclick="showLocationsQR('${escapeHtml(path)}')" title="Show QR" style="border:none; color:var(--text-secondary);"><i data-feather="grid"></i></button>`;
    }

    div.innerHTML = `
        <div class="tree-header ${type}">
            <span>${escapeHtml(name)}</span>
            <div class="tree-actions" style="display:flex; gap:4px;">
                ${qrBtn}
                <button class="icon-btn-small" onclick="renameLocation('${type}', '${escapeHtml(name)}', '${escapeHtml(parentHouse)}', '${escapeHtml(parentRoom)}')" title="Rename" style="border:none; color:var(--primary-color);"><i data-feather="edit-2"></i></button>
                <button class="icon-btn-small" onclick="deleteLocation('${type}', '${escapeHtml(name)}', '${escapeHtml(parentHouse)}', '${escapeHtml(parentRoom)}')" title="Delete" style="border:none; color:var(--danger-color);"><i data-feather="trash-2"></i></button>
            </div>
        </div>
    `;
    return div;
}

// QR Modal Logic
window.showLocationsQR = function (path) {
    const modal = document.getElementById('qr-display-modal');
    const target = document.getElementById('qr-code-target');
    const textEl = document.getElementById('qr-text');

    target.innerHTML = '';
    textEl.textContent = path;

    try {
        new QRCode(target, {
            text: path,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        modal.classList.remove('hidden');
    } catch (e) {
        alert("QR Library not loaded. Please reload page.");
    }

    document.getElementById('btn-close-qr').onclick = () => {
        modal.classList.add('hidden');
    };
};

window.renameLocation = function (type, oldName, pHouse, pRoom) {
    const newName = prompt("Rename " + type + " to:", oldName);
    if (!newName || newName === oldName) return;

    const struct = AppState.locationStructure;

    if (type === 'house') {
        struct[newName] = struct[oldName];
        delete struct[oldName];
        // Update Items
        AppState.items.forEach(i => { if (i.location?.house === oldName) i.location.house = newName; });
    }
    if (type === 'room') {
        struct[pHouse][newName] = struct[pHouse][oldName];
        delete struct[pHouse][oldName];
        AppState.items.forEach(i => { if (i.location?.house === pHouse && i.location?.room === oldName) i.location.room = newName; });
    }
    if (type === 'storage') {
        const arr = struct[pHouse][pRoom];
        const idx = arr.indexOf(oldName);
        if (idx !== -1) arr[idx] = newName;
        AppState.items.forEach(i => {
            if (i.location?.house === pHouse && i.location?.room === pRoom && i.location?.storage === oldName) i.location.storage = newName;
        });
    }

    Storage.save();
    renderLocationTree();
    populateFilterDropdowns('init');
};

window.deleteLocation = function (type, name, pHouse, pRoom) {
    const struct = AppState.locationStructure;

    // Recursively check for items
    const hasItems = (h, r, s) => {
        return AppState.items.some(i => {
            const l = i.location || {};
            if (l.house !== h) return false;
            if (r && l.room !== r) return false;
            if (s && l.storage !== s) return false;
            return true;
        });
    };

    if (type === 'house') {
        if (hasItems(name)) { alert("Cannot delete: House contains items."); return; }
        if (confirm(`Delete House ${name}?`)) delete struct[name];
    }
    if (type === 'room') {
        if (hasItems(pHouse, name)) { alert("Cannot delete: Room contains items."); return; }
        if (confirm(`Delete Room ${name}?`)) delete struct[pHouse][name];
    }
    if (type === 'storage') {
        if (hasItems(pHouse, pRoom, name)) { alert("Cannot delete: Storage contains items."); return; }
        if (confirm(`Delete Storage ${name}?`)) {
            const arr = struct[pHouse][pRoom];
            const idx = arr.indexOf(name);
            if (idx > -1) arr.splice(idx, 1);
        }
    }

    Storage.save();
    renderLocationTree();
    populateFilterDropdowns('init');
};


// --- SMART SCANNER ---
function setupScannerUI() {
    form.btnScanBarcode.onclick = () => startScanning('barcode');
    form.btnScanLocation.onclick = () => startScanning('loc-form');
    btnCloseScanner.onclick = stopScanning;
}

function startScanning(target) {
    if (AppState.isScanning) return;
    AppState.isScanning = true;
    AppState.scannerTarget = target;

    scannerOverlay.classList.remove('hidden');
    scannerStatus.textContent = "Checking Camera...";

    if (!AppState.html5QrCode) AppState.html5QrCode = new Html5Qrcode("reader");

    AppState.html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => handleSmartScan(text)
    ).catch(err => {
        alert("Camera Error: " + err);
        stopScanning();
    });
}

function stopScanning() {
    if (AppState.html5QrCode && AppState.isScanning) {
        AppState.html5QrCode.stop().then(() => {
            AppState.html5QrCode.clear();
            scannerOverlay.classList.add('hidden');
            AppState.isScanning = false;
        }).catch(() => {
            scannerOverlay.classList.add('hidden');
            AppState.isScanning = false;
        });
    } else {
        scannerOverlay.classList.add('hidden');
        AppState.isScanning = false;
    }
}

function handleSmartScan(text) {
    if (navigator.vibrate) navigator.vibrate(200);
    stopScanning();

    // 1. If triggered from "Add Item" fields, simple behavior
    if (AppState.scannerTarget === 'barcode') {
        form.barcode.value = text;
        // Auto-fill logic
        const existing = AppState.items.find(i => i.barcode === text);
        if (existing) { form.name.value = existing.name; form.category.value = existing.category; }
        return;
    }
    if (AppState.scannerTarget === 'loc-form') {
        tryParseLocation(text, (loc) => {
            // Fill form
            form.house.value = loc.house; updateHierarchySelects('house');
            form.room.value = loc.room; updateHierarchySelects('room');
            form.storage.value = loc.storage;
        });
        return;
    }

    // 2. "Smart Scan" from Header (Determine context vs item)
    if (AppState.scannerTarget === 'smart-scan') {
        if (text.includes(' > ')) {
            // Likely Location
            tryParseLocation(text, (loc) => {
                AppState.filters.house = loc.house;
                // Re-populate rooms based on new house
                populateFilterDropdowns('room');
                filterInputs.house.value = loc.house;

                AppState.filters.room = loc.room;
                populateFilterDropdowns('storage');
                filterInputs.room.value = loc.room;

                AppState.filters.storage = loc.storage;
                filterInputs.storage.value = loc.storage;

                renderInventory();
                alert(`Filter set to ${loc.house} > ${loc.room} > ${loc.storage}`);
            });
        } else {
            // Assume Barcode -> Search
            searchInput.value = text;
            renderInventory(); // Filters by text
        }
    }
}

function tryParseLocation(text, callback) {
    const parts = text.split(' > ');
    if (parts.length === 3) {
        callback({ house: parts[0], room: parts[1], storage: parts[2] });
    } else {
        alert("Not a valid Location QR (House > Room > Storage)");
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.addEventListener('DOMContentLoaded', init);
