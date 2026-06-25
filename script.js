// Variables de Estado Principal
let state = {
    phase: 1,
    players: [], 
    playersPerMatch: 4,
    matches: [] 
};

let activeMatchId = null;

// Al cargar la página, recuperar del LocalStorage si existe
window.onload = function() {
    const savedState = localStorage.getItem('tournament_state_v2');
    if (savedState) {
        try {
            state = JSON.parse(savedState);
            if (state.phase === 2) {
                renderPhase2();
            } else {
                renderPhase1();
            }
        } catch (e) {
            renderPhase1();
        }
    } else {
        // Inicialización por defecto en Fase 1
        document.getElementById('playersInput').value = Array.from({length: 12}, (_, i) => `Jugador ${i + 1}`).join('\n');
        renderPhase1();
    }
};

function saveState() {
    localStorage.setItem('tournament_state_v2', JSON.stringify(state));
}

function renderPhase1() {
    state.phase = 1;
    document.getElementById('phase1').classList.add('active');
    document.getElementById('phase2').classList.remove('active');
    document.getElementById('btnNewTournament').style.display = 'none';
    saveState();
}

function renderPhase2() {
    state.phase = 2;
    document.getElementById('phase1').classList.remove('active');
    document.getElementById('phase2').classList.add('active');
    document.getElementById('btnNewTournament').style.display = 'block';
    
    renderMatches();
    renderLeaderboard();
    saveState();
}

function confirmarNuevoTorneo() {
    if (confirm("¿Estás seguro de que deseas borrar este torneo y crear uno nuevo? Perderás todos los datos actuales.")) {
        localStorage.removeItem('tournament_state_v2');
        state = { phase: 1, players: [], playersPerMatch: 4, matches: [] };
        document.getElementById('playersInput').value = Array.from({length: 12}, (_, i) => `Jugador ${i + 1}`).join('\n');
        renderPhase1();
    }
}

function inicializarTorneo() {
    const text = document.getElementById('playersInput').value;
    const pPerMatch = parseInt(document.getElementById('sizeInput').value);
    const errorMsg = document.getElementById('errorMsg');
    
    errorMsg.style.display = 'none';

    let rawNames = text.split('\n').map(p => p.trim()).filter(p => p.length > 0);
    if (rawNames.length < 2) { return showError("Introduce al menos 2 jugadores."); }
    if (isNaN(pPerMatch) || pPerMatch < 2) { return showError("Mínimo 2 jugadores por partida."); }
    if (pPerMatch > rawNames.length) { return showError("El tamaño de partida supera el total de jugadores."); }

    // Generar IDs estables basados en la marca de tiempo para evitar problemas si se repiten nombres
    state.players = rawNames.map((name, index) => ({ id: `p_${index}_${Date.now()}`, name: name }));
    state.playersPerMatch = pPerMatch;

    let optimalFixture = null;
    let minMatches = Infinity;
    
    // Probar soluciones probabilísticas rápidas para encontrar el fixture más óptimo
    for (let i = 0; i < 300; i++) {
        let res = calcularRoundRobinHeuristico(state.players.length, pPerMatch);
        if (res && res.length < minMatches) {
            minMatches = res.length;
            optimalFixture = res;
        }
    }

    if (!optimalFixture) {
        return showError("Combinación compleja. Agrega más jugadores o reduce el tamaño de partida.");
    }

    state.matches = optimalFixture.map((partidaIdxs, index) => {
        let playerIds = partidaIdxs.map(idx => state.players[idx].id);
        let scores = {};
        let positions = {};
        playerIds.forEach(id => { scores[id] = 0; positions[id] = 1; });
        return {
            id: index,
            playerIds: playerIds,
            scores: scores,
            positions: positions,
            played: false
        };
    });

    renderPhase2();
}

function showError(msg) {
    const errorMsg = document.getElementById('errorMsg');
    errorMsg.innerText = msg;
    errorMsg.style.display = 'block';
}

