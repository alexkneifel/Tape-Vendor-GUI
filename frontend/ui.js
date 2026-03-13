/* =========================
   GLOBAL VARIABLES
========================= */
let currentTapes = [];
let isGrid = false; // Track current view mode (List/Grid)
let genreMode = "filter"; 

/* =========================
   VIRTUAL KEYBOARD SETUP
========================= */
let keyboard;
let selectedInput = null;

window.addEventListener('load', () => {
    // Initialize the keyboard instance
    const Keyboard = window.SimpleKeyboard.default;
keyboard = new Keyboard({
    onChange: input => onKeyboardChange(input),
    onKeyPress: button => onKeyboardKeyPress(button),
    layout: {
        'default': [
            '1 2 3 4 5 6 7 8 9 0 {bksp}',
            'Q W E R T Y U I O P',
            'A S D F G H J K L {enter}',
            'Z X C V B N M , . {close}', // Replaced dash with close
            '{space}'
        ]
    },
    display: {
        '{bksp}': 'DEL',
        '{enter}': 'ENT',
        '{space}': 'SPACE',
        '{close}': 'CLOSE' // Label for the new button
    }
});

    // Attach focus events to text inputs to trigger the keyboard
    const textInputs = document.querySelectorAll('input:not([type="number"])');
    textInputs.forEach(input => {
        input.addEventListener("focus", (e) => {
            selectedInput = e.target;
            document.getElementById('keyboard-wrapper').style.display = 'block';
            keyboard.setOptions({ inputName: e.target.id });
            keyboard.setInput(e.target.value);
        });
    });

    // Hide keyboard if tapping completely outside of an input or the keyboard itself
    document.addEventListener('click', (e) => {
        if (!e.target.matches('input') && !e.target.closest('#keyboard-wrapper')) {
            document.getElementById('keyboard-wrapper').style.display = 'none';
        }
    });
});

function onKeyboardChange(input) {
    if (selectedInput) {
        selectedInput.value = input;
        // This ensures your search filter functions still trigger as you type
        selectedInput.dispatchEvent(new Event('keyup'));
    }
}

// Update the key press function to handle the close button
function onKeyboardKeyPress(button) {
    if (button === "{enter}" || button === "{close}") {
        document.getElementById('keyboard-wrapper').style.display = 'none';
        if (selectedInput) selectedInput.blur();
    }
}

/* =========================
   0. Boot Screen Animation
========================= */
window.addEventListener('load', () => {
    const bootScreen = document.getElementById('boot-screen');
    if (bootScreen) {
        document.body.classList.add('crt-warp');

        // Changed from 1300ms to 2600ms to match the new 2.5s CSS + a tiny buffer
        setTimeout(() => {
            bootScreen.style.opacity = '0';
            document.body.classList.remove('crt-warp');
            
            setTimeout(() => {
                bootScreen.style.display = 'none';
            }, 800); // Slightly longer fade for a smoother exit
        }, 2600); 
    }
});

/* =========================
   1. NAVIGATION
========================= */

/**
 * Navigate to a specific menu and hide others.
 * If navigating to the directory, load the tape data.
 * @param {string} menuId - The ID of the menu to display
 */
/**
 * Navigate to a specific menu and hide others.
 */
function navigateTo(menuId) {
    // 1️⃣ Hide all menus
    document.querySelectorAll('.menu').forEach(m => m.style.display = 'none');

    // 2️⃣ Show the target menu
    const target = document.getElementById(menuId);
    if (target) target.style.display = 'flex';

    // 3️⃣ Reset directory filters when leaving or entering directory
    if (menuId === 'main-menu') {
        resetDirectoryFilters();

        loadData(); // refresh the directory for next time
    } else if (menuId === 'directory-menu') {
        loadData(); // load the directory when entering
    }

    // 4️⃣ Update stats when entering stats menu
    if (menuId === 'stats-menu') {
        updateStats();
    }

    // 5️⃣ Auto-organize menu setup
    if (menuId === 'auto-menu') {
        document.getElementById('auto-prompt').style.display = 'block';
        document.getElementById('auto-progress').style.display = 'none';
    }
}

