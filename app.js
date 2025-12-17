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
    locations: document.getElementById('view-locations'),
    settings: document.getElementById('view-settings')
};

// ...

// --- INITIALIZATION ---
// --- INITIALIZATION ---
function init() {
    try {
        Storage.load();
        // Global Undo Button
        const btnUndo = document.getElementById('btn-undo');
        if (btnUndo) {
            btnUndo.onclick = () => {
                // alert("Undo Clicked");
                performUndo();
                // Hide Toast after click
                document.getElementById('undo-toast').classList.add('hidden');
            };
        } else {
            console.error("Undo Button not found in DOM");
        }

        setupNavigation();
        setupInventoryUI();
        setupForm();
        setupScannerUI();
        setupLocationsUI();
        // setupLocationsUI(); // Removed Duplicate
        setupSettingsUI();
        setupItemDetailsUI(); // NEW

        renderInventory();
        renderLocationTree();
        if (window.feather) feather.replace();
    } catch (e) {
        alert("Init Error: " + e.message);
    }
}

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


// Duplicate init removed
// The correct init is defined above


function setupNavigation() {
    // Bottom Nav Items
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
            if (targetId === 'view-settings') {
                syncCategories();
                renderCategorySettings();
                renderStats();
            }
        });
    });

    // FAB Add Button Logic
    const fab = document.getElementById('fab-add-item');
    if (fab) {
        fab.addEventListener('click', () => {
            // Deselect all bottom nav
            navItems.forEach(b => b.classList.remove('active'));

            // Switch View
            Object.values(views).forEach(v => v.classList.remove('active'));
            views.addItem.classList.add('active'); // view-add-item

            initAddForm();
        });
    }
}

// Ensure categories in use are in the list
function syncCategories() {
    const used = new Set(AppState.items.map(i => i.category).filter(c => c && c !== 'Uncategorized'));
    let changed = false;
    used.forEach(c => {
        if (!AppState.categories.includes(c)) {
            AppState.categories.push(c);
            changed = true;
        }
    });
    if (changed) {
        AppState.categories.sort();
        Storage.save();
    }
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
        // Item Click Listener (excluding action buttons)
        card.onclick = (e) => {
            if (e.target.closest('button')) return; // Ignore button clicks
            // console.log("Card Clicked", item.name);
            openItemDetails(item);
        };

        inventoryList.appendChild(card);
    });

    if (window.feather) feather.replace();
}

// --- ITEM DETAILS MODAL ---
function setupItemDetailsUI() {
    const modal = document.getElementById('item-details-modal');
    const form = document.getElementById('edit-item-form');
    const btnClose = document.getElementById('btn-close-details');
    const btnDelete = document.getElementById('btn-delete-item');

    // Close Logic
    const close = () => modal.classList.add('hidden');
    btnClose.onclick = close;

    // Hierarchy Logic for Edit Form
    const updateEditHierarchy = (level) => {
        const s = AppState.locationStructure;
        const h = document.getElementById('edit-house').value;
        const rSelect = document.getElementById('edit-room');
        const sSelect = document.getElementById('edit-storage');

        if (level === 'house') {
            rSelect.innerHTML = '<option value="">Select Room...</option>';
            sSelect.innerHTML = '<option value="">Select Storage...</option>';
            if (h && s[h]) {
                Object.keys(s[h]).sort().forEach(r => rSelect.add(new Option(r, r)));
            }
        }
        if (level === 'room') {
            const r = rSelect.value;
            sSelect.innerHTML = '<option value="">Select Storage...</option>';
            if (h && r && s[h][r]) {
                s[h][r].sort().forEach(st => sSelect.add(new Option(st, st)));
            }
        }
    };

    document.getElementById('edit-house').onchange = () => updateEditHierarchy('house');
    document.getElementById('edit-room').onchange = () => updateEditHierarchy('room');

    // Toggle Opened Meta Visibility
    const chkOpen = document.getElementById('edit-opened');
    const metaDiv = document.getElementById('edit-opened-meta');
    chkOpen.onchange = () => {
        if (chkOpen.checked) metaDiv.classList.remove('hidden');
        else metaDiv.classList.add('hidden');
    };

    // Save Changes
    form.onsubmit = (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-item-id').value;
        const item = AppState.items.find(i => i.id === id);
        if (!item) return;

        // Update Properties
        item.name = document.getElementById('edit-name').value;
        item.category = document.getElementById('edit-category').value;
        item.quantity = parseInt(document.getElementById('edit-qty').value) || 0;
        item.expiry = document.getElementById('edit-expiry').value;
        item.isOpened = document.getElementById('edit-opened').checked;

        if (item.isOpened) {
            item.openedDate = document.getElementById('edit-opened-date').value;
            item.shelfLife = document.getElementById('edit-shelf-life').value;
        } else {
            item.openedDate = null;
            item.shelfLife = null;
        }

        item.location = {
            house: document.getElementById('edit-house').value,
            room: document.getElementById('edit-room').value,
            storage: document.getElementById('edit-storage').value
        };

        Storage.save();
        renderInventory();
        close(); // Close modal

        // No toast for edit, just close. Or maybe simple alert? User didn't ask.
    };

    // Delete Item
    btnDelete.onclick = () => {
        const id = document.getElementById('edit-item-id').value;
        if (confirm("Delete this item permanently?")) {
            AppState.items = AppState.items.filter(i => i.id !== id);
            Storage.save();
            renderInventory();
            renderStats();
            close();

            // Undo for Item Delete? User didn't explicitly ask but good to have
            // AppState.lastAction = { type: 'itemDelete', item: itemSnapshot ... };
            // For now just basic delete as requested.
        }
    };
}

