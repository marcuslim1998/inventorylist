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
    locationStructure: {}, // { House: { Room: [Storage] } }

    // UI State
    activeContext: null, // { house, room, storage } (Filter context)
    sortBy: 'date',
    filters: {
        expired: false,
        soon: false
    },

    // Scanner
    scannerTarget: null,
    html5QrCode: null,
    isScanning: false
};

// --- STORAGE ---
const Storage = {
    KEY_ITEMS: 'inv_items_v4', // Version bump for new fields
    KEY_LOCS: 'inv_loc_struct_v1',
    KEY_CATS: 'inv_cats_v2',

    save: () => {
        localStorage.setItem(Storage.KEY_ITEMS, JSON.stringify(AppState.items));
        localStorage.setItem(Storage.KEY_LOCS, JSON.stringify(AppState.locationStructure));
        localStorage.setItem(Storage.KEY_CATS, JSON.stringify(AppState.categories));
    },

    load: () => {
        try {
            const i = localStorage.getItem(Storage.KEY_ITEMS);
            if (i) AppState.items = JSON.parse(i);

            const l = localStorage.getItem(Storage.KEY_LOCS);
            if (l) AppState.locationStructure = JSON.parse(l);

            const c = localStorage.getItem(Storage.KEY_CATS);
            if (c) AppState.categories = JSON.parse(c);
        } catch (e) { console.error("Load error", e); }

        // Defaults
        if (Object.keys(AppState.locationStructure).length === 0) {
            AppState.locationStructure = { "Home": { "Kitchen": ["Pantry"] } };
        }
    }
};

// --- DOM ELEMENTS ---
const viewInventory = document.getElementById('view-inventory');
const viewAdd = document.getElementById('view-add-item');
const viewLocations = document.getElementById('view-locations');
const navItems = document.querySelectorAll('.nav-item');

// Inventory View
const inventoryList = document.getElementById('inventory-list');
const searchInput = document.getElementById('inventory-search');
const btnToggleFilters = document.getElementById('btn-toggle-filters');
const filterPanel = document.getElementById('filter-panel');
const activeContextDisplay = document.getElementById('active-context-display');
const btnClearContext = document.getElementById('btn-clear-context');
const sortChips = document.querySelectorAll('.chip');
const filterCheckboxes = document.querySelectorAll('input[name="filter-status"]');

// Add Form
const form = {
    barcode: document.getElementById('item-barcode'),
    name: document.getElementById('item-name'),
    category: document.getElementById('item-category'),
    expiry: document.getElementById('item-expiry'),
    quantity: document.getElementById('item-quantity'),
    isOpened: document.getElementById('item-opened'),
    openedDate: document.getElementById('item-opened-date'),
    shelfLife: document.getElementById('item-shelf-life'),
    openedMeta: document.getElementById('opened-meta-fields'),

    house: document.getElementById('loc-house'),
    room: document.getElementById('loc-room'),
    storage: document.getElementById('loc-storage'),

    btnScanBarcode: document.getElementById('btn-scan-input'),
    btnScanLocation: document.getElementById('btn-scan-location-input'),
    btnAddCat: document.getElementById('btn-add-category'),
    btnAddHouse: document.getElementById('btn-add-house'),
    btnAddRoom: document.getElementById('btn-add-room'),
    btnAddStorage: document.getElementById('btn-add-storage'),
};

// Location View
const locationTreeContainer = document.getElementById('location-tree-container');
const btnAddRoot = document.getElementById('btn-add-root');

// Scanner
const scannerOverlay = document.getElementById('scanner-overlay');
const btnCloseScanner = document.getElementById('btn-close-scanner');
const scannerStatus = document.getElementById('scanner-status');


// --- INITIALIZATION ---
function init() {
    Storage.load();
    setupNavigation();
    setupInventoryUI();
    setupForm();
    setupScannerUI();
    setupLocationsUI();

    renderInventory();
    renderLocationTree();
}


// --- NAVIGATION ---
function setupNavigation() {
    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target') || btn.closest('.nav-item').getAttribute('data-target');
            switchView(target);
        });
    });
}

