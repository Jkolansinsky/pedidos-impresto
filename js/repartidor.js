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
// VARIABLES PARA REGISTRO (3 NIVELES)
// ============================================
let videoStream = null;
let capturedFacePhoto = null;
let facePhotoBlob = null;
let vehiclePhotoBlob = null;
let uploadedDocuments = {
    id: null,
    license: null,
    address: null
};

// Variables para el flujo de registro
let registrationData = {
    fullName: null,
    phone: null,
    email: null,
    motivation: null,
    qrCode: null
};

// ============================================
// FUNCIONES DE AUTENTICACIÓN (LOGIN)
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
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'login',
                username: username,
                password: password,
                role: 'delivery'
            })
        });

        const result = await response.json();

        if(result.success) {
            // Guardar usuario en localStorage
            currentUser = result.user;
            localStorage.setItem('currentUser', JSON.stringify(currentUser));

            // Mostrar panel
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('deliveryPanel').classList.remove('hidden');
            document.getElementById('currentUserName').textContent = currentUser.name || currentUser.username;

            // Inicializar panel
            loadDeliveries();
        } else {
            errorDiv.textContent = result.message || 'Usuario o contraseña incorrectos';
            errorDiv.classList.remove('hidden');
        }
    } catch(error) {
        errorDiv.textContent = 'Error de conexión: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

// ============================================
// FUNCIONES DE NAVEGACIÓN ENTRE TABS
// ============================================

function showAuthTab(tab) {
    console.log('showAuthTab llamado con:', tab);
    
    // Limpiar mensajes de error
    const loginError = document.getElementById('loginError');
    const requestError = document.getElementById('requestError');
    const qrError = document.getElementById('qrError');
    const registerError = document.getElementById('registerError');
    
    if(loginError) loginError.classList.add('hidden');
    if(requestError) requestError.classList.add('hidden');
    if(qrError) qrError.classList.add('hidden');
    if(registerError) registerError.classList.add('hidden');

    // Ocultar TODOS los tabs
    console.log('Ocultando todos los tabs...');
    const loginTab = document.getElementById('loginTab');
    const requestTab = document.getElementById('requestTab');
    const preregisterTab = document.getElementById('preregisterTab');
    const registerTab = document.getElementById('registerTab');
    
    if(loginTab) loginTab.classList.add('hidden');
    if(requestTab) requestTab.classList.add('hidden');
    if(preregisterTab) preregisterTab.classList.add('hidden');
    if(registerTab) registerTab.classList.add('hidden');

    // Mostrar el tab solicitado
    console.log('Mostrando tab:', tab);
    if(tab === 'login') {
        if(loginTab) {
            loginTab.classList.remove('hidden');
            console.log('✅ loginTab mostrado');
        }
    } else if(tab === 'request') {
        if(requestTab) {
            requestTab.classList.remove('hidden');
            console.log('✅ requestTab mostrado');
        }
    } else if(tab === 'preregister') {
        if(preregisterTab) {
            preregisterTab.classList.remove('hidden');
            console.log('✅ preregisterTab mostrado');
        }
    } else if(tab === 'register') {
        if(registerTab) {
            registerTab.classList.remove('hidden');
            console.log('✅ registerTab mostrado');
        }
    }
}

// ============================================
// NIVEL 1: SOLICITUD DE REGISTRO
// ============================================

async function submitDeliveryRequest() {
    const fullName = document.getElementById('reqFullName').value.trim();
    const phone = document.getElementById('reqPhone').value.trim();
    const email = document.getElementById('reqEmail').value.trim();
    const motivation = document.getElementById('reqMotivation').value.trim();
    const errorDiv = document.getElementById('requestError');
    const successDiv = document.getElementById('requestSuccess');

    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    // Validaciones
    if(!fullName || !phone || !email || !motivation) {
        errorDiv.textContent = 'Por favor completa todos los campos obligatorios';
        errorDiv.classList.remove('hidden');
        return;
    }

    // Validar teléfono (10 dígitos para México)
    if(!/^\d{10}$/.test(phone.replace(/\D/g, ''))) {
        errorDiv.textContent = 'Por favor ingresa un teléfono válido (10 dígitos)';
        errorDiv.classList.remove('hidden');
        return;
    }

    // Validar email
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errorDiv.textContent = 'Por favor ingresa un correo válido';
        errorDiv.classList.remove('hidden');
        return;
    }

    if(motivation.length < 20) {
        errorDiv.textContent = 'Por favor da una descripción más detallada (mínimo 20 caracteres)';
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
                motivation: motivation,
                timestamp: new Date().toISOString()
            })
        });

        const result = await response.json();

        if(result.success) {
            // Guardar datos para el siguiente nivel
            registrationData = {
                fullName: fullName,
                phone: phone,
                email: email,
                motivation: motivation
            };

            successDiv.innerHTML = `
                <strong>✅ Solicitud enviada exitosamente</strong><br>
                <small>El administrador revisará tu información. Si es aprobado, recibirás un código QR por WhatsApp en el número: <strong>${phone}</strong><br>
                Una vez recibas el código, regresa y selecciona "Acceso con Código QR" para continuar.</small>
            `;
            successDiv.classList.remove('hidden');

            // Limpiar formulario
            document.getElementById('reqFullName').value = '';
            document.getElementById('reqPhone').value = '';
            document.getElementById('reqEmail').value = '';
            document.getElementById('reqMotivation').value = '';

            // Cambiar a tab de QR después de 3 segundos
            setTimeout(() => {
                showAuthTab('preregister');
            }, 3000);
        } else {
            errorDiv.textContent = result.message || 'Error al enviar la solicitud';
            errorDiv.classList.remove('hidden');
        }
    } catch(error) {
        errorDiv.textContent = 'Error de conexión: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

// ============================================
// NIVEL 2: VALIDACIÓN CON QR
// ============================================

async function validateQRCode() {
    const qrCode = document.getElementById('qrCode').value.trim();
    const errorDiv = document.getElementById('qrError');

    errorDiv.classList.add('hidden');

    if(!qrCode) {
        errorDiv.textContent = 'Por favor ingresa el código QR';
        errorDiv.classList.remove('hidden');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'validateQRCode',
                qrCode: qrCode
            })
        });

        const result = await response.json();

        if(result.success) {
            // Guardar datos del QR
            registrationData.qrCode = qrCode;

            // Pre-llenar el formulario de registro con datos del solicitante
            document.getElementById('regFullName').value = result.fullName || '';
            document.getElementById('regPhone').value = result.phone || '';
            document.getElementById('regEmail').value = result.email || '';

            // Mostrar tab de registro
            showAuthTab('register');
        } else {
            errorDiv.textContent = result.message || 'Código QR inválido o expirado';
            errorDiv.classList.remove('hidden');
        }
    } catch(error) {
        errorDiv.textContent = 'Error de conexión: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

// ============================================
// NIVEL 3: REGISTRO COMPLETO
// ============================================

// --- Funciones para Foto de Rostro ---

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
        facePhotoBlob = blob;
        const url = URL.createObjectURL(blob);
        
        document.getElementById('facePhotoImg').src = url;
        document.getElementById('facePhotoPreview').classList.remove('hidden');
        document.getElementById('facePhotoCapture').classList.add('hidden');
        
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
        
        facePhotoBlob = file;
        const url = URL.createObjectURL(file);
        
        document.getElementById('facePhotoImg').src = url;
        document.getElementById('facePhotoPreview').classList.remove('hidden');
        document.getElementById('facePhotoCapture').classList.add('hidden');
    }
}

