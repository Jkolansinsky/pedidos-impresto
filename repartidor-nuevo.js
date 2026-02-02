// ============================================
// REPARTIDOR.JS - SISTEMA DE REGISTRO EN 4 ETAPAS
// REEMPLAZAR COMPLETAMENTE EL ARCHIVO repartidor.js
// ============================================

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
let pedidosEnCurso = new Set();

// Variables para cámara y documentos
let videoStream = null;
let currentCaptureType = null;
let registrationDocuments = {
    selfie: null,
    license: null,
    vehicle: null,
    background: null
};

// Variables para tokens
let registrationToken = null;
let approvalToken = null;
let preAppData = null;

// ============================================
// INICIALIZACIÓN AL CARGAR LA PÁGINA
// ============================================

window.onload = function() {
    // Verificar si hay usuario logueado
    const user = checkAuth('delivery');
    if(user) {
        currentUser = user;
        document.getElementById('currentUserName').textContent = user.name;
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('deliveryPanel').classList.remove('hidden');
        loadDeliveries();
        return;
    }
    
    // Verificar si viene con token de registro (QR)
    const urlParams = new URLSearchParams(window.location.search);
    const regToken = urlParams.get('token');
    
    if(regToken) {
        validateRegistrationToken(regToken);
        return;
    }
    
    // Verificar si viene con token de aprobación
    const approveToken = urlParams.get('approve');
    
    if(approveToken) {
        validateApprovalToken(approveToken);
        return;
    }
    
    // Mostrar login normal
    document.getElementById('loginSection').classList.remove('hidden');
};

// ============================================
// ETAPA 1: PRE-SOLICITUD SIMPLE
// ============================================

function showPreApplication() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('preApplicationForm').classList.remove('hidden');
}

function showLogin() {
    document.getElementById('preApplicationForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
    
    // Limpiar campos
    document.getElementById('preFullName').value = '';
    document.getElementById('prePhone').value = '';
    document.getElementById('preEmail').value = '';
    document.getElementById('preCurrentJob').value = '';
    document.getElementById('preMotivation').value = '';
    
    document.getElementById('preAppError').classList.add('hidden');
    document.getElementById('preAppSuccess').classList.add('hidden');
}

async function submitPreApplication() {
    const fullName = document.getElementById('preFullName').value.trim();
    const phone = document.getElementById('prePhone').value.trim();
    const email = document.getElementById('preEmail').value.trim();
    const currentJob = document.getElementById('preCurrentJob').value.trim();
    const motivation = document.getElementById('preMotivation').value.trim();
    
    const errorDiv = document.getElementById('preAppError');
    const successDiv = document.getElementById('preAppSuccess');
    
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    
    // Validaciones
    if(!fullName || !phone || !email || !currentJob || !motivation) {
        errorDiv.textContent = 'Por favor completa todos los campos obligatorios';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if(fullName.length < 5) {
        errorDiv.textContent = 'El nombre completo debe tener al menos 5 caracteres';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if(phone.length < 10) {
        errorDiv.textContent = 'El teléfono debe tener al menos 10 dígitos';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if(!isValidEmail(email)) {
        errorDiv.textContent = 'El formato del email no es válido';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if(motivation.length < 20) {
        errorDiv.textContent = 'Por favor describe más detalladamente tu motivación (mínimo 20 caracteres)';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'submitPreApplication',
                fullName: fullName,
                phone: phone,
                email: email,
                currentJob: currentJob,
                motivation: motivation,
                timestamp: new Date().toISOString()
            })
        });
        
        const result = await response.json();
        
        if(result.success) {
            successDiv.innerHTML = `
                <strong>¡Pre-solicitud enviada exitosamente!</strong><br>
                Tu solicitud ha sido recibida con el número: <strong>${result.applicationId}</strong><br><br>
                El equipo administrativo la revisará pronto.<br>
                Si es aprobada, recibirás un código QR por WhatsApp al número: <strong>${phone}</strong>
            `;
            successDiv.classList.remove('hidden');
            
            // Limpiar formulario después de 5 segundos
            setTimeout(() => {
                showLogin();
            }, 5000);
        } else {
            errorDiv.textContent = result.message || 'Error al enviar la pre-solicitud';
            errorDiv.classList.remove('hidden');
        }
    } catch(error) {
        errorDiv.textContent = 'Error: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================
// ETAPA 2: VALIDAR TOKEN DE REGISTRO (QR)
// ============================================

async function validateRegistrationToken(token) {
    showLoading(true);
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'validateRegistrationToken',
                token: token
            })
        });
        
        const result = await response.json();
        
        if(result.success) {
            registrationToken = token;
            preAppData = result.data;
            
            // Mostrar formulario completo de registro
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('fullRegistrationSection').classList.remove('hidden');
            
            // Llenar datos recuperados
            document.getElementById('displayName').textContent = preAppData.fullName;
            document.getElementById('displayPhone').textContent = preAppData.phone;
            document.getElementById('displayEmail').textContent = preAppData.email;
        } else {
            alert('El enlace de registro no es válido o ha expirado.\n\n' + result.message);
            window.location.href = 'repartidor.html';
        }
    } catch(error) {
        alert('Error al validar el enlace: ' + error.message);
        window.location.href = 'repartidor.html';
    } finally {
        showLoading(false);
    }
}

