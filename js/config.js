// ============================================
// CONFIGURACIÓN GLOBAL
// ============================================

// URL de tu Google Apps Script (CAMBIAR POR LA TUYA)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzciQ_jywnaa4vgkGg89slyRA65r_eDkj73nB8WIP14ndDuaLduDOpZcdzQKyh81u8Axw/exec';

// Variables globales de geolocalización
let userCurrentLocation = null;
let geoWatchId = null;

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

/**
 * Solicita permisos de geolocalización al cargar la página
 */
function initGeolocation() {
    if('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                userCurrentLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                console.log('Geolocalización activada:', userCurrentLocation);
                
                // Iniciar seguimiento continuo
                geoWatchId = navigator.geolocation.watchPosition(
                    function(position) {
                        userCurrentLocation = {
                            latitude: position.coords.latitude,
                            longitude: position.coords.longitude
                        };
                    },
                    function(error) {
                        console.error('Error en seguimiento GPS:', error);
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 10000,
                        maximumAge: 5000
                    }
                );
            },
            function(error) {
                console.error('Error de geolocalización:', error);
                alert('Por favor activa la ubicación para usar todas las funcionalidades del sistema');
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        console.warn('Geolocalización no soportada');
        alert('Tu navegador no soporta geolocalización');
    }
}

/**
 * Geocodificar dirección a coordenadas usando Nominatim (OpenStreetMap)
 */
async function geocodeAddress(address) {
    try {
        const query = encodeURIComponent(address);
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
        const data = await response.json();
        
        if(data && data.length > 0) {
            return {
                latitude: parseFloat(data[0].lat),
                longitude: parseFloat(data[0].lon)
            };
        }
        
        // Si no encuentra, retornar coordenadas por defecto (Villahermosa, Tabasco)
        return {
            latitude: 17.9892,
            longitude: -92.9475
        };
    } catch(error) {
        console.error('Error en geocodificación:', error);
        // Coordenadas por defecto
        return {
            latitude: 17.9892,
            longitude: -92.9475
        };
    }
}

/**
 * Verifica si un pedido fue entregado hoy
 */
function isDeliveredToday(order) {
    if(order.status !== 'delivered') return false;
    
    const today = new Date().toISOString().split('T')[0];
    
    // Buscar en el historial el evento de entrega
    if(order.history && order.history.length > 0) {
        const deliveredEvent = order.history.find(h => h.status === 'delivered');
        if(deliveredEvent) {
            const deliveredDate = new Date(deliveredEvent.timestamp).toISOString().split('T')[0];
            return deliveredDate === today;
        }
    }
    
    // Si tiene deliveryDate
    if(order.deliveryDate) {
        const deliveredDate = new Date(order.deliveryDate).toISOString().split('T')[0];
        return deliveredDate === today;
    }
    
    return false;
}

// Inicializar geolocalización al cargar cualquier página
document.addEventListener('DOMContentLoaded', function() {
    initGeolocation();
});

// Limpiar el watch cuando se cierre la página
window.addEventListener('beforeunload', function() {
    if(geoWatchId) {
        navigator.geolocation.clearWatch(geoWatchId);
    }
});





