// ============================================
// VARIABLES GLOBALES
// ============================================

let currentUser = null;
let allDeliveries = [];
let activeDelivery = null;
let deliveryMap = null;
let deliveryMarker = null;
let routeLine = null;
let updateInterval = null;
let gpsWatchId = null;
let currentLocation = null;

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Solicitar GPS inmediatamente al cargar la página
    requestGeolocationPermission();
    
    const user = checkAuth('delivery');
    if(user) {
        showDeliveryPanel(user);
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
        const response = await fetch(SCRIPT_URL + '?action=login&username=' + username + '&password=' + password + '&type=delivery');
        const result = await response.json();
        
        if(result.success) {
            if(result.user.role !== 'delivery') {
                errorDiv.textContent = 'No tienes permisos de repartidor';
                errorDiv.classList.remove('hidden');
                return;
            }

            localStorage.setItem('currentUser', JSON.stringify(result.user));
            currentUser = result.user;
            
            showDeliveryPanel(result.user);
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

function showDeliveryPanel(user) {
    currentUser = user;
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('deliveryPanel').classList.remove('hidden');
    document.getElementById('currentUserName').textContent = user.username;
    
    loadDeliveries();
    
    // Actualizar cada 30 segundos
    updateInterval = setInterval(loadDeliveries, 30000);
}

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
                alert('Por favor activa la ubicación para poder hacer entregas');
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        alert('Tu navegador no soporta geolocalización');
    }
}

// ============================================
// CARGAR ENTREGAS
// ============================================

async function loadDeliveries() {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDeliveryOrders&delivery=' + currentUser.username);
        const result = await response.json();
        
        if(result.success) {
            allDeliveries = result.orders;
            filterDeliveries('ready');
        }
    } catch(error) {
        console.error('Error cargando entregas:', error);
    }
}

function filterDeliveries(filter) {
    let filtered = [];
    
    if(filter === 'ready') {
        // Pedidos listos para recoger (estado: ready y serviceType: delivery)
        filtered = allDeliveries.filter(o => o.status === 'ready' && !o.deliveryPerson);
    } else if(filter === 'mytaken') {
        // Mis entregas en curso - incluye AMBOS estados: ready con repartidor asignado Y delivering
        filtered = allDeliveries.filter(o => 
            o.deliveryPerson === currentUser.username && 
            (o.status === 'ready' || o.status === 'delivering')
        );
    } else if(filter === 'completed') {
        // Completadas hoy
        const today = new Date().toISOString().split('T')[0];
        filtered = allDeliveries.filter(o => 
            o.deliveryPerson === currentUser.username && 
            o.status === 'delivered' &&
            o.deliveryDate && o.deliveryDate.startsWith(today)
        );
    }
    
    displayDeliveries(filtered, filter);
}

