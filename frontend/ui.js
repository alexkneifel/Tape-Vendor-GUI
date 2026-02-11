function navigateTo(menuId) {
    document.querySelectorAll('.menu').forEach(menu => {
        menu.style.display = 'none';
    });
    const target = document.getElementById(menuId);
    if (target) target.style.display = 'flex';

    if (menuId === 'directory-menu') loadDirectory();
}

function sendMovement(action) {
    const x = document.getElementById('x-index').value;
    const y = document.getElementById('y-index').value;
    
    // Construct a URL with query parameters
    const endpoint = `/api/move?action=${action}&x=${x}&y=${y}`;
    
    fetch(endpoint)
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

function loadDirectory() {
    fetch('/api/tapes')
        .then(res => res.json())
        .then(tapes => {
            const container = document.getElementById('tapeContainer');
            container.innerHTML = '';
            tapes.forEach(tape => {
                const div = document.createElement('div');
                div.className = `tape-item ${tape.in_machine ? '' : 'is-out'}`;
                div.innerHTML = `<span>${tape.in_machine ? '' : '[OUT] '} ${tape.name}</span> <span>${tape.listens || 0} plays</span>`;
                container.appendChild(div);
            });
        });
}

function toggleView() {
    const container = document.getElementById('tapeContainer');
    container.classList.toggle('grid-view');
}