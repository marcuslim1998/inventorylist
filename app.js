/**
 * Inventory Management Logic (Refined)
 * Uses html5-qrcode for scanning.
 * Manages dynamic Categories and Locations.
 */

// --- STATE MANAGEMENT ---
const AppState = {
    items: [],
    categories: ['General', 'Pantry', 'Office', 'Storage'],
    locations: ['Home > Living Room', 'Home > Kitchen', 'Office > Desk'], // Examples
    currentLocation: '', // The "active" location for context
    sortBy: 'location',
    isScanning: false,
    scannerTarget: null, // 'barcode' | 'location'
    html5QrCode: null
};

// --- STORAGE ---
const Storage = {
    KEY_ITEMS: 'inv_items_v2',
    KEY_CATS: 'inv_cats_v1',
    KEY_LOCS: 'inv_locs_v1',
    KEY_CURR_LOC: 'inv_curr_loc_v1',

    save: () => {
        localStorage.setItem(Storage.KEY_ITEMS, JSON.stringify(AppState.items));
        localStorage.setItem(Storage.KEY_CATS, JSON.stringify(AppState.categories));
        localStorage.setItem(Storage.KEY_LOCS, JSON.stringify(AppState.locations));
        localStorage.setItem(Storage.KEY_CURR_LOC, AppState.currentLocation);
    },
    load: () => {
        const i = localStorage.getItem(Storage.KEY_ITEMS);
        const c = localStorage.getItem(Storage.KEY_CATS);
        const l = localStorage.getItem(Storage.KEY_LOCS);
        const cl = localStorage.getItem(Storage.KEY_CURR_LOC);

        if (i) AppState.items = JSON.parse(i);
        if (c) AppState.categories = JSON.parse(c);
        if (l) AppState.locations = JSON.parse(l);
        if (cl) AppState.currentLocation = cl;

        // Ensure defaults if empty
        if (AppState.categories.length === 0) AppState.categories = ['General'];
        if (AppState.locations.length === 0) AppState.locations = ['Default'];
    }
};

// --- DOM ELEMENTS ---
const viewInventory = document.getElementById('view-inventory');
const viewAddItem = document.getElementById('view-add-item');
const viewLocations = document.getElementById('view-locations');
const navItems = document.querySelectorAll('.nav-item');

const inventoryList = document.getElementById('inventory-list');
const searchInput = document.getElementById('inventory-search');
const sortChips = document.querySelectorAll('.chip');
const bannerLocationText = document.getElementById('banner-location-text');

// Form
const addItemForm = document.getElementById('add-item-form');
const inputBarcode = document.getElementById('item-barcode');
const selectCategory = document.getElementById('item-category');
const selectLocation = document.getElementById('item-location');
const inputName = document.getElementById('item-name');
const inputExpiry = document.getElementById('item-expiry');

// Location View
const locationDisplayLg = document.getElementById('location-display-lg');
const locationList = document.getElementById('location-list');

// Scanner
const scannerOverlay = document.getElementById('scanner-overlay');
const btnCloseScanner = document.getElementById('btn-close-scanner');
const scannerStatus = document.getElementById('scanner-status');

// --- INITIALIZATION ---
function init() {
    Storage.load();
    setupNavigation();
    setupForm();
    setupScanner();
    setupLocationsUI();

    renderInventory();
    updateLocationDisplays();
}