function openItemDetails(item) {
    const modal = document.getElementById('item-details-modal');
    if (!modal) return;

    const struct = AppState.locationStructure;

    // Fill ID
    document.getElementById('edit-item-id').value = item.id;
    document.getElementById('edit-name').value = item.name;
    document.getElementById('edit-qty').value = item.quantity;
    document.getElementById('edit-expiry').value = item.expiry || '';

    // Category
    const catSelect = document.getElementById('edit-category');
    catSelect.innerHTML = '';
    AppState.categories.forEach(c => catSelect.add(new Option(c, c)));
    catSelect.value = item.category || 'Uncategorized';

    // Opened
    const chkOpen = document.getElementById('edit-opened');
    chkOpen.checked = !!item.isOpened;
    document.getElementById('edit-opened-date').value = item.openedDate || '';
    document.getElementById('edit-shelf-life').value = item.shelfLife || '';

    // Set Initial Visibility
    const metaDiv = document.getElementById('edit-opened-meta');
    if (item.isOpened) metaDiv.classList.remove('hidden');
    else metaDiv.classList.add('hidden');

    // Location (Complex)
    const hSelect = document.getElementById('edit-house');
    const rSelect = document.getElementById('edit-room');
    const sSelect = document.getElementById('edit-storage');

    // 1. Populate Houses
    hSelect.innerHTML = '<option value="">Select House...</option>';
    Object.keys(struct).sort().forEach(h => hSelect.add(new Option(h, h)));
    hSelect.value = item.location?.house || '';

    // 2. Populate Rooms based on current House
    rSelect.innerHTML = '<option value="">Select Room...</option>';
    if (item.location?.house && struct[item.location.house]) {
        Object.keys(struct[item.location.house]).sort().forEach(r => rSelect.add(new Option(r, r)));
        rSelect.value = item.location?.room || '';
    }

    // 3. Populate Storages based on current Room
    sSelect.innerHTML = '<option value="">Select Storage...</option>';
    if (item.location?.room && struct[item.location.house]?.[item.location.room]) {
        struct[item.location.house][item.location.room].sort().forEach(s => sSelect.add(new Option(s, s)));
        sSelect.value = item.location?.storage || '';
    }

    modal.classList.remove('hidden');
}

// Undo State
AppState.lastAction = null; // { type: 'updateQty', id: '...', oldVal: 5, newVal: 4 }

// Global scope for onclick
// Global scope for onclick
window.updateQuantity = function (id, delta) {
    try {
        const item = AppState.items.find(i => i.id === id);
        if (item) {
            const oldQty = item.quantity || 0;
            const newQty = oldQty + delta;
            if (newQty < 0) return; // Cannot go negative

            item.quantity = newQty;

            // Capture Action for Undo
            AppState.lastAction = { type: 'updateQty', id: id, oldVal: oldQty, newVal: newQty };

            Storage.save();
            renderInventory();

            // Show Undo Toast
            let msg = `Quantity: ${newQty}`;
            if (newQty === 0) msg = "Item Empty (Hidden)";
            console.log("Calling showUndoToast");
            showUndoToast(msg, performUndo);
        }
    } catch (e) {
        alert("Update Error: " + e.message);
    }
};

