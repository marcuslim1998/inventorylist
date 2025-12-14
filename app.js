/**
 * Inventory Management Logic (Refactored)
 * - Location Object Model {house, room, storage}
 * - Hierarchical Location Selection
 * - Auto-fill from History
 * - Robust Scanner Lifecycle
 */

// --- STATE MANAGEMENT ---
const AppState = {
    items: [],
    // New Structure: Categories are just a flat list of types
    categories: ['Food', 'Facial', 'General', 'Medicine', 'Stationery'],

    // New Structure: Locations as a tree-like object or flat list of objects?
    // Flat list of unique objects is easier to manage for now, or normalization.
    // Let's store unique Houses -> Rooms -> Storages.
    // Simplest: Store *Items* with { location: { house, room, storage } }
    // AND maintain a set of "Known Locations" for the dropdowns.
    locationStructure: {
        // "Home": { "Kitchen": ["Pantry", "Fridge"], "Living Room": ["Cabinet"] }
    },

    // Current Context
    currentLocation: null, // { house, room, storage } OR null
    filterMode: 'all', // 'all' | 'location' | 'category'

    // Scanner
    scannerTarget: null,
    html5QrCode: null,
    isScanning: false
};

// --- STORAGE ---
const Storage = {
    KEY_ITEMS: 'inv_items_v3_obj', // Version bump for data migration
    KEY_LOCS: 'inv_loc_struct_v1',
    KEY_CATS: 'inv_cats_v2',

    save: () => {
        localStorage.setItem(Storage.KEY_ITEMS, JSON.stringify(AppState.items));
        localStorage.setItem(Storage.KEY_LOCS, JSON.stringify(AppState.locationStructure));
        localStorage.setItem(Storage.KEY_CATS, JSON.stringify(AppState.categories));
    },

    load: () => {
        const i = localStorage.getItem(Storage.KEY_ITEMS);
        const l = localStorage.getItem(Storage.KEY_LOCS);
        const c = localStorage.getItem(Storage.KEY_CATS);

        if (c) AppState.categories = JSON.parse(c);
        if (l) AppState.locationStructure = JSON.parse(l);

        if (i) {
            AppState.items = JSON.parse(i);
        } else {
            // Check for v2 migration?
            // For simplicity in this prompt context, we'll start fresh or leave old keys alone.
            // PROMPT: "Location must be stored as object"
        }

        // Ensure defaults
        if (Object.keys(AppState.locationStructure).length === 0) {
            // Default Seed
            AppState.locationStructure = {
                "Home": { "Kitchen": ["Pantry", "Fridge"] },
                "Office": { "Desk": ["Drawer 1"] }
            };
        }
    }
};

// --- DOM ELEMENTS ---
// Views
const views = {
    inventory: document.getElementById('view-inventory'),
    add: document.getElementById('view-add-item'),
    locations: document.getElementById('view-locations')
};
const navItems = document.querySelectorAll('.nav-item');

// Inventory View
const inventoryList = document.getElementById('inventory-list');
const searchInput = document.getElementById('inventory-search');
const filterTabs = document.querySelectorAll('.filter-tab');
const activeFilterDisplay = document.getElementById('active-filter-display');
const filterContextText = document.getElementById('filter-context-text');
const btnClearFilter = document.getElementById('btn-clear-filter');

