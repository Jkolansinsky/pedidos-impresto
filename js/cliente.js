// ============================================
// VARIABLES GLOBALES
// ============================================

let currentClient = {};
let currentService = '';
let currentBranch = '';
let cart = [];
let currentFile = null;
let currentProof = null;
let prices = {};
let branches = [];
let currentOrder = null;
let uploadedFiles = []; // Para almacenar archivos con sus IDs de Drive
let deliveryPersonData = null; // Datos del repartidor

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    loadBranches();
    loadPrices();
});

// ============================================
// NAVEGACIÓN
// ============================================

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    
    document.getElementById(tabName + '-tab').classList.add('active');
    event.target.classList.add('active');
}

// ============================================
// FLUJO CLIENTE
// ============================================

function saveClientInfo() {
    const name = document.getElementById('clientName').value.trim();
    const phone = document.getElementById('clientPhone').value.trim();
    const email = document.getElementById('clientEmail').value.trim();

    if(!name || !phone) {
        alert('Por favor completa nombre y teléfono');
        return;
    }

    currentClient = { name, phone, email };
    document.getElementById('client-info-step').classList.add('hidden');
    document.getElementById('service-type-step').classList.remove('hidden');
}

function selectService(type) {
    currentService = type;
    document.querySelectorAll('.service-card').forEach(c => c.classList.remove('selected'));
    event.target.closest('.service-card').classList.add('selected');

    document.getElementById('service-type-step').classList.add('hidden');
    
    if(type === 'pickup') {
        document.getElementById('branch-selection-step').classList.remove('hidden');
    } else {
        document.getElementById('delivery-address-step').classList.remove('hidden');
    }
}

function backToServiceType() {
    document.getElementById('branch-selection-step').classList.add('hidden');
    document.getElementById('delivery-address-step').classList.add('hidden');
    document.getElementById('service-type-step').classList.remove('hidden');
    currentService = '';
}

async function confirmBranch() {
    const branch = document.getElementById('branchSelect').value;
    if(!branch) {
        alert('Selecciona una sucursal');
        return;
    }
    currentBranch = branch;

    // Intentar capturar la ubicación del cliente (opcional, para mostrarla
    // junto a la sucursal en el mapa de rastreo). Si no da permiso o falla,
    // seguimos sin problema — simplemente no se mostrará su ubicación.
    try {
        const position = await getClientGeolocation();
        currentClient.address = {
            latitude: position.latitude,
            longitude: position.longitude
        };
        console.log('✅ Ubicación del cliente capturada para pick-up:', currentClient.address);
    } catch(error) {
        console.log('No se pudo obtener la ubicación del cliente (opcional):', error.message);
    }

    document.getElementById('branch-selection-step').classList.add('hidden');
    document.getElementById('work-config-step').classList.remove('hidden');
}

function getClientGeolocation() {
    return new Promise((resolve, reject) => {
        if(!navigator.geolocation) {
            reject(new Error('Geolocalización no soportada por el navegador'));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
            (err) => reject(new Error(err.message)),
            { timeout: 8000, maximumAge: 60000 }
        );
    });
}

async function confirmAddress() {
    const street = document.getElementById('deliveryStreet').value.trim();
    const colony = document.getElementById('deliveryColony').value.trim();
    const city = document.getElementById('deliveryCity').value.trim();

    if(!street || !colony || !city) {
        alert('Completa la dirección de entrega');
        return;
    }

    // Geocodificar la dirección
    showLoading(true);
    const fullAddress = `${street}, ${colony}, ${city}, Tabasco, México`;
    
    console.log('=== GEOCODIFICANDO DIRECCIÓN ===');
    console.log('Dirección completa:', fullAddress);
    
    const coords = await geocodeAddress(fullAddress);
    
    console.log('Coordenadas iniciales obtenidas:', coords);
    
    showLoading(false);

    // Mostrar mapa de confirmación para que el usuario verifique/ajuste la ubicación
    const confirmedCoords = await showAddressConfirmationMap(fullAddress, coords);
    
    if(!confirmedCoords) {
        // Usuario canceló, permitir corregir la dirección
        console.log('Usuario decidió corregir la dirección');
        return;
    }
    
    console.log('Coordenadas finales confirmadas:', confirmedCoords);

    currentClient.address = {
        street,
        colony,
        city,
        zip: document.getElementById('deliveryZip').value,
        references: document.getElementById('deliveryReferences').value,
        latitude: confirmedCoords.latitude,
        longitude: confirmedCoords.longitude
    };
    
    console.log('✅ Dirección guardada en currentClient:', currentClient.address);

    document.getElementById('delivery-address-step').classList.add('hidden');
    document.getElementById('work-config-step').classList.remove('hidden');
}

// ============================================
// MAPA DE VERIFICACIÓN DE DIRECCIÓN
// ============================================

let confirmAddressMap = null;
let confirmAddressMarker = null;
let tempCoords = null;

