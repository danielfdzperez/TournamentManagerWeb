/**
 * ESTADO GLOBAL DE LA APLICACIÓN
 * Mantiene la persistencia de los datos del torneo en memoria volátil
 * antes de ser sincronizados con el LocalStorage.
 */
let state = {
    phase: 1,                    // Fase actual del torneo (1: Configuración, 2: Competición)
    players: [],                 // Lista de objetos jugador: { id, name }
    playersPerMatch: 4,          // Capacidad máxima de jugadores por mesa/partida
    intendedMatchesPerPlayer: 2, // Cuántas partidas obligatorias debe jugar cada participante
    matches: []                  // Lista de partidas calculadas para el fixture
};

// Almacena el ID de la partida que se está editando activamente en el PopUp
let activeMatchId = null;

/**
 * EVENTO DE CARGA INICIAL (Lifecycle)
 * Se ejecuta automáticamente cuando el navegador termina de renderizar el HTML.
 */
window.onload = function() {
    // Escuchadores de eventos: actualizan los cálculos teóricos en tiempo real mientras el usuario escribe
    document.getElementById('playersInput').addEventListener('input', actualizarCalculosTeoricos);
    document.getElementById('sizeInput').addEventListener('input', actualizarCalculosTeoricos);
    document.getElementById('matchesInput').addEventListener('input', actualizarCalculosTeoricos);

    // Intenta recuperar un torneo guardado previamente en el almacenamiento local del navegador
    const savedState = localStorage.getItem('tournament_state_v3');
    if (savedState) {
        try {
            state = JSON.parse(savedState);
            // Si el torneo ya estaba en marcha (Fase 2), saltamos directamente ahí
            if (state.phase === 2) {
                renderPhase2();
            } else {
                renderPhase1();
            }
        } catch (e) {
            // Si el JSON está corrupto, limpiamos y cargamos la Fase 1 por seguridad
            renderPhase1();
        }
    } else {
        // Si es la primera vez que entra, precargamos 12 jugadores de ejemplo para facilitar las pruebas
        document.getElementById('playersInput').value = Array.from({length: 12}, (_, i) => `Jugador ${i + 1}`).join('\n');
        renderPhase1();
    }
};

/**
 * GUARDA EL ESTADO EN LOCAL STORAGE
 * Serializa el objeto de estado en una cadena de texto para no perder datos al refrescar.
 */
function saveState() {
    localStorage.setItem('tournament_state_v3', JSON.stringify(state));
}

/**
 * PROYECCIÓN MATEMÁTICA EN TIEMPO REAL
 * Informa al organizador sobre la viabilidad del torneo antes de darle al botón de generar.
 */
function actualizarCalculosTeoricos() {
    const text = document.getElementById('playersInput').value;
    const k = parseInt(document.getElementById('sizeInput').value); // Tamaño max mesa
    const m = parseInt(document.getElementById('matchesInput').value); // Partidas por jugador
    
    // Filtramos líneas vacías para contar los jugadores reales introducidos
    let rawNames = text.split('\n').map(p => p.trim()).filter(p => p.length > 0);
    const n = rawNames.length;

    const divMinRec = document.getElementById('calcMinRecommended');
    const divTotalMatches = document.getElementById('calcTotalMatches');

    // Validación básica: si no hay datos suficientes, reseteamos la interfaz de información
    if (n < 2 || isNaN(k) || k < 2) {
        divMinRec.innerText = "Mínimo de partidas por jugador para cruce total: --";
        divTotalMatches.innerText = "Total de partidas que se generarán en el torneo: --";
        return;
    }

    // FÓRMULA DE REDUCCIÓN COMBINATORIA: Mínimo de rondas para que todos jueguen contra todos
    // Ceil (techo) porque no existen las partidas fraccionadas.
    const minRecommended = Math.ceil((n - 1) / (k - 1));
    divMinRec.innerHTML = `Mínimo de partidas por jugador para cruce total: <strong>${minRecommended}</strong> ${m < minRecommended ? '<span style="color:#eab308;">⚠️ (Estás eligiendo menos)</span>' : ''}`;

    // FÓRMULA DE RANURAS (SLOTS): Calcula cuántas partidas idóneas saldrán en total
    if (!isNaN(m) && m > 0) {
        const totalMatches = Math.ceil((n * m) / k);
        divTotalMatches.innerHTML = `Total de partidas que se generarán en el torneo: <strong>${totalMatches} encuentros</strong>.`;
    } else {
        divTotalMatches.innerText = "Total de partidas que se generarán en el torneo: --";
    }
}