// ============================================
// ETAPA 3: REGISTRO COMPLETO CON DOCUMENTOS
// ============================================

function captureDocument(type) {
    currentCaptureType = type;
    document.getElementById('cameraModal').classList.add('active');
}

function uploadDocument(type) {
    document.getElementById(type + 'File').click();
}

async function handleDocumentUpload(type) {
    const input = document.getElementById(type + 'File');
    
    if(input.files.length > 0) {
        const file = input.files[0];
        
        // Validar tipo
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
        if(!validTypes.includes(file.type)) {
            alert('Por favor selecciona una imagen (JPG, PNG) o PDF válido');
            return;
        }
        
        // Validar tamaño (máx 10MB)
        if(file.size > 10 * 1024 * 1024) {
            alert('El archivo es muy grande. Máximo 10MB');
            return;
        }
        
        try {
            showLoading(true);
            
            // Convertir a base64
            const base64 = await fileToBase64(file);
            
            // Guardar en registrationDocuments
            registrationDocuments[type] = {
                name: file.name,
                type: file.type,
                data: base64,
                size: file.size
            };
            
            // Mostrar preview
            showDocumentPreview(type, base64, file.type);
            
        } catch(error) {
            alert('Error al procesar el archivo: ' + error.message);
        } finally {
            showLoading(false);
        }
    }
}

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

function showDocumentPreview(type, base64Data, mimeType) {
    const previewDiv = document.getElementById(type + 'Preview');
    const uploadDiv = document.getElementById(type + 'Upload');
    const img = document.getElementById(type + 'Img');
    
    if(mimeType.startsWith('image/')) {
        img.src = 'data:' + mimeType + ';base64,' + base64Data;
    } else {
        // Para PDFs mostrar un ícono
        img.src = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50%" y="50%" font-size="60" text-anchor="middle" fill="#dc3545">📄</text></svg>');
    }
    
    previewDiv.classList.remove('hidden');
    uploadDiv.classList.add('hidden');
}

function removeDocument(type) {
    registrationDocuments[type] = null;
    
    const previewDiv = document.getElementById(type + 'Preview');
    const uploadDiv = document.getElementById(type + 'Upload');
    const img = document.getElementById(type + 'Img');
    const fileInput = document.getElementById(type + 'File');
    
    img.src = '';
    previewDiv.classList.add('hidden');
    uploadDiv.classList.remove('hidden');
    fileInput.value = '';
}

// ============================================
// FUNCIONES DE CÁMARA
// ============================================

async function startDocumentCamera() {
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });
        
        const video = document.getElementById('cameraPreview');
        video.srcObject = videoStream;
        video.style.display = 'block';
        
        document.getElementById('startCameraBtn').classList.add('hidden');
        document.getElementById('takePictureBtn').classList.remove('hidden');
        
    } catch(error) {
        console.error('Error accediendo a la cámara:', error);
        alert('No se pudo acceder a la cámara. Por favor, sube el archivo desde tu dispositivo.');
    }
}

