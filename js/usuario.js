// ============================================
// VARIABLES GLOBALES
// ============================================

let currentUser = null;
let allOrders = [];
let currentOrder = null;
let deliveryPersonData = null;

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    const user = checkAuth('user');
    if(user) {
        showUserPanel(user);
    }
    // Si no hay usuario, simplemente muestra el login (no redirige)
});

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
    } else if(status === 'delivered') {
        // Filtrar solo entregados hoy
        const deliveredToday = allOrders.filter(o => isDeliveredToday(o));
        displayOrders(deliveredToday);
    } else {
        const filtered = allOrders.filter(o => o.status === status);
        displayOrders(filtered);
    }
}

// ============================================
// DETALLE DE PEDIDO
// ============================================

async function viewOrderDetail(order) {
    currentOrder = order;
    
    // Obtener datos del repartidor si está en entrega
    deliveryPersonData = null;
    if(order.deliveryPerson && (order.status === 'delivering' || order.status === 'ready')) {
        deliveryPersonData = await getDeliveryPersonData(order.deliveryPerson);
    }
    
    const deliveryPersonHTML = (order.status === 'delivering' && deliveryPersonData) ? 
        renderDeliveryPersonInfo(deliveryPersonData) : '';
    
    // Generar links de archivos
    let filesHTML = '';
    if(order.works && order.works.length > 0) {
        filesHTML = order.works.map((work, idx) => {
            if(work.fileUrl) {
                return `
                    <div style="margin: 5px 0;">
                        <a href="${work.fileUrl}" target="_blank" style="color: #667eea; text-decoration: none;">
                            <i class="fas fa-download"></i> Descargar ${work.fileName}
                        </a>
                    </div>
                `;
            }
            return '';
        }).join('');
    }
    
    const detailContent = document.getElementById('orderDetailContent');
    detailContent.innerHTML = `
        ${deliveryPersonHTML}
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
            ${filesHTML ? `
                <div style="margin-top: 15px; padding: 15px; background: white; border-radius: 8px; border: 2px solid #667eea;">
                    <h4 style="margin-bottom: 10px;"><i class="fas fa-file-download"></i> Archivos del Cliente</h4>
                    ${filesHTML}
                </div>
            ` : ''}
        </div>

        <h4><i class="fas fa-list"></i> Trabajos Solicitados</h4>
        <div style="margin-bottom: 20px;">
            ${order.works.map((work, idx) => `
                <div class="cart-item" style="margin-bottom: 10px;">
                    <p><strong>${idx + 1}. ${work.fileName}</strong></p>
                    <p>Cantidad: ${work.copies} | Tipo: ${work.printType}</p>
                    ${work.color ? `<p>Color: ${work.color} | Papel: ${work.paperType}</p>` : ''}
                    ${work.vinilType ? `<p>Vinil: ${work.vinilType}</p>` : ''}
                    ${work.finishing && work.finishing.length > 0 ? `<p>Acabado: ${work.finishing.join(', ')}</p>` : ''}
                    ${work.observations ? `<p><em>Obs: ${work.observations}</em></p>` : ''}
                    <p style="text-align: right;"><strong>$${work.price.toFixed(2)}</strong></p>
                </div>
            `).join('')}
        </div>
    `;

    buildTimeline(order);
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

// ============================================
// OBTENER DATOS DEL REPARTIDOR
// ============================================

async function getDeliveryPersonData(username) {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDeliveryPersonData&username=' + username);
        const result = await response.json();
        
        if(result.success) {
            return result.userData;
        }
        return null;
    } catch(error) {
        console.error('Error obteniendo datos del repartidor:', error);
        return null;
    }
}

function renderDeliveryPersonInfo(deliveryPerson) {
    if(!deliveryPerson) return '';
    
    // SVG de placeholder como fallback (ícono de usuario)
    const placeholderSVG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzY2N2VlYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iNDgiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+8J+agTwvdGV4dD48L3N2Zz4=';
    
    const photoUrl = deliveryPerson.photoUrl || placeholderSVG;
    const deliveryName = deliveryPerson.name || deliveryPerson.username || 'Repartidor';
    
    return `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px; color: white; display: flex; align-items: center; gap: 20px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
            <div style="flex-shrink: 0;">
                <div style="width: 80px; height: 80px; border-radius: 50%; overflow: hidden; border: 4px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.2); background: white;">
                    <img src="${photoUrl}" 
                         alt="${deliveryName}" 
                         style="width: 100%; height: 100%; object-fit: cover;"
                         onerror="this.src='${placeholderSVG}'">
                </div>
            </div>
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <i class="fas fa-motorcycle" style="font-size: 1.5em;"></i>
                    <h3 style="margin: 0; font-size: 1.3em;">${deliveryName}</h3>
                </div>
                <p style="margin: 0; font-size: 1.1em; opacity: 0.95;">
                    <i class="fas fa-route"></i> 
                    <strong>${deliveryName}</strong> está en camino a tu domicilio
                </p>
            </div>
            <div style="flex-shrink: 0;">
                <div style="background: rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 20px; text-align: center;">
                    <i class="fas fa-clock" style="font-size: 1.2em;"></i>
                    <div style="font-size: 0.9em; margin-top: 5px;">En tránsito</div>
                </div>
            </div>
        </div>
    `;
}

