/**
 * CODE.GS - Entry Point de la aplicación
 * Versión: 2.0.0 - Reestructuración simplificada
 * Fecha: 2026-01-22
 */

// ============================================
// WEB APP - ENTRY POINT
// ============================================

/**
 * Función principal del Web App
 * Sirve el dashboard (Index.html) con datos pre-cargados
 */
function doGet(e) {
  try {
    Logger.log('📄 Sirviendo Index.html - Dashboard');

    const template = HtmlService.createTemplateFromFile('Index');

    // Inyectar configuración
    template.KELATOS = KELATOS;
    template.ESTADOS_REPARACION = ESTADOS_REPARACION;
    template.ESTADOS_PEDIDO = ESTADOS_PEDIDO;
    template.TECNICOS = TECNICOS;
    template.MARCAS = MARCAS_EQUIPOS;
    template.PROVEEDORES = PROVEEDORES;

    // Pre-cargar datos del dashboard
    Logger.log('🔵 Pre-cargando datos para dashboard...');
    try {
      // Pre-cargar reparaciones
      const reparaciones = buscarReparaciones({}, 1, 50);
      template.REPARACIONES_INICIALES = JSON.stringify({
        exito: true,
        resultados: reparaciones.resultados || [],
        total: reparaciones.total || 0,
        pagina: 1,
        totalPaginas: reparaciones.totalPaginas || 1
      });
      Logger.log(`✓ Pre-cargadas ${reparaciones.total} reparaciones`);

      // Pre-cargar métricas
      const metricas = obtenerMetricas();
      template.METRICAS_INICIALES = JSON.stringify(metricas);
      Logger.log('✓ Pre-cargadas métricas');
    } catch (error) {
      Logger.log(`⚠️ Error pre-cargando datos: ${error.message}`);
      template.REPARACIONES_INICIALES = JSON.stringify({
        exito: false,
        error: error.message,
        resultados: [],
        total: 0
      });
      template.METRICAS_INICIALES = JSON.stringify({
        exito: false,
        error: error.message
      });
    }

    const html = template.evaluate()
      .setTitle('Dashboard - Kelatos')
      .setFaviconUrl(KELATOS.logo)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);

    Logger.log('✅ Index.html servido correctamente');
    return html;

  } catch (error) {
    Logger.log(`❌ Error en doGet: ${error.message}`);
    Logger.log(`Stack: ${error.stack}`);
    return ContentService.createTextOutput('Error: ' + error.message);
  }
}

/**
 * Función para verificar versión desplegada
 */
function obtenerVersion() {
  return {
    exito: true,
    version: '2.0.0',
    fecha: '2026-01-22',
    mensaje: 'Reestructuración simplificada - Un solo archivo Index.html'
  };
}

// ============================================
// API - AUTENTICACIÓN
// ============================================

/**
 * Obtiene información del usuario logueado
 * @returns {Object} Datos del usuario
 */