function takeDocumentPicture() {
    const video = document.getElementById('cameraPreview');
    const canvas = document.getElementById('captureCanvas');
    const context = canvas.getContext('2d');
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    canvas.toBlob(async function(blob) {
        try {
            showLoading(true);
            
            const base64 = await blobToBase64(blob);
            
            registrationDocuments[currentCaptureType] = {
                name: currentCaptureType + '_' + Date.now() + '.jpg',
                type: 'image/jpeg',
                data: base64,
                size: blob.size
            };
            
            showDocumentPreview(currentCaptureType, base64, 'image/jpeg');
            closeCameraModal();
            
        } catch(error) {
            alert('Error al procesar la imagen: ' + error.message);
        } finally {
            showLoading(false);
        }
    }, 'image/jpeg', 0.85);
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

function closeCameraModal() {
    if(videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }
    
    const video = document.getElementById('cameraPreview');
    video.style.display = 'none';
    video.srcObject = null;
    
    document.getElementById('startCameraBtn').classList.remove('hidden');
    document.getElementById('takePictureBtn').classList.add('hidden');
    document.getElementById('cameraModal').classList.remove('active');
    
    currentCaptureType = null;
}

// ============================================
// ENVIAR REGISTRO COMPLETO
// ============================================

async function submitFullRegistration() {
    const errorDiv = document.getElementById('fullRegError');
    const successDiv = document.getElementById('fullRegSuccess');
    
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    
    // Verificar que todos los documentos estén cargados
    const requiredDocs = ['selfie', 'license', 'vehicle', 'background'];
    const missingDocs = [];
    
    for(let doc of requiredDocs) {
        if(!registrationDocuments[doc]) {
            missingDocs.push(getDocumentName(doc));
        }
    }
    
    if(missingDocs.length > 0) {
        errorDiv.textContent = 'Faltan los siguientes documentos: ' + missingDocs.join(', ');
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if(!confirm('¿Estás seguro de enviar tus documentos para validación? Verifica que todos sean correctos y legibles.')) {
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'submitFullRegistration',
                token: registrationToken,
                documents: registrationDocuments,
                timestamp: new Date().toISOString()
            })
        });
        
        const result = await response.json();
        
        if(result.success) {
            successDiv.innerHTML = `
                <strong>¡Documentos enviados exitosamente!</strong><br><br>
                Tu registro completo ha sido recibido.<br>
                El equipo administrativo validará tus documentos.<br><br>
                Si todo está correcto, recibirás un enlace para crear tu usuario y contraseña.<br><br>
                <strong>Tiempo estimado de validación: 24-48 horas</strong>
            `;
            successDiv.classList.remove('hidden');
            
            // Deshabilitar botón
            event.target.disabled = true;
            event.target.innerHTML = '<i class="fas fa-check"></i> Documentos Enviados';
        } else {
            errorDiv.textContent = result.message || 'Error al enviar documentos';
            errorDiv.classList.remove('hidden');
        }
    } catch(error) {
        errorDiv.textContent = 'Error: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

function getDocumentName(type) {
    const names = {
        'selfie': 'Selfie con INE',
        'license': 'Licencia de Conducir',
        'vehicle': 'Tarjeta de Circulación',
        'background': 'Carta de No Antecedentes'
    };
    return names[type] || type;
}

// ============================================
// ETAPA 4: VALIDAR TOKEN DE APROBACIÓN
// ============================================

async function validateApprovalToken(token) {
    showLoading(true);
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'validateApprovalToken',
                token: token
            })
        });
        
        const result = await response.json();
        
        if(result.success) {
            approvalToken = token;
            
            // Mostrar formulario de creación de cuenta
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('createAccountSection').classList.remove('hidden');
            
            // Llenar datos
            document.getElementById('approvedName').textContent = result.data.fullName;
            document.getElementById('approvedPhone').textContent = result.data.phone;
        } else {
            alert('El enlace de aprobación no es válido o ha expirado.\n\n' + result.message);
            window.location.href = 'repartidor.html';
        }
    } catch(error) {
        alert('Error al validar el enlace: ' + error.message);
        window.location.href = 'repartidor.html';
    } finally {
        showLoading(false);
    }
}