function resetDirectoryFilters() {
    const searchBar = document.getElementById('searchBar');
    const sortSelect = document.getElementById('sortSelect');

    if (searchBar) searchBar.value = '';
    if (sortSelect) sortSelect.value = 'name-asc';
}

/* =========================
   2. DEV MODE CONTROLS
========================= */

/**
 * Send a movement command to the hardware
 * @param {string} action - 'pikcup', 'dropoff', 'goto', 'servo', 'home', 'cancel'.
 * passes the above action and the x,y associated with it in the document, if needed.
 */
function sendMovement(action) 
{
    const x = document.getElementById('x-index').value;
    const y = document.getElementById('y-index').value;
    const x_offset = document.getElementById('x-offset').value;
    fetch(`/api/srl_cmd?action=${action}&x=${x}&y=${y}&x_offset=${x_offset}`)
        .then(res => res.json())
        .then(data => alert(data.status))
        .catch(err => alert("Comm Error"));
}


/* =========================
   3. DIRECTORY DATA & VIEW
========================= */

/**
 * Fetch tape data from the server and store in currentTapes
 */
async function loadData() 
{
    try {
        const res = await fetch('/api/tapes');
        if(res.ok) {
            currentTapes = await res.json();
            renderCurrentView();
        } else {
            console.error("Server error loading tapes");
        }
    } catch(e) {
        console.error("Network error", e);
    }
}

/**
 * Render either the List or Grid view based on current mode
 */
function renderCurrentView() 
{
    if (isGrid) renderGrid();
    else renderList(currentTapes);
}

/**
 * Opens modal menu with the genre's
 * @param {string} mode - "filter" or "slot"
 */
async function openGenreModal(mode = "filter") {
    genreMode = mode; // Set global variable to track behavior
    resetDirectoryFilters();

    if (genreMode === "filter") {
        renderCurrentView(); 
    }

    try {
        const res = await fetch("/api/tags");
        const tags = await res.json();

        const container = document.getElementById("genreCheckboxes");
        container.innerHTML = "";

        tags.forEach(tag => {
            const label = document.createElement("label");
            label.className = "genre-option";
            label.innerHTML = `
                <input type="checkbox" value="${tag}">
                <span>${tag}</span>
            `;
            container.appendChild(label);
        });

        document.getElementById("genreModal").style.display = "flex";
    } catch (err) {
        console.error("Failed to load genres:", err);
    }
}

/**
 * Filter the list OR pick a random tape based on current genreMode
 */
function applyGenreFilter() {
    const checkedGenres = [...document.querySelectorAll("#genreCheckboxes input:checked")]
        .map(cb => cb.value);

    if (checkedGenres.length === 0) {
        alert("Please select at least one genre.");
        return;
    }

    // Filter currentTapes to only those that include at least one selected genre
    const filtered = currentTapes.filter(t =>
    t.in_machine == 1 &&                                   // 👈 must NOT be out
    t.tags &&
    t.tags.some(tag => checkedGenres.includes(tag))
    );

    closeGenreModal();

    if (genreMode === "slot") {
        // SLOT MODE: Pick a random one from the filtered pool
        if (filtered.length > 0) {
            const chosen = filtered[Math.floor(Math.random() * filtered.length)];
            runSlotAnimation(chosen);
        } else {
            alert("No cassettes found for those genres.");
        }
    } else {
        // FILTER MODE: Just update the directory view
        renderList(filtered);
    }
}

function closeGenreModal() {
    document.getElementById("genreModal").style.display = "none";
}

function resetDirectoryFilters() {
    const searchBar = document.getElementById('searchBar');
    const sortSelect = document.getElementById('sortSelect');

    if (searchBar) searchBar.value = '';
    if (sortSelect) sortSelect.value = 'name-asc';
}




/* =========================
   4. VIEW RENDERING
========================= */

/**
 * Render the list view of tapes
 * @param {Array} tapes - Array of tape objects
 */
