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

// Variables para captura de foto
let videoStream = null;
let capturedPhoto = null;
let photoBlob = null;
let pedidosEnCurso = new Set();

// ============================================
// NAVEGACIÓN ENTRE FORMULARIOS
// ============================================

function showLoginForm() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('requestForm').classList.add('hidden');
    document.getElementById('fullRegisterForm').classList.add('hidden');
    document.getElementById('createUserForm').classList.add('hidden');
    
    // Limpiar errores
    document.getElementById('loginError').classList.add('hidden');
}

function showRequestForm() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('requestForm').classList.remove('hidden');
    document.getElementById('fullRegisterForm').classList.add('hidden');
    document.getElementById('createUserForm').classList.add('hidden');
    
    // Limpiar formulario
    document.getElementById('reqFullName').value = '';
    document.getElementById('reqPhone').value = '';
    document.getElementById('reqEmail').value = '';
    document.getElementById('reqCurrentJob').value = '';
    document.getElementById('reqReason').value = '';
    document.getElementById('requestError').classList.add('hidden');
    document.getElementById('requestSuccess').classList.add('hidden');
}

// ============================================
// ENVIAR SOLICITUD DE REGISTRO
// ============================================

async function submitRequest() {
    const fullName = document.getElementById('reqFullName').value.trim();
    const phone = document.getElementById('reqPhone').value.trim();
    const email = document.getElementById('reqEmail').value.trim();
    const currentJob = document.getElementById('reqCurrentJob').value.trim();
    const reason = document.getElementById('reqReason').value.trim();
    const errorDiv = document.getElementById('requestError');
    const successDiv = document.getElementById('requestSuccess');

    // Limpiar mensajes
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    // Validaciones
    if(!fullName || !phone || !email || !currentJob || !reason) {
        errorDiv.textContent = 'Por favor completa todos los campos';
        errorDiv.classList.remove('hidden');
        return;
    }

    // Validar teléfono (10 dígitos)
    if(!/^\d{10}$/.test(phone)) {
        errorDiv.textContent = 'El teléfono debe tener 10 dígitos';
        errorDiv.classList.remove('hidden');
        return;
    }

    // Validar email
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorDiv.textContent = 'Ingresa un correo electrónico válido';
        errorDiv.classList.remove('hidden');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'submitDeliveryRequest',
                fullName: fullName,
                phone: phone,
                email: email,
                currentJob: currentJob,
                reason: reason,
                timestamp: new Date().toISOString()
            })
        });

        const result = await response.json();

        if(result.success) {
            successDiv.innerHTML = '<strong>¡Solicitud enviada!</strong><br>Te contactaremos pronto vía WhatsApp al número proporcionado para continuar con el proceso.';
            successDiv.classList.remove('hidden');
            
            // Limpiar formulario
            document.getElementById('reqFullName').value = '';
            document.getElementById('reqPhone').value = '';
            document.getElementById('reqEmail').value = '';
            document.getElementById('reqCurrentJob').value = '';
            document.getElementById('reqReason').value = '';
        } else {
            errorDiv.textContent = result.message || 'Error al enviar solicitud';
            errorDiv.classList.remove('hidden');
        }
    } catch(error) {
        errorDiv.textContent = 'Error: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

// ============================================
// VALIDAR TOKEN Y MOSTRAR FORMULARIO COMPLETO
// ============================================

function checkForRegistrationToken() {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const action = urlParams.get('action');
    
    if(token && action === 'complete-docs') {
        // Mostrar formulario de documentos
        validateTokenAndShowForm(token, 'docs');
    } else if(token && action === 'create-user') {
        // Mostrar formulario de creación de usuario
        validateTokenAndShowForm(token, 'user');
    }
}

async function validateTokenAndShowForm(token, formType) {
    showLoading(true);
    
    try {
        const response = await fetch(SCRIPT_URL + '?action=validateDeliveryToken&token=' + token);
        const result = await response.json();
        
        if(result.success && result.data) {
            if(formType === 'docs') {
                // Mostrar formulario de documentos
                document.getElementById('loginForm').classList.add('hidden');
                document.getElementById('fullRegisterForm').classList.remove('hidden');
                document.getElementById('regToken').value = token;
                document.getElementById('regFullName').value = result.data.fullName;
            } else if(formType === 'user') {
                // Mostrar formulario de creación de usuario
                document.getElementById('loginForm').classList.add('hidden');
                document.getElementById('createUserForm').classList.remove('hidden');
                document.getElementById('createToken').value = token;
                document.getElementById('createFullName').value = result.data.fullName;
            }
        } else {
            alert('Token inválido o expirado');
            showLoginForm();
        }
    } catch(error) {
        alert('Error al validar token: ' + error.message);
        showLoginForm();
    } finally {
        showLoading(false);
    }
}

// ============================================
// ENVIAR DOCUMENTOS COMPLETOS
// ============================================

async function submitFullRegistration() {
    const licenseFile = document.getElementById('licenseFile').files[0];
    const circulationFile = document.getElementById('circulationFile').files[0];
    const contractAccepted = document.getElementById('contractAccepted').checked;
    
    // Validar que todos los archivos estén seleccionados
    if(!licenseFile) {
        alert('❌ Por favor selecciona tu licencia de conducir');
        return;
    }
    
    if(!circulationFile) {
        alert('❌ Por favor selecciona tu tarjeta de circulación');
        return;
    }
    
    if(!capturedPhoto) {
        alert('❌ Por favor toma tu selfie de verificación');
        return;
    }
    
    if(!contractAccepted) {
        alert('❌ Debes aceptar el contrato para continuar');
        return;
    }
    
    showLoading(true);
    
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        
        if(!token) {
            alert('❌ Token no encontrado');
            return;
        }
        
        console.log('🔄 Iniciando subida de documentos...');
        
        // 1. SUBIR LICENCIA
        console.log('📄 Subiendo licencia...');
        const licenseData = await fileToBase64(licenseFile);
        const licenseResponse = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'uploadDeliveryDocument',
                token: token,
                documentType: 'license',
                fileName: licenseFile.name,
                mimeType: licenseFile.type,
                fileData: licenseData
            })
        });
        
        const licenseResult = await licenseResponse.json();
        console.log('Licencia response:', licenseResult);
        
        if(!licenseResult.success) {
            alert('❌ Error al subir licencia: ' + licenseResult.message);
            return;
        }
        
        const licenseId = licenseResult.fileId;
        console.log('✅ Licencia subida. ID:', licenseId);
        
        // 2. SUBIR CIRCULACIÓN
        console.log('📄 Subiendo tarjeta de circulación...');
        const circulationData = await fileToBase64(circulationFile);
        const circulationResponse = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'uploadDeliveryDocument',
                token: token,
                documentType: 'circulation',
                fileName: circulationFile.name,
                mimeType: circulationFile.type,
                fileData: circulationData
            })
        });
        
        const circulationResult = await circulationResponse.json();
        console.log('Circulación response:', circulationResult);
        
        if(!circulationResult.success) {
            alert('❌ Error al subir circulación: ' + circulationResult.message);
            return;
        }
        
        const circulationId = circulationResult.fileId;
        console.log('✅ Circulación subida. ID:', circulationId);
        
        // 3. SUBIR SELFIE
        console.log('📸 Subiendo selfie...');
        const photoData = capturedPhoto.split(',')[1]; // Quitar "data:image/jpeg;base64,"
        const photoResponse = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'uploadDeliveryDocument',
                token: token,
                documentType: 'photo',
                fileName: 'selfie_verificacion.jpg',
                mimeType: 'image/jpeg',
                fileData: photoData
            })
        });
        
        const photoResult = await photoResponse.json();
        console.log('Selfie response:', photoResult);
        
        if(!photoResult.success) {
            alert('❌ Error al subir selfie: ' + photoResult.message);
            return;
        }
        
        const photoId = photoResult.fileId;
        console.log('✅ Selfie subida. ID:', photoId);
        
        // 4. COMPLETAR REGISTRO
        console.log('💾 Completando registro...');
        const completeResponse = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'completeDeliveryDocuments',
                token: token,
                licenseId: licenseId,
                circulationId: circulationId,
                photoId: photoId
            })
        });
        
        const completeResult = await completeResponse.json();
        console.log('Complete response:', completeResult);
        
        if(completeResult.success) {
            alert('✅ ¡Documentos enviados exitosamente!\n\nRecibirás un correo cuando tu solicitud sea revisada.');
            
            // Redirigir al login después de 2 segundos
            setTimeout(() => {
                window.location.href = 'repartidor.html';
            }, 2000);
        } else {
            alert('❌ Error al completar registro: ' + completeResult.message);
        }
        
    } catch(error) {
        console.error('❌ Error:', error);
        alert('❌ Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Función auxiliar para convertir File a Base64
async function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1]; // Quitar "data:...;base64,"
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ============================================
// CREAR USUARIO Y CONTRASEÑA
// ============================================

async function submitUserCreation() {
    const token = document.getElementById('createToken').value;
    const username = document.getElementById('createUsername').value.trim();
    const password = document.getElementById('createPassword').value.trim();
    const passwordConfirm = document.getElementById('createPasswordConfirm').value.trim();
    const errorDiv = document.getElementById('createError');
    const successDiv = document.getElementById('createSuccess');

    // Limpiar mensajes
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    // Validaciones
    if(!username || !password || !passwordConfirm) {
        errorDiv.textContent = 'Por favor completa todos los campos';
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

    showLoading(true);

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'createDeliveryUser',
                token: token,
                username: username,
                password: password
            })
        });

        const result = await response.json();

        if(result.success) {
            successDiv.innerHTML = '<strong>¡Usuario creado exitosamente!</strong><br>Ya puedes iniciar sesión con tus credenciales.';
            successDiv.classList.remove('hidden');
            
            // Redirigir al login después de 2 segundos
            setTimeout(() => {
                window.location.href = 'repartidor.html';
            }, 2000);
        } else {
            errorDiv.textContent = result.message || 'Error al crear usuario';
            errorDiv.classList.remove('hidden');
        }
    } catch(error) {
        errorDiv.textContent = 'Error: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

// ============================================
// UTILIDADES PARA ARCHIVOS
// ============================================

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ============================================
// CAPTURA DE FOTO (Mantener funciones originales)
// ============================================

async function startCamera() {
    try {
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
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(function(blob) {
        photoBlob = blob;
        const url = URL.createObjectURL(blob);
        
        document.getElementById('photoImg').src = url;
        document.getElementById('photoPreview').classList.remove('hidden');
        document.getElementById('photoCapture').classList.add('hidden');
        
        stopCamera();
        
    }, 'image/jpeg', 0.8);
}

function handlePhotoUpload() {
    const input = document.getElementById('photoFileInput');
    if(input.files.length > 0) {
        const file = input.files[0];
        
        if(!file.type.startsWith('image/')) {
            alert('Por favor selecciona una imagen válida');
            return;
        }
        
        if(file.size > 5 * 1024 * 1024) {
            alert('La imagen es muy grande. Máximo 5MB');
            return;
        }
        
        photoBlob = file;
        const url = URL.createObjectURL(file);
        
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
// LOGIN (Mantener función original)
// ============================================

async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorDiv = document.getElementById('loginError');

    errorDiv.classList.add('hidden');

    if(!username || !password) {
        errorDiv.textContent = 'Por favor ingresa usuario y contraseña';
        errorDiv.classList.remove('hidden');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(SCRIPT_URL + '?action=login&username=' + username + '&password=' + password + '&type=delivery');
        const result = await response.json();

        if(result.success && result.user) {
            if(result.user.role !== 'delivery') {
                errorDiv.textContent = 'Este usuario no tiene permisos de repartidor';
                errorDiv.classList.remove('hidden');
                showLoading(false);
                return;
            }

            localStorage.setItem('currentUser', JSON.stringify(result.user));
            currentUser = result.user;

            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('deliveryPanel').classList.remove('hidden');
            document.getElementById('currentUserName').textContent = currentUser.name || currentUser.username;

            loadDeliveries();
        } else {
            errorDiv.textContent = result.message || 'Usuario o contraseña incorrectos';
            errorDiv.classList.remove('hidden');
        }
    } catch(error) {
        errorDiv.textContent = 'Error: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

// ============================================
// RESTO DE FUNCIONES ORIGINALES
// (Mantener todas las funciones de loadDeliveries, filterDeliveries, etc.)
// ============================================

// [AQUÍ VAN TODAS LAS FUNCIONES RESTANTES DEL ARCHIVO ORIGINAL]
// Las copio exactamente como están en el archivo original...

async function loadDeliveries() {
    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDeliveryOrders&delivery=' + currentUser.username);
        const result = await response.json();

        if(result.success) {
            allDeliveries = result.orders || [];
            filterDeliveries('ready');
        } else {
            alert('Error al cargar entregas: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function filterDeliveries(filter) {
    let filtered = [];

    if(filter === 'ready') {
        filtered = allDeliveries.filter(o => o.status === 'ready');
    } else if(filter === 'mytaken') {
        filtered = allDeliveries.filter(o => 
            o.status === 'delivering' && 
            o.deliveryPerson === currentUser.username
        );
    } else if(filter === 'completed') {
        filtered = allDeliveries.filter(o => isDeliveredToday(o));
    }

    displayDeliveries(filtered);
}

function displayDeliveries(deliveries) {
    const container = document.getElementById('deliveriesList');

    if(deliveries.length === 0) {
        container.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><p>No hay entregas en esta categoría</p></div>';
        return;
    }

    let html = '';
    deliveries.forEach(order => {
        const statusClass = order.status === 'ready' ? 'success' : 
                          order.status === 'delivering' ? 'path' : 'secondary';

        html += `
            <div class="order-card">
                <div class="order-header">
                    <div>
                        <strong>Folio: ${order.folio}</strong>
                        <span class="status-badge status-${statusClass}">${getStatusText(order.status)}</span>
                    </div>
                    <div class="text-muted">${formatDate(order.date)}</div>
                </div>
                <div class="order-body">
                    <p><strong><i class="fas fa-user"></i> Cliente:</strong> ${order.client.name}</p>
                    <p><strong><i class="fas fa-phone"></i> Teléfono:</strong> ${order.client.phone}</p>
                    ${order.address ? `
                        <p><strong><i class="fas fa-map-marker-alt"></i> Dirección:</strong> 
                        ${order.address.street}, ${order.address.colony}, ${order.address.city}</p>
                    ` : ''}
                    <p><strong><i class="fas fa-dollar-sign"></i> Total:</strong> $${order.total.toFixed(2)}</p>
                </div>
                <div class="order-actions">
                    ${order.status === 'ready' ? `
                        <button class="btn btn-success" onclick="takeDelivery('${order.folio}')">
                            <i class="fas fa-motorcycle"></i> Tomar Entrega
                        </button>
                    ` : ''}
                    ${order.status === 'delivering' && order.deliveryPerson === currentUser.username ? `
                        <button class="btn btn-primary" onclick="openActiveDelivery('${order.folio}')">
                            <i class="fas fa-route"></i> Ver Ruta
                        </button>
                        <button class="btn btn-danger" onclick="cancelDelivery('${order.folio}')">
                            <i class="fas fa-times"></i> Cancelar
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

async function takeDelivery(folio) {
    if(!confirm('¿Deseas tomar esta entrega?')) {
        return;
    }

    if(!userCurrentLocation) {
        alert('Activando ubicación GPS...');
        initGeolocation();
        setTimeout(() => {
            if(userCurrentLocation) {
                proceedToTakeDelivery(folio);
            } else {
                alert('No se pudo obtener tu ubicación. Por favor activa el GPS.');
            }
        }, 2000);
        return;
    }

    proceedToTakeDelivery(folio);
}

async function proceedToTakeDelivery(folio) {
    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'assignDelivery',
                folio: folio,
                deliveryPerson: currentUser.username,
                timestamp: new Date().toISOString()
            })
        });

        const result = await response.json();

        if(result.success) {
            pedidosEnCurso.add(folio);
            
            alert('Entrega asignada exitosamente. Ahora puedes comenzar la ruta.');
            
            loadDeliveries();
            
            setTimeout(() => {
                openActiveDelivery(folio);
            }, 500);
        } else {
            alert('Error: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function openActiveDelivery(folio) {
    const order = allDeliveries.find(o => o.folio === folio);
    if(!order) {
        alert('Pedido no encontrado');
        return;
    }

    activeDelivery = order;

    let html = `
        <div class="info-section">
            <h4><i class="fas fa-user"></i> Información del Cliente</h4>
            <p><strong>Nombre:</strong> ${order.client.name}</p>
            <p><strong>Teléfono:</strong> <a href="tel:${order.client.phone}">${order.client.phone}</a></p>
            ${order.address ? `
                <p><strong>Dirección:</strong> ${order.address.street}, ${order.address.colony}, ${order.address.city}</p>
                <p><strong>Referencias:</strong> ${order.address.references || 'Sin referencias'}</p>
            ` : ''}
        </div>
        
        <div class="info-section">
            <h4><i class="fas fa-box"></i> Detalles del Pedido</h4>
            <p><strong>Folio:</strong> ${order.folio}</p>
            <p><strong>Total:</strong> $${order.total.toFixed(2)}</p>
        </div>
    `;

    document.getElementById('deliveryInfo').innerHTML = html;

    initDeliveryMap(order);

    startGPSTracking();

    document.getElementById('activeDeliveryModal').classList.add('active');
}

function startGPSTracking() {
    if(!userCurrentLocation) {
        alert('Activando GPS...');
        initGeolocation();
    }

    if(gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
    }

    gpsWatchId = navigator.geolocation.watchPosition(
        function(position) {
            currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };

            if(deliveryMarker && deliveryMap) {
                deliveryMarker.setLatLng([currentLocation.latitude, currentLocation.longitude]);
            }

            if(activeDelivery) {
                updateLocationInServer(activeDelivery.folio, currentLocation);
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

async function updateLocationInServer(folio, location) {
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateLocation',
                folio: folio,
                deliveryPerson: currentUser.username,
                latitude: location.latitude,
                longitude: location.longitude,
                timestamp: new Date().toISOString()
            })
        });
    } catch(error) {
        console.error('Error actualizando ubicación:', error);
    }
}

function initDeliveryMap(order) {
    const mapDiv = document.getElementById('deliveryMap');
    
    const startLat = userCurrentLocation ? userCurrentLocation.latitude : 17.989;
    const startLng = userCurrentLocation ? userCurrentLocation.longitude : -92.948;

    const address = order.address;
    
    if(!address) {
        alert('Error: Este pedido no tiene dirección de entrega');
        return;
    }
    
    let destLat, destLng;
    
    if(address.latitude && address.longitude) {
        destLat = parseFloat(address.latitude);
        destLng = parseFloat(address.longitude);
    } else {
        destLat = 17.9892;
        destLng = -92.9475;
    }
    
    if(isNaN(destLat) || isNaN(destLng)) {
        alert('Error: Las coordenadas del destino no son válidas');
        return;
    }
    
    if(deliveryMap) {
        deliveryMap.remove();
    }
    
    deliveryMap = L.map('deliveryMap').setView([startLat, startLng], 14);
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(deliveryMap);
    
    destinationMarker = L.marker([destLat, destLng], {
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color:#dc3545;width:35px;height:35px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 5px rgba(0,0,0,0.3);"><i class="fas fa-home" style="color:white;font-size:18px;"></i></div>',
            iconSize: [35, 35]
        })
    }).addTo(deliveryMap).bindPopup(
        `<strong>Destino: ${order.client.name}</strong><br>` +
        `${address.street}, ${address.colony}<br>`
    ).openPopup();
    
    deliveryMarker = L.marker([startLat, startLng], {
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color:#ffc107;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);"><i class="fas fa-motorcycle" style="color:white;font-size:20px;"></i></div>',
            iconSize: [40, 40]
        })
    }).addTo(deliveryMap).bindPopup('<strong>Tu ubicación</strong>');
    
    const bounds = L.latLngBounds([[startLat, startLng], [destLat, destLng]]);
    deliveryMap.fitBounds(bounds, { padding: [50, 50] });
}

function closeActiveDelivery() {
    if(deliveryMap) {
        deliveryMap.remove();
        deliveryMap = null;
    }
    
    deliveryMarker = null;
    destinationMarker = null;
    
    document.getElementById('activeDeliveryModal').classList.remove('active');
}

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
            pedidosEnCurso.delete(activeDelivery.folio);
            
            alert('✅ Entrega completada exitosamente');
            
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
        } else {
            alert('Error al completar entrega: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function cancelDelivery(folio) {
    if(!confirm('¿Estás seguro de cancelar esta entrega? Se devolverá a la lista de disponibles.')) {
        return;
    }

    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'cancelDeliveryByDriver',
                folio: folio,
                deliveryPerson: currentUser.username
            })
        });

        const result = await response.json();

        if(result.success) {
            pedidosEnCurso.delete(folio);
            
            if(activeDelivery && activeDelivery.folio === folio) {
                if(gpsWatchId) {
                    navigator.geolocation.clearWatch(gpsWatchId);
                    gpsWatchId = null;
                }
                
                closeActiveDelivery();
                activeDelivery = null;
            }

            alert('Entrega cancelada y devuelta a la lista');
            loadDeliveries();
        } else {
            alert('Error: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Verificar si hay token en URL
    checkForRegistrationToken();
    
    // Verificar si hay usuario logueado
    const user = checkAuth('delivery');
    if(user) {
        currentUser = user;
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('deliveryPanel').classList.remove('hidden');
        document.getElementById('currentUserName').textContent = currentUser.name || currentUser.username;
        loadDeliveries();
    }
});

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
    stopCamera();
});


