/**
 * CODE.GS - Entry Point de la aplicación (Multi-Tabla)
 * Versión: 3.0.0 - Estructura Multi-Tabla Relacional
 */

// ============================================
// WEB APP - ENTRY POINT
// ============================================

/**
 * Función principal del Web App
 */
function doGet(e) {
  try {
    const template = HtmlService.createTemplateFromFile('Index');

    // Inyectar configuración estática
    template.KELATOS = KELATOS;
    template.ESTADOS_REPARACION = ESTADOS_REPARACION;
    template.ESTADOS_PEDIDO = ESTADOS_PEDIDO;
    template.ESTADOS_PRESUPUESTO = ESTADOS_PRESUPUESTO;
    template.MARCAS = MARCAS_EQUIPOS;

    // Cargar catálogos dinámicos desde la BD
    try {
      const empleados = obtenerEmpleados();
      const tecnicos = obtenerEmpleados({ esTecnico: true });
      const compradores = obtenerEmpleados({ esComprador: true });
      const proveedores = obtenerProveedores();

      template.EMPLEADOS = JSON.stringify(empleados);
      template.TECNICOS = JSON.stringify(tecnicos);
      template.COMPRADORES = JSON.stringify(compradores);
      template.PROVEEDORES = JSON.stringify(proveedores);
    } catch (error) {
      Logger.log(`Error cargando catálogos: ${error.message}`);
      template.EMPLEADOS = JSON.stringify([]);
      template.TECNICOS = JSON.stringify([]);
      template.COMPRADORES = JSON.stringify([]);
      template.PROVEEDORES = JSON.stringify([]);
    }

    // Pre-cargar datos del dashboard
    try {
      const reparaciones = buscarReparaciones({finalizadas: false}, 1, 50);
      template.REPARACIONES_INICIALES = JSON.stringify({
        exito: true,
        resultados: reparaciones.resultados || [],
        total: reparaciones.total || 0,
        pagina: 1,
        totalPaginas: reparaciones.totalPaginas || 1
      });

      const metricas = obtenerMetricas();
      template.METRICAS_INICIALES = JSON.stringify(metricas);
    } catch (error) {
      Logger.log(`Error pre-cargando datos: ${error.message}`);
      template.REPARACIONES_INICIALES = JSON.stringify({
        exito: false, error: error.message, resultados: [], total: 0
      });
      template.METRICAS_INICIALES = JSON.stringify({ exito: false, error: error.message });
    }

    const html = template.evaluate()
      .setTitle('Dashboard - Kelatos')
      .setFaviconUrl(KELATOS.logo)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    return html;

  } catch (error) {
    Logger.log(`Error en doGet: ${error.message}`);
    return ContentService.createTextOutput('Error: ' + error.message);
  }
}

/**
 * Obtiene la versión desplegada
 */
function obtenerVersion() {
  return {
    exito: true,
    version: '3.0.0',
    fecha: '2026-01-28',
    mensaje: 'Estructura Multi-Tabla Relacional'
  };
}

// ============================================
// API - AUTENTICACIÓN
// ============================================

