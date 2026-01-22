// ============================================
// VARIABLES GLOBALES
// ============================================

let currentUser = null;
let allOrders = [];
let currentOrder = null;
let currentLocation = null;

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Solicitar GPS inmediatamente al cargar
    requestGeolocationPermission();
    
    const user = checkAuth('admin'); // o 'user' para usuario.js
    if(user) {
        showAdminPanel(user); // o showUserPanel(user) para usuario.js
    }
});

function requestGeolocationPermission() {
    if('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                currentLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                console.log('Geolocalización activada');
            },
            function(error) {
                console.error('Error de geolocalización:', error);
                // No mostrar alert para no ser intrusivo en panel admin/usuario
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    }
}


// ============================================
// LOGIN
// ============================================

async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorDiv = document.getElementById('loginError');

    if(!username || !password) {
        errorDiv.textContent = 'Completa todos los campos';
        errorDiv.classList.remove('hidden');
        return;
    }

    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL + '?action=login&username=' + username + '&password=' + password + '&type=usuario');
        const result = await response.json();
        
        if(result.success) {
            if(result.user.role !== 'user') {
                errorDiv.textContent = 'No tienes permisos de usuario';
                errorDiv.classList.remove('hidden');
                return;
            }

            // Guardar en localStorage
            localStorage.setItem('currentUser', JSON.stringify(result.user));
            currentUser = result.user;
            
            showUserPanel(result.user);
        } else {
            errorDiv.textContent = result.message || 'Credenciales incorrectas';
            errorDiv.classList.remove('hidden');
        }
    } catch(error) {
        errorDiv.textContent = 'Error de conexión: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

function showUserPanel(user) {
    currentUser = user;
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('userPanel').classList.remove('hidden');
    document.getElementById('currentUserName').textContent = user.username;
    loadOrders();
}

// ============================================
// CARGAR PEDIDOS
// ============================================

async function loadOrders() {
    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL + '?action=getOrders&employee=' + currentUser.username);
        const result = await response.json();
        
        if(result.success) {
            allOrders = result.orders;
            displayOrders(result.orders);
        }
    } catch(error) {
        console.error('Error cargando pedidos:', error);
        alert('Error al cargar pedidos');
    } finally {
        showLoading(false);
    }
}

function displayOrders(orders) {
    const container = document.getElementById('ordersList');
    container.innerHTML = '';
    
    if(orders.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No hay pedidos asignados</p>';
        return;
    }
    
    orders.forEach(order => {
        const div = document.createElement('div');
        div.className = 'order-item';
        
        const statusText = getStatusText(order.status);
        const statusClass = 'status-' + order.status;
        
        // Verificar si hay retraso (más de 1 hora en entrega)
        let isDelayed = false;
        if(order.status === 'delivering' && order.history) {
            const deliveringEvent = order.history.find(h => h.status === 'delivering');
            if(deliveringEvent) {
                const startTime = new Date(deliveringEvent.timestamp);
                const now = new Date();
                const hoursDiff = (now - startTime) / (1000 * 60 * 60);
                if(hoursDiff > 1) {
                    isDelayed = true;
                }
            }
        }
        
        // Aplicar fondo rojo si hay retraso
        if(isDelayed) {
            div.style.background = '#ffe6e6';
            div.style.borderLeft = '4px solid #dc3545';
        }
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; gap: 20px;">
                <div style="flex: 1;">
                    <h4><i class="fas fa-file-alt"></i> ${order.folio} ${isDelayed ? '<span style="color: #dc3545;"><i class="fas fa-exclamation-triangle"></i> RETRASO</span>' : ''}</h4>
                    <p style="margin: 5px 0;"><strong>${order.client.name}</strong> - ${order.client.phone}</p>
                    <p style="margin: 5px 0;">Total: <strong>${order.total}</strong> | ${order.serviceType === 'pickup' ? 'Pick-up en ' + order.branch : 'Entrega a Domicilio'}</p>
                    <p style="margin: 5px 0; font-size: 0.9em; color: #666;">
                        <i class="far fa-clock"></i> ${formatDate(order.date)}
                    </p>
                    <span class="order-status ${statusClass}">${statusText}</span>
                </div>
                <button class="btn btn-primary" onclick='viewOrderDetail(${JSON.stringify(order).replace(/'/g, "&apos;")})'>
                    <i class="fas fa-eye"></i> Ver Detalle
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

