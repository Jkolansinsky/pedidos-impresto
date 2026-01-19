// ============================================
// CONFIGURACIÓN GLOBAL
// ============================================

// URL de tu Google Apps Script (CAMBIAR POR LA TUYA)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwOKUNAEw6pn5EGU8D3gIbGHjB7QZEsKMbbmJGT0-IfEjxj359Hzde-fzxGe0oV1xy4-Q/exec';

// ============================================
// FUNCIONES COMUNES
// ============================================

/**
 * Muestra/oculta el loading
 */
function showLoading(show) {
    const loading = document.getElementById('loading');
    if(loading) {
        loading.classList.toggle('active', show);
    }
}

/**
 * Obtiene el texto del estado
 */
function getStatusText(status) {
    const statusMap = {
        'new': 'Nuevo (Recibido)',
        'assigned': 'Asignado',
        'processing': 'En Elaboración',
        'ready': 'Listo para Entrega',
        'delivering': 'En Camino',
        'delivered': 'Entregado'
    };
    return statusMap[status] || status;
}

/**
 * Formatea fecha a formato local
 */
function formatDate(dateString) {
    return new Date(dateString).toLocaleString('es-MX', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Parse JSON de forma segura
 */
function safeJSONParse(str, defaultValue = null) {
    try {
        return JSON.parse(str);
    } catch(e) {
        return defaultValue;
    }
}

/**
 * Cierra sesión
 */
function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

/**
 * Verifica si hay usuario logueado
 */
function checkAuth(requiredRole) {
    const userStr = localStorage.getItem('currentUser');
    if(!userStr) {
        return null; // Solo retorna null, no redirige
    }
    
    const user = JSON.parse(userStr);
    
    if(requiredRole && user.role !== requiredRole) {
        // Limpiar y permitir nuevo login
        localStorage.removeItem('currentUser');
        return null;
    }
    
    return user;
}