// ============================================
// CREAR CUENTA DE USUARIO
// ============================================

async function createUserAccount() {
    const username = document.getElementById('newUsername').value.trim().toLowerCase();
    const password = document.getElementById('newPassword').value.trim();
    const passwordConfirm = document.getElementById('newPasswordConfirm').value.trim();
    
    const errorDiv = document.getElementById('createAccountError');
    const successDiv = document.getElementById('createAccountSuccess');
    
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
    
    if(!confirm('¿Crear tu cuenta con el usuario: ' + username + '?')) {
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'createDeliveryAccount',
                token: approvalToken,
                username: username,
                password: password,
                timestamp: new Date().toISOString()
            })
        });
        
        const result = await response.json();
        
        if(result.success) {
            successDiv.innerHTML = `
                <strong>¡Cuenta creada exitosamente!</strong><br><br>
                Usuario: <strong>${username}</strong><br><br>
                Ya puedes iniciar sesión con tus credenciales.<br>
                Serás redirigido en 3 segundos...
            `;
            successDiv.classList.remove('hidden');
            
            setTimeout(() => {
                window.location.href = 'repartidor.html';
            }, 3000);
        } else {
            errorDiv.textContent = result.message || 'Error al crear la cuenta';
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
// LOGIN
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
        const response = await fetch(`${SCRIPT_URL}?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=delivery`);
        const result = await response.json();
        
        if(result.success) {
            if(!result.user.active) {
                errorDiv.textContent = 'Tu cuenta está pendiente de activación.';
                errorDiv.classList.remove('hidden');
                showLoading(false);
                return;
            }
            
            currentUser = result.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            
            document.getElementById('currentUserName').textContent = currentUser.name;
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('deliveryPanel').classList.remove('hidden');
            
            loadDeliveries();
        } else {
            errorDiv.textContent = result.message || 'Usuario o contraseña incorrectos';
            errorDiv.classList.remove('hidden');
        }
    } catch(error) {
        errorDiv.textContent = 'Error al iniciar sesión: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

// ============================================
// GESTIÓN DE ENTREGAS (CÓDIGO ORIGINAL)
// ============================================

async function loadDeliveries() {
    showLoading(true);
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getDeliveryOrders&delivery=${currentUser.username}`);
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

function filterDeliveries(status) {
    let filtered = [];
    
    if(status === 'ready') {
        filtered = allDeliveries.filter(o => o.status === 'ready' && o.serviceType === 'domicilio');
    } else if(status === 'mytaken') {
        filtered = allDeliveries.filter(o => 
            o.status === 'delivering' && 
            o.deliveryPerson === currentUser.username &&
            o.serviceType === 'domicilio'
        );
    } else if(status === 'completed') {
        filtered = allDeliveries.filter(o => 
            o.status === 'delivered' && 
            o.deliveryPerson === currentUser.username &&
            isDeliveredToday(o) &&
            o.serviceType === 'domicilio'
        );
    }
    
    displayDeliveries(filtered);
}

function displayDeliveries(deliveries) {
    const container = document.getElementById('deliveriesList');
    
    if(deliveries.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i>
                No hay entregas en esta categoría
            </div>
        `;
        return;
    }
    
    container.innerHTML = deliveries.map(order => {
        const statusClass = 'status-' + order.status;
        const statusText = getStatusText(order.status);
        
        const address = safeJSONParse(order.address, {});
        const addressText = address.street ? 
            `${address.street}, ${address.colony}, ${address.city || 'Villahermosa'}` : 
            'Dirección no disponible';
        
        const isInProgress = pedidosEnCurso.has(order.folio);
        
        return `
            <div class="order-item">
                <div class="cart-item-header">
                    <h4>Pedido #${order.folio}</h4>
                    <span class="order-status ${statusClass}">${statusText}</span>
                </div>
                <div class="cart-item-details">
                    <strong>Cliente:</strong> ${order.client.name}<br>
                    <strong>Teléfono:</strong> ${order.client.phone}<br>
                    <strong>Dirección:</strong> ${addressText}<br>
                    <strong>Total:</strong> $${parseFloat(order.total).toFixed(2)}
                </div>
                ${order.status === 'ready' && !isInProgress ? `
                    <button class="btn btn-success" onclick="takeDelivery('${order.folio}')">
                        <i class="fas fa-hand-paper"></i> Tomar Entrega
                    </button>
                ` : ''}
                ${order.status === 'delivering' && order.deliveryPerson === currentUser.username ? `
                    <div style="display: flex; gap: 10px;">
                        <button class="btn btn-primary" onclick="viewActiveDelivery('${order.folio}')">
                            <i class="fas fa-map-marked-alt"></i> Ver Ruta
                        </button>
                        <button class="btn btn-danger" onclick="cancelDelivery('${order.folio}')">
                            <i class="fas fa-times-circle"></i> Cancelar
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

async function takeDelivery(folio) {
    if(!confirm('¿Deseas tomar esta entrega?')) {
        return;
    }
    
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
            
            const order = allDeliveries.find(o => o.folio === folio);
            if(order) {
                order.status = 'delivering';
                order.deliveryPerson = currentUser.username;
                activeDelivery = order;
                
                startGPSTracking(folio);
                
                filterDeliveries('mytaken');
                viewActiveDelivery(folio);
            }
        } else {
            alert('Error: ' + result.message);
        }
    } catch(error) {
        alert('Error al tomar entrega: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function startGPSTracking(folio) {
    if(gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
    }
    
    gpsWatchId = navigator.geolocation.watchPosition(
        function(position) {
            currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
            
            updateDeliveryLocation(folio, currentLocation);
            
            if(deliveryMarker && deliveryMap) {
                deliveryMarker.setLatLng([currentLocation.latitude, currentLocation.longitude]);
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

async function updateDeliveryLocation(folio, location) {
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

function viewActiveDelivery(folio) {
    const order = allDeliveries.find(o => o.folio === folio);
    if(!order) return;
    
    activeDelivery = order;
    
    const address = safeJSONParse(order.address, {});
    
    document.getElementById('deliveryInfo').innerHTML = `
        <div class="order-item">
            <h4>Pedido #${order.folio}</h4>
            <div class="cart-item-details">
                <strong>Cliente:</strong> ${order.client.name}<br>
                <strong>Teléfono:</strong> ${order.client.phone}<br>
                <strong>Dirección:</strong> ${address.street}, ${address.colony}<br>
                <strong>Referencias:</strong> ${address.reference || 'No hay referencias'}<br>
                <strong>Total a cobrar:</strong> $${parseFloat(order.total).toFixed(2)}
            </div>
        </div>
    `;
    
    document.getElementById('activeDeliveryModal').classList.add('active');
    
    setTimeout(() => {
        initDeliveryMap(order);
    }, 300);
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
        `${address.street}, ${address.colony}`
    ).openPopup();
    
    deliveryMarker = L.marker([startLat, startLng], {
        icon: L.divIcon({
            className: 'custom-div-icon',
            html: '<div style="background-color:#ffc107;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);"><i class="fas fa-motorcycle" style="color:white;font-size:20px;"></i></div>',
            iconSize: [40, 40]
        })
    }).addTo(deliveryMap).bindPopup('Tu ubicación');
    
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
    if(!confirm('¿Estás seguro de cancelar esta entrega? Volverá a estar disponible para otros repartidores.')) {
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
                activeDelivery = null;
                closeActiveDelivery();
            }
            
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
// CLEANUP
// ============================================

window.addEventListener('beforeunload', function() {
    if(gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
    }
    if(deliveryMap) {
        deliveryMap.remove();
    }
    if(videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }
});