function renderList(tapes) {
    const container = document.getElementById('tapeContainer');
    container.innerHTML = '';
    
    tapes.forEach(t => {
        const isOut = (t.in_machine == 0); 
        const artist = t.artist || "Unknown Artist";
        
        const div = document.createElement('div');
        div.className = `tape-item ${isOut ? 'is-out' : ''}`;
        
        div.innerHTML = `
            <span class="tape-name">${isOut ? '[OUT] ' : ''}${t.name || "UNKNOWN"}</span>
            <span class="tape-artist">${artist}</span>
            <span class="tape-plays">${t.listens || 0} PLAYS</span>
        `;
        
        div.onclick = () => openModal(t);
        container.appendChild(div);
    });
}


/**
 * Render the grid view of tapes (5x11 grid)
 */
function renderGrid(tapes = currentTapes) 
{
    const container = document.getElementById('tapeContainer');
    container.innerHTML = '';
    
    const grid = document.createElement('div');
    grid.className = "grid-layout"; 
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
    // Change from 'repeat(11, 80px)' to 'repeat(11, 1fr)'
    grid.style.gridTemplateRows = 'repeat(11, 1fr)';
    // Set a fixed height for the grid so '1fr' has a container to fill
    grid.style.height = 'calc(100vh - 120px)';
    grid.style.gap = '8px';
    grid.style.width = '95%';
    grid.style.justifyContent = 'center';               


    for (let row = 0; row < 11; row++) {
        for (let col = 0; col < 5; col++) {
            const currentX = col + 1;
            // INVERT THE Y-AXIS HERE
            // When row is 0 (top of screen), Y is 11. When row is 10 (bottom), Y is 1.
            const currentY = 11 - row; 

            const tapeAtPos = tapes.find(t => 
                parseInt(t.slot_x) === currentX && 
                parseInt(t.slot_y) === currentY
            );

            const btn = document.createElement('button');
            btn.className = "grid-btn";
            btn.style.fontSize = '0.7rem';
            btn.style.height = '100%';
            btn.style.position = 'relative';

            if (tapeAtPos) {
                btn.textContent = tapeAtPos.name;
                btn.onclick = () => openModal(tapeAtPos);
                if (Number(tapeAtPos.in_machine) === 1) {
                    btn.style.background = '#333';
                    btn.style.color = '#ff9d00';
                    btn.style.setProperty('--led-color', '#ff0000');
                    btn.style.setProperty('--led-shadow', '0 0 10px #ff0000');
                } else {
                    btn.style.background = '#1a1a1a';
                    btn.style.color = '#555';
                    btn.style.border = '2px dashed #444';
                    btn.style.setProperty('--led-color', '#220000');
                }
            } else {
                btn.textContent = '+';
                btn.style.background = '#111';
                btn.style.color = '#00ff66';
                btn.style.fontSize = '2rem';
                btn.style.fontWeight = 'bold';

                btn.style.display = 'flex';
                btn.style.alignItems = 'center';     // Vertical center
                btn.style.justifyContent = 'center';  // Horizontal center
                btn.style.padding = '0';              // Remove default button offsets
                btn.style.lineHeight = '0';           // Prevents the font height from pushing it down

                btn.onclick = () => openAddAtPosition(currentX, currentY);
            }
            grid.appendChild(btn);
        }
    }
    container.appendChild(grid);
}

/**
 * Toggle between Grid and List view
 */
function toggleView() {
    isGrid = !isGrid;
    const gridBtn = document.querySelector('.dir-controls button:nth-child(3)');
    gridBtn.textContent = isGrid ? 'LIST VIEW' : 'GRID VIEW';

    // Clear search when switching views
    document.getElementById('searchBar').value = '';

    // Show/hide sort dropdown
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) sortSelect.style.display = isGrid ? 'none' : 'inline-block';

    renderCurrentView();
}

/* =========================
   5. CASSETTE MODAL
========================= */

/**
 * Open modal for a specific tape, when tape is selected
 * @param {Object} tape - Tape object to display
 */
