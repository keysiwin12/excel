/**
 * UTILS.GS - Funciones auxiliares y utilidades
 */

// ============================================
// GENERACIÓN DE IDS
// ============================================

/**
 * Genera un número de resguardo único
 * Formato: RES-2026-0001
 * @returns {string} Número de resguardo
 */
function generarResguardo() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  const anio = new Date().getFullYear();
  const numero = String(lastRow).padStart(4, '0');

  return `RES-${anio}-${numero}`;
}

/**
 * Genera un ID único para reparación
 * Formato: REP-2026-0001
 * @returns {string} ID de reparación
 */
function generarIdReparacion() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  const anio = new Date().getFullYear();
  const numero = String(lastRow).padStart(4, '0');

  return `REP-${anio}-${numero}`;
}

// ============================================
// FORMATEO DE DATOS
// ============================================

/**
 * Formatea una fecha a string legible
 * @param {Date|string} fecha - Fecha a formatear
 * @param {boolean} conHora - Incluir hora (por defecto false)
 * @returns {string} Fecha formateada
 */
function formatearFecha(fecha, conHora) {
  if (!fecha) return "";

  const f = new Date(fecha);

  if (isNaN(f.getTime())) return "";

  const dia = String(f.getDate()).padStart(2, '0');
  const mes = String(f.getMonth() + 1).padStart(2, '0');
  const anio = f.getFullYear();

  let resultado = `${dia}/${mes}/${anio}`;

  if (conHora) {
    const hora = String(f.getHours()).padStart(2, '0');
    const minuto = String(f.getMinutes()).padStart(2, '0');
    resultado += ` ${hora}:${minuto}`;
  }

  return resultado;
}

/**
 * Formatea un número como moneda europea
 * @param {number} cantidad - Cantidad a formatear
 * @returns {string} Cantidad formateada
 */
function formatearMoneda(cantidad) {
  if (cantidad === null || cantidad === undefined) return "0,00 €";

  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR'
  }).format(cantidad);
}

/**
 * Calcula el IVA de una cantidad
 * @param {number} cantidad - Cantidad sin IVA
 * @param {number} porcentaje - Porcentaje de IVA (por defecto 21)
 * @returns {number} IVA calculado
 */
function calcularIVA(cantidad, porcentaje) {
  porcentaje = porcentaje || 21;
  return cantidad * (porcentaje / 100);
}

/**
 * Calcula días transcurridos entre dos fechas
 * @param {Date} fechaInicio - Fecha de inicio
 * @param {Date} fechaFin - Fecha de fin (por defecto hoy)
 * @returns {number} Días transcurridos
 */
function calcularDiasTranscurridos(fechaInicio, fechaFin) {
  if (!fechaInicio) return 0;

  fechaFin = fechaFin || new Date();

  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);

  const diferencia = fin - inicio;
  const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));

  return dias;
}

// ============================================
// VALIDACIONES
// ============================================

/**
 * Valida que un email sea válido
 * @param {string} email - Email a validar
 * @returns {boolean} True si es válido
 */