// --- NAVIGATION ---
function setupNavigation() {
    navItems.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = btn.getAttribute('data-target') || btn.closest('.nav-item').getAttribute('data-target');
            if (targetId) {
                switchView(targetId);
            }
        });
    });

    document.getElementById('btn-cancel-add').addEventListener('click', () => {
        switchView('view-inventory');
    });
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    navItems.forEach(btn => {
        const target = btn.getAttribute('data-target');
        if (target === viewId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    if (viewId === 'view-inventory') renderInventory();
    if (viewId === 'view-add-item') populateSelects();
    if (viewId === 'view-locations') renderLocationList();
}


// --- DATA & UI LOGIC ---

function ensureCategory(cat) {
    if (!cat) return;
    if (!AppState.categories.includes(cat)) {
        AppState.categories.push(cat);
        AppState.categories.sort();
        Storage.save();
    }
}

function ensureLocation(loc) {
    if (!loc) return;
    if (!AppState.locations.includes(loc)) {
        AppState.locations.push(loc);
        AppState.locations.sort(); // Hierarchy sort works well with strings
        Storage.save();
    }
}

function populateSelects() {
    // Categories
    selectCategory.innerHTML = '';
    AppState.categories.forEach(c => {
        const op = document.createElement('option');
        op.value = c;
        op.textContent = c;
        selectCategory.appendChild(op);
    });

    // Locations
    selectLocation.innerHTML = '';
    AppState.locations.forEach(l => {
        const op = document.createElement('option');
        op.value = l;
        op.textContent = l;
        selectLocation.appendChild(op);
    });

    // Set default location to current active if exists
    if (AppState.currentLocation && AppState.locations.includes(AppState.currentLocation)) {
        selectLocation.value = AppState.currentLocation;
    }
}

function updateLocationDisplays() {
    const loc = AppState.currentLocation || "None Selected";
    bannerLocationText.textContent = loc === "None Selected" ? "All Locations" : loc; // Filter logic?
    // Actually request says: 📍 Current Location: Home > Kitchen...
    // The inventory list might basically be showing items AT this location OR all items if generic. 
    // Let's assume the Location Filter applies.

    locationDisplayLg.textContent = loc;
}


// Add Item Form
function setupForm() {
    // Add Category Button
    document.getElementById('btn-add-category').addEventListener('click', () => {
        const newCat = prompt("Enter new category name:");
        if (newCat) {
            ensureCategory(newCat.trim());
            populateSelects();
            selectCategory.value = newCat.trim();
        }
    });

    // Add Location Button (on form) - wait, scanned location auto adds. 
    // Manual? The select has existing. If they want to create new while adding item?
    // Maybe best handled in Locations tab, but we can do a prompt.
    // Let's stick to: Use dropdown OR Scanning adds new.

    addItemForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const loc = selectLocation.value;
        const cat = selectCategory.value;

        const newItem = {
            id: Date.now().toString(),
            barcode: inputBarcode.value.trim(),
            name: inputName.value.trim(),
            category: cat,
            location: loc,
            expiry: inputExpiry.value,
            createdAt: new Date().toISOString()
        };

        AppState.items.push(newItem);
        Storage.save();

        // Reset form but keep location
        addItemForm.reset();
        selectLocation.value = loc; // Persist last location for rapid entry
        selectCategory.value = cat; // Persist last category too? Maybe.

        // Feedback
        alert("Item saved!");
        // switchView('view-inventory'); // OR stay to add more? "Rapid entry" usually implies stay.
        // User asked for "Manual item entry must always work". keeping it ready for next item is good.
    });

    // Search & Sort
    searchInput.addEventListener('input', renderInventory);
    sortChips.forEach(chip => {
        chip.addEventListener('click', () => {
            sortChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            AppState.sortBy = chip.getAttribute('data-sort');
            renderInventory();
        });
    });
}

function renderInventory() {
    inventoryList.innerHTML = '';

    let filtered = AppState.items.filter(item => {
        // Search Filter
        const term = searchInput.value.toLowerCase();
        const matchesTerm = !term ||
            item.name.toLowerCase().includes(term) ||
            item.barcode.includes(term) ||
            item.category.toLowerCase().includes(term);

        // Location Context Filter (Optional: Should showing "Current Location" filter the list?)
        // If the user sets "Current Location", it implies they are working THERE.
        // But maybe they want to see everything.
        // Let's use the Chip "Location" to sort, but maybe we should filter by AppState.currentLocation if strict?
        // User didn't strictly say "Hide items not in current location", but "Scanning location sets current location".
        // Let's leave it as global list for now, but sort by location makes sense.

        return matchesTerm;
    });

    // Sort
    filtered.sort((a, b) => {
        switch (AppState.sortBy) {
            case 'location': return a.location.localeCompare(b.location);
            case 'category': return a.category.localeCompare(b.category);
            case 'expiry':
                if (!a.expiry) return 1;
                if (!b.expiry) return -1;
                return new Date(a.expiry) - new Date(b.expiry);
            default: return 0;
        }
    });

    if (filtered.length === 0) {
        inventoryList.innerHTML = `<div class="empty-state"><p>No items found.</p></div>`;
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'inventory-item';

        let expiryHtml = '';
        if (item.expiry) {
            const daysLeft = getDaysUntil(item.expiry);
            let statusClass = 'ok';
            if (daysLeft < 0) statusClass = 'expired';
            else if (daysLeft <= 7) statusClass = 'soon';
            expiryHtml = `<span class="expiry-tag ${statusClass}">Exp: ${item.expiry}</span>`;
        }

        card.innerHTML = `
            <div class="header">
                <h3>${escapeHtml(item.name)}</h3>
                <span class="loc-badge">${escapeHtml(item.location)}</span>
            </div>
            <div class="meta">
                <span>${escapeHtml(item.category)}</span>
                ${expiryHtml}
            </div>
        `;
        inventoryList.appendChild(card);
    });
}