function filterOrders(status) {
    if(status === 'all') {
        displayOrders(allOrders);
    } else {
        const filtered = allOrders.filter(o => o.status === status);
        displayOrders(filtered);
    }
}

// ============================================
// DETALLE DE PEDIDO
// ============================================

// ACTUALIZAR la función viewOrderDetail en admin.js y usuario.js

function viewOrderDetail(order) {
    currentOrder = order;
    
    const detailContent = document.getElementById('orderDetailContent');
    detailContent.innerHTML = `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3><i class="fas fa-receipt"></i> ${order.folio}</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-top: 15px;">
                <div>
                    <p><strong>Cliente:</strong> ${order.client.name}</p>
                    <p><strong>Teléfono:</strong> ${order.client.phone}</p>
                    <p><strong>Email:</strong> ${order.client.email || 'N/A'}</p>
                </div>
                <div>
                    <p><strong>Fecha:</strong> ${formatDate(order.date)}</p>
                    <p><strong>Servicio:</strong> ${order.serviceType === 'pickup' ? 'Pick-up en ' + order.branch : 'Entrega a Domicilio'}</p>
                    <p><strong>Método de Pago:</strong> ${order.paymentMethod}</p>
                </div>
                <div>
                    <p><strong>Subtotal:</strong> $${order.subtotal}</p>
                    <p><strong>Entrega:</strong> $${order.deliveryCost || 0}</p>
                    <p><strong>Total:</strong> <span style="color: #667eea; font-size: 1.2em;">$${order.total}</span></p>
                </div>
            </div>
        </div>

        <h4><i class="fas fa-list"></i> Trabajos Solicitados</h4>
        <div style="margin-bottom: 20px;">
            ${order.works.map((work, idx) => {
                // Buscar archivo correspondiente
                const workFile = order.fileUrls ? order.fileUrls.find(f => f.type === 'work' && f.workIndex === idx) : null;
                
                return `
                    <div class="cart-item" style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div style="flex: 1;">
                                <p><strong>${idx + 1}. ${work.fileName}</strong></p>
                                <p>Cantidad: ${work.copies} | Tipo: ${work.printType}</p>
                                ${work.color ? `<p>Color: ${work.color} | Papel: ${work.paperType}</p>` : ''}
                                ${work.vinilType ? `<p>Vinil: ${work.vinilType}</p>` : ''}
                                ${work.finishing && work.finishing.length > 0 ? `<p>Acabado: ${work.finishing.join(', ')}</p>` : ''}
                                ${work.observations ? `<p><em>Obs: ${work.observations}</em></p>` : ''}
                                <p style="text-align: right;"><strong>$${work.price.toFixed(2)}</strong></p>
                            </div>
                            ${workFile ? `
                                <div style="margin-left: 15px;">
                                    <a href="${workFile.downloadUrl}" target="_blank" class="btn btn-primary" style="padding: 8px 15px; font-size: 0.9em; text-decoration: none;">
                                        <i class="fas fa-download"></i> Descargar Archivo
                                    </a>
                                </div>
                            ` : '<p style="color: #dc3545; font-size: 0.9em; margin-left: 15px;"><i class="fas fa-exclamation-triangle"></i> Archivo no disponible</p>'}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        
        ${order.fileUrls && order.fileUrls.some(f => f.type === 'proof') ? `
            <div style="background: #d4edda; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745; margin-bottom: 20px;">
                <h4><i class="fas fa-receipt"></i> Comprobante de Pago</h4>
                ${order.fileUrls.filter(f => f.type === 'proof').map(proof => `
                    <a href="${proof.downloadUrl}" target="_blank" class="btn btn-success" style="text-decoration: none; margin-top: 10px;">
                        <i class="fas fa-download"></i> Descargar Comprobante
                    </a>
                `).join('')}
            </div>
        ` : ''}
    `;

    buildTimeline(order);
    buildTimeline(order);
    
    // AGREGAR ESTO AQUÍ:
    // Si es delivery y está en camino, mostrar mapa en el modal
    if(order.serviceType === 'delivery' && order.status === 'delivering') {
        showAdminDeliveryMap(order);
    }
    
    document.getElementById('orderStatus').value = order.status;
    document.getElementById('statusNotes').value = '';
    document.getElementById('orderDetailModal').classList.add('active');
}

function buildTimeline(order) {
    const timeline = document.getElementById('orderTimeline');
    const history = order.history || [];
    
    const states = [
        { key: 'new', label: 'Pedido Recibido', icon: 'fa-inbox' },
        { key: 'assigned', label: 'Asignado a Empleado', icon: 'fa-user-check' },
        { key: 'processing', label: 'En Elaboración', icon: 'fa-cogs' },
        { key: 'ready', label: 'Listo para Entrega', icon: 'fa-check-circle' },
        { key: 'delivering', label: 'En Camino', icon: 'fa-shipping-fast' },
        { key: 'delivered', label: 'Entregado al Cliente', icon: 'fa-handshake' }
    ];

    const currentStateIndex = states.findIndex(s => s.key === order.status);
    
    timeline.innerHTML = states.map((state, index) => {
        const historyItem = history.find(h => h.status === state.key);
        const isCompleted = index <= currentStateIndex;
        const isActive = index === currentStateIndex;
        
        let itemClass = 'timeline-item';
        if(isCompleted && !isActive) itemClass += ' completed';
        if(isActive) itemClass += ' active';
        
        return `
            <div class="${itemClass}">
                <div class="timeline-content">
                    <div class="timeline-title">
                        <i class="fas ${state.icon}"></i> ${state.label}
                    </div>
                    ${historyItem ? `
                        <div class="timeline-meta">
                            <i class="far fa-clock"></i> ${formatDate(historyItem.timestamp)}
                        </div>
                        ${historyItem.employee ? `
                            <span class="timeline-employee">
                                <i class="fas fa-user"></i> ${historyItem.employee}
                            </span>
                        ` : ''}
                        ${historyItem.notes ? `
                            <div style="margin-top: 5px; font-size: 0.9em; font-style: italic; color: #555;">
                                "${historyItem.notes}"
                            </div>
                        ` : ''}
                    ` : (isActive ? `
                        <div class="timeline-meta" style="color: #ffc107;">
                            <i class="fas fa-hourglass-half"></i> En proceso...
                        </div>
                    ` : '')}
                </div>
            </div>
        `;
    }).join('');
}

function closeOrderDetail() {
    document.getElementById('orderDetailModal').classList.remove('active');
    currentOrder = null;
}

// ============================================
// ACTUALIZAR ESTADO
// ============================================

async function updateOrderStatus() {
    const newStatus = document.getElementById('orderStatus').value;
    const notes = document.getElementById('statusNotes').value.trim();

    if(!currentOrder) {
        alert('No hay pedido seleccionado');
        return;
    }

    if(newStatus === currentOrder.status && !notes) {
        alert('No hay cambios para guardar');
        return;
    }

    showLoading(true);
    try {
        const updateData = {
            action: 'updateOrderStatus',
            folio: currentOrder.folio,
            status: newStatus,
            employee: currentUser.username,
            notes: notes,
            timestamp: new Date().toISOString()
        };

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(updateData)
        });

        const result = await response.json();
        
        if(result.success) {
            alert('Estado actualizado correctamente');
            closeOrderDetail();
            loadOrders();
        } else {
            alert('Error al actualizar: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function notifyClient() {
    if(currentOrder && currentOrder.client.phone) {
        const statusText = getStatusText(currentOrder.status);
        const message = `Hola ${currentOrder.client.name}, tu pedido ${currentOrder.folio} está: ${statusText}`;
        window.open(`https://wa.me/52${currentOrder.client.phone}?text=${encodeURIComponent(message)}`, '_blank');
    }
}