// Add Item View
const form = {
    barcode: document.getElementById('item-barcode'),
    name: document.getElementById('item-name'),
    category: document.getElementById('item-category'),
    expiry: document.getElementById('item-expiry'),
    // Hierarchy inputs
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
const locDisp = {
    house: document.getElementById('disp-house'),
    room: document.getElementById('disp-room'),
    storage: document.getElementById('disp-storage'),
    // btnReset: document.getElementById('btn-reset-location'), // Fixed: was btn-manual-location-tab in prev plan, updated in HTML?
    btnScan: document.getElementById('btn-scan-location-tab'),
    btnReset: document.getElementById('btn-reset-location')
};

// Scanner
const scannerOverlay = document.getElementById('scanner-overlay');
const btnCloseScanner = document.getElementById('btn-close-scanner');
const scannerStatus = document.getElementById('scanner-status');


// --- INITIALIZATION ---
function init() {
    Storage.load();
    setupNavigation();
    setupFilters();
    setupForm();
    setupScannerUI();

    // Initial Render
    renderInventory();
    updateLocationView();
}

// --- HELPER: LOCATION MANAGMENT ---
function updateLocationStructure(house, room, storage) {
    if (!house) return;
    if (!AppState.locationStructure[house]) AppState.locationStructure[house] = {};

    if (room) {
        if (!AppState.locationStructure[house][room]) AppState.locationStructure[house][room] = [];

        if (storage) {
            if (!AppState.locationStructure[house][room].includes(storage)) {
                AppState.locationStructure[house][room].push(storage);
            }
        }
    }
    Storage.save();
}

function getLocationString(locObj) {
    if (!locObj) return "Unknown";
    return `${locObj.house} > ${locObj.room} > ${locObj.storage}`;
}


// --- NAVIGATION & VIEWS ---
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

    if (id === 'view-add-item') {
        initAddForm();
    } else if (id === 'view-inventory') {
        renderInventory();
    }
}


// --- INVENTORY FILTERING ---
function setupFilters() {
    filterTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            filterTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            const mode = tab.getAttribute('data-filter-mode');
            AppState.filterMode = mode;

            // If filtering by location but none set, prompt or show all?
            // If filtering by location, we filter by AppState.currentLocation

            renderInventory();
        });
    });

    btnClearFilter.addEventListener('click', () => {
        AppState.currentLocation = null;
        updateLocationView();
        renderInventory();
    });

    searchInput.addEventListener('input', renderInventory);
}

function renderInventory() {
    inventoryList.innerHTML = '';

    let filtered = AppState.items.filter(item => {
        // 1. Text Search
        const term = searchInput.value.toLowerCase();
        if (term && !item.name.toLowerCase().includes(term) && !item.barcode.includes(term)) {
            return false;
        }

        // 2. Tab Modes
        if (AppState.filterMode === 'location') {
            // Must match current location context (if set)
            if (AppState.currentLocation) {
                // Strict match? Or hierarchical match?
                // Let's do Hierarchical: Match House, then Room if set, then Storage if set
                const c = AppState.currentLocation;
                if (item.location.house !== c.house) return false;
                if (c.room && item.location.room !== c.room) return false;
                if (c.storage && item.location.storage !== c.storage) return false;
            }
        } else if (AppState.filterMode === 'category') {
            // Maybe sort by category? Or if we had a specific category selected.
            // For now just Sort by Category
        }

        return true;
    });

    // Sort
    if (AppState.filterMode === 'category') {
        filtered.sort((a, b) => a.category.localeCompare(b.category));
    } else {
        // Default sort by Date added (newest first) or Location
        filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    // Display Active Filter Context
    if (AppState.currentLocation && AppState.filterMode === 'location') {
        activeFilterDisplay.classList.remove('hidden');
        filterContextText.textContent = `In: ${getLocationString(AppState.currentLocation)}`;
    } else {
        activeFilterDisplay.classList.add('hidden');
    }

    if (filtered.length === 0) {
        inventoryList.innerHTML = `<div class="empty-state"><p>No items found.</p></div>`;
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'inventory-item';

        let expiryHtml = '';
        if (item.expiry) {
            const diff = Math.ceil((new Date(item.expiry) - new Date()) / (86400000));
            let cls = 'ok';
            if (diff < 0) cls = 'expired';
            else if (diff < 7) cls = 'soon';
            expiryHtml = `<span class="expiry-tag ${cls}">Exp: ${item.expiry}</span>`;
        }

        card.innerHTML = `
            <div class="header">
                <div>
                   <h3>${escapeHtml(item.name)}</h3>
                   <small class="barcode">${escapeHtml(item.barcode)}</small>
                </div>
                <!-- Mini Location Badge -->
                <div style="text-align:right; font-size:11px; color:var(--primary-color)">
                    <div>${escapeHtml(item.location.house)}</div>
                    <div>${escapeHtml(item.location.room)}</div>
                    <div>${escapeHtml(item.location.storage)}</div>
                </div>
            </div>
            <div class="meta">
                <span>${escapeHtml(item.category)}</span>
                ${expiryHtml}
            </div>
        `;
        inventoryList.appendChild(card);
    });
}


