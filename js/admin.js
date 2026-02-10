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
    const user = checkAuth('admin');
    if(user) {
        showAdminPanel(user);
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
        const response = await fetch(SCRIPT_URL + '?action=login&username=' + username + '&password=' + password + '&type=admin');
        const result = await response.json();
        
        if(result.success) {
            if(result.user.role !== 'admin') {
                errorDiv.textContent = 'No tienes permisos de administrador';
                errorDiv.classList.remove('hidden');
                return;
            }

            localStorage.setItem('currentUser', JSON.stringify(result.user));
            currentUser = result.user;
            
            showAdminPanel(result.user);
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

function showAdminPanel(user) {
    currentUser = user;
    document.getElementById('loginSection').classList.add('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
    document.getElementById('currentUserName').textContent = user.username;
    loadOrders();
}

// ============================================
// NAVEGACIÓN
// ============================================

function showAdminTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    
    document.getElementById(tabName + '-tab').classList.add('active');
    event.target.classList.add('active');

    if(tabName === 'orders') {
        loadOrders();
    } else if(tabName === 'users') {
        loadUsersTable();
    } else if(tabName === 'prices') {
        loadPricesTable();
    } else if(tabName === 'branches') {
        loadBranchesTable();
    }
}

// ============================================
// GESTIÓN DE PEDIDOS
// ============================================

async function loadOrders() {
    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL + '?action=getAllOrders');
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
        container.innerHTML = '<p style="text-align: center; color: #666; padding: 40px;">No hay pedidos</p>';
        return;
    }
    
    orders.forEach(order => {
        const div = document.createElement('div');
        div.className = 'order-item';
        
        const statusText = getStatusText(order.status);
        const statusClass = 'status-' + order.status;
        const employeeName = order.employee || 'Sin asignar';
        
        // Verificar retraso
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
        
        if(isDelayed) {
            div.style.background = '#ffe6e6';
            div.style.borderLeft = '4px solid #dc3545';
        }
        
        div.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; gap: 20px;">
                <div style="flex: 1;">
                    <h4><i class="fas fa-file-alt"></i> ${order.folio} ${isDelayed ? '<span style="color: #dc3545;"><i class="fas fa-exclamation-triangle"></i> RETRASO +1HR</span>' : ''}</h4>
                    <p style="margin: 5px 0;"><strong>${order.client.name}</strong> - ${order.client.phone}</p>
                    <p style="margin: 5px 0;">Total: <strong>${order.total}</strong> | ${order.serviceType === 'pickup' ? 'Pick-up en ' + order.branch : 'Entrega a Domicilio'}</p>
                    <p style="margin: 5px 0; font-size: 0.9em; color: #666;">
                        <i class="far fa-clock"></i> ${formatDate(order.date)}
                    </p>
                    <p style="margin: 5px 0;">
                        <i class="fas fa-user"></i> Empleado: <strong>${employeeName}</strong>
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

function viewOrderDetail(order) {
    currentOrder = order;
    
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
    
    // Link del comprobante de pago
    let proofHTML = '';
    if(order.proofFileUrl) {
        proofHTML = `
            <div style="margin-top: 10px;">
                <a href="${order.proofFileUrl}" target="_blank" style="color: #28a745; text-decoration: none;">
                    <i class="fas fa-file-invoice-dollar"></i> Ver Comprobante de Pago
                </a>
            </div>
        `;
    }
    
    const detailContent = document.getElementById('orderDetailContent');
    detailContent.innerHTML = `
        <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
            <h3><i class="fas fa-receipt"></i> ${order.folio}</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-top: 15px;">
                <div>
                    <p><strong>Cliente:</strong> ${order.client.name}</p>
                    <p><strong>TelÃ©fono:</strong> ${order.client.phone}</p>
                    <p><strong>Email:</strong> ${order.client.email || 'N/A'}</p>
                </div>
                <div>
                    <p><strong>Fecha:</strong> ${formatDate(order.date)}</p>
                    <p><strong>Servicio:</strong> ${order.serviceType === 'pickup' ? 'Pick-up en ' + order.branch : 'Entrega a Domicilio'}</p>
                    <p><strong>MÃ©todo de Pago:</strong> ${order.paymentMethod}</p>
                    ${proofHTML}
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
    document.getElementById('assignEmployee').value = order.employee || '';
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

async function updateOrderStatus() {
    if(!currentOrder) {
        alert('No hay pedido seleccionado');
        return;
    }

    // Verificar si ya fue entregado
    if(currentOrder.status === 'delivered') {
        alert('Este pedido ya fue entregado. No se puede modificar su estado.');
        return;
    }

    const newStatus = document.getElementById('orderStatus').value;
    const notes = document.getElementById('statusNotes').value.trim();
    const employee = document.getElementById('assignEmployee').value.trim() || currentUser.username;

    showLoading(true);
    try {
        const updateData = {
            action: 'updateOrderStatus',
            folio: currentOrder.folio,
            status: newStatus,
            employee: employee,
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
// GESTIÓN DE USUARIOS
// ============================================

async function loadUsersTable() {
    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL + '?action=getUsers');
        const result = await response.json();
        
        if(result.success) {
            const table = document.getElementById('usersTable');
            let html = `
                <table>
                    <thead>
                        <tr>
                            <th>Usuario</th>
                            <th>Nombre Completo</th>
                            <th>Rol</th>
                            <th>Estado</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            result.users.forEach(user => {
                const roleText = user.role === 'admin' ? 'Administrador' : 
                                user.role === 'delivery' ? 'Repartidor' : 'Usuario';
                const statusBadge = user.active ? 
                    '<span class="order-status status-ready">Activo</span>' : 
                    '<span class="order-status status-delivered">Inactivo</span>';
                
                html += `
                    <tr>
                        <td><strong>${user.username}</strong></td>
                        <td>${user.name}</td>
                        <td>${roleText}</td>
                        <td>${statusBadge}</td>
                        <td>
                            <button class="btn btn-warning" style="padding: 5px 10px; font-size: 0.9em;" 
                                onclick='editUser(${JSON.stringify(user).replace(/'/g, "&apos;")})'>
                                <i class="fas fa-edit"></i>
                            </button>
                            ${user.active ? `
                                <button class="btn btn-danger" style="padding: 5px 10px; font-size: 0.9em;" 
                                    onclick='deactivateUser("${user.username}")'>
                                    <i class="fas fa-ban"></i>
                                </button>
                            ` : ''}
                        </td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
            table.innerHTML = html;
        }
    } catch(error) {
        console.error('Error cargando usuarios:', error);
    } finally {
        showLoading(false);
    }
}

function editUser(user) {
    const newPassword = prompt(`Cambiar contraseña para ${user.username} (dejar vacío para no cambiar):`);
    
    if(newPassword !== null) {
        updateUserPassword(user.username, newPassword);
    }
}

async function updateUserPassword(username, password) {
    if(!password) return;
    
    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updateUser',
                username: username,
                password: password
            })
        });

        const result = await response.json();
        
        if(result.success) {
            alert('Contraseña actualizada correctamente');
            loadUsersTable();
        } else {
            alert('Error: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function deactivateUser(username) {
    if(!confirm(`¿Desactivar usuario ${username}?`)) return;
    
    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'deleteUser',
                username: username
            })
        });

        const result = await response.json();
        
        if(result.success) {
            alert('Usuario desactivado correctamente');
            loadUsersTable();
        } else {
            alert('Error: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function createNewUser() {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value.trim();
    const role = document.getElementById('newUserRole').value;
    const name = document.getElementById('newUserFullName').value.trim();

    if(!username || !password || !name) {
        alert('Completa todos los campos obligatorios');
        return;
    }

    if(username.length < 3) {
        alert('El nombre de usuario debe tener al menos 3 caracteres');
        return;
    }

    if(password.length < 6) {
        alert('La contraseña debe tener al menos 6 caracteres');
        return;
    }

    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'createUser',
                username: username,
                password: password,
                role: role,
                name: name
            })
        });

        const result = await response.json();
        
        if(result.success) {
            alert('Usuario creado correctamente');
            document.getElementById('newUsername').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('newUserRole').value = 'user';
            document.getElementById('newUserFullName').value = '';
            loadUsersTable();
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
// GESTIÓN DE PRECIOS
// ============================================

async function loadPricesTable() {
    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL + '?action=getPrices');
        const result = await response.json();
        
        if(result.success) {
            const table = document.getElementById('pricesTable');
            let html = `
                <table>
                    <thead>
                        <tr>
                            <th>Categoría</th>
                            <th>Subcategoría</th>
                            <th>Precio</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            for(let key in result.prices) {
                const parts = key.split('_');
                const category = parts[0];
                const subcategory = parts.slice(1).join('_') || '-';
                const price = result.prices[key];

                html += `
                    <tr>
                        <td>${category}</td>
                        <td>${subcategory}</td>
                        <td>$${price}</td>
                        <td>
                            <button class="btn btn-warning" style="padding: 5px 10px; font-size: 0.9em;" 
                                onclick='editPrice("${category}", "${subcategory}", ${price})'>
                                <i class="fas fa-edit"></i> Editar
                            </button>
                        </td>
                    </tr>
                `;
            }

            html += '</tbody></table>';
            table.innerHTML = html;
        }
    } catch(error) {
        console.error('Error cargando precios:', error);
    } finally {
        showLoading(false);
    }
}

function editPrice(category, subcategory, price) {
    document.getElementById('priceCategory').value = category;
    document.getElementById('priceSubcategory').value = subcategory === '-' ? '' : subcategory;
    document.getElementById('priceValue').value = price;
    window.scrollTo({ top: document.getElementById('priceCategory').offsetTop - 100, behavior: 'smooth' });
}

async function savePrice() {
    const category = document.getElementById('priceCategory').value.trim();
    const subcategory = document.getElementById('priceSubcategory').value.trim();
    const price = parseFloat(document.getElementById('priceValue').value);

    if(!category || isNaN(price)) {
        alert('Completa categoría y precio');
        return;
    }

    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'updatePrice',
                category: category,
                subcategory: subcategory,
                price: price
            })
        });

        const result = await response.json();
        
        if(result.success) {
            alert('Precio guardado correctamente');
            document.getElementById('priceCategory').value = '';
            document.getElementById('priceSubcategory').value = '';
            document.getElementById('priceValue').value = '';
            loadPricesTable();
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
// GESTIÓN DE SUCURSALES
// ============================================

async function loadBranchesTable() {
    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL + '?action=getBranches');
        const result = await response.json();
        
        if(result.success) {
            const table = document.getElementById('branchesTable');
            let html = `
                <table>
                    <thead>
                        <tr>
                            <th>Nombre</th>
                            <th>Dirección</th>
                            <th>Teléfono</th>
                            <th>Email</th>
                            <th>Coordenadas</th>
                            <th>Datos Bancarios</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            result.branches.forEach(branch => {
                html += `
                    <tr>
                        <td><strong>${branch.name}</strong></td>
                        <td>${branch.address}</td>
                        <td>${branch.phone}</td>
                        <td>${branch.email || 'N/A'}</td>
                        <td style="font-size: 0.85em;">${branch.latitude ? `Lat: ${branch.latitude}<br>Lng: ${branch.longitude}` : 'No establecidas'}</td>
                        <td style="white-space: pre-line; font-size: 0.85em;">${branch.bankData}</td>
                    </tr>
                `;
            });

            html += '</tbody></table>';
            table.innerHTML = html;
        }
    } catch(error) {
        console.error('Error cargando sucursales:', error);
    } finally {
        showLoading(false);
    }
}

async function saveBranch() {
    const name = document.getElementById('branchName').value.trim();
    const address = document.getElementById('branchAddress').value.trim();
    const phone = document.getElementById('branchPhone').value.trim();
    const email = document.getElementById('branchEmail').value.trim();
    const bankData = document.getElementById('branchBankData').value.trim();
    const latitude = document.getElementById('branchLatitude').value.trim();
    const longitude = document.getElementById('branchLongitude').value.trim();

    if(!name || !address || !phone || !email) {
        alert('Completa todos los campos obligatorios');
        return;
    }

    showLoading(true);
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'saveBranch',
                name: name,
                address: address,
                phone: phone,
                email: email,
                bankData: bankData,
                latitude: latitude ? parseFloat(latitude) : null,
                longitude: longitude ? parseFloat(longitude) : null
            })
        });

        const result = await response.json();
        
        if(result.success) {
            alert('Sucursal guardada correctamente');
            document.getElementById('branchName').value = '';
            document.getElementById('branchAddress').value = '';
            document.getElementById('branchPhone').value = '';
            document.getElementById('branchEmail').value = '';
            document.getElementById('branchBankData').value = '';
            document.getElementById('branchLatitude').value = '';
            document.getElementById('branchLongitude').value = '';
            loadBranchesTable();
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


// Filtrar solicitudes por estado
function filterRequests(status) {
    if(status === 'all') {
        displayDeliveryRequests(allDeliveryRequests);
    } else {
        const filtered = allDeliveryRequests.filter(req => req.status === status);
        displayDeliveryRequests(filtered);
    }
}

// ============================================
// GESTIÓN DE SOLICITUDES DE REPARTIDOR
// ============================================

// Variable global para almacenar solicitudes
let allDeliveryRequests = [];

// ============================================
// CARGAR SOLICITUDES
// ============================================

async function loadDeliveryRequests() {
    showLoading(true);
    
    try {
        const response = await fetch(SCRIPT_URL + '?action=getAllDeliveryRequests');
        const result = await response.json();
        
        if(!result.success) {
            alert('Error al cargar solicitudes: ' + result.message);
            return;
        }
        
        allDeliveryRequests = result.requests || [];
        displayDeliveryRequests(allDeliveryRequests);
        
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function displayDeliveryRequests(requests) {
    const container = document.getElementById('requestsTable');
    
    if(requests.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-inbox"></i>
                <p>No hay solicitudes de repartidor</p>
            </div>
        `;
        return;
    }
    
    let html = `
        <div style="overflow-x: auto;">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Nombre</th>
                        <th>Teléfono</th>
                        <th>Email</th>
                        <th>Ocupación</th>
                        <th>Estado</th>
                        <th>Fecha Solicitud</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    requests.forEach(req => {
        const statusBadge = getRequestStatusBadge(req.status);
        const dateFormatted = formatDate(req.dateRequested);
        
        html += `
            <tr>
                <td><small>${req.requestId}</small></td>
                <td><strong>${req.fullName}</strong></td>
                <td>${req.phone}</td>
                <td><small>${req.email}</small></td>
                <td><small>${req.currentJob}</small></td>
                <td>${statusBadge}</td>
                <td>${dateFormatted}</td>
                <td>
                    ${getRequestActions(req)}
                </td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = html;
}