function displayDeliveries(deliveries, filter) {
    const container = document.getElementById('deliveriesList');
    container.innerHTML = '';
    
    if(deliveries.length === 0) {
        let message = 'No hay entregas disponibles';
        if(filter === 'mytaken') message = 'No tienes entregas en curso';
        if(filter === 'completed') message = 'No hay entregas completadas hoy';
        
        container.innerHTML = `<p style="text-align: center; color: #666; padding: 40px;">${message}</p>`;
        return;
    }
    
    deliveries.forEach(order => {
        const div = document.createElement('div');
        div.className = 'order-item';
        div.style.borderLeft = filter === 'mytaken' ? '4px solid #fd7e14' : '4px solid #28a745';
        
        const address = order.address;
        const addressText = address ? `${address.street}, ${address.colony}, ${address.city}` : 'Dirección no disponible';
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; gap: 20px;">
                <div style="flex: 1;">
                    <h4><i class="fas fa-file-alt"></i> ${order.folio}</h4>
                    <p style="margin: 5px 0;"><strong>${order.client.name}</strong> - ${order.client.phone}</p>
                    <p style="margin: 5px 0;"><i class="fas fa-map-marker-alt"></i> ${addressText}</p>
                    ${address && address.references ? `<p style="margin: 5px 0; font-size: 0.9em; color: #666;"><em>Ref: ${address.references}</em></p>` : ''}
                    <p style="margin: 5px 0;">Total: <strong>$${order.total}</strong></p>
                    <p style="margin: 5px 0; font-size: 0.9em; color: #666;">
                        <i class="far fa-clock"></i> ${formatDate(order.date)}
                    </p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    ${filter === 'ready' ? `
                        <button class="btn btn-success" onclick='takeDelivery(${JSON.stringify(order).replace(/'/g, "&apos;")})'>
                            <i class="fas fa-hand-holding"></i> Tomar Entrega
                        </button>
                    ` : ''}
                    ${filter === 'mytaken' ? `
                        <button class="btn btn-warning" onclick='startDelivery(${JSON.stringify(order).replace(/'/g, "&apos;")})'>
                            <i class="fas fa-route"></i> Iniciar Ruta
                        </button>
                        <button class="btn btn-danger" onclick='cancelDelivery(${JSON.stringify(order).replace(/'/g, "&apos;")})' style="margin-top: 5px;">
                            <i class="fas fa-times-circle"></i> Cancelar
                        </button>
                    ` : ''}
                    ${filter === 'completed' ? `
                        <span class="order-status status-delivered">Entregado</span>
                    ` : ''}
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// ============================================
// CANCELAR ENTREGA
// ============================================

async function cancelDelivery(order) {
    const reason = prompt('¿Por qué motivo cancelas esta entrega?\n(Ej: Problema mecánico, accidente, etc.)');
    
    if(!reason) return;
    
    if(!confirm(`¿Estás seguro de cancelar la entrega del pedido ${order.folio}?\n\nEsto permitirá que otro repartidor tome el pedido.`)) {
        return;
    }

    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'cancelDeliveryByDriver',
                folio: order.folio,
                deliveryPerson: currentUser.username,
                reason: reason,
                timestamp: new Date().toISOString()
            })
        });

        const result = await response.json();
        
        if(result.success) {
            alert('Entrega cancelada. Otro repartidor podrá tomarla.');
            
            // Detener GPS si estaba activo
            if(gpsWatchId) {
                navigator.geolocation.clearWatch(gpsWatchId);
                gpsWatchId = null;
            }
            
            loadDeliveries();
        } else {
            alert('Error al cancelar: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// ============================================
// TOMAR ENTREGA
// ============================================

async function takeDelivery(order) {
    if(!confirm(`¿Confirmas tomar la entrega del pedido ${order.folio}?`)) {
        return;
    }

    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'assignDelivery',
                folio: order.folio,
                deliveryPerson: currentUser.username,
                timestamp: new Date().toISOString()
            })
        });

        const result = await response.json();
        
        if(result.success) {
            alert('Entrega asignada correctamente. Ahora puedes iniciar la ruta.');
            loadDeliveries();
        } else {
            alert('Error al asignar entrega: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// ============================================
// INICIAR ENTREGA CON MAPA
// ============================================

async function startDelivery(order) {
    activeDelivery = order;
    
    if(!currentLocation) {
        alert('Esperando ubicación GPS...');
        return;
    }
    
    // Actualizar estado a "delivering"
    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateOrderStatus',
                folio: order.folio,
                status: 'delivering',
                employee: currentUser.username,
                notes: 'Pedido salió para entrega',
                timestamp: new Date().toISOString()
            })
        });

        const result = await response.json();
        
        if(result.success) {
            // Enviar WhatsApp automático al cliente
            await sendDeliveryStartNotification(order);
            
            // Iniciar seguimiento GPS
            startGPSTracking(order);
            
            showDeliveryMap(order);
        } else {
            alert('Error al iniciar entrega: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function startGPSTracking(order) {
    // Iniciar seguimiento continuo de ubicación
    if('geolocation' in navigator) {
        gpsWatchId = navigator.geolocation.watchPosition(
            function(position) {
                currentLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                
                // Actualizar ubicación en el servidor
                updateLocationOnServer(order.folio, currentLocation);
                
                // Actualizar marcador en mapa
                if(deliveryMarker && deliveryMap) {
                    deliveryMarker.setLatLng([currentLocation.latitude, currentLocation.longitude]);
                    deliveryMap.panTo([currentLocation.latitude, currentLocation.longitude]);
                }
            },
            function(error) {
                console.error('Error GPS:', error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 5000
            }
        );
    }
}

async function updateLocationOnServer(folio, location) {
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateLocation',
                deliveryPerson: currentUser.username,
                folio: folio,
                latitude: location.latitude,
                longitude: location.longitude,
                timestamp: new Date().toISOString()
            })
        });
    } catch(error) {
        console.error('Error actualizando ubicación:', error);
    }
}