// Lógica del motor matemático Round Robin Multijugador
function calcularRoundRobinHeuristico(numPlayers, k) {
    let matrix = Array.from({ length: numPlayers }, () => new Array(numPlayers).fill(0));
    let totalPairs = (numPlayers * (numPlayers - 1)) / 2;
    let coveredPairs = 0;
    let matches = [];
    let matchesPerPlayer = new Array(numPlayers).fill(0);
    let maxLoops = 1000;

    while (coveredPairs < totalPairs && maxLoops > 0) {
        maxLoops--;
        let currentMatch = [];
        
        let minM = Math.min(...matchesPerPlayer);
        let candidates = [];
        for(let i=0; i<numPlayers; i++) if(matchesPerPlayer[i] === minM) candidates.push(i);
        let first = candidates[Math.floor(Math.random() * candidates.length)];
        currentMatch.push(first);

        while (currentMatch.length < k) {
            let bestScore = -Infinity;
            let bestCandidates = [];

            for (let p = 0; p < numPlayers; p++) {
                if (currentMatch.includes(p)) continue;
                let score = 0;
                for (let member of currentMatch) {
                    if (matrix[p][member] === 0) score += 100;
                    else score -= matrix[p][member] * 15;
                }
                score -= matchesPerPlayer[p] * 2;

                if (score > bestScore) {
                    bestScore = score;
                    bestCandidates = [p];
                } else if (score === bestScore) {
                    bestCandidates.push(p);
                }
            }

            if (bestCandidates.length === 0) break;
            let nextP = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
            currentMatch.push(nextP);
        }

        if (currentMatch.length === k) {
            matches.push(currentMatch);
            for (let i = 0; i < currentMatch.length; i++) {
                matchesPerPlayer[currentMatch[i]]++;
                for (let j = i + 1; j < currentMatch.length; j++) {
                    let p1 = currentMatch[i], p2 = currentMatch[j];
                    if (matrix[p1][p2] === 0) coveredPairs++;
                    matrix[p1][p2]++; matrix[p2][p1]++;
                }
            }
        } else { break; }
    }
    return coveredPairs === totalPairs ? matches : null;
}

// RENDERIZAR ENCUENTROS (Columna Izquierda)
function renderMatches() {
    const container = document.getElementById('matchesList');
    container.innerHTML = '';

    state.matches.forEach(match => {
        const card = document.createElement('div');
        card.className = `match-card ${match.played ? 'played' : ''}`;
        card.onclick = () => openModal(match.id);

        let playersHtml = match.playerIds.map(pId => {
            const player = state.players.find(p => p.id === pId);
            const name = player ? player.name : 'Desconocido';
            if (match.played) {
                return `
                    <div class="match-player-row">
                        <span>${name}</span>
                        <span><strong>${match.scores[pId]} pts</strong> <span class="badge-pos">${match.positions[pId]}º</span></span>
                    </div>
                `;
            } else {
                return `<div class="match-player-row"><span>${name}</span><span style="color:var(--text-muted);">-</span></div>`;
            }
        }).join('');

        card.innerHTML = `
            <div class="match-header">
                <span>Partida ${match.id + 1}</span>
                <span class="match-status">${match.played ? 'Terminado' : 'Pendiente'}</span>
            </div>
            <div class="match-players-grid">${playersHtml}</div>
        `;
        container.appendChild(card);
    });
}

// SISTEMA JERÁRQUICO DE DESEMPATE
function obtenerEstadisticasProcesadas() {
    let stats = {};
    state.players.forEach(p => {
        stats[p.id] = { id: p.id, name: p.name, points: 0, first: 0, second: 0, third: 0 };
    });

    state.matches.forEach(match => {
        if (match.played) {
            match.playerIds.forEach(pId => {
                if (stats[pId]) {
                    stats[pId].points += parseFloat(match.scores[pId] || 0);
                    let pos = parseInt(match.positions[pId]);
                    if (pos === 1) stats[pId].first++;
                    if (pos === 2) stats[pId].second++;
                    if (pos === 3) stats[pId].third++;
                }
            });
        }
    });

    // 1º Criterio: Puntos totales (Descendiente). 
    // 2º Criterio: Mayor número de 1º puestos. 
    // 3º Criterio: Mayor número de 2º puestos. 
    // 4º Criterio: Mayor número de 3º puestos.
    return Object.values(stats).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points; 
        if (b.first !== a.first) return b.first - a.first;     
        if (b.second !== a.second) return b.second - a.second; 
        return b.third - a.third;                             
    });
}