// --- ADD ITEM FORM & HIERARCHY ---
function initAddForm() {
    // Populate Categories
    form.category.innerHTML = '';
    AppState.categories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        form.category.appendChild(opt);
    });

    // Populate Hierarchy Root (Houses)
    updateHierarchySelects('house');

    // Inherit Current Location if set
    if (AppState.currentLocation) {
        setFormLocation(AppState.currentLocation);
    }
}

function updateHierarchySelects(levelChanged) {
    // levelChanged: 'house' | 'room' (triggers next level update)

    const hNodes = AppState.locationStructure;

    if (levelChanged === 'house') {
        // Populate Houses
        const currentHouse = form.house.value;
        form.house.innerHTML = '<option value="">Select House...</option>';
        Object.keys(hNodes).sort().forEach(h => {
            form.house.add(new Option(h, h));
        });
        if (currentHouse && hNodes[currentHouse]) form.house.value = currentHouse;

        // Reset dependent
        form.room.innerHTML = '<option value="">Select Room...</option>';
        form.room.disabled = true;
        form.storage.innerHTML = '<option value="">Select Storage...</option>';
        form.storage.disabled = true;

        if (form.house.value) updateHierarchySelects('room');
    }
    else if (levelChanged === 'room') {
        const h = form.house.value;
        if (!h || !hNodes[h]) return;

        const currentRoom = form.room.value;
        form.room.innerHTML = '<option value="">Select Room...</option>';
        // Keys of house object are rooms
        Object.keys(hNodes[h]).sort().forEach(r => {
            form.room.add(new Option(r, r));
        });
        form.room.disabled = false;
        if (currentRoom && hNodes[h][currentRoom]) form.room.value = currentRoom;

        // Reset dependent
        form.storage.innerHTML = '<option value="">Select Storage...</option>';
        form.storage.disabled = true;

        if (form.room.value) updateHierarchySelects('storage');
    }
    else if (levelChanged === 'storage') {
        const h = form.house.value;
        const r = form.room.value;
        if (!h || !r || !hNodes[h][r]) return;

        const currentStorage = form.storage.value;
        form.storage.innerHTML = '<option value="">Select Storage...</option>';
        hNodes[h][r].sort().forEach(s => {
            form.storage.add(new Option(s, s));
        });
        form.storage.disabled = false;
        if (currentStorage) form.storage.value = currentStorage;
    }
}

function setFormLocation(locObj) {
    if (!locObj) return;
    // We must ensure they exist in structure first? 
    // They should if currentLocation was set validly.
    updateLocationStructure(locObj.house, locObj.room, locObj.storage);

    form.house.value = locObj.house || "";
    updateHierarchySelects('house'); // Refreshes rooms

    form.room.value = locObj.room || "";
    updateHierarchySelects('room'); // Refreshes storage

    form.storage.value = locObj.storage || "";
}

function setupForm() {
    // Add Buttons
    form.btnAddCat.addEventListener('click', () => {
        const n = prompt("New Category:");
        if (n && !AppState.categories.includes(n)) {
            AppState.categories.push(n);
            AppState.categories.sort();
            Storage.save();
            initAddForm(); // refresh list
            form.category.value = n;
        }
    });

    form.btnAddHouse.addEventListener('click', () => {
        const n = prompt("New House:");
        if (n) {
            updateLocationStructure(n);
            form.house.value = n;
            updateHierarchySelects('house');
        }
    });

    form.btnAddRoom.addEventListener('click', () => {
        if (!form.house.value) return alert("Select House first");
        const n = prompt("New Room:");
        if (n) {
            updateLocationStructure(form.house.value, n);
            form.room.value = n;
            updateHierarchySelects('room');
        }
    });

    form.btnAddStorage.addEventListener('click', () => {
        if (!form.room.value) return alert("Select Room first");
        const n = prompt("New Storage:");
        if (n) {
            updateLocationStructure(form.house.value, form.room.value, n);
            form.storage.value = n;
            updateHierarchySelects('storage'); // populates list
        }
    });

    // Select Listeners
    form.house.addEventListener('change', () => updateHierarchySelects('house'));
    form.room.addEventListener('change', () => updateHierarchySelects('room'));
    form.storage.addEventListener('change', () => updateHierarchySelects('storage')); // no dependents

    // Submit
    document.getElementById('add-item-form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!form.house.value || !form.room.value || !form.storage.value) {
            alert("Please select full location");
            return;
        }

        const loc = {
            house: form.house.value,
            room: form.room.value,
            storage: form.storage.value
        };

        const newItem = {
            id: Date.now().toString(),
            barcode: form.barcode.value.trim(),
            name: form.name.value.trim(),
            category: form.category.value,
            location: loc,
            expiry: form.expiry.value,
            createdAt: new Date().toISOString()
        };

        AppState.items.push(newItem);
        Storage.save();

        // Reset fields but keep location
        form.name.value = '';
        form.barcode.value = '';
        form.expiry.value = '';

        alert("Item Added!");
    });
}