function getRequestStatusBadge(status) {
    const badges = {
        'pending': '<span class="status-badge status-warning">⏳ Pendiente</span>',
        'docs_sent': '<span class="status-badge status-info">📄 Docs Enviados</span>',
        'approved': '<span class="status-badge status-success">✅ Aprobado</span>',
        'rejected': '<span class="status-badge status-danger">❌ Rechazado</span>'
    };
    return badges[status] || status;
}

function getRequestActions(req) {
    let actions = '';
    
    // Botón para ver detalles (siempre disponible)
    actions += `
        <button class="btn btn-secondary btn-sm" onclick="viewRequestDetails('${req.requestId}')" title="Ver detalles">
            <i class="fas fa-eye"></i>
        </button>
    `;
    
    // Acciones según el estado
    if(req.status === 'pending') {
        actions += `
            <button class="btn btn-primary btn-sm" onclick="generateDocsLink('${req.requestId}')" title="Generar link para documentos">
                <i class="fas fa-link"></i> Link
            </button>
        `;
    } else if(req.status === 'docs_sent') {
        actions += `
            <button class="btn btn-success btn-sm" onclick="reviewDocuments('${req.requestId}')" title="Revisar documentos">
                <i class="fas fa-folder-open"></i> Revisar
            </button>
        `;
    } else if(req.status === 'approved') {
        actions += `
            <button class="btn btn-info btn-sm" onclick="viewUserCreationLink('${req.requestId}')" title="Ver link de creación de usuario">
                <i class="fas fa-user-check"></i> Ver Link
            </button>
        `;
    }
    
    return actions;
}

