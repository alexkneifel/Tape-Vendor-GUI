/* =========================
   GLOBAL VARIABLES
========================= */
let currentTapes = [];
let isGrid = false; // Track current view mode (List/Grid)

/* =========================
   1. NAVIGATION
========================= */

/**
 * Navigate to a specific menu and hide others.
 * If navigating to the directory, load the tape data.
 * @param {string} menuId - The ID of the menu to display
 */
function navigateTo(menuId) 
{
    document.querySelectorAll('.menu').forEach(m => m.style.display = 'none');
    document.getElementById(menuId).style.display = 'flex';
    if (menuId === 'directory-menu') loadData();
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
    fetch(`/api/move?action=${action}&x=${x}&y=${y}`)
        .then(res => res.json())
        .then(data => alert(data.status))
        .catch(err => alert("Comm Error"));
}

/**
 * Send an X-axis offset to the hardware
 */
function sendOffset() 
{
    const val = document.getElementById('x-offset').value;
    fetch(`/api/offset?val=${val}`)
        .then(res => res.json())
        .then(data => alert(data.status));
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
 */
async function openGenreModal() {
    try {
        const res = await fetch("/api/tags");
        if (!res.ok) throw new Error("Server returned " + res.status);
        const tags = await res.json();
        const container = document.getElementById("genreCheckboxes");
        container.innerHTML = "";
        tags.forEach(tag => {
            const div = document.createElement("div");
            div.innerHTML = `<input type="checkbox" value="${tag}"> ${tag}`;
            container.appendChild(div);
        });
        document.getElementById("genreModal").style.display = "flex";
    } catch (err) {
        console.error("Failed to load genres:", err);
        alert("Could not load genres. Check console.");
    }
}


function closeGenreModal() {
    document.getElementById("genreModal").style.display = "none";
}

/**
 * Filter the list based on the genre's
 */
function applyGenreFilter() {
    const checked = [...document.querySelectorAll("#genreCheckboxes input:checked")].map(cb => cb.value);

    const filtered = currentTapes
        .map(t => {
            const matchCount = t.tags ? t.tags.filter(tag => checked.includes(tag)).length : 0;
            return {...t, matchCount};
        })
        .filter(t => t.matchCount > 0)
        .sort((a,b) => b.matchCount - a.matchCount);

    renderList(filtered);
    closeGenreModal();
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
function renderGrid() 
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

    for (let row = 0; row < 11; row++) {
        for (let col = 0; col < 5; col++) {
            const currentX = col + 1;
            // INVERT THE Y-AXIS HERE
            // When row is 0 (top of screen), Y is 11. When row is 10 (bottom), Y is 1.
            const currentY = 11 - row; 

            const tapeAtPos = currentTapes.find(t => 
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
    gridBtn.textContent = isGrid ? 'LIST' : 'GRID';

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
        actions.innerHTML = `<div class="modal-btn-container">
                                <button onclick="actionTape(${tape.id}, 'dispense')">DISPENSE</button>
                             </div>`;
    } else {
        actions.innerHTML = `<div class="modal-btn-container">
                                <button onclick="actionTape(${tape.id}, 'return')">RETURN</button>
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
 */
async function actionTape(id, type) 
{
    closeModal();
    const loaderMsg = type === 'dispense' ? "DISPENSING..." : "RETURNING...";
    showLoader(loaderMsg);
    
    try {
        const response = await fetch(`/api/${type}?id=${id}`);
        if (response.ok) {
            setTimeout(async () => { 
                hideLoader(); 
                await loadData(); 
            }, 4000);
        } else {
            alert("Error communicating with machine.");
            hideLoader();
        }
    } catch (err) {
        console.error("Action failed:", err);
        hideLoader();
    }
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
            closeAddModal();
            await loadData(); 
            renderCurrentView(); 
        } else {
            const errorData = await res.json().catch(() => ({}));
            alert(errorData.status || "Error adding tape");
        }
    } catch (e) {
        alert("Network error");
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "ADD CASSETTE";
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