// --- TOAST NOTIFICATIONS ---
function showUndoToast(message, undoCallback) {
    const toast = document.getElementById('undo-toast');
    const msgSpan = document.getElementById('undo-message');
    const btnUndo = document.getElementById('btn-undo');

    if (!toast || !msgSpan || !btnUndo) return;

    msgSpan.textContent = message;
    toast.classList.remove('hidden');

    // Re-bind click every time
    btnUndo.onclick = () => {
        undoCallback();
        toast.classList.add('hidden');
    };

    // Auto-hide after 5 seconds
    if (window.undoTimer) clearTimeout(window.undoTimer);
    window.undoTimer = setTimeout(() => {
        toast.classList.add('hidden');
    }, 5000);
}

// --- UNDO SYSTEM ---
function performUndo() {
    if (!AppState.lastAction) {
        return;
    }
    const action = AppState.lastAction;

    const struct = AppState.locationStructure;

    // --- RESTORE LOGIC ---
    if (action.type === 'updateQty') {
        const item = AppState.items.find(i => i.id === action.id);
        if (item) {
            item.quantity = action.oldVal;
        }
    }
    // MISSING LOGIC ADDED HERE
    else if (action.type === 'catRename') {
        // Restore Name in List
        const idx = AppState.categories.indexOf(action.newVal);
        if (idx !== -1) AppState.categories[idx] = action.oldVal;
        AppState.categories.sort();

        // Restore Items
        action.ids.forEach(id => {
            const item = AppState.items.find(i => i.id === id);
            if (item) item.category = action.oldVal;
        });

        renderCategorySettings();
    }
    else if (action.type === 'catDelete') {
        // Restore Category
        if (!AppState.categories.includes(action.name)) {
            AppState.categories.push(action.name);
            AppState.categories.sort();
        }

        // Restore Items
        action.ids.forEach(id => {
            const item = AppState.items.find(i => i.id === id);
            if (item) {
                item.category = action.name;
            }
        });

        // Ensure consistency
        syncCategories();

        renderCategorySettings();
    }
    else if (action.type === 'restoreHouse') {
        struct[action.name] = action.data; // Restore subtree
        populateFilterDropdowns('house');
    }
    else if (action.type === 'restoreRoom') {
        if (struct[action.house]) { // Safety
            struct[action.house][action.name] = action.data;
        }
    }
    else if (action.type === 'restoreStorage') {
        if (struct[action.house] && struct[action.house][action.room]) {
            // Restore string to array
            const arr = struct[action.house][action.room];
            if (!arr.includes(action.name)) {
                arr.push(action.name);
            }
        }
    }

    Storage.save();
    renderInventory();

    // Refresh Filter Dropdowns if needed
    if (action.type && (action.type.startsWith('cat') || action.type.startsWith('restore'))) {
        populateFilterDropdowns(); // Refresh all
    }
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
    // Buttons for Adding Attributes (Category, House)
    form.btnAddCat.onclick = () => {
        const n = prompt("New Category:");
        if (n) { AppState.categories.push(n); Storage.save(); initAddForm(); form.category.value = n; }
    };
    form.btnAddHouse.onclick = () => {
        const n = prompt("New House Name:");
        if (n && !AppState.locationStructure[n]) {
            AppState.locationStructure[n] = {};
            Storage.save();
            updateHierarchySelects('house');
            form.house.value = n;
            updateHierarchySelects('room');
            renderLocationTree();
        }
    };
    // ... Sub-locations: for now rely on Manage Locations or just create logic here if needed, but user didn't ask.
    // Actually, user wants 'all info optional except name'.
    // So 'Hierarchy' should not be enforced.

    // Form Submit
    document.getElementById('add-item-form')?.addEventListener('submit', (e) => {
        e.preventDefault();

        const nameVal = form.name.value.trim();
        if (!nameVal) {
            alert("Please enter a Product Name.");
            form.name.focus();
            return;
        }

        const catVal = form.category.value || "Uncategorized";
        const loc = {
            house: form.house.value || "",
            room: form.room.value || "",
            storage: form.storage.value || ""
        };

        const qty = parseInt(form.quantity?.value) || 1;
        const barcodeVal = form.barcode?.value.trim() || "";

        // CHECK FOR EXISTING TO MERGE
        // We match if: Same Barcode (if present) AND Same Location AND Same Name (to be safe)
        // If no barcode, we might rely on Name + Location? Let's stick to Barcode primarily if valid.
        // User asked: "if i scan ... auto add".

        let existing = null;
        if (barcodeVal) {
            existing = AppState.items.find(i =>
                i.barcode === barcodeVal &&
                i.location.house === loc.house &&
                i.location.room === loc.room &&
                i.location.storage === loc.storage
            );
        } else {
            // Optional: Match by strict Name match if no barcode? 
            // Might be risky if user intends different batches. But let's do it for convenience if exact name matches.
            existing = AppState.items.find(i =>
                i.name === nameVal &&
                i.location.house === loc.house &&
                i.location.room === loc.room &&
                i.location.storage === loc.storage
            );
        }

        if (existing) {
            existing.quantity = (existing.quantity || 0) + qty;
            alert(`Updated existing item quantity! New Total: ${existing.quantity}`);
        } else {
            const newItem = {
                id: Date.now().toString(),
                barcode: barcodeVal,
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
            alert("Item saved successfully!");
        }

        Storage.save();
        renderInventory();

        // Reset fields
        form.name.value = '';
        if (form.barcode) form.barcode.value = '';
        if (form.expiry) form.expiry.value = '';
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
}

function setupSettingsUI() {
    console.log("Initializing Settings UI...");
    try {
        // 1. Stats
        renderStats();

        // 2. Data Management
        const btnExport = document.getElementById('btn-export-data');
        const btnImport = document.getElementById('btn-import-data');
        const fileInput = document.getElementById('file-import-input');

        if (btnExport) {
            btnExport.onclick = () => {
                console.log("Export Clicked");
                try { exportData(); } catch (e) { alert("Export Error: " + e.message); }
            };
        } else console.error("btn-export-data missing");

        if (btnImport) {
            btnImport.onclick = () => {
                console.log("Import Clicked");
                if (fileInput) fileInput.click();
            };
        } else console.error("btn-import-data missing");

        if (fileInput) {
            fileInput.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const data = JSON.parse(event.target.result);
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
                e.target.value = '';
            };
        }

        // 3. Bulk Print
        const btnPrint = document.getElementById('btn-bulk-print-qr');
        if (btnPrint) {
            btnPrint.onclick = () => {
                console.log("Print Clicked");
                try { printAllQRs(); } catch (e) { alert("Print Error: " + e.message); }
            };
        } else console.error("btn-bulk-print-qr missing");

        // 4. Category Management
        renderCategorySettings();
        document.getElementById('btn-settings-add-cat').onclick = () => {
            const n = prompt("New Category Name:");
            if (n && !AppState.categories.includes(n)) {
                AppState.categories.push(n);
                AppState.categories.sort();
                Storage.save();
                renderCategorySettings();
                populateFilterDropdowns('init');
            }
        };

        // 5. Reset Data (Danger Zone)
        const btnReset = document.getElementById('btn-reset-data');
        if (btnReset) {
            btnReset.onclick = () => {
                if (confirm("⚠️ CRITICAL WARNING ⚠️\n\nAre you sure you want to delete ALL data?\nThis cannot be undone!")) {
                    if (confirm("Final Confirmation: Delete everything?")) {
                        localStorage.removeItem('inventory_data');
                        location.reload();
                    }
                }
            };
        }

    } catch (e) {
        console.error("Error in setupSettingsUI:", e);
        alert("Settings UI Error: " + e.message);
    }
}

function renderCategorySettings() {
    const container = document.getElementById('settings-categories-list');
    container.innerHTML = '';

    AppState.categories.forEach(cat => {
        const li = document.createElement('div');
        li.className = 'tree-header'; // reuse existing style for consistency
        li.style.background = 'white';
        li.style.borderBottom = '1px solid #eee';
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';

        li.innerHTML = `
            <span>${escapeHtml(cat)}</span>
            <div class="tree-actions">
                <button class="edit-cat-btn"><i data-feather="edit-2"></i></button>
                <button class="del-cat-btn" style="color:var(--danger-color)"><i data-feather="trash-2"></i></button>
            </div>
        `;

        // Bind Edit
        li.querySelector('.edit-cat-btn').onclick = () => {
            const newName = prompt("Rename Category:", cat);
            if (newName && newName !== cat) {
                // Capture Affected Items
                const affectedIds = AppState.items.filter(i => i.category === cat).map(i => i.id);

                // Update List
                const idx = AppState.categories.indexOf(cat);
                if (idx !== -1) AppState.categories[idx] = newName;
                AppState.categories.sort();

                // Update Items
                affectedIds.forEach(id => {
                    const item = AppState.items.find(i => i.id === id);
                    if (item) item.category = newName;
                });

                // Undo Action
                AppState.lastAction = { type: 'catRename', oldVal: cat, newVal: newName, ids: affectedIds };

                Storage.save();
                renderCategorySettings();
                populateFilterDropdowns('init');
                renderInventory();

                showUndoToast(`Renamed to "${newName}"`, performUndo);
            }
        };

        // Bind Delete
        li.querySelector('.del-cat-btn').onclick = () => {
            // Capture Affected Items
            const affectedIds = AppState.items.filter(i => i.category === cat).map(i => i.id);

            // Remove from list
            AppState.categories = AppState.categories.filter(c => c !== cat);

            // Update Items
            affectedIds.forEach(id => {
                const item = AppState.items.find(i => i.id === id);
                if (item) item.category = "Uncategorized";
            });

            // Undo Action
            AppState.lastAction = { type: 'catDelete', name: cat, ids: affectedIds };

            Storage.save();
            renderCategorySettings();
            populateFilterDropdowns('init');
            renderInventory();

            showUndoToast(`Deleted "${cat}"`, performUndo);
        };

        container.appendChild(li);
    });

    if (window.feather) feather.replace();
}

function renderStats() {
    const totalItems = AppState.items.length;
    let totalQty = 0;
    AppState.items.forEach(i => totalQty += (i.quantity || 0));

    let statsHtml = `
        <div class="two-col" style="margin-bottom:10px;">
            <div>
                <h2 style="margin:0; color:var(--primary-color);">${totalItems}</h2>
                <small>Unique Items</small>
            </div>
            <div>
                <h2 style="margin:0; color:var(--primary-color);">${totalQty}</h2>
                <small>Total Quantity</small>
            </div>
        </div>
        <p style="font-size:12px; color:var(--text-secondary);">Inventory Summary</p>
    `;
    document.getElementById('settings-stats').innerHTML = statsHtml;
}

async function printAllQRs() {
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = '<div class="qr-grid"></div>';
    const grid = printArea.querySelector('.qr-grid');

    // Collect paths
    const paths = [];
    const struct = AppState.locationStructure;
    Object.keys(struct).sort().forEach(h => {
        // House QR? Maybe not needed if generic. But let's verify user want all. "for all data into pdf... 3x5cm"
        // Let's assume Room and Storage are the physical ones. House usually big. But let's add all.
        paths.push(h); // House
        const rooms = struct[h];
        Object.keys(rooms).sort().forEach(r => {
            paths.push(`${h} > ${r}`); // Room
            rooms[r].sort().forEach(s => {
                paths.push(`${h} > ${r} > ${s}`); // Storage
            });
        });
    });

    if (paths.length === 0) { alert("No locations found."); return; }

    // Render loop (async to allow UI update)
    if (!confirm(`Generate QRs for ${paths.length} locations? This might take a moment.`)) return;

    for (const path of paths) {
        const card = document.createElement('div');
        card.className = 'qr-card-print';

        const qrDiv = document.createElement('div');
        // Generate QR
        new QRCode(qrDiv, {
            text: path,
            width: 128, // 128px is plenty for 3cm (approx 113px)
            height: 128,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
        });

        const label = document.createElement('div');
        label.className = 'path';
        label.innerText = path;

        card.appendChild(qrDiv);
        card.appendChild(label);
        grid.appendChild(card);

        // Small delay to prevent freeze
        // await new Promise(r => setTimeout(r, 10));
    }

    // Wait images
    setTimeout(() => {
        window.print();
        // cleanup? printArea.innerHTML = '';
    }, 500);
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

                // Button: Add Storage
                const btnAddStorage = document.createElement('button');
                btnAddStorage.className = 'text-btn small';
                btnAddStorage.innerHTML = '+ Add Storage';
                btnAddStorage.style.marginLeft = '12px';
                btnAddStorage.style.marginTop = '4px';
                btnAddStorage.onclick = () => {
                    const s = prompt(`New Storage in ${room}?`);
                    if (s) {
                        if (!struct[house][room].includes(s)) {
                            struct[house][room].push(s);
                            Storage.save();
                            renderLocationTree();
                        }
                    }
                };
                roomList.appendChild(btnAddStorage);

                houseList.appendChild(roomNode);
                houseList.appendChild(roomList);
            });
        }

        // Button: Add Room
        const btnAddRoom = document.createElement('button');
        btnAddRoom.className = 'text-btn small';
        btnAddRoom.innerHTML = '+ Add Room';
        btnAddRoom.style.marginLeft = '12px';
        btnAddRoom.style.marginTop = '4px';
        btnAddRoom.onclick = () => {
            const r = prompt(`New Room in ${house}?`);
            if (r && !struct[house][r]) {
                struct[house][r] = [];
                Storage.save();
                renderLocationTree();
            }
        };
        houseList.appendChild(btnAddRoom);

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

    // 1. Constraint Check (Still block if items exist)
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
    } else if (type === 'room') {
        if (hasItems(pHouse, name)) { alert("Cannot delete: Room contains items."); return; }
    } else if (type === 'storage') {
        if (hasItems(pHouse, pRoom, name)) { alert("Cannot delete: Storage contains items."); return; }
    }

    // 2. Snapshot Data for Undo
    let restoredData;
    let undoType = '';

    if (type === 'house') {
        restoredData = JSON.parse(JSON.stringify(struct[name])); // Deep Clone content
        undoType = 'restoreHouse';
        delete struct[name];
    }
    else if (type === 'room') {
        restoredData = JSON.parse(JSON.stringify(struct[pHouse][name]));
        undoType = 'restoreRoom';
        delete struct[pHouse][name];
    }
    else if (type === 'storage') {
        // Storage is just a string in an array, restoring it means adding it back
        // But we need to know the index or just push it? Push is fine.
        const arr = struct[pHouse][pRoom];
        const idx = arr.indexOf(name);
        if (idx > -1) {
            arr.splice(idx, 1);
            restoredData = idx; // Store index to be precise? Or just string?
            undoType = 'restoreStorage';
        } else return;
    }

    // 3. Save & Render
    Storage.save();
    renderLocationTree();
    populateFilterDropdowns('init');

    // 4. Capture & Toast
    AppState.lastAction = {
        type: undoType,
        name: name,
        data: restoredData,
        house: pHouse,
        room: pRoom
    };

    showUndoToast(`${type} "${name}" deleted`, performUndo);
};

