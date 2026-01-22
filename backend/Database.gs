/**
 * DATABASE.GS - Capa de acceso a datos
 * Todas las operaciones CRUD sobre Google Sheets
 */

// ============================================
// FUNCIONES HELPER
// ============================================

/**
 * Obtiene la hoja de Consolidado
 */
function getSheet() {
  try {
    // Usar el ID del spreadsheet de la configuración
    let ss;

    if (SHEET_CONFIG.spreadsheetId) {
      // Si hay ID configurado, usarlo directamente
      ss = SpreadsheetApp.openById(SHEET_CONFIG.spreadsheetId);
      Logger.log(`📊 Usando Spreadsheet por ID: ${SHEET_CONFIG.spreadsheetId}`);
    } else {
      // Si no, intentar obtener el spreadsheet activo (solo funciona si está vinculado)
      ss = SpreadsheetApp.getActiveSpreadsheet();
      Logger.log(`📊 Usando Spreadsheet activo`);
    }

    Logger.log(`📊 Spreadsheet: ${ss.getName()}`);

    const sheet = ss.getSheetByName(SHEET_CONFIG.nombre);

    if (!sheet) {
      // Listar todas las hojas disponibles
      const hojas = ss.getSheets().map(h => h.getName());
      Logger.log(`❌ Hoja "${SHEET_CONFIG.nombre}" no encontrada`);
      Logger.log(`📋 Hojas disponibles: ${hojas.join(', ')}`);
      throw new Error(`No se encontró la hoja "${SHEET_CONFIG.nombre}". Hojas disponibles: ${hojas.join(', ')}`);
    }

    Logger.log(`✅ Hoja encontrada: ${sheet.getName()} con ${sheet.getLastRow()} filas`);
    return sheet;

  } catch (error) {
    Logger.log(`❌ Error en getSheet: ${error.message}`);
    throw error;
  }
}

/**
 * Obtiene todos los datos de la hoja
 */
function getAllData() {
  const sheet = getSheet();
  return sheet.getDataRange().getValues();
}

// ============================================
// CREATE
// ============================================

/**
 * Crea una nueva reparación (Fase 1 - Recepción)
 * @param {Object} datos - Objeto con los datos de la reparación
 * @returns {Object} Resultado con el resguardo
 */