function openModal(tape) 
{
    document.getElementById('m-title').innerText = tape.name;
    document.getElementById('m-artist').innerText = tape.artist || "Unknown Artist";
    document.getElementById('m-tags').innerText = tape.tags ? tape.tags.join(', ') : "No tags";
    const actions = document.getElementById('m-actions');
    
    if (tape.in_machine) {
    actions.innerHTML = `
        <div class="modal-btn-container">
            <button class="primary-btn" onclick="actionTape(${tape.id}, 'dispense')">
                DISPENSE
            </button>
            <button class="secondary-btn" onclick="closeModal()">
                CLOSE
            </button>
        </div>`;
} else {
    actions.innerHTML = `
        <div class="modal-btn-container">
            <button class="primary-btn" onclick="actionTape(${tape.id}, 'return')">
                RETURN
            </button>
            <button class="secondary-btn" onclick="closeModal()">
                CLOSE
            </button>
        </div>`;
}

    document.getElementById('modal').style.display = 'flex';
}

/**
 * Close the cassette modal
 */
function closeModal() 
{
    document.getElementById('modal').style.display = 'none';
}

/* =========================
   6. CASSETTE ACTIONS
========================= */
/**
 * Dispense or return a tape, show loader animation
 * @param {number} id - Tape ID
 * @param {string} type - 'dispense' or 'return'
 * @returns {Promise<void>}
 */
async function actionTape(id, type) 
{
    const btn = document.activeElement; // Grab the button that was clicked
    if (btn) btn.disabled = true;
    closeModal();

    // 1. Initial UI Kick-off
    const initialMsg = type === "return" ? "MOVING TO ENTRANCE..." : "DISPENSING...";
    showLoader(initialMsg);

    // 2. Start the hardware process
    const startResp = await fetch(`/api/${type}?id=${id}`);
    if (!startResp.ok) {
        hideLoader();
        alert(`Failed to start ${type} sequence`);
        return;
    }

    // 3. Define the messages for each state
    const statusMessages = {
        // Return states
        "homing": "MOVING TO ENTRANCE...",
        "waiting_for_insert": "PLEASE INSERT CASSETTE...",
        "returning": "PLACING CASSETTE...",
        // Dispense states
        "in_progress": "DISPENSING...",
        "ejecting": "EJECTING TAPE..."
    };

    let lastStatus = null;

    // 4. Unified Polling Loop
    while (true) {
        await new Promise(r => setTimeout(r, 300));

        const statusResp = await fetch(`/api/${type}_status?id=${id}`);
        if (!statusResp.ok) continue;

        const { status } = await statusResp.json();

        // Skip if nothing changed or if status is "unknown" (the string/int bug)
        if (status === lastStatus || status === "unknown") continue;
        lastStatus = status;

        // Success condition
        if (status === "done") {
            break;
        }

        // Error condition
        if (status === "timeout") {
            alert("MECHANICAL TIMEOUT: NO RESPONSE FROM HARDWARE");
            break;
        }

        // Update UI with the appropriate message
        const msg = statusMessages[status] || "MECHANISM ACTIVE...";
        showLoader(msg);
    }

    // 5. Cleanup
    hideLoader();
    await loadData(); // Refresh the list to show the new tape or updated location
    if (btn) btn.disabled = false;
}

/* =========================
   7. LOADER
========================= */

/**
 * Show loader overlay with a message
 * @param {string} msg - Loader text
 */
function showLoader(msg) 
{
    document.getElementById('loader-text').innerText = msg;
    document.getElementById('loader').style.display = 'flex';
}

/**
 * Hide loader overlay
 */
function hideLoader() 
{
    document.getElementById('loader').style.display = 'none';
}

/* =========================
   8. SEARCH / FILTER
========================= */

/**
 * Filter tape list in directory both in list view and grid view
 */
function filterList() {
    const term = document.getElementById('searchBar').value.toLowerCase();

    if (isGrid) {
        // GRID MODE: highlight matching buttons only
        const gridButtons = document.querySelectorAll('.grid-btn');
        gridButtons.forEach(btn => {
            const text = btn.textContent.toLowerCase();
            if (term && text.includes(term)) {
                btn.style.boxShadow = '0 0 12px #00ff66'; // highlight
            } else {
                btn.style.boxShadow = ''; // remove highlight
            }
        });
    } else {
        // LIST MODE: filter + sort + OUT cassettes on top
        filterAndSortList();
    }
}



/**
 * Options to sort the cassette list.
 */