async function showAddressConfirmationMap(address, coords) {
    return new Promise((resolve) => {
        // Crear modal de confirmación
        const modalHTML = `
            <div id="addressConfirmModal" class="modal active">
                <div class="modal-content" style="max-width: 700px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-map-marked-alt"></i> Confirma tu ubicación</h3>
                    </div>
                    <div style="padding: 20px;">
                        <p style="margin-bottom: 15px;">
                            <strong>Dirección ingresada:</strong><br>
                            ${address}
                        </p>
                        <p style="margin-bottom: 15px; color: #666;">
                            Verifica que el marcador esté en la ubicación correcta de tu domicilio:
                        </p>
                        <div id="confirmAddressMap" style="height: 400px; border-radius: 8px; border: 2px solid #667eea; margin-bottom: 20px;"></div>
                        <p style="font-size: 0.9em; color: #666; margin-bottom: 20px;">
                            <i class="fas fa-info-circle"></i> 
                            Si el marcador no está en tu ubicación exacta, puedes arrastrarlo al lugar correcto.
                        </p>
                        <div style="display: flex; gap: 10px; justify-content: flex-end;">
                            <button class="btn btn-secondary" onclick="cancelAddressConfirm()">
                                <i class="fas fa-times"></i> Corregir Dirección
                            </button>
                            <button class="btn btn-success" onclick="acceptAddressConfirm()">
                                <i class="fas fa-check"></i> Confirmar Ubicación
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Agregar modal al body
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Guardar coordenadas temporales
        tempCoords = { ...coords };
        
        // Inicializar mapa después de un pequeño delay
        setTimeout(() => {
            confirmAddressMap = L.map('confirmAddressMap').setView([coords.latitude, coords.longitude], 16);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(confirmAddressMap);
            
            // Marcador draggable (se puede mover)
            confirmAddressMarker = L.marker([coords.latitude, coords.longitude], {
                draggable: true,
                icon: L.divIcon({
                    className: 'custom-div-icon',
                    html: '<div style="background-color:#dc3545;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 4px 10px rgba(0,0,0,0.3);"><i class="fas fa-home" style="color:white;font-size:20px;"></i></div>',
                    iconSize: [40, 40],
                    iconAnchor: [20, 40]
                })
            }).addTo(confirmAddressMap);
            
            confirmAddressMarker.bindPopup('Arrastra el marcador a tu ubicación exacta').openPopup();
            
            // Actualizar coordenadas cuando se mueva el marcador
            confirmAddressMarker.on('dragend', function(e) {
                const position = e.target.getLatLng();
                tempCoords.latitude = position.lat;
                tempCoords.longitude = position.lng;
                console.log('📍 Nueva ubicación seleccionada:', tempCoords);
            });
            
            // Definir funciones globales para los botones
            window.acceptAddressConfirm = () => {
                console.log('✅ Ubicación confirmada:', tempCoords);
                cleanupAddressConfirmModal();
                resolve(tempCoords);
            };
            
            window.cancelAddressConfirm = () => {
                console.log('❌ Usuario canceló confirmación de ubicación');
                cleanupAddressConfirmModal();
                resolve(null);
            };
            
        }, 300);
    });
}

function cleanupAddressConfirmModal() {
    if(confirmAddressMap) {
        confirmAddressMap.remove();
        confirmAddressMap = null;
    }
    confirmAddressMarker = null;
    
    const modal = document.getElementById('addressConfirmModal');
    if(modal) {
        modal.remove();
    }
    
    delete window.acceptAddressConfirm;
    delete window.cancelAddressConfirm;
}

  

// ============================================
// CONFIGURACIÓN DE TRABAJO
// ============================================

function updatePrintOptions() {
    const printType = document.getElementById('printType').value;
    
    document.getElementById('vinilOptions').classList.add('hidden');
    document.getElementById('standardOptions').classList.add('hidden');
    document.getElementById('urgencyOptions').classList.add('hidden');
    document.getElementById('finishingOptions').classList.add('hidden');

    if(printType === 'VINIL') {
        document.getElementById('vinilOptions').classList.remove('hidden');
        document.getElementById('urgencyOptions').classList.remove('hidden');
    } else if(printType === 'LONAS') {
        document.getElementById('urgencyOptions').classList.remove('hidden');
    } else if(printType) {
        document.getElementById('standardOptions').classList.remove('hidden');
        document.getElementById('finishingOptions').classList.remove('hidden');
    }

    calculateWorkPrice();
}

function handleFileSelect() {
    const input = document.getElementById('fileInput');
    if(input.files.length > 0) {
        currentFile = input.files[0];
        
        if(currentFile.size > 50 * 1024 * 1024) {
            alert('El archivo es muy grande. Máximo 50MB');
            currentFile = null;
            input.value = '';
            return;
        }

        document.getElementById('fileName').textContent = currentFile.name;
        document.getElementById('removeFileBtn').classList.remove('hidden');
        calculateWorkPrice();
    }
}

function removeFile() {
    currentFile = null;
    document.getElementById('fileInput').value = '';
    document.getElementById('fileName').textContent = 'Haz clic para subir tu archivo';
    document.getElementById('removeFileBtn').classList.add('hidden');
    calculateWorkPrice();
}

function calculateWorkPrice() {
    const printType = document.getElementById('printType').value;
    const copies = parseInt(document.getElementById('copies').value) || 1;

    if(!printType || !currentFile) {
        document.getElementById('workPrice').classList.add('hidden');
        return;
    }

    let basePrice = 0;
    let priceKey = printType;

    if(printType === 'VINIL') {
        const vinilType = document.getElementById('vinilType').value;
        priceKey += '_' + vinilType;
    } else if(printType !== 'LONAS') {
        const color = document.getElementById('colorOption').value;
        const paperType = document.getElementById('paperType').value;
        priceKey += '_' + color + '_' + paperType;
    }

    basePrice = prices[priceKey] || 1.00;
    
    const finishingSelect = document.getElementById('finishing');
    if(finishingSelect && !finishingSelect.classList.contains('hidden')) {
        const selectedFinishing = Array.from(finishingSelect.selectedOptions).map(o => o.value);
        selectedFinishing.forEach(f => {
            basePrice += (prices['ACABADO_' + f] || 0);
        });
    }

    const totalPrice = basePrice * copies;
    document.getElementById('currentWorkPrice').textContent = '$' + totalPrice.toFixed(2);
    document.getElementById('workPrice').classList.remove('hidden');
}

// ============================================
// SUBIR ARCHIVO A GOOGLE DRIVE
// ============================================

async function uploadFileToDrive(file, folio, index) {
    try {
        const reader = new FileReader();
        
        return new Promise((resolve, reject) => {
            reader.onload = async function(e) {
                const base64Data = e.target.result.split(',')[1];
                
                const uploadData = {
                    action: 'uploadFileToDrive',
                    fileName: file.name,
                    fileData: base64Data,
                    mimeType: file.type,
                    folio: folio,
                    fileIndex: index
                };
                
                try {
                    const response = await fetch(SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify(uploadData)
                    });
                    
                    const result = await response.json();
                    
                    if(result.success) {
                        resolve({
                            fileId: result.fileId,
                            fileUrl: result.fileUrl,
                            fileName: file.name
                        });
                    } else {
                        reject(new Error('Error al subir archivo: ' + result.message));
                    }
                } catch(error) {
                    reject(error);
                }
            };
            
            reader.onerror = function() {
                reject(new Error('Error al leer el archivo'));
            };
            
            reader.readAsDataURL(file);
        });
    } catch(error) {
        throw error;
    }
}

async function uploadPaymentProof(file, folio) {
    try {
        const reader = new FileReader();
        
        return new Promise((resolve, reject) => {
            reader.onload = async function(e) {
                const base64Data = e.target.result.split(',')[1];
                
                const uploadData = {
                    action: 'uploadPaymentProof',
                    fileName: file.name,
                    fileData: base64Data,
                    mimeType: file.type,
                    folio: folio
                };
                
                try {
                    const response = await fetch(SCRIPT_URL, {
                        method: 'POST',
                        body: JSON.stringify(uploadData)
                    });
                    
                    const result = await response.json();
                    
                    if(result.success) {
                        resolve({
                            fileId: result.fileId,
                            fileUrl: result.fileUrl,
                            fileName: result.fileName
                        });
                    } else {
                        reject(new Error('Error al subir comprobante: ' + result.message));
                    }
                } catch(error) {
                    reject(error);
                }
            };
            
            reader.onerror = function() {
                reject(new Error('Error al leer el archivo'));
            };
            
            reader.readAsDataURL(file);
        });
    } catch(error) {
        throw error;
    }
}

// ============================================
// CARRITO
// ============================================

async function addToCart() {
    const printType = document.getElementById('printType').value;
    const copies = parseInt(document.getElementById('copies').value) || 1;
    const observations = document.getElementById('workObservations').value;

    if(!printType || !currentFile) {
        alert('Completa todos los campos obligatorios');
        return;
    }

    const work = {
        fileName: currentFile.name,
        fileData: currentFile,
        printType: printType,
        copies: copies,
        observations: observations,
        price: parseFloat(document.getElementById('currentWorkPrice').textContent.replace('$', ''))
    };

    if(printType === 'VINIL') {
        work.vinilType = document.getElementById('vinilType').value;
        work.urgency = document.getElementById('urgencyMode').value;
    } else if(printType === 'LONAS') {
        work.urgency = document.getElementById('urgencyMode').value;
    } else {
        work.color = document.getElementById('colorOption').value;
        work.paperType = document.getElementById('paperType').value;
        const finishingSelect = document.getElementById('finishing');
        work.finishing = Array.from(finishingSelect.selectedOptions).map(o => o.value);
    }

    cart.push(work);
    alert('Trabajo agregado al carrito');
    resetWorkForm();
    showCart();
}

function addAnotherWork() {
    const printType = document.getElementById('printType').value;
    if(!printType || !currentFile) {
        alert('Completa el trabajo actual antes de agregar otro');
        return;
    }
    addToCart();
}

function resetWorkForm() {
    document.getElementById('printType').value = '';
    document.getElementById('copies').value = '1';
    document.getElementById('workObservations').value = '';
    removeFile();
    document.getElementById('workPrice').classList.add('hidden');
    updatePrintOptions();
}

function backToWork() {
    document.getElementById('cart-step').classList.add('hidden');
    document.getElementById('work-config-step').classList.remove('hidden');
}

function showCart() {
    document.getElementById('work-config-step').classList.add('hidden');
    document.getElementById('cart-step').classList.remove('hidden');
    
    const cartItems = document.getElementById('cartItems');
    cartItems.innerHTML = '';

    let subtotal = 0;
    cart.forEach((work, index) => {
        subtotal += work.price;
        const item = document.createElement('div');
        item.className = 'cart-item';
        item.innerHTML = `
            <div class="cart-item-header">
                <strong>${work.fileName}</strong>
                <button class="btn btn-danger" onclick="removeFromCart(${index})" style="padding: 5px 10px;">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="cart-item-details">Cantidad: ${work.copies} copias</div>
            <div class="cart-item-details">Tipo: ${work.printType}</div>
            ${work.color ? `<div class="cart-item-details">Color: ${work.color} | Papel: ${work.paperType}</div>` : ''}
            ${work.vinilType ? `<div class="cart-item-details">Vinil: ${work.vinilType}</div>` : ''}
            ${work.finishing && work.finishing.length > 0 ? `<div class="cart-item-details">Acabado: ${work.finishing.join(', ')}</div>` : ''}
            <div class="cart-item-details"><strong>Precio: $${work.price.toFixed(2)}</strong></div>
        `;
        cartItems.appendChild(item);
    });

    document.getElementById('subtotal').textContent = subtotal.toFixed(2);
    
    let deliveryCost = 0;
    if(currentService === 'delivery') {
        deliveryCost = parseFloat(prices.DELIVERY_FEE || 50);
        document.getElementById('deliveryCostLine').classList.remove('hidden');
        document.getElementById('deliveryCost').textContent = deliveryCost.toFixed(2);
    } else {
        document.getElementById('deliveryCostLine').classList.add('hidden');
    }

    const total = subtotal + deliveryCost;
    document.getElementById('total').textContent = total.toFixed(2);

    updatePaymentInfo();
}

function removeFromCart(index) {
    cart.splice(index, 1);
    if(cart.length === 0) {
        backToWork();
    } else {
        showCart();
    }
}

// ============================================
// PAGO Y ENVÍO
// ============================================

function updatePaymentInfo() {
    const method = document.getElementById('paymentMethod').value;
    const total = parseFloat(document.getElementById('total').textContent);

    if(method === 'EFECTIVO' && currentService === 'delivery') {
        alert('Para entrega a domicilio el pago debe ser por transferencia');
        document.getElementById('paymentMethod').value = 'TRANSFERENCIA';
        return;
    }

    if(method === 'EFECTIVO' && total > 50) {
        alert('Para pedidos mayores a $50 el pago debe ser por transferencia');
        document.getElementById('paymentMethod').value = 'TRANSFERENCIA';
        return;
    }

    if(method === 'TRANSFERENCIA') {
        document.getElementById('transferInfo').classList.remove('hidden');
        document.getElementById('uploadProof').classList.remove('hidden');
        
        const branch = branches.find(b => b.name === currentBranch) || branches[0];
        document.getElementById('bankDetails').innerHTML = branch ? branch.bankData.replace(/\n/g, '<br>') : 'Cargando...';
    } else {
        document.getElementById('transferInfo').classList.add('hidden');
        document.getElementById('uploadProof').classList.add('hidden');
        document.getElementById('submitOrderBtn').disabled = false;
    }
}

function handleProofUpload() {
    const input = document.getElementById('proofInput');
    if(input.files.length > 0) {
        currentProof = input.files[0];
        document.getElementById('submitOrderBtn').disabled = false;
    }
}

async function submitOrder() {
    if(cart.length === 0) {
        alert('El carrito está vacío');
        return;
    }

    const method = document.getElementById('paymentMethod').value;
    if(method === 'TRANSFERENCIA' && !currentProof) {
        alert('Debes subir el comprobante de pago');
        return;
    }

    showLoading(true);

    try {
        const folio = 'ORD-' + new Date().toISOString().split('T')[0].replace(/-/g, '') + '-' + Math.random().toString(36).substr(2, 9).toUpperCase();
        
        // Subir archivos a Google Drive
        uploadedFiles = [];
        for(let i = 0; i < cart.length; i++) {
            const work = cart[i];
            try {
                const fileInfo = await uploadFileToDrive(work.fileData, folio, i);
                uploadedFiles.push(fileInfo);
            } catch(error) {
                console.error('Error subiendo archivo:', error);
                alert('Error al subir archivo: ' + work.fileName);
                showLoading(false);
                return;
            }
        }
        
        // Subir comprobante de pago si existe
        let proofFileInfo = null;
        if(currentProof) {
            try {
                proofFileInfo = await uploadPaymentProof(currentProof, folio);
            } catch(error) {
                console.error('Error subiendo comprobante:', error);
            }
        }
        console.log('=== DATOS DEL CLIENTE ANTES DE ENVIAR ===');
        console.log('currentClient completo:', currentClient);
        console.log('currentClient.address:', currentClient.address);
   if(currentClient.address) {
        console.log('Latitude:', currentClient.address.latitude, 'Tipo:', typeof currentClient.address.latitude);
        console.log('Longitude:', currentClient.address.longitude, 'Tipo:', typeof currentClient.address.longitude);
  }
        
        const orderData = {
            action: 'createOrder',
            folio: folio,
            client: currentClient,
            serviceType: currentService,
            branch: currentBranch,
            works: cart.map((w, idx) => ({
                fileName: w.fileName,
                printType: w.printType,
                copies: w.copies,
                color: w.color,
                paperType: w.paperType,
                vinilType: w.vinilType,
                finishing: w.finishing,
                urgency: w.urgency,
                observations: w.observations,
                price: w.price,
                fileId: uploadedFiles[idx].fileId,
                fileUrl: uploadedFiles[idx].fileUrl
            })),
            paymentMethod: method,
            subtotal: parseFloat(document.getElementById('subtotal').textContent),
            deliveryCost: currentService === 'delivery' ? parseFloat(document.getElementById('deliveryCost').textContent) : 0,
            total: parseFloat(document.getElementById('total').textContent),
            status: 'new',
            date: new Date().toISOString(),
            proofFileId: proofFileInfo ? proofFileInfo.fileId : null,
            proofFileUrl: proofFileInfo ? proofFileInfo.fileUrl : null
        };

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(orderData)
        });

        const result = await response.json();
        
        if(result.success) {
            showTicket(orderData);
        } else {
            alert('Error al crear pedido: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// ============================================
// TICKET
// ============================================

function showTicket(order) {
    const content = document.getElementById('ticketContent');
    content.innerHTML = `
        <div style="font-family: 'Courier New', monospace; background: white; padding: 20px; border: 2px solid #333;">
            <div style="text-align: center; border-bottom: 2px dashed #333; padding-bottom: 15px; margin-bottom: 15px;">
                <h2>CENTRO DE COPIADO</h2>
                <p>Ticket de Pedido</p>
            </div>
            <p><strong>Folio:</strong> ${order.folio}</p>
            <p><strong>Fecha:</strong> ${formatDate(order.date)}</p>
            <p><strong>Cliente:</strong> ${order.client.name}</p>
            <p><strong>Teléfono:</strong> ${order.client.phone}</p>
            <p><strong>Email:</strong> ${order.client.email || 'N/A'}</p>
            <p><strong>Servicio:</strong> ${order.serviceType === 'pickup' ? 'Pick-up en ' + order.branch : 'Entrega a Domicilio'}</p>
            <hr style="border: 1px dashed #333; margin: 15px 0;">
            <h4>Trabajos:</h4>
            ${order.works.map((w, idx) => `
                <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed #999;">
                    <p><strong>${idx + 1}. ${w.fileName}</strong></p>
                    <p>Cantidad: ${w.copies} copias | Tipo: ${w.printType}</p>
                    ${w.color ? `<p>Color: ${w.color} | Papel: ${w.paperType}</p>` : ''}
                    ${w.vinilType ? `<p>Vinil: ${w.vinilType}</p>` : ''}
                    ${w.finishing && w.finishing.length > 0 ? `<p>Acabado: ${w.finishing.join(', ')}</p>` : ''}
                    ${w.observations ? `<p>Obs: ${w.observations}</p>` : ''}
                    <p style="text-align: right;"><strong>$${w.price.toFixed(2)}</strong></p>
                </div>
            `).join('')}
            <hr style="border: 1px dashed #333; margin: 15px 0;">
            <p><strong>Subtotal:</strong> $${order.subtotal.toFixed(2)}</p>
            ${order.deliveryCost > 0 ? `<p><strong>Entrega:</strong> $${order.deliveryCost.toFixed(2)}</p>` : ''}
            <h3><strong>TOTAL:</strong> $${order.total.toFixed(2)}</h3>
            <p><strong>Método de Pago:</strong> ${order.paymentMethod}</p>
            <hr style="border: 1px dashed #333; margin: 15px 0;">
            <p style="text-align: center; margin-top: 15px;">¡Gracias por su preferencia!</p>
            <p style="text-align: center; font-size: 0.9em;">Guarda tu folio para rastrear tu pedido</p>
        </div>
    `;
    
    currentOrder = order;
    document.getElementById('ticketModal').classList.add('active');
}

function closeTicketModal() {
    document.getElementById('ticketModal').classList.remove('active');
    resetAll();
}

function printTicket() {
    window.print();
}

function downloadTicket() {
    const content = document.getElementById('ticketContent').innerHTML;
    const blob = new Blob([content], {type: 'text/html'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ticket-' + currentOrder.folio + '.html';
    a.click();
}

function resetAll() {
    currentClient = {};
    currentService = '';
    currentBranch = '';
    cart = [];
    currentFile = null;
    currentProof = null;
    currentOrder = null;
    uploadedFiles = [];
    
    document.getElementById('client-info-step').classList.remove('hidden');
    document.getElementById('service-type-step').classList.add('hidden');
    document.getElementById('branch-selection-step').classList.add('hidden');
    document.getElementById('delivery-address-step').classList.add('hidden');
    document.getElementById('work-config-step').classList.add('hidden');
    document.getElementById('cart-step').classList.add('hidden');
    
    document.querySelectorAll('input').forEach(i => i.value = '');
    document.querySelectorAll('select').forEach(s => s.selectedIndex = 0);
}

// ============================================
// NOTIFICACIONES (burbujas de cambio de estatus)
// ============================================

let statusWatcherId = null;
let statusWatcherLastStatus = null;
let statusWatcherFolio = null;
let lastMessageCheckTimestamp = null;

function ensureToastContainer() {
    let container = document.getElementById('statusToastContainer');
    if(!container) {
        container = document.createElement('div');
        container.id = 'statusToastContainer';
        container.style.cssText = 'position:fixed; top:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:10px; max-width:340px;';
        document.body.appendChild(container);
    }
    return container;
}

function showStatusToast(title, message, type) {
    const container = ensureToastContainer();
    const colors = {
        info: { bg: '#667eea', icon: 'fa-info-circle' },
        success: { bg: '#28a745', icon: 'fa-check-circle' },
        celebrate: { bg: '#ff9800', icon: 'fa-gift' }
    };
    const style = colors[type] || colors.info;

    const toast = document.createElement('div');
    toast.style.cssText = `background:${style.bg}; color:white; padding:16px 18px; border-radius:10px; box-shadow:0 6px 20px rgba(0,0,0,0.25); animation: slideInToast 0.35s ease-out;`;
    toast.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:10px;">
            <i class="fas ${style.icon}" style="font-size:1.3em; margin-top:2px;"></i>
            <div>
                <div style="font-weight:bold; margin-bottom:3px;">${title}</div>
                <div style="font-size:0.9em; opacity:0.95;">${message}</div>
            </div>
        </div>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.4s, transform 0.4s';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 400);
    }, 8000);

    // Inyectar la animación una sola vez
    if(!document.getElementById('statusToastStyle')) {
        const styleTag = document.createElement('style');
        styleTag.id = 'statusToastStyle';
        styleTag.textContent = '@keyframes slideInToast { from { opacity:0; transform: translateX(30px); } to { opacity:1; transform: translateX(0); } }';
        document.head.appendChild(styleTag);
    }
}

function startStatusWatcher(folio, initialStatus) {
    if(statusWatcherId) clearInterval(statusWatcherId);
    statusWatcherFolio = folio;
    statusWatcherLastStatus = initialStatus;
    lastMessageCheckTimestamp = new Date().toISOString();

    if(initialStatus === 'delivered') {
        return; // ya está entregado, no hay nada que vigilar
    }

    statusWatcherId = setInterval(async () => {
        try {
            const response = await fetch(SCRIPT_URL + '?action=trackOrder&folio=' + statusWatcherFolio);
            const result = await response.json();
            if(!result.success) return;

            const newStatus = result.order.status;
            if(newStatus !== statusWatcherLastStatus) {
                statusWatcherLastStatus = newStatus;
                notifyStatusChange(newStatus, result.order.serviceType);
                displayTracking(result.order); // refrescar la tarjeta con la info más reciente

                if(newStatus === 'delivered') {
                    clearInterval(statusWatcherId);
                    statusWatcherId = null;
                    clientChatMessages = []; // se borra el chat, ya no es necesario
                    return;
                }
            }

            // Revisar si el repartidor mandó algún mensaje nuevo
            checkForDeliveryMessages(statusWatcherFolio);
        } catch(error) {
            console.error('Error revisando cambios de estatus:', error);
        }
    }, 25000);
}

async function checkForDeliveryMessages(folio) {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDeliveryMessages&folio=' + folio + '&since=' + encodeURIComponent(lastMessageCheckTimestamp));
        const result = await response.json();
        if(!result.success || !result.messages || result.messages.length === 0) return;

        result.messages.forEach(m => {
            // Solo mostramos burbuja/toast de los mensajes del repartidor (los del
            // cliente ya se agregaron al chat al momento de enviarlos)
            if(m.sender !== 'cliente') {
                showStatusToast('Mensaje de tu repartidor', m.message, 'info');
                clientChatMessages.push({ message: m.message, sender: 'repartidor' });
                renderClientDeliveryChat();
            }
        });

        lastMessageCheckTimestamp = new Date().toISOString();
    } catch(error) {
        console.error('Error consultando mensajes del repartidor:', error);
    }
}

function notifyStatusChange(status, serviceType) {
    const banner = getStatusBannerContent(status, serviceType);
    const toastType = status === 'delivered' ? 'celebrate' : (status === 'ready' || status === 'delivering' ? 'success' : 'info');
    showStatusToast(banner.title, banner.message, toastType);
}



async function trackOrder() {
    const folio = document.getElementById('trackingFolio').value.trim();
    if(!folio) {
        alert('Ingresa el número de folio');
        return;
    }

    showLoading(true);
    try {
        // Asegurarse de que las sucursales estén cargadas
        if(branches.length === 0) {
            await loadBranches();
        }
        
        const response = await fetch(SCRIPT_URL + '?action=trackOrder&folio=' + folio);
        const result = await response.json();
        
        if(result.success) {
            displayTracking(result.order);
            startStatusWatcher(folio, result.order.status);
        } else {
            alert('Pedido no encontrado');
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}
function getStatusBannerContent(status, serviceType) {
    const banners = {
        'new': { title: 'Pedido recibido', message: 'Tu pedido está en espera de ser procesado.', colorFrom: '#667eea', colorTo: '#5563c1', icon: '📥' },
        'assigned': { title: 'Pedido asignado', message: 'Un miembro de nuestro equipo ya está por comenzar a trabajar tu pedido.', colorFrom: '#667eea', colorTo: '#5563c1', icon: '📋' },
        'processing': { title: '¡Tu pedido se está elaborando!', message: 'Estamos trabajando en tu pedido en este momento.', colorFrom: '#667eea', colorTo: '#5563c1', icon: '🖨️' },
        'ready': serviceType === 'delivery'
            ? { title: '¡Tu pedido está terminado!', message: 'El operador ya terminó de imprimir tu pedido. Ahora solo falta que un repartidor lo tome para llevarlo a tu domicilio.', colorFrom: '#28a745', colorTo: '#1e7e34', icon: '✅' }
            : { title: '¡Tu pedido está listo!', message: 'Ya puedes pasar a recogerlo a la sucursal.', colorFrom: '#28a745', colorTo: '#1e7e34', icon: '✅' },
        'delivering': { title: '¡Tu pedido va en camino!', message: 'Un repartidor va hacia tu dirección. Puedes ver su ubicación en tiempo real aquí abajo.', colorFrom: '#28a745', colorTo: '#1e7e34', icon: '🛵' },
        'delivered': { title: '¡Gracias por tu compra!', message: 'Tu pedido fue entregado con éxito. Esperamos que todo haya salido justo como lo necesitabas. ¡Nos encantaría volver a atenderte pronto!', colorFrom: '#ff9800', colorTo: '#ff5722', icon: '🎉' }
    };
    return banners[status] || { title: 'Tu pedido se actualizó', message: getStatusText(status), colorFrom: '#667eea', colorTo: '#5563c1', icon: 'ℹ️' };
}

function displayTracking(order) {
    const results = document.getElementById('trackingResults');
    const statusText = getStatusText(order.status);
    const statusClass = 'status-' + order.status;
    
    const banner = getStatusBannerContent(order.status, order.serviceType);
    const statusBanner = `
        <div style="background: linear-gradient(135deg, ${banner.colorFrom}, ${banner.colorTo}); color: white; border-radius: 10px; padding: 20px; margin-top: 15px; text-align: center;">
            <div style="font-size: 2em; margin-bottom: 5px;">${banner.icon}</div>
            <h3 style="margin: 0 0 8px 0;">${banner.title}</h3>
            <p style="margin: 0; opacity: 0.95;">${banner.message}</p>
        </div>
    `;
    
    results.innerHTML = `
        <div class="cart-item">
            <h3>Pedido ${order.folio}</h3>
            <p><strong>Estado:</strong> <span class="order-status ${statusClass}">${statusText}</span></p>
            <p><strong>Cliente:</strong> ${order.client.name}</p>
            <p><strong>Total:</strong> ${order.total}</p>
            <p><strong>Fecha:</strong> ${formatDate(order.date)}</p>
            ${order.employee ? `<p><strong>Atendido por:</strong> ${order.employee}</p>` : ''}
        </div>
        ${statusBanner}
    `;
    
    if(order.history && order.history.length > 0) {
        results.innerHTML += '<h4 style="margin-top: 20px;"><i class="fas fa-history"></i> Historial</h4>';
        const timelineDiv = document.createElement('div');
        timelineDiv.className = 'timeline';
        
        order.history.forEach(h => {
            const item = document.createElement('div');
            item.className = 'timeline-item completed';
            item.innerHTML = `
                <div class="timeline-content">
                    <div class="timeline-title">${getStatusText(h.status)}</div>
                    <div class="timeline-meta">
                        <i class="far fa-clock"></i> ${formatDate(h.timestamp)}
                    </div>
                    ${h.employee ? `<span class="timeline-employee"><i class="fas fa-user"></i> ${h.employee}</span>` : ''}
                    ${h.notes ? `<div style="margin-top: 5px; font-style: italic;">${h.notes}</div>` : ''}
                </div>
            `;
            timelineDiv.appendChild(item);
        });
        
        results.appendChild(timelineDiv);
    }
    
    // Mostrar mapa según el tipo de servicio
    if(order.serviceType === 'delivery') {
        if(order.status === 'delivering') {
            // Pedido en camino - mostrar ubicación del repartidor
            showTrackingMapWithDelivery(order);
        } else {
            // Pedido aún no sale - solo mostrar destino
            showTrackingMapDestinationOnly(order);
        }
        
        if(order.status === 'delivered' && order.deliveryPerson) {
            maybeShowDeliveryRating(order);
        }
    } else {
        // Pickup - mostrar sucursal
        showTrackingMapPickup(order);
    }
}

// ============================================
// CALIFICACIÓN DEL REPARTIDOR (1-5 estrellas)
// ============================================

async function maybeShowDeliveryRating(order) {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDeliveryRating&folio=' + order.folio);
        const result = await response.json();

        const container = document.getElementById('trackingResults');
        const ratingDiv = document.createElement('div');
        ratingDiv.id = 'deliveryRatingSection';
        ratingDiv.style.cssText = 'margin-top: 20px; padding: 20px; background: #fff8f0; border-radius: 10px; text-align: center; border: 2px solid #ffe0b2;';

        if(result.success && result.rated) {
            ratingDiv.innerHTML = `
                <p style="margin: 0; color: #666;"><i class="fas fa-check-circle" style="color:#28a745;"></i> Ya calificaste el trato de tu repartidor. ¡Gracias!</p>
            `;
        } else {
            ratingDiv.innerHTML = `
                <h4 style="margin-bottom: 10px;"><i class="fas fa-star" style="color:#ffc107;"></i> ¿Cómo fue el trato de tu repartidor?</h4>
                <div id="starRatingWidget" style="font-size: 2em; cursor: pointer; margin-bottom: 12px;">
                    ${[1,2,3,4,5].map(n => `<i class="far fa-star star-option" data-value="${n}" style="color:#ffc107; margin: 0 3px;"></i>`).join('')}
                </div>
                <textarea id="deliveryRatingComment" rows="2" placeholder="Comentario (opcional)" style="width:100%; max-width:400px; margin-bottom:10px;"></textarea><br>
                <button class="btn btn-primary" onclick="submitDeliveryRatingFromClient('${order.folio}', '${order.deliveryPerson}')">
                    <i class="fas fa-paper-plane"></i> Enviar Calificación
                </button>
            `;
        }

        container.appendChild(ratingDiv);

        if(!result.rated) {
            setupStarRatingWidget();
        }
    } catch(error) {
        console.error('Error cargando estado de calificación:', error);
    }
}

let selectedRatingValue = 0;

function setupStarRatingWidget() {
    const stars = document.querySelectorAll('#starRatingWidget .star-option');
    stars.forEach(star => {
        star.addEventListener('click', () => {
            selectedRatingValue = parseInt(star.dataset.value, 10);
            stars.forEach(s => {
                const val = parseInt(s.dataset.value, 10);
                s.className = val <= selectedRatingValue ? 'fas fa-star star-option' : 'far fa-star star-option';
            });
        });
    });
}

async function submitDeliveryRatingFromClient(folio, deliveryPerson) {
    if(!selectedRatingValue) {
        alert('Selecciona de 1 a 5 estrellas');
        return;
    }

    const comment = document.getElementById('deliveryRatingComment').value.trim();

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'submitDeliveryRating',
                folio: folio,
                deliveryPerson: deliveryPerson,
                rating: selectedRatingValue,
                comment: comment
            })
        });
        const result = await response.json();

        const ratingDiv = document.getElementById('deliveryRatingSection');
        if(result.success) {
            ratingDiv.innerHTML = `<p style="margin: 0; color: #666;"><i class="fas fa-check-circle" style="color:#28a745;"></i> ¡Gracias por tu calificación!</p>`;
        } else {
            alert(result.message || 'No se pudo enviar la calificación');
        }
    } catch(error) {
        alert('Error de conexión al enviar la calificación');
    }
}

async function showTrackingMapWithDelivery(order) {
    const mapContainer = document.getElementById('trackingResults');
    
    // Obtener datos del repartidor
    if(order.deliveryPerson) {
        deliveryPersonData = await getDeliveryPersonData(order.deliveryPerson);
    }
    
    const deliveryPersonHTML = deliveryPersonData ? renderDeliveryPersonInfo(deliveryPersonData) : '';
    
    const mapDiv = document.createElement('div');
    mapDiv.innerHTML = `
        ${deliveryPersonHTML}
        <h4 style="margin-top: 20px;"><i class="fas fa-map-marked-alt"></i> Ubicación en Tiempo Real</h4>
        <div id="clientTrackingMap" style="height: 400px; border-radius: 8px; overflow: hidden; margin-top: 10px;"></div>
        <div style="margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
            <h4 style="margin-bottom: 10px;"><i class="fas fa-comment-dots"></i> Chat con tu repartidor</h4>
            <p style="font-size: 0.85em; color: #666; margin-bottom: 10px;">
                Útil si no te encuentra o necesitas indicarle algo. Esta conversación no se guarda, desaparece cuando tu pedido se entrega.
            </p>
            <div id="clientDeliveryChat" style="max-height: 220px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px;"></div>
            <div style="display: flex; gap: 8px;">
                <input type="text" id="clientMessageInput" placeholder="Escribe un mensaje..." style="flex:1; padding: 8px; border-radius: 6px; border: 1px solid #ccc;">
                <button class="btn btn-primary" onclick="sendClientMessageToDelivery()"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `;
    mapContainer.appendChild(mapDiv);
    
    setTimeout(() => updateTrackingMap(order), 300);
}

// ============================================
// CHAT EFÍMERO CON EL REPARTIDOR (no se guarda en ningún lado)
// ============================================

let clientChatMessages = [];

function renderClientDeliveryChat() {
    const chatDiv = document.getElementById('clientDeliveryChat');
    if(!chatDiv) return;

    if(clientChatMessages.length === 0) {
        chatDiv.innerHTML = '<p style="color:#999; font-size:0.85em; text-align:center; margin:0;">Sin mensajes todavía</p>';
        return;
    }

    chatDiv.innerHTML = clientChatMessages.map(m => {
        const isMe = m.sender === 'cliente';
        return `
            <div style="align-self: ${isMe ? 'flex-end' : 'flex-start'}; background: ${isMe ? '#667eea' : '#e9ecef'}; color: ${isMe ? 'white' : '#333'}; padding: 8px 12px; border-radius: 12px; max-width: 80%; font-size: 0.9em;">
                ${m.message}
            </div>
        `;
    }).join('');
    chatDiv.scrollTop = chatDiv.scrollHeight;
}

async function sendClientMessageToDelivery() {
    const input = document.getElementById('clientMessageInput');
    const message = input.value.trim();
    if(!message || !statusWatcherFolio) return;

    input.value = '';
    clientChatMessages.push({ message, sender: 'cliente' });
    renderClientDeliveryChat();

    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'sendDeliveryMessage',
                folio: statusWatcherFolio,
                message: message,
                sender: 'cliente',
                timestamp: new Date().toISOString()
            })
        });
    } catch(error) {
        console.error('Error enviando mensaje al repartidor:', error);
    }
}

async function showTrackingMapDestinationOnly(order) {
    const mapContainer = document.getElementById('trackingResults');
    
    const statusMessage = getDeliveryStatusMessage(order.status);
    
    const mapDiv = document.createElement('div');
    mapDiv.innerHTML = `
        <div style="margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center;">
            <h3 style="color: #667eea; margin-bottom: 10px;">
                <i class="fas fa-truck"></i> Entrega a Domicilio
            </h3>
            <p style="font-size: 1.2em; color: #333;">
                ${statusMessage}
            </p>
        </div>
        <h4 style="margin-top: 20px;"><i class="fas fa-map-marked-alt"></i> Dirección de Entrega</h4>
        <div id="clientTrackingMap" style="height: 400px; border-radius: 8px; overflow: hidden; margin-top: 10px;"></div>
    `;
    mapContainer.appendChild(mapDiv);
    
    setTimeout(() => {
        const address = order.address;
        const destLat = address.latitude || 17.9892;
        const destLng = address.longitude || -92.9475;
        
        const map = L.map('clientTrackingMap').setView([destLat, destLng], 15);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        
        L.marker([destLat, destLng], {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: '<div style="background-color:#dc3545;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fas fa-home" style="color:white;"></i></div>',
                iconSize: [30, 30]
            })
        }).addTo(map).bindPopup('Tu dirección').openPopup();
    }, 300);
}

function getDeliveryStatusMessage(status) {
    const messages = {
        'new': 'Su pedido está en espera de ser procesado.',
        'assigned': 'Su pedido fue asignado y está por comenzar a elaborarse.',
        'processing': 'Su pedido se está elaborando.',
        'ready': 'Su pedido ya está terminado, en espera de que un repartidor lo tome.',
        'delivered': 'Su pedido ya fue entregado.'
    };
    return messages[status] || 'Su pedido está en proceso.';
}

function getPickupStatusMessage(status) {
    const messages = {
        'new': 'Su pedido está en espera de ser procesado.',
        'assigned': 'Su pedido fue asignado y está por comenzar a elaborarse.',
        'processing': 'Su pedido se está elaborando.',
        'ready': 'Su pedido está listo, ya puede pasar a recogerlo a la sucursal',
        'delivered': 'Su pedido ya fue entregado.'
    };
    return messages[status] || 'Su pedido está en proceso.';
}

async function showTrackingMapPickup(order) {
    const mapContainer = document.getElementById('trackingResults');
    
    // Buscar la sucursal en el array de branches
    const branch = branches.find(b => b.name === order.branch);
    
    const statusMessage = getPickupStatusMessage(order.status);
    const readySuffix = order.status === 'ready' ? ` <strong>${order.branch}</strong>.` : '';
    
    if(!branch) {
        mapContainer.innerHTML += `
            <div style="margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center;">
                <h3 style="color: #667eea; margin-bottom: 10px;">
                    <i class="fas fa-store"></i> Pick-up en Sucursal
                </h3>
                <p style="font-size: 1.2em; color: #333;">
                    ${statusMessage}${readySuffix}
                </p>
                <p style="color: #dc3545; margin-top: 10px;">No se pudo cargar el mapa de la sucursal</p>
            </div>
        `;
        return;
    }
    
    const branchLat = branch.latitude ? parseFloat(branch.latitude) : 17.9892;
    const branchLng = branch.longitude ? parseFloat(branch.longitude) : -92.9475;

    // Ubicación del cliente, si la tenemos (opcional, capturada al elegir sucursal)
    const clientLat = order.address && order.address.latitude ? parseFloat(order.address.latitude) : null;
    const clientLng = order.address && order.address.longitude ? parseFloat(order.address.longitude) : null;
    const hasClientLocation = clientLat !== null && clientLng !== null && !isNaN(clientLat) && !isNaN(clientLng);
    
    mapContainer.innerHTML += `
        <div style="margin-top: 20px; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center;">
            <h3 style="color: #667eea; margin-bottom: 10px;">
                <i class="fas fa-store"></i> Pick-up en Sucursal
            </h3>
            <p style="font-size: 1.2em; color: #333; margin-bottom: 15px;">
                ${statusMessage}${readySuffix}
            </p>
        </div>
        <h4 style="margin-top: 20px;"><i class="fas fa-map-marker-alt"></i> Ubicación de la Sucursal${hasClientLocation ? ' y tu ubicación' : ''}</h4>
        <div id="clientTrackingMap" style="height: 400px; width: 100%; border-radius: 8px; margin-top: 10px; border: 2px solid #ddd;"></div>
    `;
    
    // Esperar a que el contenedor esté en el DOM
    setTimeout(() => {
        const mapElement = document.getElementById('clientTrackingMap');
        if(!mapElement) return;
        
        try {
            const map = L.map('clientTrackingMap');
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19
            }).addTo(map);
            
            const branchMarker = L.marker([branchLat, branchLng], {
                icon: L.divIcon({
                    className: 'custom-div-icon',
                    html: '<div style="background-color:#667eea;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);"><i class="fas fa-store" style="color:white;font-size:20px;"></i></div>',
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                })
            }).addTo(map);
            branchMarker.bindPopup(`<strong>${branch.name}</strong><br>${branch.address || ''}`);
            
            if(hasClientLocation) {
                const clientMarker = L.marker([clientLat, clientLng], {
                    icon: L.divIcon({
                        className: 'custom-div-icon',
                        html: '<div style="background-color:#dc3545;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);"><i class="fas fa-user" style="color:white;font-size:16px;"></i></div>',
                        iconSize: [34, 34],
                        iconAnchor: [17, 17]
                    })
                }).addTo(map);
                clientMarker.bindPopup('Tu ubicación');
                
                // Línea "imaginaria" (no es una ruta real por calles, solo referencia visual)
                L.polyline([[branchLat, branchLng], [clientLat, clientLng]], {
                    color: '#667eea',
                    weight: 3,
                    dashArray: '8, 8',
                    opacity: 0.8
                }).addTo(map);
                
                map.fitBounds([[branchLat, branchLng], [clientLat, clientLng]], { padding: [50, 50] });
                branchMarker.openPopup();
            } else {
                map.setView([branchLat, branchLng], 16);
                branchMarker.openPopup();
            }
            
            setTimeout(() => map.invalidateSize(), 100);
            
        } catch(error) {
            console.error('Error creando el mapa:', error);
        }
        
    }, 300);
}

async function updateTrackingMap(order) {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDeliveryLocation&folio=' + order.folio);
        const result = await response.json();
        
        if(result.success && result.location) {
            const loc = result.location;
            const address = order.address;
            const destLat = address.latitude || 17.9892;
            const destLng = address.longitude || -92.9475;
            
            // Obtener el nombre del repartidor para mostrarlo en el mapa
            let deliveryPersonName = 'Tu repartidor';
            if(order.deliveryPerson) {
                try {
                    const dpResponse = await fetch(SCRIPT_URL + '?action=getDeliveryPersonData&username=' + encodeURIComponent(order.deliveryPerson));
                    const dpResult = await dpResponse.json();
                    if(dpResult.success && dpResult.user && dpResult.user.name) {
                        deliveryPersonName = dpResult.user.name;
                    }
                } catch(e) { /* usamos el genérico si falla */ }
            }
            
            const trackMap = L.map('clientTrackingMap').setView([loc.latitude, loc.longitude], 15);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(trackMap);
            
            // Marcador del destino
            L.marker([destLat, destLng], {
                icon: L.divIcon({
                    className: 'custom-div-icon',
                    html: '<div style="background-color:#dc3545;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;"><i class="fas fa-home" style="color:white;"></i></div>',
                    iconSize: [30, 30]
                })
            }).addTo(trackMap).bindPopup('Tu dirección');
            
            // Marcador del repartidor, identificado con su nombre
            const deliveryMarker = L.marker([loc.latitude, loc.longitude], {
                icon: L.divIcon({
                    className: 'custom-div-icon',
                    html: '<div style="background-color:#ffc107;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);"><i class="fas fa-motorcycle" style="color:white;font-size:24px;"></i></div>',
                    iconSize: [50, 50]
                })
            }).addTo(trackMap).bindPopup(`<strong>${deliveryPersonName}</strong><br>Tu repartidor`).openPopup();
            
            // Línea "imaginaria" de referencia (no es una ruta real por calles) del
            // repartidor hacia tu dirección. Color distinto al de la ruta de pick-up.
            let routeLine = L.polyline([[loc.latitude, loc.longitude], [destLat, destLng]], {
                color: '#28a745',
                weight: 4,
                dashArray: '10, 10',
                opacity: 0.85
            }).addTo(trackMap);
            
            // Actualizar cada 10 segundos (la posición del repartidor en el servidor
            // se actualiza cada 2-3 minutos, así que aquí solo refrescamos la vista)
            setInterval(() => refreshDeliveryLocation(order.folio, trackMap, deliveryMarker, routeLine, [destLat, destLng]), 10000);
        } else {
            // El repartidor aún no manda su primera ubicación (puede tardar unos
            // segundos/minutos en obtener el primer GPS). Reintentamos solos
            // cada 10s hasta que aparezca, en vez de quedarnos estancados.
            document.getElementById('clientTrackingMap').innerHTML = '<p style="padding: 40px; text-align: center; color: #666;"><i class="fas fa-spinner fa-spin"></i> Esperando la ubicación del repartidor...</p>';
            setTimeout(() => updateTrackingMap(order), 10000);
        }
    } catch(error) {
        console.error('Error cargando mapa:', error);
    }
}

async function refreshDeliveryLocation(folio, map, marker, routeLine, destLatLng) {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDeliveryLocation&folio=' + folio);
        const result = await response.json();
        
        if(result.success && result.location) {
            const loc = result.location;
            marker.setLatLng([loc.latitude, loc.longitude]);
            if(routeLine) {
                routeLine.setLatLngs([[loc.latitude, loc.longitude], destLatLng]);
            }
            map.setView([loc.latitude, loc.longitude], 15);
        }
    } catch(error) {
        console.error('Error actualizando ubicación:', error);
    }
}

// ============================================
// OBTENER DATOS DEL REPARTIDOR
// ============================================

async function getDeliveryPersonData(username) {
    try {
        console.log('=== OBTENIENDO DATOS DEL REPARTIDOR ===');
        console.log('Username:', username);
        
        const response = await fetch(SCRIPT_URL + '?action=getDeliveryPersonData&username=' + username);
        const result = await response.json();
        
        console.log('Respuesta del servidor:', result);
        
        if(result.success) {
            console.log('Datos del repartidor:', result.userData);
            console.log('URL de la foto:', result.userData.photoUrl);
            return result.userData;
        }
        
        console.warn('No se encontraron datos del repartidor');
        return null;
    } catch(error) {
        console.error('Error obteniendo datos del repartidor:', error);
        return null;
    }
}

function renderDeliveryPersonInfo(deliveryPerson) {
    if(!deliveryPerson) {
        console.warn('No hay datos del repartidor para mostrar');
        return '';
    }
    
    console.log('=== RENDERIZANDO INFO DEL REPARTIDOR ===');
    console.log('Datos completos:', deliveryPerson);
    console.log('Photo URL:', deliveryPerson.photoUrl);
    
    // SVG de placeholder solo como ÚLTIMO recurso si no hay foto
    const placeholderSVG = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iIzY2N2VlYSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iNDgiIGZpbGw9IndoaXRlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+8J+agTwvdGV4dD48L3N2Zz4=';
    
    // Usar la foto del repartidor SI EXISTE, sino usar placeholder
    const photoUrl = (deliveryPerson.photoUrl && deliveryPerson.photoUrl.trim() !== '') 
        ? deliveryPerson.photoUrl 
        : placeholderSVG;
    
    console.log('URL final a usar:', photoUrl);
    
    const deliveryName = deliveryPerson.name || deliveryPerson.username || 'Repartidor';
    
    // Agregar evento onload para verificar que la imagen cargó
    const imgOnLoad = `console.log('✅ Foto del repartidor cargada correctamente');`;
    const imgOnError = `console.error('❌ Error cargando foto del repartidor'); this.src='${placeholderSVG}';`;
    
    return `
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; margin-bottom: 20px; color: white; display: flex; align-items: center; gap: 20px; box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);">
            <div style="flex-shrink: 0;">
                <div style="width: 80px; height: 80px; border-radius: 50%; overflow: hidden; border: 4px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.2); background: white;">
                    <img src="${photoUrl}" 
                         alt="${deliveryName}" 
                         style="width: 100%; height: 100%; object-fit: cover;"
                         onload="${imgOnLoad}"
                         onerror="${imgOnError}">
                </div>
            </div>
            <div style="flex: 1;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    <i class="fas fa-motorcycle" style="font-size: 1.5em;"></i>
                    <h3 style="margin: 0; font-size: 1.3em;">${deliveryName}</h3>
                </div>
                <p style="margin: 0; font-size: 1.1em; opacity: 0.95;">
                    <i class="fas fa-route"></i> 
                    <strong>${deliveryName}</strong> está en camino
                </p>
            </div>
            <div style="flex-shrink: 0;">
                <div style="background: rgba(255,255,255,0.2); padding: 10px 20px; border-radius: 20px; text-align: center;">
                    <i class="fas fa-shipping-fast" style="font-size: 1.2em;"></i>
                    <div style="font-size: 0.9em; margin-top: 5px;">En tránsito</div>
                </div>
            </div>
        </div>
    `;
}

// ============================================
// CARGA DE DATOS
// ============================================

async function loadPrices() {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getPrices');
        const result = await response.json();
        if(result.success) {
            prices = result.prices;
        }
    } catch(error) {
        console.error('Error cargando precios:', error);
    }
}

async function loadBranches() {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getBranches');
        const result = await response.json();
        if(result.success) {
            branches = result.branches;
            const select = document.getElementById('branchSelect');
            select.innerHTML = '<option value="">Selecciona una sucursal</option>';
            branches.forEach(b => {
                const option = document.createElement('option');
                option.value = b.name;
                option.textContent = b.name + ' - ' + b.address;
                select.appendChild(option);
            });
        }
    } catch(error) {
        console.error('Error cargando sucursales:', error);
    }
}



































