function crearReparacion(datos) {
  try {
    const sheet = getSheet();

    // Usar resguardo de Factusol (obligatorio)
    const resguardo = datos.resguardo;
    if (!resguardo) {
      return {
        exito: false,
        errores: ['El número de resguardo es obligatorio']
      };
    }

    // Verificar que el resguardo no exista ya
    const existente = encontrarFilaPorResguardo(resguardo);
    if (existente) {
      return {
        exito: false,
        errores: [`El resguardo ${resguardo} ya existe en el sistema`]
      };
    }

    // Fecha de recepción (del parte de Factusol)
    const fechaRecepcion = datos.fechaRecepcion ? new Date(datos.fechaRecepcion) : new Date();

    // Estado inicial: "Presupuesto Pendiente" o "Garantía"
    const estadoInicial = datos.estado || "Presupuesto Pendiente";

    // Construir fila completa (45 columnas según estructura real)
    // Fase 1: Solo columnas A, B, G, H, I, J, K, L
    const fila = [
      resguardo,                                  // Col 1 (0) - A: Resguardo de Recepcion
      fechaRecepcion,                             // Col 2 (1) - B: Fecha
      "",                                         // Col 3 (2) - C: Responsable de presupuesto
      null,                                       // Col 4 (3) - D: Fecha de Elaboración de Presupuesto
      "",                                         // Col 5 (4) - E: Técnico que ha reparado el equipo
      null,                                       // Col 6 (5) - F: Fecha de Reparación
      datos.clienteNombre || "",                  // Col 7 (6) - G: Nombre de Cliente
      datos.clienteTelefono || "",                // Col 8 (7) - H: Telefono
      datos.clienteEmail || "",                   // Col 9 (8) - I: Correo electrónico
      datos.equipoModelo || "",                   // Col 10 (9) - J: Modelo/Marca Equipo
      datos.sintoma || "",                        // Col 11 (10) - K: Síntoma / Reparación
      estadoInicial,                              // Col 12 (11) - L: Estado
      null,                                       // Col 13 (12) - M: TIEMPO (DÍAS) DE ENTREGA DE EQUIPO
      0,                                          // Col 14 (13) - N: Costo de Reparación sin IVA
      0,                                          // Col 15 (14) - O: COSTO DE PIEZA
      null,                                       // Col 16 (15) - P: Ganancia Neta
      "",                                         // Col 17 (16) - Q: Responsable de Compra
      "",                                         // Col 18 (17) - R: PROVEEDOR
      "",                                         // Col 19 (18) - S: ENLACES DE COMPRA
      "",                                         // Col 20 (19) - T: NÚMERO DE PEDIDO DE COMPRA
      null,                                       // Col 21 (20) - U: FECHA DE PEDIDO
      "",                                         // Col 22 (21) - V: Estado de Pedido
      false,                                      // Col 23 (22) - W: Aviso Wasap Estado
      null,                                       // Col 24 (23) - X: Fecha Límite Presupuesto
      false,                                      // Col 25 (24) - Y: Alerta envío de presupuesto
      "",                                         // Col 26 (25) - Z: Motivo Rechazo de Presupuesto
      null,                                       // Col 27 (26) - AA: FECHA ACEPTACION DE PRESUPUESTO
      null,                                       // Col 28 (27) - AB: FECHA DE ENTREGA (pieza)
      false,                                      // Col 29 (28) - AC: CONTACTAR PROVEEDOR
      null,                                       // Col 30 (29) - AD: FECHA CONTACTO 1
      null,                                       // Col 31 (30) - AE: RECORDATORIO P1
      "",                                         // Col 32 (31) - AF: NÚMERO DE FACTURA
      null,                                       // Col 33 (32) - AG: FECHA DE RECOGIDA POR EL CLIENTE
      "PENDIENTE",                                // Col 34 (33) - AH: ESTADO DE RECOGIDA
      "",                                         // Col 35 (34) - AI: FICHA /MARCA
      false,                                      // Col 36 (35) - AJ: Colocó Reseña
      "",                                         // Col 37 (36) - AK: OBSERVACIONES
      false,                                      // Col 38 (37) - AL: Envío de Encuesta
      false,                                      // Col 39 (38) - AM: Envío de enlace para reseña
      false,                                      // Col 40 (39) - AN: Ingresó Reseña?
      "",                                         // Col 41 (40) - AO: Obs (Entrega de Equipos)
      "",                                         // Col 42 (41) - AP: (vacío)
      null,                                       // Col 43 (42) - AQ: Fecha Último Recordatorio
      "",                                         // Col 44 (43) - AR: Tipo Último Recordatorio
      0                                           // Col 45 (44) - AS: Contador Recordatorios Recojo
    ];

    // Agregar fila al final
    sheet.appendRow(fila);

    // Invalidar caché
    CacheService.getScriptCache().remove('metricas-dashboard');

    Logger.log(`✅ Reparación creada: ${resguardo} - Estado: ${estadoInicial}`);

    return {
      exito: true,
      resguardo: resguardo,
      mensaje: `Recepción ${resguardo} registrada exitosamente`
    };

  } catch (error) {
    Logger.log(`❌ Error al crear reparación: ${error.message}`);
    return {
      exito: false,
      error: error.message
    };
  }
}

// ============================================
// READ
// ============================================

/**
 * Obtiene una reparación por su resguardo
 * @param {string} resguardo - Número de resguardo
 * @returns {Object} Objeto con los datos de la reparación
 */
function obtenerReparacion(resguardo) {
  try {
    const data = getAllData();

    // Buscar por resguardo (columna A, índice 0)
    for (let i = 1; i < data.length; i++) {
      if (data[i][SHEET_CONFIG.columnas.resguardo] === resguardo) {
        return convertirFilaAObjeto(data[i], i + 1);
      }
    }

    throw new Error(`Reparación ${resguardo} no encontrada`);

  } catch (error) {
    Logger.log(`❌ Error al obtener reparación: ${error.message}`);
    throw error;
  }
}

/**
 * Busca reparaciones según filtros
 * @param {Object} filtros - Objeto con filtros
 * @param {number} pagina - Número de página (por defecto 1)
 * @param {number} porPagina - Resultados por página (por defecto 50)
 * @returns {Object} Resultados paginados
 */
