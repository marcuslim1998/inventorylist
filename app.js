/**
 * Inventory Management Logic
 * Handles state, storage, UI rendering, and scanner integration.
 */

// --- STATE MANAGEMENT ---
const AppState = {
    items: [],
    currentLocation: '',
    sortBy: 'location', // location | expiry | category
    isScanning: false,
    scannerTarget: null // 'item' | 'location'
};

// --- STORAGE ---
const Storage = {
    KEY: 'inventory_data_v1',
    save: () => {
        localStorage.setItem(Storage.KEY, JSON.stringify(AppState.items));
    },
    load: () => {
        const data = localStorage.getItem(Storage.KEY);
        if (data) {
            AppState.items = JSON.parse(data);
        }
    }
};

// --- DOM ELEMENTS ---
const viewInventory = document.getElementById('view-inventory');
const viewAddItem = document.getElementById('view-add-item');
const navItems = document.querySelectorAll('.nav-item');
const inventoryList = document.getElementById('inventory-list');
const searchInput = document.getElementById('inventory-search');
const sortChips = document.querySelectorAll('.chip');

// Form Elements
const addItemForm = document.getElementById('add-item-form');
const inputBarcode = document.getElementById('item-barcode'); // Scan target
const inputLocation = document.getElementById('item-location'); // Scan target
const inputName = document.getElementById('item-name');
const inputCategory = document.getElementById('item-category');
const inputExpiry = document.getElementById('item-expiry');

// Scanner Elements
const scannerOverlay = document.getElementById('scanner-overlay');
const scannerVideo = document.getElementById('scanner-video');
const btnCloseScanner = document.getElementById('btn-close-scanner');
const scannerStatus = document.getElementById('scanner-status');

// --- INITIALIZATION ---
function init() {
    Storage.load();
    setupNavigation();
    setupForm();
    setupScanner();
    renderInventory();
    
    // Set default date for expiry input to today + 30 days (optional UX polish)
    // const today = new Date();
    // today.setDate(today.getDate() + 30);
    // inputExpiry.valueAsDate = today;
}

// --- NAVIGATION ---
function setupNavigation() {
    navItems.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetId = btn.getAttribute('data-target') || btn.closest('.nav-item').getAttribute('data-target');
            if (targetId) {
                switchView(targetId);
                updateNavState(targetId);
            }
        });
    });

    document.getElementById('btn-cancel-add').addEventListener('click', () => {
        switchView('view-inventory');
        updateNavState('view-inventory');
    });
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    
    // Reset form if leaving add item view
    if (viewId === 'view-inventory') {
        renderInventory();
    }
}