function filterAndSortList() {
    const term = document.getElementById('searchBar').value.toLowerCase();
    const sortVal = document.getElementById("sortSelect").value;

    let filtered = currentTapes.filter(t => 
        t.name.toLowerCase().includes(term) || 
        (t.artist && t.artist.toLowerCase().includes(term))
    );

    // Separate OUT cassettes
    const outTapes = filtered.filter(t => t.in_machine == 0);
    const inTapes = filtered.filter(t => t.in_machine == 1);

    // Sort ONLY in-machine tapes
    switch(sortVal) {
        case 'name-asc':
            inTapes.sort((a,b) => a.name.localeCompare(b.name));
            break;
        case 'plays-asc':
            inTapes.sort((a,b) => (a.listens||0) - (b.listens||0));
            break;
        case 'plays-desc':
            inTapes.sort((a,b) => (b.listens||0) - (a.listens||0));
            break;
        case 'recent-desc':
            inTapes.sort((a,b) => new Date(b.last_played) - new Date(a.last_played));
            break;
        case 'recent-asc':
            inTapes.sort((a,b) => new Date(a.last_played) - new Date(b.last_played));
            break;
    }

    // Merge OUT cassettes at top
    renderList([...outTapes, ...inTapes]);
}




/**
 * Filter tape list in remove modal
 */
function filterRemoveList() 
{
    const term = document.getElementById("removeSearch").value.toLowerCase();
    const allItems = document.getElementById("removeContainer").children;
    for (let item of allItems) {
        const name = item.querySelector('span').innerText.toLowerCase();
        item.style.display = name.includes(term) ? 'flex' : 'none';
    }
}

/* =========================
   9. ADD CASSETTE
========================= */

/**
 * Open add cassette modal
 */
function openAddModal() 
{
    document.getElementById("addModal").style.display = "flex";
    resetDirectoryFilters();
    renderCurrentView();
}

/**
 * Close add cassette modal and clear fields
 */
function closeAddModal() 
{
    document.getElementById("addModal").style.display = "none";
    clearAddFields();
}

/**
 * Clear add cassette modal input fields
 */
function clearAddFields() 
{
    document.getElementById("newName").value = "";
    document.getElementById("newArtist").value = "";
    delete document.getElementById("addModal").dataset.slotX;
    delete document.getElementById("addModal").dataset.slotY;
}

/**
 * Open add cassette modal at specific grid position
 */
function openAddAtPosition(slotX, slotY) 
{
    openAddModal();
    const addModal = document.getElementById("addModal");
    addModal.dataset.slotX = slotX;
    addModal.dataset.slotY = slotY;
}

/**
 * Submit new cassette to the server
 */
async function submitNewCassette() 
{
    const nameInput = document.getElementById("newName");
    const artistInput = document.getElementById("newArtist");
    const submitBtn = document.querySelector("#addModal button[onclick='submitNewCassette()']");
    const addModal = document.getElementById("addModal");
    
    const name = nameInput.value.trim();
    const artist = artistInput.value.trim();

    if (!name) { alert("Name required"); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = "SAVING...";

    try {
        const res = await fetch("/api/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                name, 
                artist, 
                slotX: addModal.dataset.slotX || null, 
                slotY: addModal.dataset.slotY || null 
            })
        });

        if (res.ok) {
            const tape = await res.json();

            // Show loader immediately
            showLoader("MOVING TO ENTRANCE...");

            // Close modal AFTER loader is visible
            closeAddModal();

            // Start polling
            actionTape(tape.id, "return");
        }   else {
            const errorData = await res.json().catch(() => ({}));
            alert(errorData.status || "Error adding tape");
        }
    } catch (e) {
        alert("Network error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "ADD";
    }
}


/* =========================
   10. REMOVE CASSETTE
========================= */

/**
 * Open remove cassette modal
 */
function openRemoveModal() 
{
    document.getElementById("removeModal").style.display = "flex";
    loadRemoveData();
    document.getElementById("removeSearch").value = "";
}

/**
 * Close remove cassette modal
 */