function removeFacePhoto() {
    facePhotoBlob = null;
    document.getElementById('facePhotoImg').src = '';
    document.getElementById('facePhotoPreview').classList.add('hidden');
    document.getElementById('facePhotoCapture').classList.remove('hidden');
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

// --- Funciones para Foto del Vehículo ---

function handleVehiclePhotoUpload() {
    const input = document.getElementById('vehicleFileInput');
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
        
        vehiclePhotoBlob = file;
        const url = URL.createObjectURL(file);
        
        document.getElementById('vehiclePhotoImg').src = url;
        document.getElementById('vehiclePhotoPreview').classList.remove('hidden');
        document.getElementById('vehiclePhotoCapture').classList.add('hidden');
    }
}

function removeVehiclePhoto() {
    vehiclePhotoBlob = null;
    document.getElementById('vehiclePhotoImg').src = '';
    document.getElementById('vehiclePhotoPreview').classList.add('hidden');
    document.getElementById('vehiclePhotoCapture').classList.remove('hidden');
    document.getElementById('vehicleFileInput').value = '';
}

// --- Funciones para Documentos ---

function handleDocUpload(docType) {
    let inputId, previewDivId, captureDiv, nameDivId;
    
    switch(docType) {
        case 'id':
            inputId = 'idDocInput';
            previewDivId = 'idDocPreview';
            captureDiv = 'idDocCapture';
            nameDivId = 'idDocName';
            break;
        case 'license':
            inputId = 'licenseDocInput';
            previewDivId = 'licenseDocPreview';
            captureDiv = 'licenseDocCapture';
            nameDivId = 'licenseDocName';
            break;
        case 'address':
            inputId = 'addressDocInput';
            previewDivId = 'addressDocPreview';
            captureDiv = 'addressDocCapture';
            nameDivId = 'addressDocName';
            break;
    }

    const input = document.getElementById(inputId);
    if(input.files.length > 0) {
        const file = input.files[0];
        
        // Validar tipo
        const validTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if(!validTypes.includes(file.type)) {
            alert('Por favor sube un PDF o imagen válida');
            return;
        }
        
        // Validar tamaño
        if(file.size > 10 * 1024 * 1024) {
            alert('El archivo es muy grande. Máximo 10MB');
            return;
        }
        
        uploadedDocuments[docType] = file;
        
        document.getElementById(nameDivId).innerHTML = `
            <i class="fas fa-file"></i> <strong>${file.name}</strong><br>
            <small>${(file.size / 1024).toFixed(2)} KB</small>
        `;
        document.getElementById(previewDivId).classList.remove('hidden');
        document.getElementById(captureDiv).classList.add('hidden');
    }
}