// --- LOCATION MANAGEMENT UI ---
function setupLocationsUI() {
    document.getElementById('btn-add-location').addEventListener('click', () => {
        const newLoc = prompt("Enter new location (e.g. 'Home > Kitchen'):");
        if (newLoc) {
            ensureLocation(newLoc.trim());
            renderLocationList();
        }
    });

    document.getElementById('btn-manual-location-tab').addEventListener('click', () => {
        const newLoc = prompt("Set Current Location name:", AppState.currentLocation);
        if (newLoc) {
            setCurrentLocation(newLoc.trim());
        }
    });

    document.getElementById('btn-scan-location-tab').addEventListener('click', () => startScanning('location-set'));
}

function renderLocationList() {
    locationList.innerHTML = '';
    AppState.locations.forEach(loc => {
        const li = document.createElement('li');
        li.textContent = loc;
        if (loc === AppState.currentLocation) {
            li.style.color = 'var(--primary-color)';
            li.style.fontWeight = 'bold';
            li.innerHTML += ' (Current)';
        }

        li.addEventListener('click', () => {
            setCurrentLocation(loc);
            alert(`Location set to: ${loc}`);
        });

        locationList.appendChild(li);
    });
}

function setCurrentLocation(loc) {
    ensureLocation(loc); // Make sure it exists in DB
    AppState.currentLocation = loc;
    Storage.save();
    updateLocationDisplays();
    renderLocationList();
}


// --- SCANNER LOGIC (Html5Qrcode) ---
function setupScanner() {
    document.getElementById('btn-scan-input').addEventListener('click', () => startScanning('barcode'));
    document.getElementById('btn-scan-location-input').addEventListener('click', () => startScanning('location-input'));
    btnCloseScanner.addEventListener('click', stopScanning);
}

function startScanning(mode) {
    AppState.scannerTarget = mode;
    scannerOverlay.classList.remove('hidden');
    scannerStatus.textContent = "Starting Camera...";

    // Config
    // Note: html5-qrcode's 'Html5Qrcode' class allows more control than 'Html5QrcodeScanner'
    if (!AppState.html5QrCode) {
        AppState.html5QrCode = new Html5Qrcode("reader");
    }

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    // Prefer rear camera
    const cameraConfig = { facingMode: "environment" };

    AppState.html5QrCode.start(
        cameraConfig,
        config,
        (decodedText, decodedResult) => {
            handleScanSuccess(decodedText);
        },
        (errorMessage) => {
            // parse error, ignore
        }
    ).then(() => {
        scannerStatus.textContent = "Scan now";
    }).catch(err => {
        console.error("Scanner Error", err);
        scannerStatus.textContent = "Error: " + err;
        alert("Camera failed. Please allow permission.");
        stopScanning();
    });
}

function stopScanning() {
    if (AppState.html5QrCode && AppState.html5QrCode.isScanning) {
        AppState.html5QrCode.stop().then(() => {
            scannerOverlay.classList.add('hidden');
            AppState.html5QrCode.clear();
        }).catch(err => console.error("Stop failed", err));
    } else {
        scannerOverlay.classList.add('hidden');
    }
}

function handleScanSuccess(text) {
    // Haptic
    if (navigator.vibrate) navigator.vibrate(200);
    stopScanning();

    if (AppState.scannerTarget === 'barcode') {
        inputBarcode.value = text;
    } else if (AppState.scannerTarget === 'location-input') {
        // Ensure location exists and select it
        ensureLocation(text);
        populateSelects(); // refresh dropdown
        selectLocation.value = text;
    } else if (AppState.scannerTarget === 'location-set') {
        setCurrentLocation(text);
        alert("Location set to: " + text);
    }
}

// Helpers
function getDaysUntil(dateStr) {
    const target = new Date(dateStr);
    const today = new Date();
    target.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

document.addEventListener('DOMContentLoaded', init);
