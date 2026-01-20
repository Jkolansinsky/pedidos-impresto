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
let currentLocation = null;

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Solicitar GPS inmediatamente
    requestGeolocationPermission();
    
    loadBranches();
    loadPrices();
});

function requestGeolocationPermission() {
    if('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                currentLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                console.log('Geolocalización activada en cliente');
            },
            function(error) {
                console.error('Error de geolocalización:', error);
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

function confirmBranch() {
    const branch = document.getElementById('branchSelect').value;
    if(!branch) {
        alert('Selecciona una sucursal');
        return;
    }
    currentBranch = branch;
    document.getElementById('branch-selection-step').classList.add('hidden');
    document.getElementById('work-config-step').classList.remove('hidden');
}

function confirmAddress() {
    const street = document.getElementById('deliveryStreet').value.trim();
    const colony = document.getElementById('deliveryColony').value.trim();
    const city = document.getElementById('deliveryCity').value.trim();

    if(!street || !colony || !city) {
        alert('Completa la dirección de entrega');
        return;
    }

    currentClient.address = {
        street,
        colony,
        city,
        zip: document.getElementById('deliveryZip').value,
        references: document.getElementById('deliveryReferences').value
    };

    document.getElementById('delivery-address-step').classList.add('hidden');
    document.getElementById('work-config-step').classList.remove('hidden');
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
// CARRITO
// ============================================

function addToCart() {
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
        
        const orderData = {
            action: 'createOrder',
            folio: folio,
            client: currentClient,
            serviceType: currentService,
            branch: currentBranch,
            works: cart.map(w => ({
                fileName: w.fileName,
                printType: w.printType,
                copies: w.copies,
                color: w.color,
                paperType: w.paperType,
                vinilType: w.vinilType,
                finishing: w.finishing,
                urgency: w.urgency,
                observations: w.observations,
                price: w.price
            })),
            paymentMethod: method,
            subtotal: parseFloat(document.getElementById('subtotal').textContent),
            deliveryCost: currentService === 'delivery' ? parseFloat(document.getElementById('deliveryCost').textContent) : 0,
            total: parseFloat(document.getElementById('total').textContent),
            status: 'new',
            date: new Date().toISOString()
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
// TRACKING
// ============================================

async function trackOrder() {
    const folio = document.getElementById('trackingFolio').value.trim();
    if(!folio) {
        alert('Ingresa el número de folio');
        return;
    }

    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL + '?action=trackOrder&folio=' + folio);
        const result = await response.json();
        
        if(result.success) {
            displayTracking(result.order);
        } else {
            alert('Pedido no encontrado');
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function displayTracking(order) {
    const results = document.getElementById('trackingResults');
    const statusText = getStatusText(order.status);
    const statusClass = 'status-' + order.status;
    
    results.innerHTML = `
        <div class="cart-item">
            <h3>Pedido ${order.folio}</h3>
            <p><strong>Estado:</strong> <span class="order-status ${statusClass}">${statusText}</span></p>
            <p><strong>Cliente:</strong> ${order.client.name}</p>
            <p><strong>Total:</strong> ${order.total}</p>
            <p><strong>Fecha:</strong> ${formatDate(order.date)}</p>
            ${order.employee ? `<p><strong>Atendido por:</strong> ${order.employee}</p>` : ''}
        </div>
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
    
    // Si está en camino, mostrar mapa en tiempo real
    if(order.serviceType === 'delivery' && order.status === 'delivering') {
        showTrackingMap(order.folio);
    }
}

async function showTrackingMap(folio) {
    const mapContainer = document.getElementById('trackingResults');
    
    // Crear contenedor del mapa
    const mapDiv = document.createElement('div');
    mapDiv.innerHTML = `
        <h4 style="margin-top: 20px;"><i class="fas fa-map-marked-alt"></i> Ubicación en Tiempo Real</h4>
        <div id="clientTrackingMap" style="height: 400px; border-radius: 8px; overflow: hidden; margin-top: 10px;"></div>
    `;
    mapContainer.appendChild(mapDiv);
    
    // Obtener ubicación del repartidor
    setTimeout(() => updateTrackingMap(folio), 300);
}

async function updateTrackingMap(folio) {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDeliveryLocation&folio=' + folio);
        const result = await response.json();
        
        if(result.success && result.location) {
            const loc = result.location;
            
            // Crear mapa
            const trackMap = L.map('clientTrackingMap').setView([loc.latitude, loc.longitude], 15);
            
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(trackMap);
            
            // Marcador del repartidor
            L.marker([loc.latitude, loc.longitude], {
                icon: L.divIcon({
                    className: 'custom-div-icon',
                    html: '<div style="background-color:#ffc107;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 3px 10px rgba(0,0,0,0.4);"><i class="fas fa-motorcycle" style="color:white;font-size:24px;"></i></div>',
                    iconSize: [50, 50]
                })
            }).addTo(trackMap).bindPopup('Tu pedido está en camino').openPopup();
            
            // Actualizar cada 10 segundos
            setInterval(() => refreshDeliveryLocation(folio, trackMap), 10000);
        } else {
            document.getElementById('clientTrackingMap').innerHTML = '<p style="padding: 40px; text-align: center; color: #666;">El repartidor aún no ha iniciado el recorrido</p>';
        }
    } catch(error) {
        console.error('Error cargando mapa:', error);
    }
}

async function refreshDeliveryLocation(folio, map) {
    try {
        const response = await fetch(SCRIPT_URL + '?action=getDeliveryLocation&folio=' + folio);
        const result = await response.json();
        
        if(result.success && result.location) {
            const loc = result.location;
            map.setView([loc.latitude, loc.longitude], 15);
            
            // Actualizar marcador (eliminar anterior y crear nuevo)
            map.eachLayer(layer => {
                if(layer instanceof L.Marker) {
                    layer.setLatLng([loc.latitude, loc.longitude]);
                }
            });
        }
    } catch(error) {
        console.error('Error actualizando ubicación:', error);
    }
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