function validarEmail(email) {
  if (!email) return false;

  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Valida que un teléfono sea válido
 * @param {string} telefono - Teléfono a validar
 * @returns {boolean} True si es válido
 */
function validarTelefono(telefono) {
  if (!telefono) return false;

  // Eliminar espacios y caracteres especiales
  const limpio = telefono.replace(/[\s\-\(\)]/g, '');

  // Debe tener al menos 9 dígitos
  return limpio.length >= 9 && /^\d+$/.test(limpio);
}

/**
 * Valida los datos de una reparación antes de crear/actualizar
 * @param {Object} datos - Datos de la reparación
 * @param {boolean} esCreacion - True si es creación, false si es actualización
 * @returns {Object} Resultado de validación {valido: boolean, errores: Array}
 */
function validarDatosReparacion(datos, esCreacion) {
  const errores = [];

  // Validaciones para creación
  if (esCreacion) {
    if (!datos.clienteNombre || datos.clienteNombre.trim() === "") {
      errores.push("El nombre del cliente es obligatorio");
    }

    if (!datos.clienteTelefono || datos.clienteTelefono.trim() === "") {
      errores.push("El teléfono del cliente es obligatorio");
    } else if (!validarTelefono(datos.clienteTelefono)) {
      errores.push("El teléfono no es válido");
    }

    if (datos.clienteEmail && !validarEmail(datos.clienteEmail)) {
      errores.push("El email no es válido");
    }

    if (!datos.equipoModelo || datos.equipoModelo.trim() === "") {
      errores.push("El modelo del equipo es obligatorio");
    }

    if (!datos.sintoma || datos.sintoma.trim() === "") {
      errores.push("El síntoma/avería es obligatorio");
    }
  }

  return {
    valido: errores.length === 0,
    errores: errores
  };
}

// ============================================
// SANITIZACIÓN
// ============================================

/**
 * Limpia y sanitiza un texto
 * @param {string} texto - Texto a limpiar
 * @returns {string} Texto limpio
 */
function sanitizarTexto(texto) {
  if (!texto) return "";

  return texto
    .toString()
    .trim()
    .replace(/\s+/g, ' '); // Eliminar múltiples espacios
}

/**
 * Formatea un teléfono a formato estándar
 * @param {string} telefono - Teléfono a formatear
 * @returns {string} Teléfono formateado
 */
function formatearTelefono(telefono) {
  if (!telefono) return "";

  // Eliminar todo excepto números y el símbolo +
  let limpio = telefono.replace(/[^\d+]/g, '');

  // Si no empieza con +, agregar +34 (España) por defecto
  if (!limpio.startsWith('+')) {
    // Si empieza con 34, agregar solo +
    if (limpio.startsWith('34')) {
      limpio = '+' + limpio;
    }
    // Si empieza con 6, 7, 9 (móviles España), agregar +34
    else if (limpio.match(/^[679]/)) {
      limpio = '+34' + limpio;
    }
    // Si empieza con 51 (Perú), agregar +
    else if (limpio.startsWith('51')) {
      limpio = '+' + limpio;
    }
  }

  return limpio;
}

// ============================================
// HELPERS DE ESTADO
// ============================================

/**
 * Verifica si un estado requiere notificación de recojo
 * @param {string} estado - Estado de la reparación
 * @returns {boolean} True si requiere notificación
 */
function estadoRequiereRecojo(estado) {
  const estadosRecojo = [
    "Reparado",
    "No tiene Reparación",
    "Presupuesto Rechazado"
  ];

  return estadosRecojo.includes(estado);
}

/**
 * Obtiene el icono y color de un estado
 * @param {string} estado - Estado de la reparación
 * @returns {Object} {icono, color, descripcion}
 */
function obtenerInfoEstado(estado) {
  return ESTADOS_REPARACION[estado] || {
    icono: "❓",
    color: "#6c757d",
    descripcion: "Estado desconocido"
  };
}

/**
 * Obtiene el icono y color de un estado de pedido
 * @param {string} estadoPedido - Estado del pedido
 * @returns {Object} {icono, color, descripcion}
 */
function obtenerInfoEstadoPedido(estadoPedido) {
  return ESTADOS_PEDIDO[estadoPedido] || ESTADOS_PEDIDO[""];
}

// ============================================
// NOTIFICACIONES Y LOGS
// ============================================

/**
 * Registra una acción en el log
 * @param {string} tipo - Tipo de acción
 * @param {string} mensaje - Mensaje del log
 * @param {Object} datos - Datos adicionales
 */
function registrarLog(tipo, mensaje, datos) {
  const timestamp = new Date().toISOString();
  const usuario = Session.getActiveUser().getEmail();

  const logEntry = {
    timestamp: timestamp,
    tipo: tipo,
    usuario: usuario,
    mensaje: mensaje,
    datos: datos
  };

  Logger.log(`[${tipo}] ${mensaje}`);

  // TODO: Opcionalmente guardar en una hoja de logs
  // const logSheet = getLogSheet();
  // logSheet.appendRow([timestamp, tipo, usuario, mensaje, JSON.stringify(datos)]);
}

// ============================================
// CACHE HELPERS
// ============================================

/**
 * Invalida todos los cachés
 */
function invalidarCaches() {
  const cache = CacheService.getScriptCache();
  cache.remove('metricas-dashboard');
  Logger.log('🗑️ Cachés invalidados');
}

/**
 * Obtiene un valor del caché o lo calcula si no existe
 * @param {string} key - Clave del caché
 * @param {Function} calculador - Función que calcula el valor si no existe
 * @param {number} ttl - Tiempo de vida en segundos (por defecto 300 = 5 min)
 * @returns {*} Valor del caché o calculado
 */
function obtenerOCalcular(key, calculador, ttl) {
  ttl = ttl || 300;

  const cache = CacheService.getScriptCache();
  const cached = cache.get(key);

  if (cached) {
    return JSON.parse(cached);
  }

  const valor = calculador();
  cache.put(key, JSON.stringify(valor), ttl);

  return valor;
}

// ============================================
// EXPORT/IMPORT
// ============================================

/**
 * Exporta una reparación a JSON
 * @param {Object} reparacion - Objeto de reparación
 * @returns {string} JSON string
 */
function exportarReparacionJSON(reparacion) {
  return JSON.stringify(reparacion, null, 2);
}

/**
 * Importa una reparación desde JSON
 * @param {string} json - JSON string
 * @returns {Object} Objeto de reparación
 */
function importarReparacionJSON(json) {
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`Error al parsear JSON: ${error.message}`);
  }
}

// ============================================
// PERMISOS Y AUTENTICACIÓN
// ============================================

/**
 * Obtiene el usuario actual
 * @returns {Object} {email, nombre}
 */
function obtenerUsuarioActual() {
  const email = Session.getActiveUser().getEmail();

  return {
    email: email,
    nombre: email.split('@')[0],
    esValido: validarUsuario(email)
  };
}

/**
 * Verifica si el usuario actual tiene permisos
 * @returns {boolean} True si tiene permisos
 */
function verificarPermisos() {
  // Sin validación por ahora - permitir todos los usuarios
  return true;
}
