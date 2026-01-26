// ============================================
// VARIABLES GLOBALES
// ============================================

let currentUser = null;
let allDeliveries = [];
let activeDelivery = null;
let deliveryMap = null;
let deliveryMarker = null;
let destinationMarker = null;
let updateInterval = null;
let gpsWatchId = null;
let currentLocation = null;
// ============================================
// VARIABLES PARA REGISTRO
// ============================================
let videoStream = null;
let capturedPhoto = null;
let photoBlob = null;

// ============================================
// FUNCIONES DE AUTENTICACIÓN (LOGIN/REGISTRO)
// ============================================

function showAuthTab(tab) {
    // Limpiar mensajes de error
    document.getElementById('loginError').classList.add('hidden');
    document.getElementById('registerError').classList.add('hidden');
    document.getElementById('registerSuccess').classList.add('hidden');
    
    // Cambiar tabs
    document.querySelectorAll('.tab-auth').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    
    if(tab === 'login') {
        document.getElementById('tabLogin').classList.add('active');
        document.getElementById('loginTab').classList.add('active');
    } else {
        document.getElementById('tabRegister').classList.add('active');
        document.getElementById('registerTab').classList.add('active');
    }
}

// ============================================
// CAPTURA DE FOTO
// ============================================

async function startCamera() {
    try {
        // Solicitar acceso a la cámara
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            } 
        });
        
        const video = document.getElementById('videoPreview');
        video.srcObject = videoStream;
        video.style.display = 'block';
        
        document.getElementById('takePicBtn').classList.remove('hidden');
        
    } catch(error) {
        console.error('Error accediendo a la cámara:', error);
        alert('No se pudo acceder a la cámara. Por favor, sube una foto desde archivo.');
    }
}

function takePicture() {
    const video = document.getElementById('videoPreview');
    const canvas = document.getElementById('photoCanvas');
    const context = canvas.getContext('2d');
    
    // Configurar tamaño del canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Capturar frame del video
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convertir a blob
    canvas.toBlob(function(blob) {
        photoBlob = blob;
        const url = URL.createObjectURL(blob);
        
        // Mostrar preview
        document.getElementById('photoImg').src = url;
        document.getElementById('photoPreview').classList.remove('hidden');
        document.getElementById('photoCapture').classList.add('hidden');
        
        // Detener cámara
        stopCamera();
        
    }, 'image/jpeg', 0.8);
}

function handlePhotoUpload() {
    const input = document.getElementById('photoFileInput');
    if(input.files.length > 0) {
        const file = input.files[0];
        
        // Validar que sea imagen
        if(!file.type.startsWith('image/')) {
            alert('Por favor selecciona una imagen válida');
            return;
        }
        
        // Validar tamaño (máx 5MB)
        if(file.size > 5 * 1024 * 1024) {
            alert('La imagen es muy grande. Máximo 5MB');
            return;
        }
        
        photoBlob = file;
        const url = URL.createObjectURL(file);
        
        // Mostrar preview
        document.getElementById('photoImg').src = url;
        document.getElementById('photoPreview').classList.remove('hidden');
        document.getElementById('photoCapture').classList.add('hidden');
    }
}

function removePhoto() {
    photoBlob = null;
    document.getElementById('photoImg').src = '';
    document.getElementById('photoPreview').classList.add('hidden');
    document.getElementById('photoCapture').classList.remove('hidden');
    document.getElementById('photoFileInput').value = '';
}

