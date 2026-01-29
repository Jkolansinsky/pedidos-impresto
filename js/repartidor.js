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
// VARIABLES PARA REGISTRO CONTROLADO
// ============================================
let videoStream = null;
let currentCaptureType = null;
let validatedInvitationCode = null;
let registrationData = {
    invitationCode: null,
    personalInfo: {},
    documents: {
        selfie: null,
        license: null,
        vehicle: null,
        background: null
    },
    contractAccepted: false
};
let pedidosEnCurso = new Set();

// ============================================
// FUNCIONES DE NAVEGACIÓN ENTRE TABS
// ============================================

function showAuthTab(tab) {
    // Limpiar mensajes de error
    const loginError = document.getElementById('loginError');
    const codeError = document.getElementById('codeError');
    
    if(loginError) loginError.classList.add('hidden');
    if(codeError) codeError.classList.add('hidden');
    
    // Cambiar tabs
    document.querySelectorAll('.tab-auth').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    
    if(tab === 'login') {
        document.getElementById('tabLogin').classList.add('active');
        document.getElementById('loginTab').classList.add('active');
    } else {
        document.getElementById('tabRegister').classList.add('active');
        document.getElementById('registerTab').classList.add('active');
        // Reset al paso 1
        goToStep(1);
    }
}

function goToStep(stepNumber) {
    // Ocultar todos los pasos
    document.querySelectorAll('.registration-step').forEach(step => {
        step.classList.remove('active');
    });
    
    // Mostrar el paso solicitado
    document.getElementById('step' + stepNumber).classList.add('active');
    
    // Scroll al inicio
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// PASO 1: VALIDACIÓN DE CÓDIGO DE INVITACIÓN
// ============================================

async function validateInvitationCode() {
    const code = document.getElementById('invitationCode').value.trim().toUpperCase();
    const errorDiv = document.getElementById('codeError');
    
    errorDiv.classList.add('hidden');
    
    if(!code) {
        errorDiv.textContent = 'Por favor ingresa el código de invitación';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'validateInvitationCode',
                code: code
            })
        });
        
        const result = await response.json();
        
        if(result.success) {
            validatedInvitationCode = code;
            registrationData.invitationCode = code;
            goToStep(2);
        } else {
            errorDiv.textContent = result.message || 'Código de invitación inválido';
            errorDiv.classList.remove('hidden');
        }
    } catch(error) {
        errorDiv.textContent = 'Error al validar el código: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

// ============================================
// PASO 2: VALIDACIÓN DE DATOS PERSONALES
// ============================================

function validateStep2() {
    const fullName = document.getElementById('regFullName').value.trim();
    const username = document.getElementById('regUsername').value.trim().toLowerCase();
    const password = document.getElementById('regPassword').value.trim();
    const passwordConfirm = document.getElementById('regPasswordConfirm').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const errorDiv = document.getElementById('step2Error');
    
    errorDiv.classList.add('hidden');
    
    // Validaciones
    if(!fullName || !username || !password || !passwordConfirm || !phone) {
        errorDiv.textContent = 'Por favor completa todos los campos obligatorios (*)';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if(fullName.length < 5) {
        errorDiv.textContent = 'El nombre completo debe tener al menos 5 caracteres';
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
    
    if(phone.length < 10) {
        errorDiv.textContent = 'El teléfono debe tener al menos 10 dígitos';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if(email && !isValidEmail(email)) {
        errorDiv.textContent = 'El formato del email no es válido';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // Guardar datos
    registrationData.personalInfo = {
        fullName,
        username,
        password,
        phone,
        email
    };
    
    // Actualizar nombre en contrato
    document.getElementById('contractName').textContent = fullName;
    
    goToStep(3);
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================
// PASO 3: CARGA DE DOCUMENTOS
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
            
            // Guardar en registrationData
            registrationData.documents[type] = {
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
            // Extraer solo el base64 sin el prefijo data:...
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
    registrationData.documents[type] = null;
    
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
// MODAL DE CÁMARA
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
    
    // Configurar tamaño del canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Capturar frame del video
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convertir a blob y luego a base64
    canvas.toBlob(async function(blob) {
        try {
            showLoading(true);
            
            const base64 = await blobToBase64(blob);
            
            // Guardar en registrationData
            registrationData.documents[currentCaptureType] = {
                name: currentCaptureType + '_' + Date.now() + '.jpg',
                type: 'image/jpeg',
                data: base64,
                size: blob.size
            };
            
            // Mostrar preview
            showDocumentPreview(currentCaptureType, base64, 'image/jpeg');
            
            // Cerrar modal
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

function validateStep3() {
    const errorDiv = document.getElementById('step3Error');
    errorDiv.classList.add('hidden');
    
    // Verificar que todos los documentos estén cargados
    const requiredDocs = ['selfie', 'license', 'vehicle', 'background'];
    const missingDocs = [];
    
    for(let doc of requiredDocs) {
        if(!registrationData.documents[doc]) {
            missingDocs.push(getDocumentName(doc));
        }
    }
    
    if(missingDocs.length > 0) {
        errorDiv.textContent = 'Faltan los siguientes documentos: ' + missingDocs.join(', ');
        errorDiv.classList.remove('hidden');
        return;
    }
    
    goToStep(4);
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
// PASO 4: ENVÍO DE SOLICITUD
// ============================================

async function submitRegistration() {
    const errorDiv = document.getElementById('step4Error');
    const successDiv = document.getElementById('registerSuccess');
    
    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');
    
    // Validar checkboxes
    const acceptContract = document.getElementById('acceptContract').checked;
    const acceptPrivacy = document.getElementById('acceptPrivacy').checked;
    
    if(!acceptContract) {
        errorDiv.textContent = 'Debes aceptar el contrato de prestación de servicios';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if(!acceptPrivacy) {
        errorDiv.textContent = 'Debes aceptar el aviso de privacidad';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if(!confirm('¿Estás seguro de enviar tu solicitud de registro? Verifica que toda la información sea correcta.')) {
        return;
    }
    
    showLoading(true);
    
    try {
        console.log('=== ENVIANDO SOLICITUD DE REGISTRO ===');
        
        // Preparar datos completos
        const registrationPayload = {
            action: 'submitDeliveryRegistration',
            invitationCode: registrationData.invitationCode,
            personalInfo: registrationData.personalInfo,
            documents: registrationData.documents,
            contractAccepted: true,
            privacyAccepted: true,
            timestamp: new Date().toISOString()
        };
        
        console.log('Payload preparado (sin documentos):', {
            ...registrationPayload,
            documents: 'DOCUMENTOS ADJUNTOS'
        });
        
        // Enviar al backend
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(registrationPayload)
        });
        
        const result = await response.json();
        
        if(result.success) {
            successDiv.innerHTML = `
                <strong>¡Solicitud Enviada Exitosamente!</strong><br>
                Tu solicitud ha sido recibida y está en revisión.<br>
                <strong>Número de solicitud:</strong> ${result.applicationId}<br>
                <br>
                Recibirás una notificación cuando tu cuenta sea activada.<br>
                El proceso de revisión toma entre 24-48 horas hábiles.
            `;
            successDiv.classList.remove('hidden');
            
            // Limpiar formulario después de 5 segundos
            setTimeout(() => {
                resetRegistrationForm();
                showAuthTab('login');
            }, 5000);
            
        } else {
            errorDiv.textContent = result.message || 'Error al enviar la solicitud';
            errorDiv.classList.remove('hidden');
        }
        
    } catch(error) {
        console.error('Error:', error);
        errorDiv.textContent = 'Error al enviar la solicitud: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

function resetRegistrationForm() {
    validatedInvitationCode = null;
    registrationData = {
        invitationCode: null,
        personalInfo: {},
        documents: {
            selfie: null,
            license: null,
            vehicle: null,
            background: null
        },
        contractAccepted: false
    };
    
    // Limpiar campos
    document.getElementById('invitationCode').value = '';
    document.getElementById('regFullName').value = '';
    document.getElementById('regUsername').value = '';
    document.getElementById('regPassword').value = '';
    document.getElementById('regPasswordConfirm').value = '';
    document.getElementById('regPhone').value = '';
    document.getElementById('regEmail').value = '';
    document.getElementById('acceptContract').checked = false;
    document.getElementById('acceptPrivacy').checked = false;
    
    // Limpiar documentos
    ['selfie', 'license', 'vehicle', 'background'].forEach(type => {
        removeDocument(type);
    });
    
    goToStep(1);
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
            // Verificar que el usuario esté activo
            if(!result.user.active) {
                errorDiv.textContent = 'Tu cuenta está pendiente de activación. Por favor espera la aprobación del administrador.';
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
// INICIALIZACIÓN
// ============================================

window.onload = function() {
    const user = checkAuth('delivery');
    if(user) {
        currentUser = user;
        document.getElementById('currentUserName').textContent = user.name;
        document.getElementById('loginSection').classList.add('hidden');
        document.getElementById('deliveryPanel').classList.remove('hidden');
        loadDeliveries();
    }
};

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