function buscarReparaciones(filtros, pagina, porPagina) {
  try {
    filtros = filtros || {};
    pagina = pagina || 1;
    porPagina = porPagina || 50;

    const data = getAllData();
    const resultados = [];

    // Saltar header (fila 0)
    for (let i = 1; i < data.length; i++) {
      const fila = data[i];

      // Saltar filas vacías
      if (!fila[SHEET_CONFIG.columnas.nombreCliente]) continue;

      // Aplicar filtros
      if (filtros.estado && filtros.estado !== "Todos") {
        if (fila[SHEET_CONFIG.columnas.estado] !== filtros.estado) continue;
      }

      if (filtros.tecnico && filtros.tecnico !== "Todos") {
        if (fila[SHEET_CONFIG.columnas.tecnico] !== filtros.tecnico) continue;
      }

      if (filtros.estadoRecogida && filtros.estadoRecogida !== "Todos") {
        if (fila[SHEET_CONFIG.columnas.estadoRecogida] !== filtros.estadoRecogida) continue;
      }

      if (filtros.necesitaPieza) {
        const estadoPedido = fila[SHEET_CONFIG.columnas.estadoPedido];
        if (!estadoPedido || estadoPedido === "") continue;
      }

      // Búsqueda de texto
      if (filtros.busqueda) {
        const textoBusqueda = filtros.busqueda.toLowerCase();
        const textoFila = (
          (fila[SHEET_CONFIG.columnas.resguardo] || "") +
          (fila[SHEET_CONFIG.columnas.nombreCliente] || "") +
          (fila[SHEET_CONFIG.columnas.telefono] || "") +
          (fila[SHEET_CONFIG.columnas.email] || "") +
          (fila[SHEET_CONFIG.columnas.modeloMarcaEquipo] || "")
        ).toLowerCase();

        if (!textoFila.includes(textoBusqueda)) continue;
      }

      // Agregar resultado
      resultados.push(convertirFilaAObjeto(fila, i + 1));
    }

    // Ordenar por fecha de ingreso (más recientes primero)
    resultados.sort((a, b) => {
      const fechaA = a.fechaElaboracionPpto || new Date(0);
      const fechaB = b.fechaElaboracionPpto || new Date(0);
      return new Date(fechaB) - new Date(fechaA);
    });

    // Paginar
    const inicio = (pagina - 1) * porPagina;
    const fin = inicio + porPagina;
    const paginados = resultados.slice(inicio, fin);

    return {
      resultados: paginados,
      total: resultados.length,
      pagina: pagina,
      totalPaginas: Math.ceil(resultados.length / porPagina),
      porPagina: porPagina
    };

  } catch (error) {
    Logger.log(`❌ Error al buscar reparaciones: ${error.message}`);
    throw error;
  }
}

/**
 * Obtiene métricas del dashboard
 * @returns {Object} Objeto con las métricas
 */