// Alterna la visualización de la interfaz hacia la Fase de Configuración
function renderPhase1() {
    state.phase = 1;
    document.getElementById('phase1').classList.add('active');
    document.getElementById('phase2').classList.remove('active');
    document.getElementById('btnNewTournament').style.display = 'none';
    actualizarCalculosTeoricos();
    saveState();
}

// Alterna la visualización de la interfaz hacia la Fase de Torneo Activo
function renderPhase2() {
    state.phase = 2;
    document.getElementById('phase1').classList.remove('active');
    document.getElementById('phase2').classList.add('active');
    document.getElementById('btnNewTournament').style.display = 'block';
    
    renderMatches();
    renderLeaderboard();
    saveState();
}

// Muestra una alerta de confirmación antes de destruir el torneo actual
function confirmarNuevoTorneo() {
    if (confirm("¿Estás seguro de que deseas borrar este torneo? Perderás todos los datos.")) {
        localStorage.removeItem('tournament_state_v3');
        state = { phase: 1, players: [], playersPerMatch: 4, intendedMatchesPerPlayer: 2, matches: [] };
        document.getElementById('playersInput').value = Array.from({length: 12}, (_, i) => `Jugador ${i + 1}`).join('\n');
        renderPhase1();
    }
}

/**
 * PUNTO DE ENTRADA PARA LA CREACIÓN DEL FIXTURE
 * Valida los inputs del usuario e inicia el bucle de fuerza bruta/Monte Carlo.
 */