function filterRequests(status) {
    if(status === 'all') {
        displayDeliveryRequests(allDeliveryRequests);
    } else {
        const filtered = allDeliveryRequests.filter(req => req.status === status);
        displayDeliveryRequests(filtered);
    }
}

// ============================================
// VER DETALLES DE SOLICITUD
// ============================================

function viewRequestDetails(requestId) {
    const req = allDeliveryRequests.find(r => r.requestId === requestId);
    if(!req) {
        alert('Solicitud no encontrada');
        return;
    }
    
    const modalHtml = `
        <div class="modal active" id="requestDetailModal">
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h3><i class="fas fa-user-circle"></i> Detalles de Solicitud</h3>
                    <button class="close-modal" onclick="closeRequestDetailModal()">×</button>
                </div>
                <div class="modal-body">
                    <div class="info-section">
                        <h4><i class="fas fa-id-card"></i> Información Personal</h4>
                        <p><strong>ID Solicitud:</strong> ${req.requestId}</p>
                        <p><strong>Nombre Completo:</strong> ${req.fullName}</p>
                        <p><strong>Teléfono:</strong> ${req.phone}</p>
                        <p><strong>Email:</strong> ${req.email}</p>
                        <p><strong>Ocupación Actual:</strong> ${req.currentJob}</p>
                    </div>
                    
                    <div class="info-section">
                        <h4><i class="fas fa-question-circle"></i> Motivación</h4>
                        <p style="background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #667eea;">
                            "${req.reason}"
                        </p>
                    </div>
                    
                    <div class="info-section">
                        <h4><i class="fas fa-clock"></i> Fechas</h4>
                        <p><strong>Fecha de Solicitud:</strong> ${formatDate(req.dateRequested)}</p>
                        ${req.docsDate ? `<p><strong>Documentos Enviados:</strong> ${formatDate(req.docsDate)}</p>` : ''}
                        ${req.approvedDate ? `<p><strong>Fecha de Aprobación:</strong> ${formatDate(req.approvedDate)}</p>` : ''}
                    </div>
                    
                    <div class="info-section">
                        <h4><i class="fas fa-info-circle"></i> Estado Actual</h4>
                        <p>${getRequestStatusBadge(req.status)}</p>
                        ${req.adminNotes ? `<p><strong>Notas:</strong> ${req.adminNotes}</p>` : ''}
                    </div>
                    
                    ${req.status === 'docs_sent' || req.status === 'approved' ? `
                        <div class="info-section">
                            <h4><i class="fas fa-file-alt"></i> Documentos</h4>
                            ${req.licenseId ? `
                                <p>
                                    <a href="https://drive.google.com/file/d/${req.licenseId}/view" target="_blank" class="btn btn-secondary btn-sm">
                                        <i class="fas fa-id-card"></i> Ver Licencia
                                    </a>
                                </p>
                            ` : ''}
                            ${req.circulationId ? `
                                <p>
                                    <a href="https://drive.google.com/file/d/${req.circulationId}/view" target="_blank" class="btn btn-secondary btn-sm">
                                        <i class="fas fa-file"></i> Ver Tarjeta de Circulación
                                    </a>
                                </p>
                            ` : ''}
                            ${req.photoId ? `
                                <p>
                                    <a href="https://drive.google.com/file/d/${req.photoId}/view" target="_blank" class="btn btn-secondary btn-sm">
                                        <i class="fas fa-camera"></i> Ver Selfie
                                    </a>
                                </p>
                            ` : ''}
                            ${req.contractAccepted ? `
                                <p style="color: #28a745;">
                                    <i class="fas fa-check-circle"></i> Contrato aceptado
                                </p>
                            ` : ''}
                        </div>
                    ` : ''}
                    
                    <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                        <button class="btn btn-secondary" onclick="closeRequestDetailModal()">
                            Cerrar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeRequestDetailModal() {
    const modal = document.getElementById('requestDetailModal');
    if(modal) modal.remove();
}

// ============================================
// GENERAR LINK DE DOCUMENTOS
// ============================================

async function generateDocsLink(requestId) {
    const req = allDeliveryRequests.find(r => r.requestId === requestId);
    if(!req) {
        alert('Solicitud no encontrada');
        return;
    }
    
    if(!req.docsToken) {
        alert('Error: Esta solicitud no tiene token generado');
        return;
    }
    
    // OPCIÓN 1: URL fija (RECOMENDADO)
    const baseUrl = 'https://jkolansinsky.github.io/pedidos-impresto';  // ← CAMBIAR AQUÍ
    
    // OPCIÓN 2: Detectar automáticamente
    // const baseUrl = window.location.origin;
    
    const docsLink = `${baseUrl}/repartidor.html?action=complete-docs&token=${req.docsToken}`;
    
    console.log('Link generado:', docsLink);  // Para verificar
    
    const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(docsLink)}`;
    
    showLinkModal(req, docsLink, qrUrl, 'docs');
}