function obtenerMetricas() {
  try {
    // Intentar obtener del caché
    const cache = CacheService.getScriptCache();
    const cached = cache.get('metricas-dashboard');

    if (cached) {
      Logger.log('📊 Métricas obtenidas del caché');
      return JSON.parse(cached);
    }

    // Calcular métricas
    const data = getAllData();
    const metricas = {
      presupuestoPendiente: 0,
      esperandoPieza: 0,
      enReparacion: 0,
      listos: 0,
      totalReparaciones: 0,
      alertas: []
    };

    for (let i = 1; i < data.length; i++) {
      const fila = data[i];

      // Saltar vacías
      if (!fila[SHEET_CONFIG.columnas.nombreCliente]) continue;

      metricas.totalReparaciones++;

      const estado = fila[SHEET_CONFIG.columnas.estado];
      const estadoRecogida = fila[SHEET_CONFIG.columnas.estadoRecogida];

      // Contar por estado (nuevos estados)
      if (estado === "Presupuesto Pendiente" || estado === "Presupuesto Enviado") {
        metricas.presupuestoPendiente++;
      }
      if (estado === "Pieza Pendiente") {
        metricas.esperandoPieza++;
      }
      if (estado === "En Reparación" || estado === "Pieza Entregada" || estado === "Presupuesto Aceptado") {
        metricas.enReparacion++;
      }

      // Listos para recoger
      if ((estado === "Reparado" || estado === "No tiene Reparación" || estado === "Presupuesto Rechazado") &&
        estadoRecogida === "PENDIENTE") {
        metricas.listos++;
      }

      // Detectar alertas
      // Alerta 1: Presupuestos sin respuesta +5 días
      if (estado === "Presupuesto Enviado") {
        const fechaPpto = fila[SHEET_CONFIG.columnas.fechaElaboracionPpto];
        if (fechaPpto) {
          const diasDesde = Math.floor((new Date() - new Date(fechaPpto)) / (1000 * 60 * 60 * 24));
          if (diasDesde >= 5) {
            metricas.alertas.push({
              tipo: "presupuesto",
              mensaje: `Presupuesto sin respuesta hace ${diasDesde} días`,
              resguardo: fila[SHEET_CONFIG.columnas.resguardo]
            });
          }
        }
      }

      // Alerta 2: Equipos listos sin recoger +7 días
      if (estadoRecogida === "PENDIENTE" && (estado === "Reparado" || estado === "No tiene Reparación")) {
        const fechaReparacion = fila[SHEET_CONFIG.columnas.fechaReparacion];
        if (fechaReparacion) {
          const diasDesde = Math.floor((new Date() - new Date(fechaReparacion)) / (1000 * 60 * 60 * 24));
          if (diasDesde >= 7) {
            metricas.alertas.push({
              tipo: "recogida",
              mensaje: `Equipo listo sin recoger hace ${diasDesde} días`,
              resguardo: fila[SHEET_CONFIG.columnas.resguardo]
            });
          }
        }
      }

      // Alerta 3: Pedidos retrasados
      if (estado === "Esperando Pieza") {
        const fechaEntregaEsperada = fila[SHEET_CONFIG.columnas.fechaEntrega];
        if (fechaEntregaEsperada && new Date(fechaEntregaEsperada) < new Date()) {
          metricas.alertas.push({
            tipo: "pedido_retrasado",
            mensaje: `Pedido de pieza retrasado`,
            resguardo: fila[SHEET_CONFIG.columnas.resguardo]
          });
        }
      }
    }

    // Guardar en caché por 5 minutos
    cache.put('metricas-dashboard', JSON.stringify(metricas), 300);

    return metricas;

  } catch (error) {
    Logger.log(`❌ Error al obtener métricas: ${error.message}`);
    throw error;
  }
}

/**
 * Obtiene pedidos de piezas pendientes/en tránsito
 * @returns {Array} Lista de pedidos
 */
function obtenerPedidosPendientes() {
  try {
    const data = getAllData();
    const pedidos = [];

    for (let i = 1; i < data.length; i++) {
      const fila = data[i];

      // Saltar vacías
      if (!fila[SHEET_CONFIG.columnas.nombreCliente]) continue;

      const estadoPedido = fila[SHEET_CONFIG.columnas.estadoPedido];

      // Solo pedidos activos
      if (estadoPedido === "Pedido" || estadoPedido === "En Tránsito") {
        pedidos.push(convertirFilaAObjeto(fila, i + 1));
      }
    }

    return pedidos;

  } catch (error) {
    Logger.log(`❌ Error al obtener pedidos: ${error.message}`);
    throw error;
  }
}

// ============================================
// UPDATE
// ============================================

/**
 * Actualiza una reparación
 * @param {string} resguardo - Número de resguardo
 * @param {Object} datos - Datos a actualizar
 * @returns {Object} Resultado de la operación
 */