function removeIdDoc() {
    uploadedDocuments.id = null;
    document.getElementById('idDocPreview').classList.add('hidden');
    document.getElementById('idDocCapture').classList.remove('hidden');
    document.getElementById('idDocInput').value = '';
}

function removeLicenseDoc() {
    uploadedDocuments.license = null;
    document.getElementById('licenseDocPreview').classList.add('hidden');
    document.getElementById('licenseDocCapture').classList.remove('hidden');
    document.getElementById('licenseDocInput').value = '';
}

function removeAddressDoc() {
    uploadedDocuments.address = null;
    document.getElementById('addressDocPreview').classList.add('hidden');
    document.getElementById('addressDocCapture').classList.remove('hidden');
    document.getElementById('addressDocInput').value = '';
}

// --- Función Principal de Registro Completo ---

async function completeRegistration() {
    const fullName = document.getElementById('regFullName').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const vehicleType = document.getElementById('vehicleType').value.trim();
    const licensePlate = document.getElementById('licensePlate').value.trim();
    const errorDiv = document.getElementById('registerError');
    const successDiv = document.getElementById('registerSuccess');

    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    // Validaciones
    if(!vehicleType) {
        errorDiv.textContent = 'Por favor selecciona un tipo de vehículo';
        errorDiv.classList.remove('hidden');
        return;
    }

    if(!licensePlate) {
        errorDiv.textContent = 'Por favor ingresa el número de placa';
        errorDiv.classList.remove('hidden');
        return;
    }

    if(!vehiclePhotoBlob) {
        errorDiv.textContent = 'Por favor carga una foto del vehículo / licencia';
        errorDiv.classList.remove('hidden');
        return;
    }

    if(!uploadedDocuments.id) {
        errorDiv.textContent = 'Por favor carga tu documento de identidad';
        errorDiv.classList.remove('hidden');
        return;
    }

    if(!uploadedDocuments.license) {
        errorDiv.textContent = 'Por favor carga tu licencia de conducir';
        errorDiv.classList.remove('hidden');
        return;
    }

    if(!uploadedDocuments.address) {
        errorDiv.textContent = 'Por favor carga un comprobante de domicilio';
        errorDiv.classList.remove('hidden');
        return;
    }

    if(!facePhotoBlob) {
        errorDiv.textContent = 'Por favor toma o carga una foto de tu rostro';
        errorDiv.classList.remove('hidden');
        return;
    }

    showLoading(true);

    try {
        console.log('=== INICIANDO REGISTRO COMPLETO ===');

        // Crear FormData para enviar archivos
        const formData = new FormData();
        formData.append('action', 'completeDeliveryRegistration');
        formData.append('qrCode', registrationData.qrCode || '');
        formData.append('fullName', fullName);
        formData.append('phone', phone);
        formData.append('email', email);
        formData.append('vehicleType', vehicleType);
        formData.append('licensePlate', licensePlate);
        formData.append('timestamp', new Date().toISOString());

        // Agregar archivos
        formData.append('vehiclePhoto', vehiclePhotoBlob);
        formData.append('facePhoto', facePhotoBlob);
        formData.append('idDocument', uploadedDocuments.id);
        formData.append('licenseDocument', uploadedDocuments.license);
        formData.append('addressDocument', uploadedDocuments.address);

        // Enviar a Google Apps Script
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if(result.success) {
            // Mostrar instrucciones para la siguiente fase
            successDiv.innerHTML = `
                <strong>✅ Documentos enviados exitosamente</strong><br>
                <small>
                    Tu información y documentos han sido recibidos.<br>
                    El administrador revisará tu solicitud (puede tomar 24-48 horas).<br>
                    Una vez aprobado, recibirás tu usuario y contraseña por correo.<br>
                    <strong>Correo de contacto: ${email}</strong>
                </small>
            `;
            successDiv.classList.remove('hidden');

            // Limpiar formulario después de 5 segundos
            setTimeout(() => {
                resetRegistrationForm();
                showAuthTab('login');
            }, 5000);
        } else {
            errorDiv.textContent = result.message || 'Error al completar el registro';
            errorDiv.classList.remove('hidden');
        }
    } catch(error) {
        console.error('Error:', error);
        errorDiv.textContent = 'Error de conexión: ' + error.message;
        errorDiv.classList.remove('hidden');
    } finally {
        showLoading(false);
    }
}