function switchView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(id).classList.add('active');

    navItems.forEach(n => {
        const target = n.getAttribute('data-target');
        if (target === id) n.classList.add('active');
        else n.classList.remove('active');
    });

    if (id === 'view-add-item') initAddForm();
    if (id === 'view-inventory') renderInventory();
    if (id === 'view-locations') renderLocationTree();
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

    // Checkbox Filters
    filterCheckboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            AppState.filters[cb.value] = cb.checked;
            renderInventory();
        });
    });

    // Context
    btnClearContext.addEventListener('click', () => {
        AppState.activeContext = null;
        renderInventory();
    });

    searchInput.addEventListener('input', renderInventory);
}

function renderInventory() {
    inventoryList.innerHTML = '';

    // Update Context UI
    if (AppState.activeContext) {
        const c = AppState.activeContext;
        activeContextDisplay.textContent = `${c.house} > ${c.room || '*'} > ${c.storage || '*'}`;
        activeContextDisplay.classList.remove('empty');
    } else {
        activeContextDisplay.textContent = "All Locations";
        activeContextDisplay.classList.add('empty');
    }

    // Filter Logic
    let filtered = AppState.items.filter(item => {
        // 1. Text Search (Search Name or Barcode)
        const term = searchInput.value.toLowerCase();
        if (term && !item.name.toLowerCase().includes(term) && !item.barcode.includes(term)) {
            return false;
        }

        // 2. Active Context (Location Filter)
        if (AppState.activeContext) {
            const c = AppState.activeContext;
            const loc = item.location || {}; // Handle missing location
            if (loc.house !== c.house) return false;
            // Strict or lenient hierarchy? If context has room, item must match.
            // If item has no room, it doesn't match a Room-specific context.
            if (c.room && loc.room !== c.room) return false;
            if (c.storage && loc.storage !== c.storage) return false;
        }

        // 3. Status Filters (Expired / Soon)
        // Need to calculate status first to filter by it
        const effDate = getEffectiveExpiry(item);
        const daysLeft = effDate ? getDaysUntil(effDate) : 9999;

        if (AppState.filters.expired && daysLeft >= 0) return false; // Only show < 0
        if (AppState.filters.soon && (daysLeft < 0 || daysLeft > 30)) return false; // Only show 0-30? Assuming 'soon' means within 30 days.

        return true;
    });

    // Sort Logic
    filtered.sort((a, b) => {
        if (AppState.sortBy === 'date') return new Date(b.createdAt) - new Date(a.createdAt); // Newest first
        if (AppState.sortBy === 'location') {
            const la = a.location ? `${a.location.house}${a.location.room}${a.location.storage}` : 'zzz'; // Push empty to end
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
            let cls = 'ok';
            let label = 'Exp';

            if (daysLeft < 0) cls = 'expired';
            else if (daysLeft < 14) cls = 'soon'; // 2 weeks warning for food?

            if (item.isOpened) label = 'Eff. Exp'; // effective expiry

            const dateStr = effDate.toISOString().split('T')[0];
            expiryHtml = `<span class="expiry-tag ${cls}">${label}: ${dateStr}</span>`;
        }

        card.innerHTML = `
            <div class="header">
                <div>
                   <h3>${escapeHtml(item.name)} <span style="font-weight:400; font-size:14px; color:#555">x${item.quantity || 1}</span></h3>
                   <small class="barcode">${escapeHtml(item.barcode)}</small>
                </div>
                <div style="text-align:right; font-size:11px; color:var(--primary-color)">
                    <div>${escapeHtml(item.location?.house || '-')}</div>
                    <div>${escapeHtml(item.location?.room || '')}</div>
                    <div>${escapeHtml(item.location?.storage || '')}</div>
                </div>
            </div>
            <div class="meta">
                <span>${escapeHtml(item.category)} ${item.isOpened ? '(Opened)' : ''}</span>
                ${expiryHtml}
            </div>
        `;
        inventoryList.appendChild(card);
    });
}

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
    form.category.innerHTML = '';
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

        // Category and Location are now OPTIONAL as requested
        // if (!catVal) {
        //     alert("Please select a Category.");
        //     return;
        // }
        // if (!loc.house || !loc.room || !loc.storage) {
        //     alert("Please select a full Location (House, Room, and Storage).");
        //     return;
        // }

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
    btnAddRoot.onclick = () => {
        const n = prompt("New House Name:");
        if (n && !AppState.locationStructure[n]) {
            AppState.locationStructure[n] = {};
            Storage.save();
            renderLocationTree();
        }
    };
}