function actualizarReparacion(resguardo, datos) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    // Actualizar campos específicos
    const col = SHEET_CONFIG.columnas;

    if (datos.estado !== undefined) {
      sheet.getRange(numFila, col.estado + 1).setValue(datos.estado);
    }

    if (datos.tecnico !== undefined) {
      sheet.getRange(numFila, col.tecnico + 1).setValue(datos.tecnico);
    }

    if (datos.fechaReparacion !== undefined) {
      sheet.getRange(numFila, col.fechaReparacion + 1).setValue(datos.fechaReparacion);
    }

    if (datos.clienteNombre !== undefined) {
      sheet.getRange(numFila, col.nombreCliente + 1).setValue(datos.clienteNombre);
    }

    if (datos.clienteTelefono !== undefined) {
      sheet.getRange(numFila, col.telefono + 1).setValue(datos.clienteTelefono);
    }

    if (datos.clienteEmail !== undefined) {
      sheet.getRange(numFila, col.email + 1).setValue(datos.clienteEmail);
    }

    if (datos.sintoma !== undefined) {
      sheet.getRange(numFila, col.sintoma + 1).setValue(datos.sintoma);
    }

    if (datos.observaciones !== undefined) {
      const obsActuales = sheet.getRange(numFila, col.observaciones + 1).getValue();
      const nuevaObs = obsActuales ? obsActuales + "\n" + datos.observaciones : datos.observaciones;
      sheet.getRange(numFila, col.observaciones + 1).setValue(nuevaObs);
    }

    // Presupuesto
    if (datos.costoReparacion !== undefined) {
      sheet.getRange(numFila, col.costoReparacionSinIVA + 1).setValue(datos.costoReparacion);
    }

    if (datos.costoPieza !== undefined) {
      sheet.getRange(numFila, col.costoPieza + 1).setValue(datos.costoPieza);
    }

    if (datos.fechaElaboracionPpto !== undefined) {
      sheet.getRange(numFila, col.fechaElaboracionPpto + 1).setValue(datos.fechaElaboracionPpto);
    }

    if (datos.fechaResponsablePpto !== undefined) {
      sheet.getRange(numFila, col.fechaResponsablePpto + 1).setValue(datos.fechaResponsablePpto);
    }

    if (datos.fechaAceptacionPpto !== undefined) {
      sheet.getRange(numFila, col.fechaAceptacionPpto + 1).setValue(datos.fechaAceptacionPpto);
    }

    if (datos.motivoRechazo !== undefined) {
      sheet.getRange(numFila, col.motivoRechazo + 1).setValue(datos.motivoRechazo);
    }

    // Pieza/Pedido
    if (datos.responsableCompra !== undefined) {
      sheet.getRange(numFila, col.responsableCompra + 1).setValue(datos.responsableCompra);
    }

    if (datos.proveedor !== undefined) {
      sheet.getRange(numFila, col.proveedor + 1).setValue(datos.proveedor);
    }

    if (datos.enlaceCompra !== undefined) {
      sheet.getRange(numFila, col.enlaceCompra + 1).setValue(datos.enlaceCompra);
    }

    if (datos.numeroPedido !== undefined) {
      sheet.getRange(numFila, col.numeroPedido + 1).setValue(datos.numeroPedido);
    }

    if (datos.fechaPedido !== undefined) {
      sheet.getRange(numFila, col.fechaPedido + 1).setValue(datos.fechaPedido);
    }

    if (datos.estadoPedido !== undefined) {
      sheet.getRange(numFila, col.estadoPedido + 1).setValue(datos.estadoPedido);
    }

    if (datos.fechaEntrega !== undefined) {
      sheet.getRange(numFila, col.fechaEntrega + 1).setValue(datos.fechaEntrega);
    }

    // Recogida
    if (datos.estadoRecogida !== undefined) {
      sheet.getRange(numFila, col.estadoRecogida + 1).setValue(datos.estadoRecogida);
    }

    if (datos.fechaRecogida !== undefined) {
      sheet.getRange(numFila, col.fechaRecogida + 1).setValue(datos.fechaRecogida);
    }

    if (datos.numeroFactura !== undefined) {
      sheet.getRange(numFila, col.numeroFactura + 1).setValue(datos.numeroFactura);
    }

    // Ficha/Marca y Resena
    if (datos.fichaMarca !== undefined) {
      sheet.getRange(numFila, col.fichaMarca + 1).setValue(datos.fichaMarca);
    }

    if (datos.colocoResena !== undefined) {
      sheet.getRange(numFila, col.colocoResena + 1).setValue(datos.colocoResena);
    }

    // Invalidar caché
    CacheService.getScriptCache().remove('metricas-dashboard');

    Logger.log(`✅ Reparación ${resguardo} actualizada`);

    return {
      exito: true,
      mensaje: `Reparación ${resguardo} actualizada exitosamente`
    };

  } catch (error) {
    Logger.log(`❌ Error al actualizar reparación: ${error.message}`);
    throw error;
  }
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Encuentra el número de fila de una reparación por su resguardo
 * @param {string} resguardo - Número de resguardo
 * @returns {number|null} Número de fila (1-based) o null si no se encuentra
 */