function inicializarTorneo() {
    const text = document.getElementById('playersInput').value;
    const pPerMatch = parseInt(document.getElementById('sizeInput').value);
    const mPerPlayer = parseInt(document.getElementById('matchesInput').value);
    const errorMsg = document.getElementById('errorMsg');
    
    errorMsg.style.display = 'none';

    let rawNames = text.split('\n').map(p => p.trim()).filter(p => p.length > 0);
    if (rawNames.length < 2) { return showError("Introduce al menos 2 jugadores."); }
    if (isNaN(pPerMatch) || pPerMatch < 2) { return showError("Mínimo 2 jugadores por partida."); }
    if (isNaN(mPerPlayer) || mPerPlayer < 1) { return showError("Cada jugador debe jugar al menos 1 partida."); }

    // Generamos identificadores únicos inmutables usando Timestamps para evitar colisiones por nombres duplicados
    state.players = rawNames.map((name, index) => ({ id: `p_${index}_${Date.now()}`, name: name }));
    state.playersPerMatch = pPerMatch;
    state.intendedMatchesPerPlayer = mPerPlayer;

    let optimalFixture = null;
    
    /**
     * BUCLE SIMULACIÓN MONTE CARLO (500 Intentos)
     * Como el algoritmo toma decisiones con un ligero factor aleatorio (desempates),
     * si una iteración se bloquea matemáticamente, se descarta y se inicia una nueva desde cero.
     * Esto ocurre en milisegundos.
     */
    for (let i = 0; i < 500; i++) {
        let res = calcularRoundRobinEstricto(state.players.length, pPerMatch, mPerPlayer);
        if (res) {
            optimalFixture = res; // Encontrado un fixture válido que cumple todas las restricciones
            break;
        }
    }

    if (!optimalFixture) {
        return showError("Combinación matemáticamente inestable. Prueba a cambiar el número de partidas por jugador o el tamaño de las mesas.");
    }

    // Estructuramos el fixture final mapeando los índices matemáticos a nuestro objeto de estado
    state.matches = optimalFixture.map((partidaIdxs, index) => {
        let playerIds = partidaIdxs.map(idx => state.players[idx].id);
        let scores = {};
        let positions = {};
        // Inicializamos puntuaciones a cero y posiciones en 1º de forma provisional
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

/**
 * EL ALGORITMO CORE: ROUND ROBIN ESTRICTO Y BALANCEADO
 * Diseñado bajo un enfoque Greedy (Codicioso) con redistribución homogénea de residuos.
 */
function calcularRoundRobinEstricto(numPlayers, k, m) {
    // 1. Calculamos el espacio total de "asientos" (slots) disponibles en todo el torneo
    let totalSlots = numPlayers * m;
    // 2. Determinamos cuántas partidas idóneas absolutas se necesitan
    let totalMatches = Math.ceil(totalSlots / k);
    
    /**
     * ESTRATEGIA DE REDISTRIBUCIÓN HOMOGÉNEA (Evita partidas de 1 jugador)
     * En lugar de llenar mesas a tope y dejar residuos cojos, dividimos los slots de forma equitativa.
     * Ejemplo: 22 slots en mesas de máx 4 -> Crea 4 mesas de 4 jugadores y 2 mesas de 3 jugadores.
     */
    let capacities = [];
    let baseCap = Math.floor(totalSlots / totalMatches); // Capacidad mínima garantizada por mesa
    let remainder = totalSlots % totalMatches;          // Cuántas mesas recibirán un jugador extra (+1)
    
    for (let i = 0; i < totalMatches; i++) {
        capacities.push(baseCap + (i < remainder ? 1 : 0));
    }

    // Matriz de adyacencia (N x N) para registrar cuántas veces se han enfrentado el jugador X e Y
    let matrix = Array.from({ length: numPlayers }, () => new Array(numPlayers).fill(0));
    // Array de control para verificar cuántas partidas lleva jugadas cada individuo
    let matchesPerPlayer = new Array(numPlayers).fill(0);
    let matches = []; // Almacenará el fixture final de índices

    // Generamos consecutivamente cada una de las partidas requeridas
    for (let mIdx = 0; mIdx < totalMatches; mIdx++) {
        let currentCap = capacities[mIdx]; // Capacidad exacta balanceada para ESTA mesa específica
        let currentMatch = [];             // Integrantes de la mesa actual
        
        // 1. RESTRICCIÓN DE IGUALDAD: Buscar el número mínimo de partidos que alguien lleva actualmente
        let minPlayed = Infinity;
        for(let i=0; i<numPlayers; i++) {
            if(matchesPerPlayer[i] < m && matchesPerPlayer[i] < minPlayed) {
                minPlayed = matchesPerPlayer[i];
            }
        }
        if (minPlayed === Infinity) break;

        // Filtramos qué jugadores comparten este estatus de rezagados y aún tienen permitido jugar
        let candidates = [];
        for (let i = 0; i < numPlayers; i++) {
            if (matchesPerPlayer[i] === minPlayed && matchesPerPlayer[i] < m) candidates.push(i);
        }
        
        // Sentamos al primer jugador de la mesa (elegido al azar entre los que menos han jugado)
        let first = candidates[Math.floor(Math.random() * candidates.length)];
        currentMatch.push(first);

        // 2. SISTEMA DE PUNTUACIÓN GREEDY: Rellenar los asientos restantes de la mesa de forma inteligente
        while (currentMatch.length < currentCap) {
            let bestScore = -Infinity;
            let bestCandidates = [];

            for (let p = 0; p < numPlayers; p++) {
                if (matchesPerPlayer[p] >= m) continue;   // Saltamos si ya cumplió su cupo máximo de partidas
                if (currentMatch.includes(p)) continue;   // Saltamos si ya está sentado en esta misma mesa

                let score = 0;
                // Evaluamos la relación del candidato con los que ya están sentados en la mesa
                for (let member of currentMatch) {
                    if (matrix[p][member] === 0) {
                        score += 100; // ¡Rival nuevo! Máxima prioridad para asegurar el Round Robin (todos contra todos)
                    } else {
                        score -= matrix[p][member] * 20; // Penalización severa si ya han jugado juntos para evitar repeticiones
                    }
                }
                // Factor de estabilización lineal: preferir sutilmente a quienes llevan menos partidas totales
                score -= matchesPerPlayer[p] * 12;

                // Guardamos los candidatos con la puntuación de afinidad más alta
                if (score > bestScore) {
                    bestScore = score;
                    bestCandidates = [p];
                } else if (score === bestScore) {
                    bestCandidates.push(p);
                }
            }

            // BACKTRACKING TRIGGER: Si la matriz se bloqueó y no hay candidatos válidos,
            // devolvemos 'null' para abortar este intento e iniciar otra simulación limpia.
            if (bestCandidates.length === 0) return null; 
            
            let nextP = bestCandidates[Math.floor(Math.random() * bestCandidates.length)];
            currentMatch.push(nextP);
        }

        // Mesa completada con éxito. Registramos los enfrentamientos en la matriz y el contador individual
        matches.push(currentMatch);
        for (let i = 0; i < currentMatch.length; i++) {
            matchesPerPlayer[currentMatch[i]]++;
            for (let j = i + 1; j < currentMatch.length; j++) {
                let p1 = currentMatch[i], p2 = currentMatch[j];
                matrix[p1][p2]++; 
                matrix[p2][p1]++; // La relación es simétrica (si A juega con B, B juega con A)
            }
        }
    }

    // VALIDACIÓN ESTRICTA FINAL: El fixture solo se aprueba si ABSOLUTAMENTE TODOS jugaron el número exacto 'm'
    for (let i = 0; i < numPlayers; i++) {
        if (matchesPerPlayer[i] !== m) return null;
    }
    return matches; // Fixture perfecto generado
}

/**
 * RENDERIZADOR DE ENCUENTROS
 * Traduce el array de partidas en tarjetas visuales interactivas (HTML)
 */
function renderMatches() {
    const container = document.getElementById('matchesList');
    container.innerHTML = ''; // Limpiamos el contenedor

    state.matches.forEach(match => {
        const card = document.createElement('div');
        // Si la partida ya fue puntuada, le añadimos una clase CSS verde de éxito
        card.className = `match-card ${match.played ? 'played' : ''}`;
        card.onclick = () => openModal(match.id); // Al hacer clic, abre su PopUp de edición

        // Construimos las filas de los integrantes de la mesa
        let playersHtml = match.playerIds.map(pId => {
            const player = state.players.find(p => p.id === pId);
            const name = player ? player.name : 'Desconocido';
            if (match.played) {
                // Si ya se jugó, mostramos puntos y puesto
                return `
                    <div class="match-player-row">
                        <span>${name}</span>
                        <span><strong>${match.scores[pId]} pts</strong> <span class="badge-pos">${match.positions[pId]}º</span></span>
                    </div>
                `;
            } else {
                // Si está pendiente, mostramos un guion neutro
                return `
                    <div class="match-player-row">
                        <span>${name}</span>
                        <span style="color:var(--text-muted);">-</span>
                    </div>
                `;
            }
        }).join('');

        card.innerHTML = `
            <div class="match-header">
                <span>Partida ${match.id + 1} (${match.playerIds.length} jugadores)</span>
                <span class="match-status">${match.played ? 'Terminado' : 'Pendiente'}</span>
            </div>
            <div class="match-players-grid">${playersHtml}</div>
        `;
        container.appendChild(card);
    });
}

/**
 * PROCESADOR DE ESTADÍSTICAS ACUMULADAS
 * Recorre todas las partidas del torneo, suma los puntos y cuenta los podios individuales.
 * Devuelve la lista ordenada bajo criterios rigurosos de desempate federativo.
 */
function obtenerEstadisticasProcesadas() {
    let stats = {};
    // Inicializamos el casillero de estadísticas para cada jugador inscrito
    state.players.forEach(p => {
        stats[p.id] = { id: p.id, name: p.name, matchesPlayed: 0, points: 0, first: 0, second: 0, third: 0 };
    });

    // Mapeo y acumulación analítica
    state.matches.forEach(match => {
        if (match.played) {
            match.playerIds.forEach(pId => {
                if (stats[pId]) {
                    stats[pId].matchesPlayed++; // Conteo de partidas jugadas reales
                    stats[pId].points += parseFloat(match.scores[pId] || 0); // Acumulador de puntos
                    
                    let pos = parseInt(match.positions[pId]);
                    if (pos === 1) stats[pId].first++;
                    if (pos === 2) stats[pId].second++;
                    if (pos === 3) stats[pId].third++;
                }
            });
        }
    });

    /**
     * CRITERIOS DE ORDENACIÓN Y DESEMPATE (DESCENDENTE)
     * 1º Criterio: Mayor número de puntos totales.
     * 2º Criterio (Desempate): Mayor cantidad de veces habiendo quedado 1º.
     * 3º Criterio (Desempate): Mayor cantidad de veces habiendo quedado 2º.
     * 4º Criterio (Desempate): Mayor cantidad de veces habiendo quedado 3º.
     */
    return Object.values(stats).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points; 
        if (b.first !== a.first) return b.first - a.first;     
        if (b.second !== a.second) return b.second - a.second; 
        return b.third - a.third;                             
    });
}

/**
 * RENDERIZADOR DE LA TABLA DE CLASIFICACIÓN
 * Dibuja los resultados ordenados en la columna derecha.
 */
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
            <td style="color: var(--text-muted); font-weight: 500;">${playerStat.matchesPlayed} / ${state.intendedMatchesPerPlayer}</td>
            <td style="font-weight:bold;">${playerStat.points}</td>
            <td><span style="color:#b45309; font-weight:600;">${playerStat.first}</span></td>
            <td><span style="color:#4b5563; font-weight:600;">${playerStat.second}</span></td>
            <td><span style="color:#78350f; font-weight:600;">${playerStat.third}</span></td>
        `;
        tbody.appendChild(row);
    });
}

/**
 * EDICIÓN DE NOMBRES EN TIEMPO REAL
 * Permite renombrar participantes sobre la marcha afectando a todo el ecosistema del torneo.
 */
function modificarNombreJugador(id, nuevoNombre) {
    let nameClean = nuevoNombre.trim();
    if (nameClean.length === 0) return; // Ignorar si dejan el campo vacío
    
    let p = state.players.find(x => x.id === id);
    if (p) {
        p.name = nameClean;
        saveState();
        renderMatches();      // Re-renderizamos encuentros para actualizar el nombre modificado
        renderLeaderboard();  // Re-renderizamos la tabla
    }
}

/**
 * ABRE EL POPUP (MODAL) DE PUNTUACIONES
 * Construye dinámicamente el panel de edición según los jugadores de la mesa seleccionada.
 */
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

        // El dropdown de posiciones se acota dinámicamente al tamaño real de ESTA mesa
        let selectOptions = '';
        for(let i = 1; i <= match.playerIds.length; i++) {
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

    document.getElementById('scoreModal').classList.add('active'); // Muestra el PopUp aplicando la clase CSS
}

/**
 * CÁLCULO DE PUESTOS AUTOMÁTICO EN EL POPUP
 * Ejecutado en tiempo real mediante el evento 'oninput' cada vez que cambia un número.
 */
function calcularPosicionesDinamicas() {
    if (activeMatchId === null) return;
    const match = state.matches.find(m => m.id === activeMatchId);
    
    // Recopilamos los valores numéricos actuales escritos en la interfaz
    let listaPuntajes = match.playerIds.map(pId => {
        const val = document.getElementById(`modal_score_${pId}`).value;
        return { id: pId, score: val === "" ? 0 : parseFloat(val) };
    });

    // Ordenamos provisionalmente de mayor a menor puntuación para establecer el escalafón
    listaPuntajes.sort((a, b) => b.score - a.score);

    let puestoActual = 1;
    for (let i = 0; i < listaPuntajes.length; i++) {
        // Regla de desempate: Si mi puntuación es estrictamente menor al del jugador anterior, mi puesto baja
        if (i > 0 && listaPuntajes[i].score < listaPuntajes[i-1].score) {
            puestoActual = i + 1;
        }
        const selectElement = document.getElementById(`modal_pos_${listaPuntajes[i].id}`);
        if (selectElement) selectElement.value = puestoActual; // Inyectamos el puesto calculado en el selector
    }
}

function closeModal() {
    document.getElementById('scoreModal').classList.remove('active');
    activeMatchId = null;
}

/**
 * PERSISTENCIA DE MARCADORES DE LA PARTIDA
 * Lee los valores finales del PopUp, los asienta en el estado y actualiza el ecosistema.
 */
function saveScores() {
    if (activeMatchId === null) return;
    const match = state.matches.find(m => m.id === activeMatchId);

    match.playerIds.forEach(pId => {
        const scoreInput = document.getElementById(`modal_score_${pId}`);
        const posSelect = document.getElementById(`modal_pos_${pId}`);
        
        match.scores[pId] = scoreInput.value === "" ? 0 : parseFloat(scoreInput.value);
        match.positions[pId] = parseInt(posSelect.value);
    });

    match.played = true; // Marcamos la tarjeta como completada
    closeModal();
    renderPhase2();     // Refrescamos vistas y guardamos en LocalStorage
}

/**
 * CIERRE DEL TORNEO: EL CUADRO DE HONOR
 * Extrae los 3 mejores perfiles de la clasificación y dibuja el podio estructural por alturas.
 */
function finalizarTorneoYMostrarPodio() {
    let sortedStats = obtenerEstadisticasProcesadas();
    const container = document.getElementById('podiumContainer');
    container.innerHTML = '';

    // Estructura de contingencia por si se ejecuta un torneo con menos de 3 personas
    let vacio = { name: 'Vacío', points: 0, first: 0, second: 0, third: 0 };
    let p1 = sortedStats[0] || vacio; // Oro
    let p2 = sortedStats[1] || vacio; // Plata
    let p3 = sortedStats[2] || vacio; // Bronce

    // Inyección de HTML estructurando el orden visual del podio real: Plata (izq), Oro (centro), Bronce (der)
    container.innerHTML = `
        <div class="podium-step second">
            <div class="podium-medal">🥈</div>
            <div class="podium-name" title="${escapeHtml(p2.name)}">${escapeHtml(p2.name)}</div>
            <div class="podium-pts">${p2.points} pts</div>
            <div class="podium-breakdown">1º: ${p2.first} | 2º: ${p2.second}</div>
        </div>
        <div class="podium-step first">
            <div class="podium-medal">🥇</div>
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

    document.getElementById('podiumModal').classList.add('active'); // Desplegamos el modal del podio
}

function closePodiumModal() {
    document.getElementById('podiumModal').classList.remove('active');
}

/**
 * MEDIDA DE SEGURIDAD CONTRA INYECCIÓN DE CÓDIGO (XSS)
 * Sanitiza los nombres introducidos por el usuario transformando caracteres especiales 
 * en entidades HTML inofensivas.
 */
function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}