function resetRegistrationForm() {
    // Limpiar datos de registro
    registrationData = {
        fullName: null,
        phone: null,
        email: null,
        motivation: null,
        qrCode: null
    };

    // Limpiar formulario
    document.getElementById('regFullName').value = '';
    document.getElementById('regPhone').value = '';
    document.getElementById('regEmail').value = '';
    document.getElementById('vehicleType').value = '';
    document.getElementById('licensePlate').value = '';

    // Limpiar fotos y documentos
    removeFacePhoto();
    removeVehiclePhoto();
    removeIdDoc();
    removeLicenseDoc();
    removeAddressDoc();

    uploadedDocuments = { id: null, license: null, address: null };
    facePhotoBlob = null;
    vehiclePhotoBlob = null;
}

// ============================================
// MANEJO DE SESIÓN
// ============================================

function logout() {
    localStorage.removeItem('currentUser');
    location.reload();
}

// Verificar autenticación al cargar
function checkDeliveryAuth() {
    const userStr = localStorage.getItem('currentUser');
    if(userStr) {
        const user = JSON.parse(userStr);
        if(user.role === 'delivery') {
            currentUser = user;
            document.getElementById('loginSection').classList.add('hidden');
            document.getElementById('deliveryPanel').classList.remove('hidden');
            document.getElementById('currentUserName').textContent = user.name || user.username;
            loadDeliveries();
            return;
        }
    }
    
    // Mostrar login
    document.getElementById('loginSection').classList.remove('hidden');
    document.getElementById('deliveryPanel').classList.add('hidden');
}