function obtenerUsuarioGoogle() {
  try {
    const usuario = obtenerUsuarioActual();

    // Sin validación por ahora - permitir todos los usuarios
    return {
      exito: true,
      usuario: {
        email: usuario.email,
        nombre: usuario.nombre
      }
    };

  } catch (error) {
    Logger.log(`❌ Error en autenticación: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * Cierra la sesión del usuario
 * @returns {Object} Resultado
 */
function cerrarSesion() {
  return {
    exito: true,
    mensaje: 'Sesión cerrada'
  };
}

// ============================================
// API - REPARACIONES (CRUD)
// ============================================

/**
 * API: Obtiene el siguiente número de resguardo disponible
 * @returns {Object} Siguiente resguardo
 */
function apiObtenerSiguienteResguardo() {
  try {
    verificarPermisos();

    const siguiente = generarSiguienteResguardo();

    return {
      exito: true,
      resguardo: siguiente
    };

  } catch (error) {
    Logger.log(`❌ Error en apiObtenerSiguienteResguardo: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * API: Crea una nueva reparación
 * @param {Object} datos - Datos de la reparación
 * @returns {Object} Resultado
 */
function apiCrearReparacion(datos) {
  try {
    verificarPermisos();

    // Validar datos
    const validacion = validarDatosReparacion(datos, true);
    if (!validacion.valido) {
      return {
        exito: false,
        errores: validacion.errores
      };
    }

    // Sanitizar datos
    datos.clienteNombre = sanitizarTexto(datos.clienteNombre);
    datos.clienteTelefono = formatearTelefono(datos.clienteTelefono);
    datos.clienteEmail = sanitizarTexto(datos.clienteEmail);
    datos.equipoModelo = sanitizarTexto(datos.equipoModelo);
    datos.sintoma = sanitizarTexto(datos.sintoma);

    // Crear reparación
    const resultado = crearReparacion(datos);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiCrearReparacion: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * API: Obtiene una reparación
 * @param {string} resguardo - Número de resguardo
 * @returns {Object} Datos de la reparación
 */
function apiObtenerReparacion(resguardo) {
  try {
    verificarPermisos();

    const reparacion = obtenerReparacion(resguardo);

    return {
      exito: true,
      reparacion: reparacion
    };

  } catch (error) {
    Logger.log(`❌ Error en apiObtenerReparacion: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * API: Busca reparaciones
 * @param {Object} filtros - Filtros de búsqueda
 * @param {number} pagina - Página
 * @param {number} porPagina - Resultados por página
 * @returns {Object} Resultados
 */
function apiBuscarReparaciones(filtros, pagina, porPagina) {
  // CRITICAL FIX: Forzar valores por defecto ANTES del try-catch
  filtros = filtros || {};
  pagina = pagina || 1;
  porPagina = porPagina || 50;

  try {
    Logger.log(`🔍 apiBuscarReparaciones llamado - VERSIÓN v1.2.1 (fix null return)`);
    Logger.log(`   Filtros recibidos: ${typeof filtros} - ${JSON.stringify(filtros)}`);
    Logger.log(`   Página: ${pagina} (tipo: ${typeof pagina}), PorPágina: ${porPagina} (tipo: ${typeof porPagina})`);

    // NUEVO: Validar que los parámetros no sean undefined/null
    if (filtros === null || filtros === undefined) {
      Logger.log(`⚠️ WARNING: filtros es ${filtros}, usando objeto vacío`);
      filtros = {};
    }

    verificarPermisos();

    Logger.log(`🔵 Llamando a buscarReparaciones con filtros validados...`);
    const resultados = buscarReparaciones(filtros, pagina, porPagina);
    Logger.log(`🔵 buscarReparaciones retornó: ${resultados ? 'OBJETO' : 'NULL/UNDEFINED'}`);

    if (!resultados) {
      Logger.log(`⚠️ WARNING: buscarReparaciones devolvió null o undefined`);
      return {
        exito: false,
        error: 'No se obtuvieron resultados de la búsqueda',
        debug: {
          filtros: filtros,
          pagina: pagina,
          porPagina: porPagina
        }
      };
    }

    const response = {
      exito: true,
      resultados: resultados.resultados || [],
      total: resultados.total || 0,
      pagina: resultados.pagina || pagina,
      totalPaginas: resultados.totalPaginas || 1
    };

    Logger.log(`📤 Retornando: ${response.total} resultados, página ${response.pagina}`);
    Logger.log(`📤 Primera reparación: ${response.resultados[0]?.resguardo || 'N/A'}`);
    Logger.log(`📤 Tipo de respuesta: ${typeof response}`);

    return response;

  } catch (error) {
    Logger.log(`❌ Error en apiBuscarReparaciones: ${error.message}`);
    Logger.log(`   Stack: ${error.stack}`);
    return {
      exito: false,
      error: error.message,
      stack: error.stack
    };
  }
}

/**
 * API: Actualiza una reparación
 * @param {string} resguardo - Número de resguardo
 * @param {Object} datos - Datos a actualizar
 * @returns {Object} Resultado
 */
function apiActualizarReparacion(resguardo, datos) {
  try {
    verificarPermisos();

    const resultado = actualizarReparacion(resguardo, datos);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiActualizarReparacion: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

// ============================================
// API - ESTADOS Y ACCIONES
// ============================================

/**
 * API: Cambia el estado de una reparación
 * @param {string} resguardo - Número de resguardo
 * @param {string} nuevoEstado - Nuevo estado
 * @param {Object} opciones - Opciones adicionales
 * @returns {Object} Resultado
 */
function apiCambiarEstado(resguardo, nuevoEstado, opciones) {
  try {
    verificarPermisos();

    const resultado = cambiarEstadoReparacion(resguardo, nuevoEstado, opciones);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiCambiarEstado: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * API: Agrega una observación
 * @param {string} resguardo - Número de resguardo
 * @param {string} texto - Texto de la observación
 * @returns {Object} Resultado
 */
function apiAgregarObservacion(resguardo, texto) {
  try {
    verificarPermisos();

    texto = sanitizarTexto(texto);

    if (!texto || texto === '') {
      return {
        exito: false,
        error: 'El texto de la observación es obligatorio'
      };
    }

    const resultado = agregarObservacion(resguardo, texto);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiAgregarObservacion: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

// ============================================
// API - PRESUPUESTO
// ============================================

/**
 * API: Actualiza el presupuesto
 * @param {string} resguardo - Número de resguardo
 * @param {Object} presupuesto - Datos del presupuesto
 * @returns {Object} Resultado
 */
function apiActualizarPresupuesto(resguardo, presupuesto) {
  try {
    verificarPermisos();

    const resultado = actualizarPresupuesto(resguardo, presupuesto);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiActualizarPresupuesto: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * API: Acepta un presupuesto
 * @param {string} resguardo - Número de resguardo
 * @returns {Object} Resultado
 */
function apiAceptarPresupuesto(resguardo) {
  try {
    verificarPermisos();

    const resultado = aceptarPresupuesto(resguardo);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiAceptarPresupuesto: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * API: Rechaza un presupuesto
 * @param {string} resguardo - Número de resguardo
 * @param {string} motivo - Motivo del rechazo
 * @returns {Object} Resultado
 */
function apiRechazarPresupuesto(resguardo, motivo) {
  try {
    verificarPermisos();

    const resultado = rechazarPresupuesto(resguardo, motivo);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiRechazarPresupuesto: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

// ============================================
// API - PEDIDOS/PIEZAS
// ============================================

/**
 * API: Actualiza información de pieza
 * @param {string} resguardo - Número de resguardo
 * @param {Object} datosPieza - Datos de la pieza
 * @returns {Object} Resultado
 */
function apiActualizarPieza(resguardo, datosPieza) {
  try {
    verificarPermisos();

    const resultado = actualizarPieza(resguardo, datosPieza);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiActualizarPieza: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * API: Cambia el estado de un pedido
 * @param {string} resguardo - Número de resguardo
 * @param {string} nuevoEstado - Nuevo estado del pedido
 * @param {Object} opciones - Opciones adicionales
 * @returns {Object} Resultado
 */
function apiCambiarEstadoPedido(resguardo, nuevoEstado, opciones) {
  try {
    verificarPermisos();

    const resultado = cambiarEstadoPedido(resguardo, nuevoEstado, opciones);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiCambiarEstadoPedido: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * API: Obtiene pedidos activos
 * @returns {Object} Pedidos activos
 */
function apiObtenerPedidosActivos() {
  try {
    verificarPermisos();

    const pedidos = obtenerPedidosActivos();

    return {
      exito: true,
      pedidos: pedidos
    };

  } catch (error) {
    Logger.log(`❌ Error en apiObtenerPedidosActivos: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

// ============================================
// API - DASHBOARD
// ============================================

/**
 * API: Obtiene métricas del dashboard
 * @returns {Object} Métricas
 */
function apiObtenerMetricas() {
  try {
    verificarPermisos();

    const metricas = obtenerMetricas();

    return {
      exito: true,
      metricas: metricas
    };

  } catch (error) {
    Logger.log(`❌ Error en apiObtenerMetricas: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * API: Obtiene reparaciones con alertas
 * @returns {Object} Alertas
 */
function apiObtenerAlertas() {
  try {
    verificarPermisos();

    const alertas = obtenerReparacionesConAlertas();

    return {
      exito: true,
      alertas: alertas
    };

  } catch (error) {
    Logger.log(`❌ Error en apiObtenerAlertas: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

// ============================================
// API - GESTIÓN DE PIEZA
// ============================================

/**
 * API: Registra un pedido de pieza
 * @param {string} resguardo - Número de resguardo
 * @param {Object} datos - Datos del pedido
 * @returns {Object} Resultado
 */
function apiRegistrarPedidoPieza(resguardo, datos) {
  try {
    verificarPermisos();

    const resultado = registrarPedidoPieza(resguardo, datos);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiRegistrarPedidoPieza: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * API: Actualiza el estado de un pedido
 * @param {string} resguardo - Número de resguardo
 * @param {string} nuevoEstado - Nuevo estado
 * @param {Date} fechaRecepcion - Fecha de recepción (opcional)
 * @returns {Object} Resultado
 */
function apiActualizarEstadoPedido(resguardo, nuevoEstado, fechaRecepcion) {
  try {
    verificarPermisos();

    const resultado = actualizarEstadoPedido(resguardo, nuevoEstado, fechaRecepcion);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiActualizarEstadoPedido: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

// ============================================
// API - REPARACIÓN
// ============================================

/**
 * API: Inicia una reparación
 * @param {string} resguardo - Número de resguardo
 * @returns {Object} Resultado
 */
function apiIniciarReparacion(resguardo) {
  try {
    verificarPermisos();

    const resultado = iniciarReparacion(resguardo);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiIniciarReparacion: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * API: Finaliza una reparación
 * @param {string} resguardo - Número de resguardo
 * @param {Object} datos - Datos de finalización
 * @returns {Object} Resultado
 */
function apiFinalizarReparacion(resguardo, datos) {
  try {
    verificarPermisos();

    const resultado = finalizarReparacion(resguardo, datos);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiFinalizarReparacion: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

// ============================================
// API - ENTREGA
// ============================================

/**
 * API: Marca como entregado
 * @param {string} resguardo - Número de resguardo
 * @param {Object} datos - Datos de entrega {numeroFactura, fechaRecogida, observaciones}
 * @returns {Object} Resultado
 */
function apiMarcarComoEntregado(resguardo, datos) {
  try {
    verificarPermisos();

    const resultado = marcarComoEntregado(resguardo, datos);

    return resultado;

  } catch (error) {
    Logger.log(`❌ Error en apiMarcarComoEntregado: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

// ============================================
// API - CONFIGURACIÓN
// ============================================

/**
 * API: Obtiene la configuración general
 * @returns {Object} Configuración
 */
function apiObtenerConfiguracion() {
  try {
    return {
      exito: true,
      configuracion: {
        tecnicos: TECNICOS,
        marcas: MARCAS_EQUIPOS,
        proveedores: PROVEEDORES,
        estadosReparacion: Object.keys(ESTADOS_REPARACION),
        estadosPedido: Object.keys(ESTADOS_PEDIDO),
        estadosRecogida: Object.keys(ESTADOS_RECOGIDA),
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
    Logger.log(`❌ Error en apiObtenerConfiguracion: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

// ============================================
// TESTING
// ============================================

/**
 * Función de prueba para verificar que todo funciona
 */
function TEST_verificarSistema() {
  Logger.log('🔧 INICIANDO PRUEBAS DEL SISTEMA\n');

  try {
    // 1. Verificar configuración
    Logger.log('1. Verificando configuración...');
    Logger.log(`   ✓ Hoja: ${SHEET_CONFIG.nombre}`);
    Logger.log(`   ✓ Técnicos: ${TECNICOS.length}`);
    Logger.log(`   ✓ Marcas: ${MARCAS_EQUIPOS.length}`);

    // 2. Verificar acceso a la hoja
    Logger.log('\n2. Verificando acceso a Google Sheets...');
    const sheet = getSheet();
    Logger.log(`   ✓ Hoja encontrada: ${sheet.getName()}`);
    Logger.log(`   ✓ Filas: ${sheet.getLastRow()}`);

    // 3. Obtener métricas
    Logger.log('\n3. Obteniendo métricas...');
    const metricas = obtenerMetricas();
    Logger.log(`   ✓ Total reparaciones: ${metricas.totalReparaciones}`);
    Logger.log(`   ✓ En diagnóstico: ${metricas.enDiagnostico}`);
    Logger.log(`   ✓ Alertas: ${metricas.alertas.length}`);

    // 4. Verificar usuario
    Logger.log('\n4. Verificando usuario...');
    const usuario = obtenerUsuarioActual();
    Logger.log(`   ✓ Email: ${usuario.email}`);
    Logger.log(`   ✓ Válido: ${usuario.esValido}`);

    Logger.log('\n✅ TODAS LAS PRUEBAS PASARON CORRECTAMENTE');

    return {
      exito: true,
      mensaje: 'Sistema funcionando correctamente'
    };

  } catch (error) {
    Logger.log(`\n❌ ERROR EN LAS PRUEBAS: ${error.message}`);
    Logger.log(`Stack: ${error.stack}`);

    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * Test simple del doGet
 */
function TEST_doGet() {
  const e = { parameter: { page: 'login' } };
  const resultado = doGet(e);
  Logger.log('✅ doGet funciona');
  Logger.log('Tipo: ' + typeof resultado);
  return resultado;
}

/**
 * Test para buscar reparaciones
 */
function TEST_buscarReparaciones() {
  Logger.log('🔍 TEST: Buscando reparaciones\n');

  try {
    const filtros = {};
    const resultado = apiBuscarReparaciones(filtros, 1, 50);

    Logger.log('📊 Resultado:');
    Logger.log(JSON.stringify(resultado, null, 2));

    return resultado;

  } catch (error) {
    Logger.log(`❌ ERROR: ${error.message}`);
    Logger.log(`Stack: ${error.stack}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * Test simplificado para diagnóstico de serialización
 * Retorna solo datos básicos sin fechas ni objetos complejos
 */
function apiBuscarReparacionesSimple() {
  try {
    Logger.log('🔍 apiBuscarReparacionesSimple - Test de serialización');

    verificarPermisos();

    const resultados = buscarReparaciones({}, 1, 5);

    if (!resultados || !resultados.resultados || resultados.resultados.length === 0) {
      Logger.log('⚠️ No hay resultados');
      return {
        exito: true,
        mensaje: 'No hay reparaciones',
        total: 0
      };
    }

    // Extraer solo datos básicos, sin fechas
    const reparacionesSimples = resultados.resultados.map(r => ({
      resguardo: r.resguardo,
      cliente: r.cliente.nombre,
      telefono: r.cliente.telefono,
      equipo: r.equipo.modelo,
      estado: r.estado,
      tecnico: r.tecnico
    }));

    Logger.log(`✅ Retornando ${reparacionesSimples.length} reparaciones simplificadas`);

    return {
      exito: true,
      total: resultados.total,
      cantidad: reparacionesSimples.length,
      reparaciones: reparacionesSimples
    };

  } catch (error) {
    Logger.log(`❌ Error: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

/**
 * Test para diagnosticar problema de la hoja
 */
function TEST_diagnosticarHoja() {
  Logger.log('🔍 DIAGNÓSTICO DE HOJA\n');

  try {
    // 1. Obtener spreadsheet
    Logger.log('1. Obteniendo spreadsheet activo...');
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Logger.log(`   ✓ ID: ${ss.getId()}`);
    Logger.log(`   ✓ Nombre: ${ss.getName()}`);
    Logger.log(`   ✓ URL: ${ss.getUrl()}`);

    // 2. Listar todas las hojas
    Logger.log('\n2. Listando todas las hojas disponibles...');
    const hojas = ss.getSheets();
    Logger.log(`   ✓ Total de hojas: ${hojas.length}`);
    hojas.forEach((hoja, idx) => {
      Logger.log(`   ${idx + 1}. "${hoja.getName()}" - ${hoja.getLastRow()} filas, ${hoja.getLastColumn()} columnas`);
    });

    // 3. Buscar hoja específica
    Logger.log(`\n3. Buscando hoja "${SHEET_CONFIG.nombre}"...`);
    const sheet = ss.getSheetByName(SHEET_CONFIG.nombre);

    if (sheet) {
      Logger.log(`   ✅ Hoja encontrada!`);
      Logger.log(`   ✓ Filas: ${sheet.getLastRow()}`);
      Logger.log(`   ✓ Columnas: ${sheet.getLastColumn()}`);

      // 4. Leer primera fila (encabezados)
      if (sheet.getLastRow() > 0) {
        Logger.log('\n4. Leyendo encabezados...');
        const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
        Logger.log(`   Encabezados encontrados: ${headers.length}`);
        headers.forEach((header, idx) => {
          Logger.log(`   Col ${idx + 1}: "${header}"`);
        });
      } else {
        Logger.log('\n4. ⚠️ La hoja está vacía');
      }

    } else {
      Logger.log(`   ❌ Hoja "${SHEET_CONFIG.nombre}" NO encontrada`);
    }

    Logger.log('\n✅ DIAGNÓSTICO COMPLETADO');

    return {
      exito: true,
      mensaje: 'Ver logs para detalles'
    };

  } catch (error) {
    Logger.log(`\n❌ ERROR: ${error.message}`);
    Logger.log(`Stack: ${error.stack}`);

    return {
      exito: false,
      error: error.message
    };
  }
}