function stopCamera() {
    if(videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    
    const video = document.getElementById('videoPreview');
    video.style.display = 'none';
    video.srcObject = null;
    
    document.getElementById('takePicBtn').classList.add('hidden');
}

// ============================================
// REGISTRO DE REPARTIDOR
// ============================================

async function registerDelivery() {
    const fullName = document.getElementById('regFullName').value.trim();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value.trim();
    const passwordConfirm = document.getElementById('regPasswordConfirm').value.trim();
    const errorDiv = document.getElementById('registerError');
    const successDiv = document.getElementById('registerSuccess');

    // Limpiar mensajes previos
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    // Validaciones
    if(!fullName || !username || !password || !passwordConfirm) {
        errorDiv.textContent = 'Por favor completa todos los campos obligatorios';
        errorDiv.classList.remove('hidden');
        return;
    }

    if(username.length < 3) {
        errorDiv.textContent = 'El nombre de usuario debe tener al menos 3 caracteres';
        errorDiv.classList.remove('hidden');
        return;
    }

    if(/\s/.test(username)) {
        errorDiv.textContent = 'El nombre de usuario no puede contener espacios';
        errorDiv.classList.remove('hidden');
        return;
    }

    if(password.length < 6) {
        errorDiv.textContent = 'La contraseña debe tener al menos 6 caracteres';
        errorDiv.classList.remove('hidden');
        return;
    }

    if(password !== passwordConfirm) {
        errorDiv.textContent = 'Las contraseñas no coinciden';
        errorDiv.classList.remove('hidden');
        return;
    }

    if(!photoBlob) {
        errorDiv.textContent = 'Debes tomar o subir una foto de tu rostro';
        errorDiv.classList.remove('hidden');
        return;
    }

    showLoading(true);

    try {
        console.log('=== INICIANDO REGISTRO ===');
        console.log('Usuario:', username);
        console.log('Nombre completo:', fullName);
        
        // 1. Subir foto a Drive
        console.log('Paso 1: Subiendo foto...');
        const photoData = await uploadPhotoToDrive(photoBlob, username);
        
        console.log('Foto subida exitosamente:', photoData);
        
        if(!photoData.success) {
            throw new Error(photoData.message || 'Error al subir la foto');
        }

        // 2. Crear usuario en Google Sheets
        console.log('Paso 2: Creando usuario en Sheets...');
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'createUser',
                username: username,
                password: password,
                role: 'delivery',
                name: fullName,
                photoFileId: photoData.fileId,
                photoFileUrl: photoData.fileUrl
            })
        });

        const result = await response.json();
        
        console.log('Resultado de creación de usuario:', result);
        
        if(result.success) {
            successDiv.innerHTML = `
                <strong>¡Registro exitoso!</strong><br>
                Tu cuenta ha sido creada correctamente.<br>
                Ahora puedes iniciar sesión con tus credenciales.
            `;
            successDiv.classList.remove('hidden');
            
            // Limpiar formulario
            document.getElementById('regFullName').value = '';
            document.getElementById('regUsername').value = '';
            document.getElementById('regPassword').value = '';
            document.getElementById('regPasswordConfirm').value = '';
            removePhoto();
            
            // Cambiar a tab de login después de 3 segundos
            setTimeout(() => {
                showAuthTab('login');
                successDiv.classList.add('hidden');
            }, 3000);
            
        } else {
            errorDiv.textContent = result.message || 'Error al crear la cuenta. Por favor intenta nuevamente.';
            errorDiv.classList.remove('hidden');
        }
        
    } catch(error) {
        console.error('=== ERROR EN REGISTRO ===');
        console.error('Error completo:', error);
        console.error('Stack:', error.stack);
        
        errorDiv.textContent = 'Error al registrar: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

async function uploadPhotoToDrive(blob, username) {
    try {
        console.log('Iniciando subida de foto para:', username);
        console.log('Tamaño del blob:', blob.size);
        
        // Convertir blob a base64
        const reader = new FileReader();
        
        return new Promise((resolve, reject) => {
            reader.onload = async function(e) {
                try {
                    const base64Data = e.target.result.split(',')[1];
                    
                    console.log('Base64 generado, longitud:', base64Data.length);
                    
                    const uploadData = {
                        action: 'uploadDriverPhoto',
                        fileName: `foto_${username}_${Date.now()}.jpg`,
                        fileData: base64Data,
                        mimeType: 'image/jpeg',
                        username: username
                    };
                    
                    console.log('Enviando datos al servidor...');
                    
                    const response = await fetch(SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify(uploadData)
                    });
                    
                    console.log('Respuesta recibida');
                    
                    const result = await response.json();
                    
                    console.log('Resultado:', result);
                    
                    if(result.success) {
                        resolve(result);
                    } else {
                        reject(new Error(result.message || 'Error desconocido al subir foto'));
                    }
                    
                } catch(error) {
                    console.error('Error en proceso de subida:', error);
                    reject(error);
                }
            };
            
            reader.onerror = function(error) {
                console.error('Error al leer el blob:', error);
                reject(new Error('Error al leer la imagen'));
            };
            
            reader.readAsDataURL(blob);
        });
        
    } catch(error) {
        console.error('Error general en uploadPhotoToDrive:', error);
        throw error;
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
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
        // Completadas hoy - usar la función isDeliveredToday
        filtered = allDeliveries.filter(o => 
            o.deliveryPerson === currentUser.username && 
            isDeliveredToday(o)
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
    
    if(!userCurrentLocation) {
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
    const startLat = userCurrentLocation ? userCurrentLocation.latitude : 17.989;
    const startLng = userCurrentLocation ? userCurrentLocation.longitude : -92.948;
    
    // Coordenadas del destino del cliente
    const address = order.address;
    const destLat = address.latitude || 17.9892;
    const destLng = address.longitude || -92.9475;
    
    // Crear mapa
    if(deliveryMap) {
        deliveryMap.remove();
    }
    
    deliveryMap = L.map('deliveryMap').setView([startLat, startLng], 14);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(deliveryMap);
    
    // Marcador de destino (casa del cliente)
    destinationMarker = L.marker([destLat, destLng], {
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color:#dc3545;width:35px;height:35px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);"><i class="fas fa-home" style="color:white;font-size:18px;"></i></div>',
            iconSize: [35, 35]
        })
    }).addTo(deliveryMap).bindPopup('Destino: ' + order.client.name);
    
    // Marcador del repartidor (moto) - posición real
    deliveryMarker = L.marker([startLat, startLng], {
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color:#ffc107;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);"><i class="fas fa-motorcycle" style="color:white;font-size:20px;"></i></div>',
            iconSize: [40, 40]
        })
    }).addTo(deliveryMap).bindPopup('Tu ubicación').openPopup();
    
    // Ajustar el mapa para ver ambos marcadores
    const bounds = L.latLngBounds([[startLat, startLng], [destLat, destLng]]);
    deliveryMap.fitBounds(bounds, { padding: [50, 50] });
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
    
    deliveryMarker = null;
    destinationMarker = null;
    
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
// CLEANUP ADICIONAL PARA CÁMARA
// ============================================

// Modificar la función existente window.addEventListener('beforeunload')


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
    // Nuevo: Detener cámara si está activa
    stopCamera();
});