// ============================================
// FUNCIONES DE ENTREGAS
// ============================================

async function loadDeliveries() {
    if(!currentUser) return;
    
    showLoading(true);

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'getDeliveries',
                username: currentUser.username
            })
        });

        const result = await response.json();

        if(result.success) {
            allDeliveries = result.orders || [];
            filterDeliveries('ready');
        }
    } catch(error) {
        console.error('Error:', error);
        alert('Error al cargar entregas: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function filterDeliveries(filter) {
    let filtered = allDeliveries;

    if(filter === 'ready') {
        filtered = allDeliveries.filter(d => d.status === 'ready');
    } else if(filter === 'mytaken') {
        filtered = allDeliveries.filter(d => d.deliveryPerson === currentUser.username && 
                                            ['delivering', 'assigned'].includes(d.status));
    } else if(filter === 'completed') {
        filtered = allDeliveries.filter(d => isDeliveredToday(d));
    }

    renderDeliveries(filtered);
}

function renderDeliveries(deliveries) {
    const listDiv = document.getElementById('deliveriesList');

    if(!deliveries || deliveries.length === 0) {
        listDiv.innerHTML = '<div class="alert alert-info"><i class="fas fa-info-circle"></i> No hay entregas disponibles</div>';
        return;
    }

    let html = '<div style="display: grid; gap: 15px;">';

    deliveries.forEach(delivery => {
        const status = getStatusText(delivery.status);
        const statusColor = getStatusColor(delivery.status);

        html += `
            <div class="card" style="border-left: 5px solid ${statusColor}; padding: 20px; cursor: pointer;"
                 onclick="openDelivery('${delivery.folio}')">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div>
                        <h4 style="margin: 0; color: #333;">
                            <i class="fas fa-box"></i> Pedido #${delivery.folio}
                        </h4>
                        <p style="margin: 5px 0; color: #666;">
                            <strong>${delivery.client.name}</strong>
                        </p>
                        <p style="margin: 5px 0; color: #999; font-size: 0.9em;">
                            ${delivery.client.phone}
                        </p>
                        <p style="margin: 5px 0; color: #666; font-size: 0.9em;">
                            📍 ${delivery.address.street}, ${delivery.address.colony}
                        </p>
                    </div>
                    <div style="text-align: right;">
                        <span class="status-badge" style="background-color: ${statusColor}20; color: ${statusColor}; padding: 8px 12px; border-radius: 20px; font-size: 0.85em;">
                            ${status}
                        </span>
                        <p style="margin: 10px 0 0 0; color: #999; font-size: 0.85em;">
                            ${formatDate(delivery.createdAt)}
                        </p>
                    </div>
                </div>
            </div>
        `;
    });

    html += '</div>';
    listDiv.innerHTML = html;
}

function openDelivery(folio) {
    const delivery = allDeliveries.find(d => d.folio === folio);
    if(!delivery) return;

    activeDelivery = delivery;

    const html = `
        <div style="padding: 20px; background: #f9f9f9;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
                <div>
                    <h5 style="margin-bottom: 10px;">📦 Detalles del Pedido</h5>
                    <p><strong>Folio:</strong> ${delivery.folio}</p>
                    <p><strong>Estado:</strong> ${getStatusText(delivery.status)}</p>
                    <p><strong>Fecha:</strong> ${formatDate(delivery.createdAt)}</p>
                </div>
                <div>
                    <h5 style="margin-bottom: 10px;">👤 Información del Cliente</h5>
                    <p><strong>Nombre:</strong> ${delivery.client.name}</p>
                    <p><strong>Teléfono:</strong> ${delivery.client.phone}</p>
                    <p><strong>Email:</strong> ${delivery.client.email || 'N/A'}</p>
                </div>
            </div>

            <div style="padding: 15px; background: white; border-radius: 8px; margin-bottom: 20px;">
                <h5 style="margin-bottom: 10px;">📍 Dirección de Entrega</h5>
                <p><strong>${delivery.address.street}</strong></p>
                <p>${delivery.address.colony}, ${delivery.address.city}</p>
                <p>CP: ${delivery.address.postalCode}</p>
                ${delivery.address.referencePoint ? `<p><small>Referencia: ${delivery.address.referencePoint}</small></p>` : ''}
            </div>

            <div style="padding: 15px; background: white; border-radius: 8px;">
                <h5 style="margin-bottom: 10px;">📋 Detalles de Impresión</h5>
                <table style="width: 100%; font-size: 0.9em;">
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 8px 0;"><strong>Descripción:</strong></td>
                        <td style="text-align: right;">${delivery.description}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 8px 0;"><strong>Cantidad:</strong></td>
                        <td style="text-align: right;">${delivery.quantity}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #eee;">
                        <td style="padding: 8px 0;"><strong>Total:</strong></td>
                        <td style="text-align: right;"><strong>$${parseFloat(delivery.total).toFixed(2)}</strong></td>
                    </tr>
                </table>
            </div>
        </div>
    `;

    document.getElementById('deliveryInfo').innerHTML = html;

    // Inicializar mapa
    setTimeout(() => {
        initDeliveryMap(delivery);
    }, 500);

    document.getElementById('activeDeliveryModal').classList.add('active');

    // Iniciar GPS si es necesario
    if(delivery.status === 'ready' || delivery.status === 'assigned') {
        // Pedir permiso para tomar la entrega
        if(confirm('¿Deseas aceptar esta entrega?')) {
            acceptDelivery(folio);
        }
    }
}

async function acceptDelivery(folio) {
    showLoading(true);

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'acceptDelivery',
                folio: folio,
                deliveryPerson: currentUser.username,
                timestamp: new Date().toISOString()
            })
        });

        const result = await response.json();

        if(result.success) {
            activeDelivery.status = 'delivering';
            activeDelivery.deliveryPerson = currentUser.username;

            // Iniciar GPS
            startGPS(activeDelivery);

            alert('✅ Entrega aceptada. Navega hacia el destino.');
        } else {
            alert('Error: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function startGPS(delivery) {
    if('geolocation' in navigator) {
        gpsWatchId = navigator.geolocation.watchPosition(
            function(position) {
                currentLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy
                };

                // Actualizar marcador en el mapa
                if(deliveryMarker && deliveryMap) {
                    deliveryMarker.setLatLng([
                        currentLocation.latitude,
                        currentLocation.longitude
                    ]);
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
        `<strong>Destino: ${order.client.name}</strong><br>
        ${address.street}, ${address.colony}`
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

function getStatusColor(status) {
    const colors = {
        'new': '#667eea',
        'assigned': '#FFA500',
        'processing': '#FFC107',
        'ready': '#28a745',
        'delivering': '#17a2b8',
        'delivered': '#6c757d'
    };
    return colors[status] || '#667eea';
}

// ============================================
// INICIALIZACIÓN AL CARGAR
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    checkDeliveryAuth();
    initGeolocation();
});

window.addEventListener('beforeunload', function() {
    stopCamera();
    if(gpsWatchId) {
        navigator.geolocation.clearWatch(gpsWatchId);
    }
    if(deliveryMap) {
        deliveryMap.remove();
    }
});


