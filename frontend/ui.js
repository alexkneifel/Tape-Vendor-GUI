let currentTapes = [];
let isGrid = false; // track current view mode

// --------------------- NAVIGATION ---------------------
function navigateTo(menuId) {
    document.querySelectorAll('.menu').forEach(m => m.style.display = 'none');
    document.getElementById(menuId).style.display = 'flex';
    if (menuId === 'directory-menu') loadData();
}

// --------------------- DEV MODE CONTROLS ---------------------
function sendMovement(action) {
    const x = document.getElementById('x-index').value;
    const y = document.getElementById('y-index').value;
    fetch(`/api/move?action=${action}&x=${x}&y=${y}`)
        .then(res => res.json())
        .then(data => alert(data.status))
        .catch(err => alert("Comm Error"));
}

function sendOffset() {
    const val = document.getElementById('x-offset').value;
    fetch(`/api/offset?val=${val}`)
        .then(res => res.json())
        .then(data => alert(data.status));
}

// --------------------- DIRECTORY LOGIC ---------------------
async function loadData() {
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

// RENDER CURRENT VIEW BASED ON isGrid
function renderCurrentView() {
    if (isGrid) renderGrid();
    else renderList(currentTapes);
}

// --------------------- LIST VIEW ---------------------




  
    

// --------------------- TOGGLE VIEW ---------------------
function toggleView() {
    isGrid = !isGrid;
    const gridBtn = document.querySelector('.dir-controls button:nth-child(3)');
    gridBtn.textContent = isGrid ? 'LIST' : 'GRID';
    renderCurrentView();
}

// --------------------- CASSETTE MODAL ---------------------
function openModal(tape) {
    document.getElementById('m-title').innerText = tape.name;
    document.getElementById('m-artist').innerText = tape.artist || "Unknown Artist";
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

function closeModal() { document.getElementById('modal').style.display = 'none'; }

// --------------------- LIST VIEW ---------------------
function renderList(tapes) {
    const container = document.getElementById('tapeContainer');
    container.innerHTML = '';
    
    tapes.forEach(t => {
        const div = document.createElement('div');
        // If in_machine is 0, add the 'is-out' class for the dashed look
        const isOut = (t.in_machine == 0); 
        div.className = `tape-item ${isOut ? 'is-out' : ''}`;
        
        // Show [OUT] prefix only if the tape is dispensed
        div.innerHTML = `
            <span>${isOut ? '[OUT] ' : ''}${t.name || "UNKNOWN"}</span> 
            <span>${t.listens || 0} PLAYS</span>
        `;
        
        div.onclick = () => openModal(t);
        container.appendChild(div);
    });
}

// --------------------- GRID VIEW ---------------------
function renderGrid() {
    const container = document.getElementById('tapeContainer');
    container.innerHTML = '';
    
    const grid = document.createElement('div');
    grid.className = "grid-layout"; 
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(5, 1fr)';
    grid.style.gridTemplateRows = 'repeat(11, 80px)';
    grid.style.gap = '8px';
    grid.style.width = '95%';

    for (let row = 0; row < 11; row++) {
        for (let col = 0; col < 5; col++) {
            const currentX = col + 1;
            const currentY = row + 1;

            // FIX: Force everything to Integers for the comparison
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

                // LED Logic
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
                btn.onclick = () => openAddAtPosition(currentX, currentY);
            }
            grid.appendChild(btn);
        }
    }
    container.appendChild(grid);
}

// --------------------- ACTION LOGIC ---------------------
async function actionTape(id, type) {
    closeModal();
    const loaderMsg = type === 'dispense' ? "DISPENSING..." : "RETURNING...";
    showLoader(loaderMsg);
    
    try {
        // This hits the specific endpoint (dispense or return)
        const response = await fetch(`/api/${type}?id=${id}`);
        
        if (response.ok) {
            // Wait for hardware animation (4 seconds)
            setTimeout(async () => { 
                hideLoader(); 
                // CRITICAL: Refresh the data and the view
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

// --------------------- LOADER ---------------------
function showLoader(msg) {
    document.getElementById('loader-text').innerText = msg;
    document.getElementById('loader').style.display = 'flex';
}
function hideLoader() { document.getElementById('loader').style.display = 'none'; }

// --------------------- SEARCH ---------------------
function filterList() {
    const term = document.getElementById('searchBar').value.toLowerCase();
    const filtered = currentTapes.filter(t => t.name.toLowerCase().includes(term));
    renderList(filtered);
}

// --------------------- ADD CASSETTE ---------------------
function openAddModal() {
    document.getElementById("addModal").style.display = "flex";
}

function closeAddModal() {
    document.getElementById("addModal").style.display = "none";
    clearAddFields();
}

function clearAddFields() {
    document.getElementById("newName").value = "";
    document.getElementById("newArtist").value = "";
    delete document.getElementById("addModal").dataset.slotX;
    delete document.getElementById("addModal").dataset.slotY;
}

function openAddAtPosition(slotX, slotY) {
    openAddModal();
    const addModal = document.getElementById("addModal");
    addModal.dataset.slotX = slotX;
    addModal.dataset.slotY = slotY;
}

async function submitNewCassette() {
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
            console.log("Tape added successfully");
            closeAddModal();
            
            // Re-fetch everything from the server
            await loadData(); 
            
            // FORCE the render to happen again now that currentTapes is updated
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


// --------------------- REMOVE CASSETTE ---------------------
function openRemoveModal() {
    document.getElementById("removeModal").style.display = "flex";
    loadRemoveData();
    document.getElementById("removeSearch").value = "";
}

function closeRemoveModal() {
    document.getElementById("removeModal").style.display = "none";
    document.getElementById("removeContainer").innerHTML = "";
    loadData();
}

async function loadRemoveData() {
    const res = await fetch('/api/tapes');
    const tapes = await res.json();
    renderRemoveList(tapes);
}

function renderRemoveList(tapes) {
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

function filterRemoveList() {
    const term = document.getElementById("removeSearch").value.toLowerCase();
    const allItems = document.getElementById("removeContainer").children;
    for (let item of allItems) {
        const name = item.querySelector('span').innerText.toLowerCase();
        item.style.display = name.includes(term) ? 'flex' : 'none';
    }
}

async function removeCassette(id) {
    if (!confirm("Are you sure you want to remove this cassette?")) return;
    
    await fetch(`/api/remove?id=${id}`, { method: 'DELETE' });
    
    loadRemoveData(); // Update remove list
    loadData(); // Update main grid/list
}