// RENDERIZAR CLASIFICACIÓN (Columna Derecha)
function renderLeaderboard() {
    const tbody = document.getElementById('leaderboardBody');
    tbody.innerHTML = '';

    let sortedStats = obtenerEstadisticasProcesadas();

    sortedStats.forEach(playerStat => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>
                <input type="text" class="input-inline-name" value="${escapeHtml(playerStat.name)}" 
                       onchange="modificarNombreJugador('${playerStat.id}', this.value)">
            </td>
            <td style="font-weight:bold;">${playerStat.points}</td>
            <td><span style="color:#b45309; font-weight:600;">${playerStat.first}</span></td>
            <td><span style="color:#4b5563; font-weight:600;">${playerStat.second}</span></td>
            <td><span style="color:#78350f; font-weight:600;">${playerStat.third}</span></td>
        `;
        tbody.appendChild(row);
    });
}

function modificarNombreJugador(id, nuevoNombre) {
    let nameClean = nuevoNombre.trim();
    if (nameClean.length === 0) return;
    
    let p = state.players.find(x => x.id === id);
    if (p) {
        p.name = nameClean;
        saveState();
        renderMatches();
        renderLeaderboard();
    }
}

// POPUP INTERACTIVO (MODAL RESULTADOS)
function openModal(matchId) {
    activeMatchId = matchId;
    const match = state.matches.find(m => m.id === matchId);
    document.getElementById('modalMatchTitle').innerText = `Resultados - Partida ${matchId + 1}`;
    
    const container = document.getElementById('modalPlayersContainer');
    container.innerHTML = '';

    match.playerIds.forEach(pId => {
        const player = state.players.find(p => p.id === pId);
        const currentScore = match.played ? match.scores[pId] : 0;
        const currentPos = match.played ? match.positions[pId] : 1;

        let selectOptions = '';
        for(let i = 1; i <= state.playersPerMatch; i++) {
            selectOptions += `<option value="${i}" ${currentPos == i ? 'selected' : ''}>${i}º</option>`;
        }

        const row = document.createElement('div');
        row.className = 'modal-row';
        row.innerHTML = `
            <label title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</label>
            <input type="number" id="modal_score_${pId}" value="${currentScore}" step="any" oninput="calcularPosicionesDinamicas()">
            <select id="modal_pos_${pId}">${selectOptions}</select>
        `;
        container.appendChild(row);
    });

    document.getElementById('scoreModal').classList.add('active');
}

// Auto-cálculo de posiciones por puntaje en tiempo real
function calcularPosicionesDinamicas() {
    if (activeMatchId === null) return;
    const match = state.matches.find(m => m.id === activeMatchId);
    
    let listaPuntajes = match.playerIds.map(pId => {
        const val = document.getElementById(`modal_score_${pId}`).value;
        return { id: pId, score: val === "" ? 0 : parseFloat(val) };
    });

    listaPuntajes.sort((a, b) => b.score - a.score);

    let puestoActual = 1;
    for (let i = 0; i < listaPuntajes.length; i++) {
        if (i > 0 && listaPuntajes[i].score < listaPuntajes[i-1].score) {
            puestoActual = i + 1;
        }
        const selectElement = document.getElementById(`modal_pos_${listaPuntajes[i].id}`);
        if (selectElement) selectElement.value = puestoActual;
    }
}

function closeModal() {
    document.getElementById('scoreModal').classList.remove('active');
    activeMatchId = null;
}

function saveScores() {
    if (activeMatchId === null) return;
    const match = state.matches.find(m => m.id === activeMatchId);

    match.playerIds.forEach(pId => {
        const scoreInput = document.getElementById(`modal_score_${pId}`);
        const posSelect = document.getElementById(`modal_pos_${pId}`);
        
        match.scores[pId] = scoreInput.value === "" ? 0 : parseFloat(scoreInput.value);
        match.positions[pId] = parseInt(posSelect.value);
    });

    match.played = true;
    closeModal();
    renderPhase2();
}

// FINALIZAR TORNEO Y PODIO VISUAL (2º - 1º - 3º)
function finalizarTorneoYMostrarPodio() {
    let sortedStats = obtenerEstadisticasProcesadas();
    const container = document.getElementById('podiumContainer');
    container.innerHTML = '';

    let vacio = { name: 'Vacio', points: 0, first: 0, second: 0, third: 0 };
    let p1 = sortedStats[0] || vacio;
    let p2 = sortedStats[1] || vacio;
    let p3 = sortedStats[2] || vacio;

    container.innerHTML = `
        <div class="podium-step second">
            <div class="podium-medal">🥈</div>
            <div class="podium-name" title="${escapeHtml(p2.name)}">${escapeHtml(p2.name)}</div>
            <div class="podium-pts">${p2.points} pts</div>
            <div class="podium-breakdown">1º: ${p2.first} | 2º: ${p2.second}</div>
        </div>

        <div class="podium-step first">
            <div class="podium-medal">👑🥇</div>
            <div class="podium-name" title="${escapeHtml(p1.name)}">${escapeHtml(p1.name)}</div>
            <div class="podium-pts">${p1.points} pts</div>
            <div class="podium-breakdown">1º: ${p1.first} | 2º: ${p1.second}</div>
        </div>

        <div class="podium-step third">
            <div class="podium-medal">🥉</div>
            <div class="podium-name" title="${escapeHtml(p3.name)}">${escapeHtml(p3.name)}</div>
            <div class="podium-pts">${p3.points} pts</div>
            <div class="podium-breakdown">1º: ${p3.first} | 2º: ${p3.second}</div>
        </div>
    `;

    document.getElementById('podiumModal').classList.add('active');
}

function closePodiumModal() {
    document.getElementById('podiumModal').classList.remove('active');
}

// Limpieza segura de caracteres especiales
function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}