function performUndo() {
    if (!AppState.lastAction) return;
    const action = AppState.lastAction;
    const struct = AppState.locationStructure;

    // --- RESTORE LOGIC ---
    if (action.type === 'updateQty') {
        const item = AppState.items.find(i => i.id === action.id);
        if (item) {
            item.quantity = action.oldVal;
        }
    }
    else if (action.type === 'restoreHouse') {
        struct[action.name] = action.data; // Restore subtree
        populateFilterDropdowns('house');
    }
    else if (action.type === 'restoreRoom') {
        if (struct[action.house]) { // Safety
            struct[action.house][action.name] = action.data;
        }
    }
    else if (action.type === 'restoreStorage') {
        if (struct[action.house] && struct[action.house][action.room]) {
            struct[action.house][action.room].splice(action.data, 0, action.name); // Insert back at index? or just push
            // action.data was the Index if I stored logic correctly?
            // Actually in delete I stored 'data' as 'idx'. 
            // Let's refine: delete logic saves idx.
        }
    }

    Storage.save();
    renderInventory();
    renderLocationTree();
    populateFilterDropdowns('init');

    AppState.lastAction = null;

    // Feedback
    // Maybe hide toast immediately? Yes per logic.
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

    if (!AppState.html5QrCode) {
        AppState.html5QrCode = new Html5Qrcode("reader");
    }

    AppState.html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => handleSmartScan(text)
    ).then(() => {
        scannerStatus.textContent = "Point camera at code...";
    }).catch(err => {
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