function showLinkModal(req, link, qrUrl, type) {
    const isDocsLink = type === 'docs';
    const title = isDocsLink ? 'Link para Subir Documentos' : 'Link para Crear Usuario';
    const instructions = isDocsLink ? 
        'El repartidor podrá subir su licencia, tarjeta de circulación y selfie.' :
        'El repartidor podrá crear su usuario y contraseña para acceder al sistema.';
    
    const modalHtml = `
        <div class="modal active" id="linkModal">
            <div class="modal-content" style="max-width: 700px;">
                <div class="modal-header">
                    <h3><i class="fas fa-link"></i> ${title}</h3>
                    <button class="close-modal" onclick="closeLinkModal()">×</button>
                </div>
                <div class="modal-body">
                    <div style="text-align: center; margin-bottom: 20px; padding: 15px; background: #f0f4ff; border-radius: 8px;">
                        <h4 style="margin: 0; color: #667eea;">
                            <i class="fas fa-user"></i> ${req.fullName}
                        </h4>
                        <p style="margin: 5px 0 0 0; color: #666;">
                            <i class="fas fa-phone"></i> ${req.phone}
                        </p>
                    </div>
                    
                    <div style="background: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin-bottom: 20px;">
                        <p style="margin: 0;">
                            <i class="fas fa-info-circle"></i> <strong>Importante:</strong> ${instructions}
                        </p>
                    </div>
                    
                    <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
                        <label style="font-weight: bold; margin-bottom: 10px; display: block;">
                            <i class="fas fa-link"></i> Link:
                        </label>
                        <div style="display: flex; gap: 10px;">
                            <input type="text" id="generatedLink" value="${link}" 
                                   readonly style="flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-family: monospace; font-size: 0.9em;">
                            <button class="btn btn-primary" onclick="copyGeneratedLink()">
                                <i class="fas fa-copy"></i> Copiar
                            </button>
                        </div>
                    </div>
                    
                    <div style="text-align: center; margin-bottom: 20px;">
                        <label style="font-weight: bold; margin-bottom: 10px; display: block;">
                            <i class="fas fa-qrcode"></i> Código QR:
                        </label>
                        <img src="${qrUrl}" alt="QR Code" style="border: 2px solid #ddd; border-radius: 8px; padding: 10px; background: white;">
                        <br>
                        <a href="${qrUrl}" download="QR-${req.requestId}.png" class="btn btn-success" style="margin-top: 10px;">
                            <i class="fas fa-download"></i> Descargar QR
                        </a>
                    </div>
                    
                    <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; border-left: 4px solid #2196f3; margin-bottom: 20px;">
                        <h4 style="margin-top: 0;">
                            <i class="fas fa-envelope"></i> Mensaje de WhatsApp
                        </h4>
                        <textarea id="whatsappMessage" rows="8" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-family: inherit;" readonly>¡Hola ${req.fullName}! 👋

Tu solicitud para ser repartidor ha sido revisada.

${isDocsLink ? 
`Por favor, completa tu registro subiendo los siguientes documentos:
✅ Licencia de conducir
✅ Tarjeta de circulación
✅ Selfie de verificación` : 
`¡Felicidades! Tu solicitud ha sido aprobada. 🎉

Ahora crea tu usuario y contraseña para acceder al sistema.`}

Puedes escanear este QR o abrir el link:

${link}

Este enlace es válido por 7 días.

¡Gracias! 🚗</textarea>
                        <button class="btn btn-secondary btn-sm" onclick="copyWhatsAppMessage()" style="margin-top: 10px; width: 100%;">
                            <i class="fas fa-copy"></i> Copiar Mensaje
                        </button>
                    </div>
                    
                    <div style="display: flex; gap: 10px; justify-content: space-between; flex-wrap: wrap;">
                        <button class="btn btn-success" onclick="sendViaWhatsApp('${req.phone}', '${req.fullName}', '${link}', ${isDocsLink})" style="flex: 1;">
                            <i class="fab fa-whatsapp"></i> Abrir WhatsApp
                        </button>
                        <button class="btn btn-secondary" onclick="closeLinkModal()">
                            <i class="fas fa-times"></i> Cerrar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function copyGeneratedLink() {
    const input = document.getElementById('generatedLink');
    input.select();
    document.execCommand('copy');
    
    // Feedback visual
    const button = event.target.closest('button');
    const originalHTML = button.innerHTML;
    button.innerHTML = '<i class="fas fa-check"></i> Copiado';
    button.style.background = '#28a745';
    
    setTimeout(() => {
        button.innerHTML = originalHTML;
        button.style.background = '';
    }, 2000);
}

function copyWhatsAppMessage() {
    const textarea = document.getElementById('whatsappMessage');
    textarea.select();
    document.execCommand('copy');
    
    // Feedback visual
    const button = event.target.closest('button');
    const originalHTML = button.innerHTML;
    button.innerHTML = '<i class="fas fa-check"></i> Mensaje Copiado';
    button.style.background = '#28a745';
    
    setTimeout(() => {
        button.innerHTML = originalHTML;
        button.style.background = '';
    }, 2000);
}

function sendViaWhatsApp(phone, name, link, isDocsLink) {
    // Limpiar número
    const cleanPhone = phone.replace(/\D/g, '');
    
    // Mensaje
    const message = isDocsLink ?
        `¡Hola ${name}! 👋

Tu solicitud para ser repartidor ha sido revisada.

Por favor, completa tu registro subiendo los siguientes documentos:
✅ Licencia de conducir
✅ Tarjeta de circulación
✅ Selfie de verificación

Puedes escanear este QR o abrir el link:

${link}

Este enlace es válido por 7 días.

¡Gracias! 🚗` :
        `¡Hola ${name}! 👋

¡Felicidades! Tu solicitud ha sido aprobada. 🎉

Ahora crea tu usuario y contraseña para acceder al sistema:

${link}

Este enlace es válido por 7 días.

¡Bienvenido al equipo! 🚗`;
    
    // Abrir WhatsApp
    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
}

function closeLinkModal() {
    const modal = document.getElementById('linkModal');
    if(modal) modal.remove();
}

// ============================================
// REVISAR DOCUMENTOS Y APROBAR/RECHAZAR
// ============================================

function reviewDocuments(requestId) {
    const req = allDeliveryRequests.find(r => r.requestId === requestId);
    if(!req) {
        alert('Solicitud no encontrada');
        return;
    }
    
    const modalHtml = `
        <div class="modal active" id="reviewModal">
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h3><i class="fas fa-folder-open"></i> Revisar Documentos</h3>
                    <button class="close-modal" onclick="closeReviewModal()">×</button>
                </div>
                <div class="modal-body">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h4>${req.fullName}</h4>
                        <p>${req.phone} • ${req.email}</p>
                    </div>
                    
                    <div class="info-section">
                        <h4><i class="fas fa-file-alt"></i> Documentos Subidos</h4>
                        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-top: 15px;">
                            ${req.licenseId ? `
                                <a href="https://drive.google.com/file/d/${req.licenseId}/view" target="_blank" 
                                   class="doc-card" style="display: block; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center; text-decoration: none; color: inherit; border: 2px solid #ddd;">
                                    <i class="fas fa-id-card" style="font-size: 2em; color: #667eea; margin-bottom: 10px;"></i>
                                    <p style="margin: 0; font-weight: bold;">Licencia de Conducir</p>
                                    <small style="color: #666;">Click para ver</small>
                                </a>
                            ` : '<p>❌ Licencia no subida</p>'}
                            
                            ${req.circulationId ? `
                                <a href="https://drive.google.com/file/d/${req.circulationId}/view" target="_blank" 
                                   class="doc-card" style="display: block; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center; text-decoration: none; color: inherit; border: 2px solid #ddd;">
                                    <i class="fas fa-file" style="font-size: 2em; color: #667eea; margin-bottom: 10px;"></i>
                                    <p style="margin: 0; font-weight: bold;">Tarjeta de Circulación</p>
                                    <small style="color: #666;">Click para ver</small>
                                </a>
                            ` : '<p>❌ Tarjeta no subida</p>'}
                            
                            ${req.photoId ? `
                                <a href="https://drive.google.com/file/d/${req.photoId}/view" target="_blank" 
                                   class="doc-card" style="display: block; padding: 20px; background: #f8f9fa; border-radius: 8px; text-align: center; text-decoration: none; color: inherit; border: 2px solid #ddd;">
                                    <i class="fas fa-camera" style="font-size: 2em; color: #667eea; margin-bottom: 10px;"></i>
                                    <p style="margin: 0; font-weight: bold;">Selfie de Verificación</p>
                                    <small style="color: #666;">Click para ver</small>
                                </a>
                            ` : '<p>❌ Selfie no subida</p>'}
                        </div>
                        
                        ${req.contractAccepted ? `
                            <p style="margin-top: 15px; padding: 10px; background: #d4edda; border-radius: 5px; color: #155724;">
                                <i class="fas fa-check-circle"></i> <strong>Contrato aceptado</strong>
                            </p>
                        ` : ''}
                    </div>
                    
                    <div class="info-section">
                        <h4><i class="fas fa-sticky-note"></i> Notas Administrativas (opcional)</h4>
                        <textarea id="adminNotes" rows="3" placeholder="Agregar notas sobre esta solicitud..." 
                                  style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">${req.adminNotes || ''}</textarea>
                    </div>
                    
                    <div style="display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap;">
                        <button class="btn btn-success" onclick="approveRequest('${requestId}')" style="flex: 1;">
                            <i class="fas fa-check-circle"></i> Aprobar Solicitud
                        </button>
                        <button class="btn btn-danger" onclick="rejectRequest('${requestId}')" style="flex: 1;">
                            <i class="fas fa-times-circle"></i> Rechazar Solicitud
                        </button>
                        <button class="btn btn-secondary" onclick="closeReviewModal()">
                            <i class="fas fa-times"></i> Cerrar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeReviewModal() {
    const modal = document.getElementById('reviewModal');
    if(modal) modal.remove();
}

async function approveRequest(requestId) {
    if(!confirm('¿Estás seguro de aprobar esta solicitud?\n\nSe enviará un link al repartidor para crear su usuario.')) {
        return;
    }
    
    showLoading(true);
    
    try {
        const notes = document.getElementById('adminNotes')?.value || '';
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'approveDeliveryRequest',
                requestId: requestId,
                notes: notes
            })
        });
        
        const result = await response.json();
        
        if(result.success) {
            alert('✅ Solicitud aprobada exitosamente\n\nSe ha enviado un email al repartidor con el link para crear su usuario.');
            closeReviewModal();
            loadDeliveryRequests(); // Recargar lista
        } else {
            alert('Error: ' + result.message);
        }
    } catch(error) {
        alert('Error: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function rejectRequest(requestId) {
    const reason = prompt('¿Por qué se rechaza esta solicitud?\n\n(Este mensaje se enviará al solicitante)');
    
    if(!reason) {
        alert('Debes proporcionar un motivo de rechazo');
        return;
    }
    
    showLoading(true);
    
    try {
        const notes = document.getElementById('adminNotes')?.value || '';
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'rejectDeliveryRequest',
                requestId: requestId,
                reason: reason,
                notes: notes
            })
        });
        
        const result = await response.json();
        
        if(result.success) {
            alert('Solicitud rechazada');
            closeReviewModal();
            loadDeliveryRequests(); // Recargar lista
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
// VER LINK DE CREACIÓN DE USUARIO (para aprobados)
// ============================================

async function viewUserCreationLink(requestId) {
    const req = allDeliveryRequests.find(r => r.requestId === requestId);
    if(!req || !req.userToken) {
        alert('Error: No se encontró el token de creación de usuario');
        return;
    }
    
    const baseUrl = window.location.origin;
    const userLink = `${baseUrl}/repartidor.html?action=create-user&token=${req.userToken}`;
    const qrUrl = `https://chart.googleapis.com/chart?cht=qr&chs=300x300&chl=${encodeURIComponent(userLink)}`;
    
    showLinkModal(req, userLink, qrUrl, 'user');
}

// ============================================
// REPORTES
// ============================================

function generateReport() {
    alert('Funcionalidad de reportes en desarrollo');
}

