async function sendDeliveryStartNotification(order) {
    try {
        // Enviar notificación automática por WhatsApp
        await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'sendWhatsAppNotification',
                phone: order.client.phone,
                folio: order.folio,
                message: `¡Hola ${order.client.name}! Tu pedido ${order.folio} está en camino. El repartidor salió de nuestra sucursal y llegará pronto. 🚀`
            })
        });
    } catch(error) {
        console.error('Error enviando WhatsApp:', error);
    }
}

function showDeliveryMap(order) {
    const deliveryInfo = document.getElementById('deliveryInfo');
    const address = order.address;
    
    deliveryInfo.innerHTML = `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px;">
            <h4><i class="fas fa-box"></i> ${order.folio}</h4>
            <p><strong>Cliente:</strong> ${order.client.name}</p>
            <p><strong>Teléfono:</strong> ${order.client.phone}</p>
            <p><strong>Dirección:</strong> ${address.street}, ${address.colony}, ${address.city}</p>
            ${address.references ? `<p><strong>Referencias:</strong> ${address.references}</p>` : ''}
            <p><strong>Total a cobrar:</strong> <span style="color: #667eea; font-size: 1.2em;">$${order.total}</span></p>
        </div>
    `;

    document.getElementById('activeDeliveryModal').classList.add('active');
    
    // Inicializar mapa
    setTimeout(() => initDeliveryMap(order), 300);
}

function initDeliveryMap(order) {
    const mapDiv = document.getElementById('deliveryMap');
    
    // Usar ubicación actual del repartidor
    const startLat = currentLocation ? currentLocation.latitude : 17.989;
    const startLng = currentLocation ? currentLocation.longitude : -92.948;
    
    // Coordenadas del destino (simuladas - en producción usarías geocoding)
    const destLat = startLat + (Math.random() * 0.02 - 0.01);
    const destLng = startLng + (Math.random() * 0.02 - 0.01);
    
    // Crear mapa
    if(deliveryMap) {
        deliveryMap.remove();
    }
    
    deliveryMap = L.map('deliveryMap').setView([startLat, startLng], 14);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(deliveryMap);
    
    // Marcador de sucursal/inicio
    L.marker([startLat, startLng], {
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color:#667eea;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fas fa-store" style="color:white;"></i></div>',
            iconSize: [30, 30]
        })
    }).addTo(deliveryMap).bindPopup('Punto de Partida');
    
    // Marcador de destino
    L.marker([destLat, destLng], {
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color:#dc3545;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fas fa-home" style="color:white;"></i></div>',
            iconSize: [30, 30]
        })
    }).addTo(deliveryMap).bindPopup('Destino: ' + order.client.name);
    
    // Marcador del repartidor (moto) - posición real
    deliveryMarker = L.marker([startLat, startLng], {
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color:#ffc107;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);"><i class="fas fa-motorcycle" style="color:white;font-size:20px;"></i></div>',
            iconSize: [40, 40]
        })
    }).addTo(deliveryMap).bindPopup('Tu ubicación');
    
    // NO AGREGAR LÍNEAS PUNTEADAS
    // routeLine ya no se crea
    
    // El GPS real actualizará la posición automáticamente
}

function closeActiveDelivery() {
    // Detener seguimiento GPS
    if(gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
        gpsWatchId = null;
    }
    
    if(deliveryMap) {
        deliveryMap.remove();
        deliveryMap = null;
    }
    document.getElementById('activeDeliveryModal').classList.remove('active');
    activeDelivery = null;
    loadDeliveries();
}

// ============================================
// COMPLETAR ENTREGA
// ============================================

async function completeDelivery() {
    const notes = document.getElementById('deliveryNotes').value.trim();
    
    if(!notes) {
        if(!confirm('¿Deseas completar la entrega sin comentarios?')) {
            return;
        }
    }

    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'completeDelivery',
                folio: activeDelivery.folio,
                deliveryPerson: currentUser.username,
                notes: notes,
                timestamp: new Date().toISOString()
            })
        });

        const result = await response.json();
        
        if(result.success) {
            alert('✅ Entrega completada exitosamente');
            closeActiveDelivery();
        } else {
            alert('Error al completar entrega: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function cancelActiveDelivery() {
    if(!activeDelivery) return;
    
    closeActiveDelivery();
    cancelDelivery(activeDelivery);
}

// ============================================
// CLEANUP
// ============================================

window.addEventListener('beforeunload', function() {
    if(updateInterval) {
        clearInterval(updateInterval);
    }
    if(gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
    }
    if(deliveryMap) {
        deliveryMap.remove();
    }
});