function closeRemoveModal() 
{
    document.getElementById("removeModal").style.display = "none";
    document.getElementById("removeContainer").innerHTML = "";
    loadData();
}

/**
 * Load tapes for remove modal
 */
async function loadRemoveData() 
{
    const res = await fetch('/api/tapes');
    const tapes = await res.json();
    renderRemoveList(tapes);
}

/**
 * Render remove modal list
 * @param {Array} tapes
 */
function renderRemoveList(tapes) 
{
    const container = document.getElementById('removeContainer');
    container.innerHTML = '';
    tapes.forEach(t => {
        const div = document.createElement('div');
        div.className = 'tape-item remove-item';
        div.innerHTML = `
            <span>${t.name} - ${t.artist || "Unknown Artist"}</span>
            <button class="remove-x" onclick="removeCassette(${t.id})">X</button>
        `;
        container.appendChild(div);
    });
}

/**
 * Remove a cassette
 * @param {number} id
 */
async function removeCassette(id) 
{
    if (!confirm("Are you sure you want to remove this cassette?")) return;
    
    await fetch(`/api/remove?id=${id}`, { method: 'DELETE' });
    
    loadRemoveData(); // Update remove list
    loadData();       // Update main grid/list
}

/**
 * Remove all cassettes from databse
 */
async function clearAllCassettes() {
    if (!confirm("⚠️ This will remove ALL cassettes from the database! Are you sure?")) return;

    try {
        const res = await fetch("/api/remove_all", { method: "DELETE" });
        if (res.ok) {
            alert("All cassettes removed successfully.");
            loadRemoveData(); // Refresh remove modal list
            loadData();       // Refresh main directory/grid
        } else {
            const err = await res.json().catch(() => ({}));
            alert(err.status || "Error clearing database");
        }
    } catch (e) {
        alert("Network error while clearing database");
        console.error(e);
    }
}

/**
 * Open slot machine window.
 */
function openSlotModal() {
    document.getElementById("slotModal").style.display = "flex";
    resetDirectoryFilters();
    renderCurrentView();
}

/**
 * Close slot machine window.
 */
function closeSlotModal() {
    document.getElementById("slotModal").style.display = "none";
}

/**
 * Return a weighted random tape from an array of tapes.
 * @param {Array} tapes - Array of tape objects
 * @param {Function} weightFn - Function that returns a weight for each tape
 * @returns {Object} - The selected tape
 */
function weightedRandom(tapes, weightFn) {
    const weights = tapes.map(weightFn);
    const totalWeight = weights.reduce((a,b) => a + b, 0);

    let random = Math.random() * totalWeight;

    for (let i = 0; i < tapes.length; i++) {
        if (random < weights[i]) return tapes[i];
        random -= weights[i];
    }
}

/**
 * shows the slot machine animation and selects a tape based on the type of randomization chosen by the user.
 * @param {string} type - 'normal' for pure random, 'favorite' for weighted towards most played, 'neglected' for weighted towards least played 
 * @returns 
 */
function startRandom(type) {
    closeSlotModal();

    // Only use tapes that are NOT out
    const availableTapes = currentTapes.filter(t => t.in_machine ==1 );

    console.log("Available tapes:", availableTapes);

    if (!availableTapes.length) {
        alert("No available cassettes to dispense.");
        return;
    }

    let chosen;

    switch(type) {

        case 'normal':
            chosen = availableTapes[Math.floor(Math.random() * availableTapes.length)];
            break;

        case 'favorite':
            chosen = weightedRandom(availableTapes, t => (t.listens || 0) + 1);
            break;

        case 'neglected':
            chosen = weightedRandom(availableTapes, t => 1 / ((t.listens || 0) + 1));
            break;
    }

    runSlotAnimation(chosen);
}



function openGenreFromSlot() {
    closeSlotModal();
    openGenreModal("slot"); // pass mode
}

/**
 * 
 * @param {*} finalTape 
 */
function runSlotAnimation(finalTape) {

    showLoader("SPINNING...");

    const spinInterval = setInterval(() => {
        const randomTape = currentTapes[
            Math.floor(Math.random() * currentTapes.length)
        ];
        document.getElementById("loader-text").innerText = randomTape.name;
    }, 100);

    setTimeout(() => {
        clearInterval(spinInterval);
        hideLoader();
        openModal(finalTape);
    }, 2500);
}