function encontrarFilaPorResguardo(resguardo) {
  const data = getAllData();

  for (let i = 1; i < data.length; i++) {
    if (data[i][SHEET_CONFIG.columnas.resguardo] === resguardo) {
      return i + 1; // +1 porque getRange empieza en 1
    }
  }

  return null;
}

/**
 * Convierte una fila del sheet a un objeto JavaScript
 * @param {Array} fila - Array con los datos de la fila
 * @param {number} numFila - Número de fila (1-based)
 * @returns {Object} Objeto con los datos estructurados
 */
function convertirFilaAObjeto(fila, numFila) {
  const col = SHEET_CONFIG.columnas;

  // Helper para convertir fechas a strings serializables para google.script.run
  const serializarFecha = (valor) => {
    if (!valor) return null;
    if (valor instanceof Date) {
      return valor.toISOString();
    }
    // Si ya es string, intentar parsearlo para validar
    if (typeof valor === 'string' && valor.trim() !== '') {
      try {
        const fecha = new Date(valor);
        return fecha.toISOString();
      } catch (e) {
        return valor; // Retornar string original si no es fecha válida
      }
    }
    return null;
  };

  return {
    fila: numFila,
    resguardo: fila[col.resguardo] || "",
    fechaResponsablePpto: serializarFecha(fila[col.fechaResponsablePpto]),
    fechaElaboracionPpto: serializarFecha(fila[col.fechaElaboracionPpto]),
    tecnico: fila[col.tecnico] || "",
    fechaReparacion: serializarFecha(fila[col.fechaReparacion]),

    // Cliente
    cliente: {
      nombre: fila[col.nombreCliente] || "",
      telefono: fila[col.telefono] || "",
      email: fila[col.email] || ""
    },

    // Equipo
    equipo: {
      modelo: fila[col.modeloMarcaEquipo] || "",
      marca: fila[col.fichaMarca] || "",
      sintoma: fila[col.sintoma] || ""
    },

    // Estado
    estado: fila[col.estado] || "",
    tiempoEntregaDias: fila[col.tiempoEntregaDias] || null,

    // Presupuesto
    presupuesto: {
      costoReparacion: fila[col.costoReparacionSinIVA] || 0,
      costoPieza: fila[col.costoPieza] || 0,
      gananciaNeta: fila[col.gananciaNeta] || 0,
      fechaElaboracion: serializarFecha(fila[col.fechaElaboracionPpto]),
      fechaLimite: serializarFecha(fila[col.fechaLimitePpto]),
      fechaAceptacion: serializarFecha(fila[col.fechaAceptacionPpto]),
      motivoRechazo: fila[col.motivoRechazo] || ""
    },

    // Pieza/Pedido
    pieza: {
      responsableCompra: fila[col.responsableCompra] || "",
      proveedor: fila[col.proveedor] || "",
      enlaceCompra: fila[col.enlaceCompra] || "",
      numeroPedido: fila[col.numeroPedido] || "",
      fechaPedido: serializarFecha(fila[col.fechaPedido]),
      estadoPedido: fila[col.estadoPedido] || "",
      fechaEntrega: serializarFecha(fila[col.fechaEntrega]),
      contactarProveedor: fila[col.contactarProveedor] || false,
      fechaContacto1: serializarFecha(fila[col.fechaContacto1]),
      recordatorioP1: serializarFecha(fila[col.recordatorioP1])
    },

    // Recogida
    recogida: {
      numeroFactura: fila[col.numeroFactura] || "",
      fechaRecogida: serializarFecha(fila[col.fechaRecogida]),
      estadoRecogida: fila[col.estadoRecogida] || "PENDIENTE"
    },

    // Observaciones
    observaciones: fila[col.observaciones] || "",
    obsEntregaEquipos: fila[col.obsEntregaEquipos] || "",

    // Otros
    avisoWhatsappEstado: fila[col.avisoWhatsappEstado] || false,
    colocoResena: fila[col.colocoResena] || false,
    envioEncuesta: fila[col.envioEncuesta] || false
  };
}