function updateNavState(activeTargetId) {
    navItems.forEach(btn => {
        const target = btn.getAttribute('data-target');
        if (target === activeTargetId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}


// --- INVENTORY LOGIC ---
function addItem(item) {
    AppState.items.push(item);
    Storage.save();
    renderInventory();
    
    // Reset form fields but keep location if desirable (often useful in batched tasks)
    // We'll reset everything for cleanliness as per "New items added after scanning inherit THIS location" logic implies persistent location state
    const lastLocation = item.location;
    addItemForm.reset();
    if (lastLocation) {
        inputLocation.value = lastLocation; // Inherit location
    }
    
    switchView('view-inventory');
    updateNavState('view-inventory');
}

function setupForm() {
    addItemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const newItem = {
            id: Date.now().toString(), // Simple ID
            barcode: inputBarcode.value.trim(),
            name: inputName.value.trim(),
            category: inputCategory.value.trim(),
            location: inputLocation.value.trim(),
            expiry: inputExpiry.value,
            createdAt: new Date().toISOString()
        };
        
        addItem(newItem);
    });

    // Filtering chips
    sortChips.forEach(chip => {
        chip.addEventListener('click', () => {
            sortChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            AppState.sortBy = chip.getAttribute('data-sort');
            renderInventory();
        });
    });

    // Search
    searchInput.addEventListener('input', renderInventory);
}

function renderInventory() {
    inventoryList.innerHTML = '';
    
    let filtered = AppState.items.filter(item => {
        if (!searchInput.value) return true;
        const term = searchInput.value.toLowerCase();
        return item.name.toLowerCase().includes(term) || 
               item.category.toLowerCase().includes(term) ||
               item.location.toLowerCase().includes(term);
    });
    
    // Sorting
    filtered.sort((a, b) => {
        switch(AppState.sortBy) {
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
        inventoryList.innerHTML = `
            <div class="empty-state">
                <p>No items found.</p>
                <p class="sub-text">Add items to get started.</p>
            </div>`;
        return;
    }

    filtered.forEach(item => {
        const card = document.createElement('div');
        card.className = 'inventory-item';
        
        // Expiry Logic
        let expiryHtml = '';
        if (item.expiry) {
            const daysLeft = getDaysUntil(item.expiry);
            let statusClass = 'ok';
            let statusText = `${daysLeft} days`;
            
            if (daysLeft < 0) {
                statusClass = 'expired';
                statusText = 'Expired';
            } else if (daysLeft <= 7) {
                statusClass = 'soon';
            }
            expiryHtml = `<span class="expiry-tag ${statusClass}">Exp: ${item.expiry}</span>`;
        }

        card.innerHTML = `
            <div class="header">
                <h3>${escapeHtml(item.name)}</h3>
                <span style="font-size: 12px; font-weight: 500; color:var(--primary-color)">${escapeHtml(item.location)}</span>
            </div>
            <div class="meta">
                <span>${escapeHtml(item.category)}</span>
                ${expiryHtml}
            </div>
        `;
        inventoryList.appendChild(card);
    });
}

function getDaysUntil(dateStr) {
    const target = new Date(dateStr);
    const today = new Date();
    // Reset time components for accurate day diff
    target.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    
    const diffTime = target - today;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;")
               .replace(/</g, "&lt;")
               .replace(/>/g, "&gt;")
               .replace(/"/g, "&quot;")
               .replace(/'/g, "&#039;");
}

// --- SCANNER LOGIC ---
// Uses Native BarcodeDetector API if available
// Note: Limited browser support. In production, a library like html5-qrcode is safer for cross-browser,
// but requirements asked for native API usage primarily ("Use native browser BarcodeDetector API")
// and "No external barcode libraries".
async function setupScanner() {
    // Buttons to trigger scanner
    document.getElementById('btn-scan-header').addEventListener('click', () => startScanning('item')); // Generic scan, usually for lookup? or just adds to buffer? Let's just go to Add Item for now or search. 
    // Requirement says: "User can add inventory items by... b) Scanning product barcode". Implicitly this means scanning triggers Add Item flow or fills it.
    // Let's make header scan button just go to 'lookup' logic if we had it, but for now we'll route to Add Item -> Scan
    
    // Actually, header scan might be for generic lookup. Let's make it quick-add or filter.
    // For simplicity given constraints: Header button -> Focus Search Bar.
    // The REAL scanner buttons are in the "Add Item" form.
    
    document.getElementById('btn-scan-header').addEventListener('click', () => {
        // Maybe make this a global "Identify Item" scanner?
        // For now, let's map it to "Add Item" as that's the primary use case mentioned.
        switchView('view-add-item');
        updateNavState('view-add-item');
        startScanning('barcode'); // Auto start scanning barcode on add view entry? Maybe annoying. Let's let user click scan.
    });

    document.getElementById('btn-scan-input').addEventListener('click', () => startScanning('barcode'));
    document.getElementById('btn-scan-location').addEventListener('click', () => startScanning('location'));
    
    btnCloseScanner.addEventListener('click', stopScanning);
}

async function startScanning(targetMode) {
    // Check support
    if (!('BarcodeDetector' in window)) {
        alert("Native Barcode Detector not supported on this device/browser. Please type manually.");
        // Fallback: If we couldn't scan, maybe focus the input?
        return;
    }

    AppState.scannerTarget = targetMode;
    scannerOverlay.classList.remove('hidden');
    scannerStatus.textContent = targetMode === 'location' ? "Scan Location QR Code" : "Scan Item Barcode";
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: { exact: "environment" } // Rear camera
            } 
        });
        scannerVideo.srcObject = stream;
        
        // Start detection loop
        detectLoop();
    } catch (err) {
        console.error("Camera access denied or failed", err);
        alert("Could not access camera. Ensure permissions are granted.");
        stopScanning();
    }
}

function stopScanning() {
    scannerOverlay.classList.add('hidden');
    const stream = scannerVideo.srcObject;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        scannerVideo.srcObject = null;
    }
    AppState.isScanning = false;
}

async function detectLoop() {
    if (scannerOverlay.classList.contains('hidden')) return;

    const barcodeDetector = new BarcodeDetector({
        formats: ['qr_code', 'ean_13', 'code_128', 'ean_8', 'upc_a'] 
    });

    try {
        const barcodes = await barcodeDetector.detect(scannerVideo);
        if (barcodes.length > 0) {
            // Found one!
            const rawValue = barcodes[0].rawValue;
            handleScanSuccess(rawValue);
            return; // Stop loop
        }
    } catch (e) {
        // Detection failed this frame, continue
        // console.warn(e);
    }
    
    requestAnimationFrame(detectLoop);
}

function handleScanSuccess(value) {
    // Haptic feedback if available
    if (navigator.vibrate) navigator.vibrate(200);
    
    stopScanning(); // Stop camera

    if (AppState.scannerTarget === 'barcode') {
        inputBarcode.value = value;
        // Optional: Auto-lookup name? (Not in requirements/no backend)
    } else if (AppState.scannerTarget === 'location') {
        inputLocation.value = value;
    }
}

// Start app
document.addEventListener('DOMContentLoaded', init);