/**
 * Calculate and display statistics from currentTapes
 */
function updateStats() {
    if (currentTapes.length === 0) return;

    // 1. Total Cassettes
    const totalTapes = currentTapes.length;

    // 2. Total Plays
    const totalPlays = currentTapes.reduce((acc, t) => acc + (t.listens || 0), 0);

    // 3. Most Played Cassette
    const mostPlayedTape = [...currentTapes].sort((a, b) => (b.listens || 0) - (a.listens || 0))[0];

    // 4. Favorite Genre (Most frequent tag)
    const genreCounts = {};
    currentTapes.forEach(t => {
        if (t.tags) {
            t.tags.forEach(tag => {
                genreCounts[tag] = (genreCounts[tag] || 0) + 1;
            });
        }
    });

    let favoriteGenre = "NONE";
    let maxCount = 0;
    for (const [genre, count] of Object.entries(genreCounts)) {
        if (count > maxCount) {
            maxCount = count;
            favoriteGenre = genre;
        }
    }

    // Inject into HTML
    document.getElementById('stat-total-tapes').innerText = totalTapes;
    document.getElementById('stat-total-plays').innerText = totalPlays;
    document.getElementById('stat-most-played').innerText = mostPlayedTape ? mostPlayedTape.name.toUpperCase() : "N/A";
    document.getElementById('stat-fav-genre').innerText = favoriteGenre.toUpperCase();
}

/* =========================
   AUTO-ORGANIZE LOGIC
   TODO: I should write this and check it
========================= */

/**
 * Triggers the reorganization sequence
 */
async function beginAutoOrganize() {
    // UI Transition
    document.getElementById('auto-prompt').style.display = 'none';
    document.getElementById('auto-progress').style.display = 'block';
    
    // 1. Logic: Sort tapes by listens (descending)
    const sorted = [...currentTapes].sort((a, b) => (b.listens || 0) - (a.listens || 0));
    
    const moves = [];

    // TODO the target slot should be the next closest slot to 3,1
    let targetX = 1;
    let targetY = 1;

    // this should be making a queue of all the moves we want to make, send to backend
    sorted.forEach(tape => {
        // Only queue a move if it's not already in the right spot
        if (parseInt(tape.slot_x) !== targetX || parseInt(tape.slot_y) !== targetY) {
            moves.push({
                id: tape.id,
                name: tape.name,
                from: { x: tape.slot_x, y: tape.slot_y },
                to: { x: targetX, y: targetY }
            });
        }
        
        // Increment coordinates (5 wide, 11 high)
        targetX++;
        if (targetX > 5) {
            targetX = 1;
            targetY++;
        }
    });

    document.getElementById('auto-status').innerText = "EXECUTING SEQUENTIAL MOVES";
    document.getElementById('auto-step').innerText = `PENDING OPERATIONS: ${moves.length}`;

    // 2. Communication with Flask
    try {
        const response = await fetch('/api/auto_organize', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ moves: moves })
        });

        if (response.ok) {
            alert("RECALIBRATION SUCCESSFUL. DATABASE UPDATED.");
            navigateTo('main-menu');
        } else {
            const err = await response.json();
            alert("HARDWARE ERROR: " + (err.status || "Unknown Failure"));
            navigateTo('main-menu');
        }
    } catch (err) {
        alert("COMMUNICATION LOSS: SERIAL PORT UNRESPONSIVE");
        navigateTo('main-menu');
    }
}

/**
 * Emergency Halt of organize.
 */
function cancelAutoOrganize() {
    console.log("!!! EMERGENCY STOP INITIATED !!!");
    
    // 1. Tell the hardware to stop
    fetch(`/api/srl_cmd?action=cancel`)
        .then(() => {
            alert("PROTOCOL TERMINATED. MECHANICAL HALT ENGAGED.");
            // 2. Return to main menu
            navigateTo('main-menu');
        })
        .catch(err => {
            console.error("Failed to send stop signal", err);
            navigateTo('main-menu');
        });
}