// --- LOCATION VIEW LOGIC ---
function updateLocationView() {
    const c = AppState.currentLocation;
    locDisp.house.textContent = c ? c.house : '-';
    locDisp.room.textContent = c ? c.room : '-';
    locDisp.storage.textContent = c ? c.storage : '-';
}

// Reset Context
locDisp.btnReset.addEventListener('click', () => {
    AppState.currentLocation = null;
    Storage.save();
    updateLocationView();
});


// --- SCANNER & AUTO-FILL ---
function setupScannerUI() {
    form.btnScanBarcode.addEventListener('click', () => startScanning('barcode'));
    form.btnScanLocation.addEventListener('click', () => startScanning('loc-input')); // For form fill
    locDisp.btnScan.addEventListener('click', () => startScanning('loc-context')); // For context setting

    btnCloseScanner.addEventListener('click', stopScanning);
}

function startScanning(target) {
    if (AppState.isScanning) return; // Prevent double init
    AppState.isScanning = true;
    AppState.scannerTarget = target;

    scannerOverlay.classList.remove('hidden');
    scannerStatus.textContent = "Starting Camera...";

    if (!AppState.html5QrCode) {
        AppState.html5QrCode = new Html5Qrcode("reader");
    }

    AppState.html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => handleScan(text)
    ).catch(err => {
        console.error(err);
        alert("Camera failed: " + err);
        stopScanning();
    });
}

function stopScanning() {
    if (AppState.html5QrCode && AppState.isScanning) {
        AppState.html5QrCode.stop().then(() => {
            AppState.html5QrCode.clear();
            scannerOverlay.classList.add('hidden');
            AppState.isScanning = false;
        }).catch(err => {
            console.error("Stop failed", err);
            // Force close UI anyway
            scannerOverlay.classList.add('hidden');
            AppState.isScanning = false;
        });
    } else {
        scannerOverlay.classList.add('hidden');
        AppState.isScanning = false;
    }
}

function handleScan(text) {
    if (navigator.vibrate) navigator.vibrate(200);
    stopScanning();

    const mode = AppState.scannerTarget;

    if (mode === 'barcode') {
        form.barcode.value = text;

        // Logic Enhancement: Auto-fill from History
        const existing = AppState.items.find(i => i.barcode === text);
        if (existing) {
            form.name.value = existing.name;
            form.category.value = existing.category;
            alert(`Found "${existing.name}" in history!`);
        }
    }
    else if (mode === 'loc-input' || mode === 'loc-context') {
        // Parse "House > Room > Storage"
        // If users generated QR with old tool, it's "Location Name"
        // We need to support splitting by " > "
        const parts = text.split(' > ');
        if (parts.length === 3) {
            const locObj = { house: parts[0], room: parts[1], storage: parts[2] };

            // Ensure it exists
            updateLocationStructure(locObj.house, locObj.room, locObj.storage);

            if (mode === 'loc-input') {
                setFormLocation(locObj);
            } else {
                AppState.currentLocation = locObj;
                Storage.save();
                updateLocationView();
                alert(`Context set to: ${text}`);
            }
        } else {
            alert("Invalid Location QR format. Must be 'House > Room > Storage'");
        }
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.addEventListener('DOMContentLoaded', init);