function obtenerUsuarioGoogle() {
  try {
    const usuario = obtenerUsuarioActual();
    return { exito: true, usuario: usuario };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function cerrarSesion() {
  return { exito: true, mensaje: 'Sesión cerrada' };
}

// ============================================
// API - CATÁLOGOS (NUEVOS)
// ============================================

/**
 * API: Obtiene empleados (con filtro opcional)
 * @param {Object} filtro - {esTecnico, esComprador, activo}
 */
function apiObtenerEmpleados(filtro) {
  try {
    verificarPermisos();
    const empleados = obtenerEmpleados(filtro || {});
    return { exito: true, empleados: empleados };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

/**
 * API: Obtiene proveedores activos
 */
function apiObtenerProveedores() {
  try {
    verificarPermisos();
    const proveedores = obtenerProveedores();
    return { exito: true, proveedores: proveedores };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

// ============================================
// API - REPARACIONES (CRUD)
// ============================================

function apiObtenerSiguienteResguardo() {
  try {
    verificarPermisos();
    return { exito: true, resguardo: generarSiguienteResguardo() };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function apiCrearReparacion(datos) {
  try {
    verificarPermisos();

    const validacion = validarDatosReparacion(datos, true);
    if (!validacion.valido) {
      return { exito: false, errores: validacion.errores };
    }

    datos.clienteNombre = sanitizarTexto(datos.clienteNombre);
    datos.clienteTelefono = formatearTelefono(datos.clienteTelefono);
    datos.clienteEmail = sanitizarTexto(datos.clienteEmail);
    datos.equipoModelo = sanitizarTexto(datos.equipoModelo);
    datos.sintoma = sanitizarTexto(datos.sintoma);

    return crearReparacion(datos);

  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function apiObtenerReparacion(resguardo) {
  try {
    verificarPermisos();
    const reparacion = obtenerReparacion(resguardo);
    return { exito: true, reparacion: reparacion };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function apiBuscarReparaciones(filtros, pagina, porPagina) {
  filtros = filtros || {};
  pagina = pagina || 1;
  porPagina = porPagina || 50;

  try {
    verificarPermisos();
    const resultados = buscarReparaciones(filtros, pagina, porPagina);

    if (!resultados) {
      return { exito: false, error: 'No se obtuvieron resultados' };
    }

    return {
      exito: true,
      resultados: resultados.resultados || [],
      total: resultados.total || 0,
      pagina: resultados.pagina || pagina,
      totalPaginas: resultados.totalPaginas || 1
    };

  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function apiActualizarReparacion(resguardo, datos) {
  try {
    verificarPermisos();
    return actualizarReparacion(resguardo, datos);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

// ============================================
// API - ESTADOS Y ACCIONES
// ============================================

function apiCambiarEstado(resguardo, nuevoEstado, opciones) {
  try {
    verificarPermisos();
    return cambiarEstadoReparacion(resguardo, nuevoEstado, opciones);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function apiAgregarObservacion(resguardo, texto) {
  try {
    verificarPermisos();
    texto = sanitizarTexto(texto);
    if (!texto) return { exito: false, error: 'El texto es obligatorio' };
    return agregarObservacion(resguardo, texto);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

// ============================================
// API - PRESUPUESTOS (NUEVO: Multi-presupuesto)
// ============================================

/**
 * API: Crea un presupuesto para una reparación
 * @param {string} resguardo
 * @param {Object} datos - {costoReparacion, gananciaNeta, diasEntrega, elaboradoPor, notas}
 * @param {Array} piezas - [{descripcion, proveedorId, costo, enlace, notas}]
 */
function apiCrearPresupuesto(resguardo, datos, piezas) {
  try {
    verificarPermisos();
    return crearPresupuesto(resguardo, datos, piezas);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

/**
 * API: Obtiene todos los presupuestos de una reparación
 * @param {string} resguardo
 */
function apiObtenerPresupuestos(resguardo) {
  try {
    verificarPermisos();
    const presupuestos = obtenerPresupuestosDeReparacion(resguardo);
    return { exito: true, presupuestos: presupuestos };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

/**
 * API: Envía TODOS los presupuestos en borrador de una reparación al cliente
 * @param {string} resguardo
 */
function apiEnviarPresupuestos(resguardo) {
  try {
    verificarPermisos();
    return enviarPresupuestos(resguardo);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

/**
 * API: Envía un presupuesto individual al cliente (legacy)
 * @param {string} presupuestoId
 */
function apiEnviarPresupuesto(presupuestoId) {
  try {
    verificarPermisos();
    return enviarPresupuesto(presupuestoId);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

/**
 * API: Acepta un presupuesto (rechaza los demás)
 * @param {string} presupuestoId
 */
function apiAceptarPresupuesto(presupuestoId, opciones) {
  try {
    verificarPermisos();
    return aceptarPresupuesto(presupuestoId, opciones || {});
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

/**
 * API: Rechaza un presupuesto
 * @param {string} presupuestoId
 * @param {string} motivo
 */
function apiRechazarPresupuesto(presupuestoId, motivo) {
  try {
    verificarPermisos();
    return rechazarPresupuesto(presupuestoId, motivo);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

// ============================================
// API - PEDIDOS/PIEZAS
// ============================================

/**
 * API: Registra un pedido de pieza
 * @param {string} resguardo
 * @param {Object} datos
 */
function apiRegistrarPedidoPieza(resguardo, datos) {
  try {
    verificarPermisos();
    return registrarPedidoPieza(resguardo, datos);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

/**
 * API: Cambia el estado de un pedido por pedidoId
 * @param {string} pedidoId - ID del pedido (no resguardo)
 * @param {string} nuevoEstado
 * @param {Object} opciones
 */
function apiCambiarEstadoPedido(pedidoId, nuevoEstado, opciones) {
  try {
    verificarPermisos();
    return cambiarEstadoPedido(pedidoId, nuevoEstado, opciones);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

/**
 * API: Actualiza el estado del pedido activo de una reparación (por resguardo)
 * Busca el pedido activo (En Tránsito/Pedido) y le cambia el estado.
 * @param {string} resguardo
 * @param {string} nuevoEstado
 * @param {string} fechaRecepcion - Fecha de recepción (opcional, para estado "Recibido")
 */
function apiActualizarEstadoPedido(resguardo, nuevoEstado, fechaRecepcion) {
  try {
    verificarPermisos();

    // Buscar pedidos de esta reparación
    const pedidos = obtenerPedidosDeReparacion(resguardo);
    if (!pedidos || pedidos.length === 0) {
      return { exito: false, error: 'No se encontraron pedidos para el resguardo ' + resguardo };
    }

    // Buscar TODOS los pedidos activos (En Tránsito o Pedido)
    const pedidosActivos = pedidos.filter(p =>
      p.estado === 'En Tránsito' || p.estado === 'Pedido' || p.estado === 'Pendiente'
    );

    if (pedidosActivos.length === 0) {
      return { exito: false, error: 'No se encontró un pedido activo para actualizar' };
    }

    const opciones = {};
    if (nuevoEstado === 'Recibido' && fechaRecepcion) {
      opciones.fechaRecepcion = fechaRecepcion;
    }

    // Marcar TODOS los pedidos activos con el nuevo estado
    let ultimoResultado;
    for (const pedido of pedidosActivos) {
      ultimoResultado = cambiarEstadoPedido(pedido.pedidoId, nuevoEstado, opciones);
    }

    return ultimoResultado;
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

/**
 * API: Obtiene pedidos activos
 */
function apiObtenerPedidosActivos() {
  try {
    verificarPermisos();
    return { exito: true, pedidos: obtenerPedidosActivos() };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

// ============================================
// API - REPARACIÓN (INICIO / FIN)
// ============================================

function apiIniciarReparacion(resguardo, tecnico, observacion) {
  try {
    verificarPermisos();
    return iniciarReparacion(resguardo, tecnico, observacion);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function apiFinalizarReparacion(resguardo, datos) {
  try {
    verificarPermisos();
    return finalizarReparacion(resguardo, datos);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function apiReportarProblemaPieza(resguardo, datos) {
  try {
    verificarPermisos();
    return reportarProblemaPieza(resguardo, datos);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

// ============================================
// API - ENTREGA
// ============================================

function apiMarcarComoEntregado(resguardo, datos) {
  try {
    verificarPermisos();
    return marcarComoEntregado(resguardo, datos);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function apiMarcarEquipoRecibido(resguardo) {
  try {
    verificarPermisos();
    actualizarReparacion(resguardo, { equipo_en_local: "SI" });
    agregarEventoHistorial(resguardo, "equipo_recibido", "Cliente trajo el equipo al local");
    CacheService.getScriptCache().remove('metricas-dashboard');
    return { exito: true, mensaje: "Equipo recibido en local" };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function apiEnviarAPuntoLimpio(resguardo) {
  try {
    verificarPermisos();
    return enviarAPuntoLimpio(resguardo);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function apiActualizarCliente(resguardo, datos) {
  try {
    verificarPermisos();
    return actualizarCliente(resguardo, datos);
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

// ============================================
// API - HISTORIAL (NUEVO)
// ============================================

/**
 * API: Obtiene el historial de una reparación
 * @param {string} resguardo
 */
function apiObtenerHistorial(resguardo) {
  try {
    verificarPermisos();
    const historial = obtenerHistorialDeReparacion(resguardo);
    return { exito: true, historial: historial };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

// ============================================
// API - DASHBOARD
// ============================================

function apiObtenerMetricas() {
  try {
    verificarPermisos();
    return { exito: true, metricas: obtenerMetricas() };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

function apiObtenerAlertas() {
  try {
    verificarPermisos();
    return { exito: true, alertas: obtenerReparacionesConAlertas() };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

// ============================================
// API - CONFIGURACIÓN
// ============================================

function apiObtenerConfiguracion() {
  try {
    const empleados = obtenerEmpleados();
    const tecnicos = obtenerEmpleados({ esTecnico: true });
    const compradores = obtenerEmpleados({ esComprador: true });
    const proveedores = obtenerProveedores();

    return {
      exito: true,
      configuracion: {
        empleados: empleados,
        tecnicos: tecnicos,
        compradores: compradores,
        proveedores: proveedores,
        marcas: MARCAS_EQUIPOS,
        estadosReparacion: Object.keys(ESTADOS_REPARACION),
        estadosPedido: Object.keys(ESTADOS_PEDIDO),
        estadosRecogida: Object.keys(ESTADOS_RECOGIDA),
        estadosPresupuesto: Object.keys(ESTADOS_PRESUPUESTO),
        kelatos: {
          nombre: KELATOS.nombre,
          direccion: KELATOS.direccion,
          telefono: KELATOS.telefono,
          email: KELATOS.email,
          logo: KELATOS.logo
        }
      }
    };
  } catch (error) {
    return { exito: false, error: error.message };
  }
}

// ============================================
// TESTING
// ============================================

function TEST_verificarSistema() {
  Logger.log('INICIANDO PRUEBAS DEL SISTEMA\n');

  try {
    Logger.log('1. Verificando hojas...');
    const hojas = ["reparaciones", "presupuestos", "piezas", "pedidos", "historial", "empleados", "proveedores", "notificaciones"];
    for (const h of hojas) {
      const sheet = getHoja(h);
      Logger.log(`   OK: ${HOJAS[h].nombre} (${sheet.getLastRow()} filas)`);
    }

    Logger.log('\n2. Verificando catálogos...');
    const empleados = obtenerEmpleados();
    Logger.log(`   Empleados: ${empleados.length}`);
    const proveedores = obtenerProveedores();
    Logger.log(`   Proveedores: ${proveedores.length}`);

    Logger.log('\n3. Obteniendo métricas...');
    const metricas = obtenerMetricas();
    Logger.log(`   Total reparaciones: ${metricas.totalReparaciones}`);

    Logger.log('\n4. Verificando usuario...');
    const usuario = obtenerUsuarioActual();
    Logger.log(`   Email: ${usuario.email}`);

    Logger.log('\nTODAS LAS PRUEBAS PASARON');
    return { exito: true, mensaje: 'Sistema funcionando correctamente' };

  } catch (error) {
    Logger.log(`\nERROR: ${error.message}`);
    return { exito: false, error: error.message };
  }
}
