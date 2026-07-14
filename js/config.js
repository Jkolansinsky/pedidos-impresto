// ============================================
// CONFIGURACION GLOBAL
// ============================================

// URL de tu Google Apps Script (CAMBIAR POR LA TUYA)
const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwHo-e5N6eLBOIrVQLD6iI-E_qrtX3PjNHxhTO84hIE45R7PNwU_u6My-JDLXugYxXW_Q/exec';

// Variables globales de geolocalizaciÃ³n
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
        'processing': 'En ElaboraciÃ³n',
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
 * Cierra sesion
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
 * Solicita permisos de geolocalizacion al cargar la pagina
 */
function initGeolocation() {
    if('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            function(position) {
                userCurrentLocation = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                };
                console.log('Geolocalizacion activada:', userCurrentLocation);
                
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
                console.error('Error de geolocalizacion:', error);
                alert('Por favor activa la ubicacion para usar todas las funcionalidades del sistema');
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    } else {
        console.warn('Geolocalizacion no soportada');
        alert('Tu navegador no soporta geolocalizacion');
    }
}

/**
 * Geocodificar direccion a coordenadas usando Nominatim (OpenStreetMap)
 */
async function geocodeAddress(address) {
    try {
        console.log(' Iniciando geocodificacion para:', address);
        
        // Limpiar y preparar la direcciÃ³n
        const cleanAddress = address.trim();
        const query = encodeURIComponent(cleanAddress);
        
        // Usar Nominatim con parametros mejorados para Mexico
        const url = `https://nominatim.openstreetmap.org/search?` +
                    `format=json` +
                    `&q=${query}` +
                    `&limit=5` +
                    `&countrycodes=mx` +
                    `&addressdetails=1` +
                    `&bounded=1` +
                    `&viewbox=-93.5,17.5,-92.3,18.5`;  // Area de Tabasco
        
        console.log(' URL de geocodificacion:', url);
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'CentroCopiado/1.0'
            }
        });
        
        const data = await response.json();
        
        console.log('ðŸ“¦ Respuesta completa de geocodificacion:', data);
        
        if(data && data.length > 0) {
            // Tomar el primer resultado (mas relevante)
            const result = data[0];
            
            const coords = {
                latitude: parseFloat(result.lat),
                longitude: parseFloat(result.lon)
            };
            
            console.log(' Coordenadas encontradas:', coords);
            console.log(' Nombre del lugar:', result.display_name);
            console.log(' Tipo de lugar:', result.type);
            console.log(' Importancia:', result.importance);
            
            // Verificar que las coordenadas estan dentro de un rango razonable para Villahermosa/Tabasco
            const isInTabasco = (
                coords.latitude >= 17.5 && coords.latitude <= 18.5 &&
                coords.longitude >= -93.5 && coords.longitude <= -92.3
            );
            
            if(!isInTabasco) {
                console.warn(' Las coordenadas parecen estar fuera de Tabasco');
                console.warn(' Usando coordenadas por defecto');
                return {
                    latitude: 17.9892,
                    longitude: -92.9475
                };
            }
            
            return coords;
        }
        
        console.warn(' No se encontraron coordenadas, usando ubicacion por defecto de Villahermosa');
        
        // Si no encuentra, retornar coordenadas por defecto (Centro de Villahermosa)
        return {
            latitude: 17.9892,
            longitude: -92.9475
        };
    } catch(error) {
        console.error('Error en geocodificacion:', error);
        // Coordenadas por defecto (Centro de Villahermosa)
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

// Inicializar geolocalizacion al cargar cualquier pagina
document.addEventListener('DOMContentLoaded', function() {
    initGeolocation();
});

// Limpiar el watch cuando se cierre la pagina
window.addEventListener('beforeunload', function() {
    if(geoWatchId) {
        navigator.geolocation.clearWatch(geoWatchId);
    }
});



























































