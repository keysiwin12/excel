/**
 * UTILS.GS - Funciones auxiliares y utilidades
 */

// ============================================
// FORMATEO DE DATOS
// ============================================

/**
 * Formatea una fecha a string legible
 * @param {Date|string} fecha
 * @param {boolean} conHora
 * @returns {string}
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
 * @param {number} cantidad
 * @returns {string}
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
 * @param {number} cantidad
 * @param {number} porcentaje - Por defecto 21
 * @returns {number}
 */
function calcularIVA(cantidad, porcentaje) {
  porcentaje = porcentaje || 21;
  return cantidad * (porcentaje / 100);
}

/**
 * Calcula días transcurridos entre dos fechas
 * @param {Date} fechaInicio
 * @param {Date} fechaFin
 * @returns {number}
 */
function calcularDiasTranscurridos(fechaInicio, fechaFin) {
  if (!fechaInicio) return 0;
  fechaFin = fechaFin || new Date();
  const diferencia = new Date(fechaFin) - new Date(fechaInicio);
  return Math.floor(diferencia / (1000 * 60 * 60 * 24));
}

/**
 * Calcula horas transcurridas entre dos fechas
 * @param {Date} fechaInicio
 * @param {Date} fechaFin
 * @returns {number}
 */
function calcularHorasTranscurridas(fechaInicio, fechaFin) {
  if (!fechaInicio) return 0;
  fechaFin = fechaFin || new Date();
  const diferencia = new Date(fechaFin) - new Date(fechaInicio);
  return Math.floor(diferencia / (1000 * 60 * 60));
}

/**
 * Calcula días laborables (L-V) entre dos fechas
 * @param {Date} fechaInicio
 * @param {Date} fechaFin
 * @returns {number}
 */
function calcularDiasLaborables(fechaInicio, fechaFin) {
  if (!fechaInicio) return 0;
  fechaFin = fechaFin || new Date();

  const inicio = new Date(fechaInicio);
  const fin = new Date(fechaFin);
  inicio.setHours(0, 0, 0, 0);
  fin.setHours(0, 0, 0, 0);

  let diasLaborables = 0;
  let fechaActual = new Date(inicio);

  while (fechaActual <= fin) {
    const diaSemana = fechaActual.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) {
      diasLaborables++;
    }
    fechaActual.setDate(fechaActual.getDate() + 1);
  }

  return diasLaborables;
}

// ============================================
// VALIDACIONES
// ============================================

/**
 * Valida que un email sea válido
 * @param {string} email
 * @returns {boolean}
 */
function validarEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Valida que un teléfono sea válido
 * @param {string} telefono
 * @returns {boolean}
 */
function validarTelefono(telefono) {
  if (!telefono) return false;
  const limpio = telefono.replace(/[\s\-\(\)]/g, '');
  return limpio.length >= 9 && /^\d+$/.test(limpio);
}

/**
 * Valida los datos de una reparación
 * @param {Object} datos
 * @param {boolean} esCreacion
 * @returns {Object} {valido, errores}
 */
function validarDatosReparacion(datos, esCreacion) {
  const errores = [];

  if (esCreacion) {
    if (!datos.clienteNombre || datos.clienteNombre.trim() === "") {
      errores.push("El nombre del cliente es obligatorio");
    }

    if (!datos.clienteTelefono || datos.clienteTelefono.trim() === "") {
      errores.push("El teléfono del cliente es obligatorio");
    } else {
      const telefonoLimpio = datos.clienteTelefono.trim().toLowerCase();
      const esExcepcion = telefonoLimpio === "0" || telefonoLimpio === "no tiene";
      if (!esExcepcion && !validarTelefono(datos.clienteTelefono)) {
        errores.push("El teléfono no es válido");
      }
    }

    if (datos.clienteEmail && datos.clienteEmail.trim() !== "") {
      const emailLimpio = datos.clienteEmail.trim().toLowerCase();
      const esExcepcion = emailLimpio === "0" || emailLimpio === "no tiene";
      if (!esExcepcion && !validarEmail(datos.clienteEmail)) {
        errores.push("El email no es válido");
      }
    }

    if (!datos.equipoModelo || datos.equipoModelo.trim() === "") {
      errores.push("El modelo del equipo es obligatorio");
    }

    if (!datos.sintoma || datos.sintoma.trim() === "") {
      errores.push("El síntoma/avería es obligatorio");
    }
  }

  return { valido: errores.length === 0, errores: errores };
}