// Agregar al final de admin.js y usuario.js
async function showAdminDeliveryMap(order) {
    const detailContent = document.getElementById('orderDetailContent');
    
    // Agregar contenedor del mapa
    const mapDiv = document.createElement('div');
    mapDiv.innerHTML = `
        <div style="margin-top: 20px;">
            <h4><i class="fas fa-map-marked-alt"></i> Ubicación del Repartidor en Tiempo Real</h4>
            <div id="adminDeliveryMap" style="height: 350px; border-radius: 8px; overflow: hidden; margin-top: 10px; border: 2px solid #ffc107;"></div>
        </div>
    `;
    detailContent.appendChild(mapDiv);
    
    // Esperar un momento para que el DOM se actualice
    setTimeout(async () => {
        try {
            const response = await fetch(SCRIPT_URL + '?action=getDeliveryLocation&folio=' + order.folio);
            const result = await response.json();
            
            if(result.success && result.location) {
                const loc = result.location;
                const address = order.address;
                
                const map = L.map('adminDeliveryMap').setView([loc.latitude, loc.longitude], 14);
                
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors'
                }).addTo(map);
                
                // Marcador del repartidor
                L.marker([loc.latitude, loc.longitude], {
                    icon: L.divIcon({
                        className: 'custom-div-icon',
                        html: '<div style="background-color:#ffc107;width:45px;height:45px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);"><i class="fas fa-motorcycle" style="color:white;font-size:22px;"></i></div>',
                        iconSize: [45, 45]
                    })
                }).addTo(map).bindPopup('Repartidor en camino').openPopup();
                
                // Marcador del destino si hay coordenadas
                if(address && address.latitude && address.longitude) {
                    L.marker([address.latitude, address.longitude], {
                        icon: L.divIcon({
                            className: 'custom-div-icon',
                            html: '<div style="background-color:#dc3545;width:35px;height:35px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);"><i class="fas fa-home" style="color:white;font-size:16px;"></i></div>',
                            iconSize: [35, 35]
                        })
                    }).addTo(map).bindPopup('Destino: ' + order.client.name);
                    
                    // Ajustar zoom para mostrar ambos puntos
                    const bounds = L.latLngBounds([[loc.latitude, loc.longitude], [address.latitude, address.longitude]]);
                    map.fitBounds(bounds, { padding: [50, 50] });
                }
                
                // Actualizar ubicación cada 10 segundos
                setInterval(async () => {
                    const updateResponse = await fetch(SCRIPT_URL + '?action=getDeliveryLocation&folio=' + order.folio);
                    const updateResult = await updateResponse.json();
                    
                    if(updateResult.success && updateResult.location) {
                        map.eachLayer(layer => {
                            if(layer instanceof L.Marker && layer.getPopup() && layer.getPopup().getContent().includes('Repartidor')) {
                                layer.setLatLng([updateResult.location.latitude, updateResult.location.longitude]);
                            }
                        });
                    }
                }, 10000);
                
            } else {
                document.getElementById('adminDeliveryMap').innerHTML = '<p style="padding: 40px; text-align: center; color: #666;">El repartidor aún no ha compartido su ubicación</p>';
            }
        } catch(error) {
            console.error('Error cargando mapa:', error);
            document.getElementById('adminDeliveryMap').innerHTML = '<p style="padding: 40px; text-align: center; color: #dc3545;">Error al cargar el mapa</p>';
        }
    }, 300);
}