function renderLocationTree() {
    locationTreeContainer.innerHTML = '';
    const struct = AppState.locationStructure;

    Object.keys(struct).sort().forEach(house => {
        const hNode = createTreeNode('house', house, () => deleteNode('house', house), () => renameNode('house', house));

        // Rooms
        const rooms = struct[house];
        Object.keys(rooms).sort().forEach(room => {
            const rNode = createTreeNode('room', room, () => deleteNode('room', room, house), () => renameNode('room', room, house));

            // Storages
            rooms[room].sort().forEach(storage => {
                const sNode = createTreeNode('storage', storage, () => deleteNode('storage', storage, house, room), () => renameNode('storage', storage, house, room));
                rNode.appendChild(sNode);
            });

            // Add Storage Btn
            const addS = document.createElement('button');
            addS.textContent = "+ Storage";
            addS.className = "text-btn small";
            addS.style.marginLeft = "24px";
            addS.onclick = () => {
                const n = prompt("New Storage in " + room);
                if (n) {
                    if (!rooms[room].includes(n)) rooms[room].push(n);
                    Storage.save(); renderLocationTree();
                }
            };
            rNode.appendChild(addS);

            hNode.appendChild(rNode);
        });

        // Add Room Btn
        const addR = document.createElement('button');
        addR.textContent = "+ Room";
        addR.className = "text-btn small";
        addR.style.marginLeft = "12px";
        addR.onclick = () => {
            const n = prompt("New Room in " + house);
            if (n && !struct[house][n]) {
                struct[house][n] = [];
                Storage.save(); renderLocationTree();
            }
        };
        hNode.appendChild(addR);

        locationTreeContainer.appendChild(hNode);
    });
}

function createTreeNode(type, name, deleteFn, renameFn) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tree-node';

    const header = document.createElement('div');
    header.className = `tree-header ${type}`;
    header.innerHTML = `<span>${escapeHtml(name)}</span>`;

    const actions = document.createElement('div');
    actions.className = 'tree-actions';

    const btnRen = document.createElement('button');
    btnRen.textContent = '✏️';
    btnRen.onclick = renameFn;

    const btnDel = document.createElement('button');
    btnDel.textContent = '🗑️';
    btnDel.className = 'del';
    btnDel.onclick = deleteFn;

    actions.append(btnRen, btnDel);
    header.appendChild(actions);
    wrapper.appendChild(header);
    return wrapper;
}

function deleteNode(type, name, house, room) {
    // Check constraints: Are there items here?
    const hasItems = AppState.items.some(i => {
        if (type === 'house') return i.location.house === name;
        if (type === 'room') return i.location.house === house && i.location.room === name;
        if (type === 'storage') return i.location.house === house && i.location.room === room && i.location.storage === name;
        return false;
    });

    if (hasItems) return alert("Cannot delete: Items exist in this location.");

    if (confirm(`Delete ${type} "${name}"?`)) {
        if (type === 'house') delete AppState.locationStructure[name];
        if (type === 'room') delete AppState.locationStructure[house][name];
        if (type === 'storage') {
            const idx = AppState.locationStructure[house][room].indexOf(name);
            if (idx > -1) AppState.locationStructure[house][room].splice(idx, 1);
        }
        Storage.save();
        renderLocationTree();
    }
}

function renameNode(type, oldName, house, room) {
    const newName = prompt("Rename to:", oldName);
    if (!newName || newName === oldName) return;

    // Update Structure
    if (type === 'house') {
        AppState.locationStructure[newName] = AppState.locationStructure[oldName];
        delete AppState.locationStructure[oldName];
    }
    if (type === 'room') {
        AppState.locationStructure[house][newName] = AppState.locationStructure[house][oldName];
        delete AppState.locationStructure[house][oldName];
    }
    if (type === 'storage') {
        const arr = AppState.locationStructure[house][room];
        arr[arr.indexOf(oldName)] = newName;
    }

    // Update Items (Migration)
    AppState.items.forEach(i => {
        if (type === 'house' && i.location.house === oldName) i.location.house = newName;
        if (type === 'room' && i.location.house === house && i.location.room === oldName) i.location.room = newName;
        if (type === 'storage' && i.location.house === house && i.location.room === room && i.location.storage === oldName) i.location.storage = newName;
    });

    Storage.save();
    renderLocationTree();
}


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
                AppState.activeContext = loc;
                renderInventory();
                alert(`Context set to ${loc.house} > ...`);
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