// ============================================
// SANITIZACIÓN
// ============================================

/**
 * Limpia y sanitiza un texto
 * @param {string} texto
 * @returns {string}
 */
function sanitizarTexto(texto) {
  if (!texto) return "";
  return texto.toString().trim().replace(/\s+/g, ' ');
}

/**
 * Formatea un teléfono a formato estándar
 * @param {string} telefono
 * @returns {string}
 */
function formatearTelefono(telefono) {
  if (!telefono) return "";
  let limpio = telefono.replace(/[^\d+]/g, '');

  if (!limpio.startsWith('+')) {
    if (limpio.startsWith('34')) {
      limpio = '+' + limpio;
    } else if (limpio.match(/^[679]/)) {
      limpio = '+34' + limpio;
    } else if (limpio.startsWith('51')) {
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
 * @param {string} estado
 * @returns {boolean}
 */
function estadoRequiereRecojo(estado) {
  return ["Reparado", "No tiene Reparación", "Presupuesto Rechazado"].includes(estado);
}

/**
 * Obtiene el icono y color de un estado de reparación
 * @param {string} estado
 * @returns {Object}
 */
function obtenerInfoEstado(estado) {
  return ESTADOS_REPARACION[estado] || { icono: "?", color: "#6c757d", descripcion: "Estado desconocido" };
}

/**
 * Obtiene el icono y color de un estado de pedido
 * @param {string} estadoPedido
 * @returns {Object}
 */
function obtenerInfoEstadoPedido(estadoPedido) {
  return ESTADOS_PEDIDO[estadoPedido] || ESTADOS_PEDIDO["Pendiente"];
}

// ============================================
// NOTIFICACIONES Y LOGS
// ============================================

/**
 * Registra una acción en el log de Apps Script
 * @param {string} tipo
 * @param {string} mensaje
 * @param {Object} datos
 */
function registrarLog(tipo, mensaje, datos) {
  Logger.log(`[${tipo}] ${mensaje}`);
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
}

/**
 * Obtiene un valor del caché o lo calcula si no existe
 * @param {string} key
 * @param {Function} calculador
 * @param {number} ttl - Segundos (por defecto 300)
 * @returns {*}
 */
function obtenerOCalcular(key, calculador, ttl) {
  ttl = ttl || 300;
  const cache = CacheService.getScriptCache();
  const cached = cache.get(key);
  if (cached) return JSON.parse(cached);

  const valor = calculador();
  cache.put(key, JSON.stringify(valor), ttl);
  return valor;
}

// ============================================
// PERMISOS Y AUTENTICACIÓN
// ============================================

/**
 * Obtiene el usuario actual (buscando en tabla Empleados)
 * @returns {Object} {email, nombre, id, esTecnico, esComprador, esValido}
 */
function obtenerUsuarioActual() {
  const email = Session.getActiveUser().getEmail();
  const empleado = obtenerEmpleadoPorEmail(email);

  if (empleado) {
    return {
      email: email,
      nombre: empleado.nombre,
      id: empleado.id,
      esTecnico: empleado.esTecnico,
      esComprador: empleado.esComprador,
      esValido: true
    };
  }

  return {
    email: email,
    nombre: email.split('@')[0],
    id: "",
    esTecnico: false,
    esComprador: false,
    esValido: false
  };
}

/**
 * Verifica si el usuario actual tiene permisos
 * @returns {boolean}
 */
function verificarPermisos() {
  return true;
}
