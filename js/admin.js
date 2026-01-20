// ============================================
// VARIABLES GLOBALES
// ============================================

let currentUser = null;
let allOrders = [];
let currentOrder = null;
let currentLocation = null;

// ============================================
// INICIALIZACIÓN
// ============================================

document.addEventListener('DOMContentLoaded', function() {
    // Solicitar GPS inmediatamente al cargar
    requestGeolocationPermission();
    
    const user = checkAuth('admin'); // o 'user' para usuario.js
    if(user) {
        showAdminPanel(user); // o showUserPanel(user) para usuario.js
    }
});

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
                // No mostrar alert para no ser intrusivo en panel admin/usuario
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
    } else {
        const filtered = allOrders.filter(o => o.status === status);
        displayOrders(filtered);
    }
}

// ACTUALIZAR la función viewOrderDetail en admin.js y usuario.js

function viewOrderDetail(order) {
    currentOrder = order;
    
    const detailContent = document.getElementById('orderDetailContent');
    detailContent.innerHTML = `
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
        </div>

        <h4><i class="fas fa-list"></i> Trabajos Solicitados</h4>
        <div style="margin-bottom: 20px;">
            ${order.works.map((work, idx) => {
                // Buscar archivo correspondiente
                const workFile = order.fileUrls ? order.fileUrls.find(f => f.type === 'work' && f.workIndex === idx) : null;
                
                return `
                    <div class="cart-item" style="margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: start;">
                            <div style="flex: 1;">
                                <p><strong>${idx + 1}. ${work.fileName}</strong></p>
                                <p>Cantidad: ${work.copies} | Tipo: ${work.printType}</p>
                                ${work.color ? `<p>Color: ${work.color} | Papel: ${work.paperType}</p>` : ''}
                                ${work.vinilType ? `<p>Vinil: ${work.vinilType}</p>` : ''}
                                ${work.finishing && work.finishing.length > 0 ? `<p>Acabado: ${work.finishing.join(', ')}</p>` : ''}
                                ${work.observations ? `<p><em>Obs: ${work.observations}</em></p>` : ''}
                                <p style="text-align: right;"><strong>$${work.price.toFixed(2)}</strong></p>
                            </div>
                            ${workFile ? `
                                <div style="margin-left: 15px;">
                                    <a href="${workFile.downloadUrl}" target="_blank" class="btn btn-primary" style="padding: 8px 15px; font-size: 0.9em; text-decoration: none;">
                                        <i class="fas fa-download"></i> Descargar Archivo
                                    </a>
                                </div>
                            ` : '<p style="color: #dc3545; font-size: 0.9em; margin-left: 15px;"><i class="fas fa-exclamation-triangle"></i> Archivo no disponible</p>'}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        
        ${order.fileUrls && order.fileUrls.some(f => f.type === 'proof') ? `
            <div style="background: #d4edda; padding: 15px; border-radius: 8px; border-left: 4px solid #28a745; margin-bottom: 20px;">
                <h4><i class="fas fa-receipt"></i> Comprobante de Pago</h4>
                ${order.fileUrls.filter(f => f.type === 'proof').map(proof => `
                    <a href="${proof.downloadUrl}" target="_blank" class="btn btn-success" style="text-decoration: none; margin-top: 10px;">
                        <i class="fas fa-download"></i> Descargar Comprobante
                    </a>
                `).join('')}
            </div>
        ` : ''}
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

async function updateOrderStatus() {
    const newStatus = document.getElementById('orderStatus').value;
    const notes = document.getElementById('statusNotes').value.trim();
    const employee = document.getElementById('assignEmployee').value.trim() || currentUser.username;

    if(!currentOrder) {
        alert('No hay pedido seleccionado');
        return;
    }

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
                bankData: bankData
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
// REPORTES
// ============================================

function generateReport() {
    alert('Funcionalidad de reportes en desarrollo');
}


