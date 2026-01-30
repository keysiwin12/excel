/**
 * DATABASE.GS - Capa de acceso a datos (Multi-Tabla)
 * Operaciones CRUD genéricas + funciones específicas por entidad
 */

// ============================================
// FUNCIONES HELPER GENÉRICAS
// ============================================

/**
 * Obtiene una hoja por su clave en HOJAS
 * @param {string} claveHoja - Clave en el objeto HOJAS (ej: "reparaciones", "presupuestos")
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getHoja(claveHoja) {
  const config = HOJAS[claveHoja];
  if (!config) {
    throw new Error(`Hoja "${claveHoja}" no está configurada en HOJAS`);
  }

  const ss = SpreadsheetApp.openById(DB_ID);
  const sheet = ss.getSheetByName(config.nombre);

  if (!sheet) {
    const hojas = ss.getSheets().map(h => h.getName());
    throw new Error(`Hoja "${config.nombre}" no encontrada. Disponibles: ${hojas.join(', ')}`);
  }

  return sheet;
}

/**
 * Obtiene todos los datos de una hoja (sin header)
 * @param {string} claveHoja - Clave en HOJAS
 * @returns {Array[][]} Datos sin header
 */
function obtenerTodo(claveHoja) {
  const sheet = getHoja(claveHoja);
  const data = sheet.getDataRange().getValues();
  return data.slice(1); // sin header
}

/**
 * Obtiene todos los datos incluyendo header
 * @param {string} claveHoja - Clave en HOJAS
 * @returns {Array[][]} Datos con header
 */
function obtenerTodoConHeader(claveHoja) {
  const sheet = getHoja(claveHoja);
  return sheet.getDataRange().getValues();
}

/**
 * Busca una fila por valor en una columna específica
 * @param {string} claveHoja - Clave en HOJAS
 * @param {string} claveCol - Clave de columna en cols (ej: "resguardo")
 * @param {*} valor - Valor a buscar
 * @returns {Object|null} {fila: Array, numFila: number (1-based)} o null
 */
function buscarPorId(claveHoja, claveCol, valor) {
  const config = HOJAS[claveHoja];
  const colIndex = config.cols[claveCol];
  const data = obtenerTodoConHeader(claveHoja);
  const valorStr = String(valor);

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]) === valorStr) {
      return { fila: data[i], numFila: i + 1 };
    }
  }
  return null;
}

/**
 * Busca todas las filas que coincidan con un valor en una columna
 * @param {string} claveHoja - Clave en HOJAS
 * @param {string} claveCol - Clave de columna
 * @param {*} valor - Valor a buscar
 * @returns {Array<{fila: Array, numFila: number}>}
 */
function buscarTodosPorCampo(claveHoja, claveCol, valor) {
  const config = HOJAS[claveHoja];
  const colIndex = config.cols[claveCol];
  const data = obtenerTodoConHeader(claveHoja);
  const valorStr = String(valor);
  const resultados = [];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]) === valorStr) {
      resultados.push({ fila: data[i], numFila: i + 1 });
    }
  }
  return resultados;
}

/**
 * Agrega una fila al final de una hoja
 * @param {string} claveHoja - Clave en HOJAS
 * @param {Array} datos - Array con los valores de la fila
 * @returns {number} Número de fila agregada (1-based)
 */
function agregarFila(claveHoja, datos) {
  const sheet = getHoja(claveHoja);
  sheet.appendRow(datos);
  return sheet.getLastRow();
}

/**
 * Actualiza una celda específica
 * @param {string} claveHoja - Clave en HOJAS
 * @param {number} numFila - Número de fila (1-based)
 * @param {string} claveCol - Clave de columna en cols
 * @param {*} valor - Nuevo valor
 */
function actualizarCelda(claveHoja, numFila, claveCol, valor) {
  const config = HOJAS[claveHoja];
  const colIndex = config.cols[claveCol];
  const sheet = getHoja(claveHoja);
  sheet.getRange(numFila, colIndex + 1).setValue(valor);
}

/**
 * Actualiza múltiples celdas de una fila de una vez (más eficiente)
 * @param {string} claveHoja - Clave en HOJAS
 * @param {number} numFila - Número de fila (1-based)
 * @param {Object} cambios - Objeto {claveCol: valor, ...}
 */
function actualizarCeldas(claveHoja, numFila, cambios) {
  const config = HOJAS[claveHoja];
  const sheet = getHoja(claveHoja);

  for (const [claveCol, valor] of Object.entries(cambios)) {
    const colIndex = config.cols[claveCol];
    if (colIndex !== undefined) {
      sheet.getRange(numFila, colIndex + 1).setValue(valor);
    }
  }
}

/**
 * Genera un ID secuencial con prefijo
 * @param {string} prefijo - Prefijo del ID (ej: "PPTO", "PED", "EVT")
 * @param {string} claveHoja - Clave en HOJAS
 * @param {string} claveCol - Clave de la columna de ID
 * @returns {string} ID generado (ej: "PPTO-0001")
 */
function generarId(prefijo, claveHoja, claveCol) {
  const config = HOJAS[claveHoja];
  const colIndex = config.cols[claveCol];
  const data = obtenerTodoConHeader(claveHoja);

  let maxNum = 0;
  for (let i = 1; i < data.length; i++) {
    const id = String(data[i][colIndex] || "");
    const match = id.match(/\d+$/);
    if (match) {
      const num = parseInt(match[0], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  return `${prefijo}-${String(maxNum + 1).padStart(4, '0')}`;
}

// ============================================
// FUNCIONES DE CATÁLOGO
// ============================================

/**
 * Obtiene empleados, opcionalmente filtrados
 * @param {Object} filtro - {esTecnico: true, esComprador: true, activo: true}
 * @returns {Array<Object>}
 */
function obtenerEmpleados(filtro) {
  filtro = filtro || {};
  const cols = HOJAS.empleados.cols;
  const data = obtenerTodo("empleados");
  const empleados = [];

  for (const fila of data) {
    if (!fila[cols.nombre]) continue;

    // Filtrar por activo (por defecto solo activos)
    if (filtro.activo !== false) {
      const activo = String(fila[cols.activo]).toUpperCase();
      if (activo !== "TRUE" && activo !== "SI" && activo !== "SÍ" && activo !== "1") continue;
    }

    if (filtro.esTecnico) {
      const esTecnico = String(fila[cols.es_tecnico]).toUpperCase();
      if (esTecnico !== "TRUE" && esTecnico !== "SI" && esTecnico !== "SÍ" && esTecnico !== "1") continue;
    }

    if (filtro.esComprador) {
      const esComprador = String(fila[cols.es_comprador]).toUpperCase();
      if (esComprador !== "TRUE" && esComprador !== "SI" && esComprador !== "SÍ" && esComprador !== "1") continue;
    }

    empleados.push({
      id: fila[cols.empleado_id] || "",
      nombre: fila[cols.nombre] || "",
      email: fila[cols.email] || "",
      rol: fila[cols.rol] || "",
      esTecnico: fila[cols.es_tecnico],
      esComprador: fila[cols.es_comprador],
      activo: fila[cols.activo]
    });
  }

  return empleados;
}

/**
 * Obtiene proveedores activos
 * @returns {Array<Object>}
 */
function obtenerProveedores() {
  const cols = HOJAS.proveedores.cols;
  const data = obtenerTodo("proveedores");
  const proveedores = [];

  for (const fila of data) {
    if (!fila[cols.nombre]) continue;

    const activo = String(fila[cols.activo]).toUpperCase();
    if (activo !== "TRUE" && activo !== "SI" && activo !== "SÍ" && activo !== "1") continue;

    proveedores.push({
      id: fila[cols.provedor_id] || "",
      nombre: fila[cols.nombre] || "",
      notas: fila[cols.notas] || ""
    });
  }

  return proveedores;
}

/**
 * Obtiene un empleado por su email
 * @param {string} email
 * @returns {Object|null}
 */
function obtenerEmpleadoPorEmail(email) {
  if (!email) return null;
  const cols = HOJAS.empleados.cols;
  const data = obtenerTodo("empleados");
  const emailBuscado = String(email).toLowerCase();

  for (const fila of data) {
    if (String(fila[cols.email]).toLowerCase() === emailBuscado) {
      return {
        id: fila[cols.empleado_id] || "",
        nombre: fila[cols.nombre] || "",
        email: fila[cols.email] || "",
        rol: fila[cols.rol] || "",
        esTecnico: fila[cols.es_tecnico],
        esComprador: fila[cols.es_comprador],
        activo: fila[cols.activo]
      };
    }
  }
  return null;
}

// ============================================
// REPARACIONES - CRUD
// ============================================

/**
 * Genera el siguiente número de resguardo correlativo
 * @returns {number}
 */
function generarSiguienteResguardo() {
  const cols = HOJAS.reparaciones.cols;
  const data = obtenerTodoConHeader("reparaciones");

  if (data.length <= 1) return 1;

  let maxNumero = 0;
  for (let i = 1; i < data.length; i++) {
    const resguardo = data[i][cols.resguardo];
    if (!resguardo) continue;
    const numero = parseInt(resguardo, 10);
    if (!isNaN(numero) && numero > maxNumero) {
      maxNumero = numero;
    }
  }

  return maxNumero + 1;
}

/**
 * Crea una nueva reparación
 * @param {Object} datos - Datos de la reparación
 * @returns {Object} Resultado con el resguardo
 */
function crearReparacion(datos) {
  try {
    const resguardo = datos.resguardo;
    if (!resguardo) {
      return { exito: false, errores: ['El número de resguardo es obligatorio'] };
    }

    // Verificar que no exista
    const existente = encontrarFilaPorResguardo(resguardo);
    if (existente) {
      return { exito: false, errores: [`El resguardo ${resguardo} ya existe en el sistema`] };
    }

    const fechaRecepcion = datos.fechaRecepcion ? new Date(datos.fechaRecepcion) : new Date();
    const estadoInicial = datos.estado || "Presupuesto Pendiente";
    const cols = HOJAS.reparaciones.cols;

    // Construir fila (18 columnas según nueva estructura)
    const fila = new Array(Object.keys(cols).length).fill("");
    fila[cols.resguardo] = resguardo;
    fila[cols.fecha_recepcion] = fechaRecepcion;
    fila[cols.cliente_nombre] = datos.clienteNombre || "";
    fila[cols.cliente_telefono] = datos.clienteTelefono || "";
    fila[cols.cliente_email] = datos.clienteEmail || "";
    fila[cols.equipo_modelo] = datos.equipoModelo || "";
    fila[cols.sintoma] = datos.sintoma || "";
    fila[cols.estado] = estadoInicial;
    fila[cols.estado_entrega] = "PENDIENTE";
    fila[cols.observaciones] = "";
    fila[cols.creado_por] = datos.creadoPor || Session.getActiveUser().getEmail();
    fila[cols.fecha_creacion] = new Date();
    fila[cols.tipo_recepcion] = datos.tipoRecepcion || "LOCAL";
    fila[cols.equipo_en_local] = datos.equipoEnLocal || "SI";

    agregarFila("reparaciones", fila);

    // Registrar en historial
    agregarEventoHistorial(resguardo, "creacion", `Reparación creada. Estado: ${estadoInicial}`, datos.creadoPor);

    // Invalidar caché
    CacheService.getScriptCache().remove('metricas-dashboard');

    Logger.log(`Reparación creada: ${resguardo} - Estado: ${estadoInicial}`);

    return {
      exito: true,
      resguardo: resguardo,
      mensaje: `Recepción ${resguardo} registrada exitosamente`
    };

  } catch (error) {
    Logger.log(`Error al crear reparación: ${error.message}`);
    return { exito: false, error: error.message };
  }
}

/**
 * Encuentra el número de fila de una reparación por su resguardo
 * @param {string} resguardo
 * @returns {number|null} Número de fila (1-based) o null
 */
function encontrarFilaPorResguardo(resguardo) {
  const resultado = buscarPorId("reparaciones", "resguardo", resguardo);
  return resultado ? resultado.numFila : null;
}

/**
 * Obtiene una reparación completa (con presupuestos, pedidos e historial)
 * @param {string} resguardo
 * @returns {Object} Objeto completo de la reparación
 */
function obtenerReparacion(resguardo) {
  try {
    const resultado = buscarPorId("reparaciones", "resguardo", resguardo);
    if (!resultado) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const obj = convertirFilaAReparacion(resultado.fila, resultado.numFila);

    // Obtener presupuestos de esta reparación
    obj.presupuestos = obtenerPresupuestosDeReparacion(resguardo);

    // Obtener pedidos de esta reparación
    obj.pedidos = obtenerPedidosDeReparacion(resguardo);

    // Obtener historial
    obj.historialEventos = obtenerHistorialDeReparacion(resguardo);

    return obj;

  } catch (error) {
    Logger.log(`Error al obtener reparación: ${error.message}`);
    throw error;
  }
}

/**
 * Busca reparaciones según filtros (paginado)
 * @param {Object} filtros
 * @param {number} pagina
 * @param {number} porPagina
 * @returns {Object} Resultados paginados
 */
function buscarReparaciones(filtros, pagina, porPagina) {
  try {
    filtros = filtros || {};
    pagina = pagina || 1;
    porPagina = porPagina || 50;

    const cols = HOJAS.reparaciones.cols;
    const data = obtenerTodoConHeader("reparaciones");
    const resultados = [];

    for (let i = 1; i < data.length; i++) {
      const fila = data[i];

      // Saltar filas vacías
      if (!fila[cols.cliente_nombre]) continue;

      // Filtro finalizadas: ENTREGADO, RECICLAJE o ENVIO
      const estadoEntregaFila = fila[cols.estado_entrega] || "";
      const esFinalizadaFila = (estadoEntregaFila === "ENTREGADO" || estadoEntregaFila === "RECICLAJE" || estadoEntregaFila === "ENVIO");
      if (filtros.finalizadas === true && !esFinalizadaFila) continue;
      if (filtros.finalizadas === false && esFinalizadaFila) continue;

      // Filtro por rango de fechas (fecha_entrega)
      if (filtros.fechaDesde || filtros.fechaHasta) {
        const fechaEntregaFila = fila[cols.fecha_entrega];
        if (!fechaEntregaFila) continue;
        const fechaE = new Date(fechaEntregaFila);
        fechaE.setHours(0, 0, 0, 0);
        if (filtros.fechaDesde) {
          const desde = new Date(filtros.fechaDesde);
          desde.setHours(0, 0, 0, 0);
          if (fechaE < desde) continue;
        }
        if (filtros.fechaHasta) {
          const hasta = new Date(filtros.fechaHasta);
          hasta.setHours(23, 59, 59, 999);
          if (fechaE > hasta) continue;
        }
      }

      // Filtro por estado
      if (filtros.estado && filtros.estado !== "Todos") {
        if (fila[cols.estado] !== filtros.estado) continue;
      }

      // Filtro por técnico
      if (filtros.tecnico && filtros.tecnico !== "Todos") {
        if (fila[cols.tecnico_asignado] !== filtros.tecnico) continue;
      }

      // Filtro por estado de entrega/recogida
      if (filtros.estadoRecogida && filtros.estadoRecogida !== "Todos") {
        if (fila[cols.estado_entrega] !== filtros.estadoRecogida) continue;
      }

      // Búsqueda de texto
      if (filtros.busqueda) {
        const textoBusqueda = filtros.busqueda.toLowerCase();
        const textoFila = (
          String(fila[cols.resguardo] || "") +
          String(fila[cols.cliente_nombre] || "") +
          String(fila[cols.cliente_telefono] || "") +
          String(fila[cols.cliente_email] || "") +
          String(fila[cols.equipo_modelo] || "")
        ).toLowerCase();

        if (!textoFila.includes(textoBusqueda)) continue;
      }

      resultados.push(convertirFilaAReparacion(fila, i + 1));
    }

    // Ordenar por fecha de recepción (más recientes primero)
    resultados.sort((a, b) => {
      const fechaA = a.fechaRecepcion ? new Date(a.fechaRecepcion) : new Date(0);
      const fechaB = b.fechaRecepcion ? new Date(b.fechaRecepcion) : new Date(0);
      return fechaB - fechaA;
    });

    // Paginar
    const inicio = (pagina - 1) * porPagina;
    const paginados = resultados.slice(inicio, inicio + porPagina);

    return {
      resultados: paginados,
      total: resultados.length,
      pagina: pagina,
      totalPaginas: Math.ceil(resultados.length / porPagina),
      porPagina: porPagina
    };

  } catch (error) {
    Logger.log(`Error al buscar reparaciones: ${error.message}`);
    throw error;
  }
}

/**
 * Actualiza campos de una reparación
 * @param {string} resguardo
 * @param {Object} datos - {claveCol: valor, ...} usando claves de HOJAS.reparaciones.cols
 * @returns {Object}
 */
function actualizarReparacion(resguardo, datos) {
  try {
    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    actualizarCeldas("reparaciones", numFila, datos);

    // Invalidar caché
    CacheService.getScriptCache().remove('metricas-dashboard');

    Logger.log(`Reparación ${resguardo} actualizada`);
    return { exito: true, mensaje: `Reparación ${resguardo} actualizada` };

  } catch (error) {
    Logger.log(`Error al actualizar reparación: ${error.message}`);
    throw error;
  }
}

// ============================================
// CONVERSIÓN FILA → OBJETO (REPARACIONES)
// ============================================

/**
 * Convierte una fila de Reparaciones a objeto JavaScript
 * @param {Array} fila
 * @param {number} numFila - Número de fila (1-based)
 * @returns {Object}
 */
function convertirFilaAReparacion(fila, numFila) {
  const col = HOJAS.reparaciones.cols;

  const serializarFecha = (valor) => {
    if (!valor) return null;
    if (valor instanceof Date) return valor.toISOString();
    if (typeof valor === 'string' && valor.trim() !== '') {
      try {
        const fecha = new Date(valor);
        if (!isNaN(fecha.getTime())) return fecha.toISOString();
      } catch (e) { }
    }
    return null;
  };

  return {
    fila: numFila,
    resguardo: String(fila[col.resguardo] || ""),
    fechaRecepcion: serializarFecha(fila[col.fecha_recepcion]),
    cliente: {
      nombre: fila[col.cliente_nombre] || "",
      telefono: fila[col.cliente_telefono] || "",
      email: fila[col.cliente_email] || ""
    },
    equipo: {
      modelo: fila[col.equipo_modelo] || "",
      sintoma: fila[col.sintoma] || ""
    },
    estado: fila[col.estado] || "",
    presupuestoAceptadoId: fila[col.presupuesto_aceptado_id] || "",
    tecnicoAsignado: fila[col.tecnico_asignado] || "",
    fechaReparacion: serializarFecha(fila[col.fecha_reparacion]),
    resultadoReparacion: fila[col.resultado_reparacion] || "",
    numeroFactura: fila[col.numero_factura] || "",
    fechaEntrega: serializarFecha(fila[col.fecha_entrega]),
    estadoEntrega: fila[col.estado_entrega] || "PENDIENTE",
    tipoRecepcion: fila[col.tipo_recepcion] || "LOCAL",
    equipoEnLocal: fila[col.equipo_en_local] || "SI",
    observaciones: fila[col.observaciones] || "",
    creadoPor: fila[col.creado_por] || "",
    fechaCreacion: serializarFecha(fila[col.fecha_creacion]),

    // Estos se llenan en obtenerReparacion() con queries separadas
    presupuestos: [],
    pedidos: [],
    historialEventos: []
  };
}

// ============================================
// PRESUPUESTOS - Queries
// ============================================

/**
 * Obtiene todos los presupuestos de una reparación
 * @param {string} resguardo
 * @returns {Array<Object>}
 */
function obtenerPresupuestosDeReparacion(resguardo) {
  const filas = buscarTodosPorCampo("presupuestos", "resguardo", resguardo);
  const colP = HOJAS.presupuestos.cols;

  const serializarFecha = (valor) => {
    if (!valor) return null;
    if (valor instanceof Date) return valor.toISOString();
    if (typeof valor === 'string' && valor.trim() !== '') {
      try { const f = new Date(valor); if (!isNaN(f.getTime())) return f.toISOString(); } catch (e) { }
    }
    return null;
  };

  return filas.map(r => {
    const f = r.fila;
    const pptoId = f[colP.presupuesto_id] || "";

    // Obtener piezas de este presupuesto
    const piezas = obtenerPiezasDePresupuesto(pptoId);

    return {
      presupuestoId: pptoId,
      resguardo: f[colP.resguardo] || "",
      version: f[colP.version] || 1,
      fechaElaboracion: serializarFecha(f[colP.fecha_elaboracion]),
      elaboradoPor: f[colP.elaborado_por] || "",
      costoReparacion: f[colP.costo_reparacion] || 0,
      costoPiezas: f[colP.costo_piezas] || 0,
      total: f[colP.total] || 0,
      gananciaNeta: f[colP.ganancia_neta] || 0,
      diasEntrega: f[colP.dias_entrega] || 0,
      estado: f[colP.estado] || "borrador",
      fechaEnvio: serializarFecha(f[colP.fecha_envio]),
      fechaRespuesta: serializarFecha(f[colP.fecha_respuesta]),
      motivoRechazo: f[colP.motivo_rechazo] || "",
      notas: f[colP.notas] || "",
      tipoPieza: f[colP.tipo_pieza] || "no",
      piezas: piezas,
      numFila: r.numFila
    };
  });
}

/**
 * Obtiene las piezas de un presupuesto
 * @param {string} presupuestoId
 * @returns {Array<Object>}
 */
function obtenerPiezasDePresupuesto(presupuestoId) {
  const filas = buscarTodosPorCampo("piezas", "presupuesto_id", presupuestoId);
  const colPz = HOJAS.piezas.cols;

  return filas.map(r => {
    const f = r.fila;
    return {
      piezaId: f[colPz.pieza_id] || "",
      presupuestoId: f[colPz.presupuesto_id] || "",
      proveedorId: f[colPz.proveedor_id] || "",
      descripcion: f[colPz.descripcion] || "",
      costo: f[colPz.costo] || 0,
      enlace: f[colPz.enlace] || "",
      notas: f[colPz.notas] || "",
      numFila: r.numFila
    };
  });
}

// ============================================
// PEDIDOS - Queries
// ============================================

/**
 * Obtiene todos los pedidos de una reparación
 * @param {string} resguardo
 * @returns {Array<Object>}
 */
function obtenerPedidosDeReparacion(resguardo) {
  const filas = buscarTodosPorCampo("pedidos", "resguardo", resguardo);
  return filas.map(r => convertirFilaAPedido(r.fila, r.numFila));
}

/**
 * Convierte una fila de PEDIDOS a objeto
 * @param {Array} fila
 * @param {number} numFila
 * @returns {Object}
 */
function convertirFilaAPedido(fila, numFila) {
  const col = HOJAS.pedidos.cols;

  const serializarFecha = (valor) => {
    if (!valor) return null;
    if (valor instanceof Date) return valor.toISOString();
    if (typeof valor === 'string' && valor.trim() !== '') {
      try { const f = new Date(valor); if (!isNaN(f.getTime())) return f.toISOString(); } catch (e) { }
    }
    return null;
  };

  return {
    pedidoId: fila[col.pedido_id] || "",
    piezaId: fila[col.pieza_id] || "",
    resguardo: fila[col.resguardo] || "",
    compradoPor: fila[col.comprado_por] || "",
    numeroPedido: fila[col.numero_pedido] || "",
    fechaPedido: serializarFecha(fila[col.fecha_pedido]),
    fechaEstimada: serializarFecha(fila[col.fecha_estimada]),
    fechaRecepcion: serializarFecha(fila[col.fecha_recepcion]),
    estado: fila[col.estado] || "",
    recibidoPor: fila[col.recibido_por] || "",
    problemaTipo: fila[col.problema_tipo] || "",
    codigoDevolucion: fila[col.codigo_devolucion] || "",
    pedidoRemplazoId: fila[col.pedido_remplazo_id] || "",
    notas: fila[col.notas] || "",
    numFila: numFila
  };
}

/**
 * Obtiene pedidos activos (Pedido o En Tránsito) de todas las reparaciones
 * @returns {Array<Object>}
 */
function obtenerPedidosPendientes() {
  const col = HOJAS.pedidos.cols;
  const data = obtenerTodoConHeader("pedidos");
  const pedidos = [];

  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const estado = fila[col.estado];
    if (estado === "Pedido" || estado === "En Tránsito") {
      pedidos.push(convertirFilaAPedido(fila, i + 1));
    }
  }

  return pedidos;
}

// ============================================
// HISTORIAL - Queries
// ============================================

/**
 * Agrega un evento al historial
 * @param {string} resguardo
 * @param {string} tipo - Tipo de evento
 * @param {string} descripcion
 * @param {string} empleadoId - Email o ID del empleado (opcional)
 * @param {string} datosExtra - JSON con datos adicionales (opcional)
 * @returns {string} ID del evento creado
 */
function agregarEventoHistorial(resguardo, tipo, descripcion, empleadoId, datosExtra) {
  const eventoId = generarId("EVT", "historial", "evento_id");
  const cols = HOJAS.historial.cols;

  const fila = new Array(Object.keys(cols).length).fill("");
  fila[cols.evento_id] = eventoId;
  fila[cols.resguardo] = resguardo;
  fila[cols.fecha_hora] = new Date();
  fila[cols.empleado_id] = empleadoId || Session.getActiveUser().getEmail();
  fila[cols.tipo] = tipo;
  fila[cols.descripcion] = descripcion;
  fila[cols.datos_extra] = datosExtra || "";

  agregarFila("historial", fila);
  return eventoId;
}

/**
 * Obtiene el historial de una reparación
 * @param {string} resguardo
 * @returns {Array<Object>}
 */
function obtenerHistorialDeReparacion(resguardo) {
  const filas = buscarTodosPorCampo("historial", "resguardo", resguardo);
  const cols = HOJAS.historial.cols;

  const serializarFecha = (valor) => {
    if (!valor) return null;
    if (valor instanceof Date) return valor.toISOString();
    if (typeof valor === 'string' && valor.trim() !== '') {
      try { const f = new Date(valor); if (!isNaN(f.getTime())) return f.toISOString(); } catch (e) { }
    }
    return null;
  };

  const eventos = filas.map(r => {
    const f = r.fila;
    return {
      eventoId: f[cols.evento_id] || "",
      resguardo: f[cols.resguardo] || "",
      fechaHora: serializarFecha(f[cols.fecha_hora]),
      empleadoId: f[cols.empleado_id] || "",
      tipo: f[cols.tipo] || "",
      descripcion: f[cols.descripcion] || "",
      datosExtra: f[cols.datos_extra] || ""
    };
  });

  // Ordenar por fecha (más recientes primero)
  eventos.sort((a, b) => {
    return new Date(b.fechaHora || 0) - new Date(a.fechaHora || 0);
  });

  return eventos;
}

// ============================================
// MÉTRICAS
// ============================================

/**
 * Obtiene métricas del dashboard
 * @returns {Object}
 */
function obtenerMetricas() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('metricas-dashboard');
    if (cached) {
      Logger.log('Métricas obtenidas del caché');
      return JSON.parse(cached);
    }

    const cols = HOJAS.reparaciones.cols;
    const data = obtenerTodoConHeader("reparaciones");

    const metricas = {
      presupuestoPendiente: 0,
      pptoEnviado: 0,
      esperandoPieza: 0,
      piezaEntregada: 0,
      enReparacion: 0,
      listos: 0,
      garantia: 0,
      totalReparaciones: 0,
      totalFinalizadas: 0,
      alertas: [],
      presupuestosRetrasados: [],
      equiposRetrasados: []
    };

    // Para las alertas de equipos retrasados necesitamos datos de presupuestos
    // Los cargamos una vez
    const colP = HOJAS.presupuestos.cols;
    let presupuestosData = null;

    for (let i = 1; i < data.length; i++) {
      const fila = data[i];
      if (!fila[cols.cliente_nombre]) continue;

      metricas.totalReparaciones++;

      const estado = fila[cols.estado];
      const estadoEntrega = fila[cols.estado_entrega];
      const resguardo = fila[cols.resguardo];

      // Excluir finalizadas de las métricas activas
      if (estadoEntrega === "ENTREGADO" || estadoEntrega === "RECICLAJE" || estadoEntrega === "ENVIO") {
        metricas.totalFinalizadas++;
        continue;
      }

      // Contar por estado
      if (estado === "Presupuesto Pendiente") {
        metricas.presupuestoPendiente++;

        // Detectar presupuestos pendientes +24h
        const fechaRecepcion = fila[cols.fecha_recepcion];
        if (fechaRecepcion) {
          const horas = calcularHorasTranscurridas(fechaRecepcion, new Date());
          if (horas >= 24) {
            metricas.presupuestosRetrasados.push({
              resguardo: resguardo,
              cliente: fila[cols.cliente_nombre],
              equipo: fila[cols.equipo_modelo],
              horasRetraso: Math.round(horas),
              diasRetraso: Math.floor(horas / 24)
            });
          }
        }
      }

      if (estado === "Presupuesto Enviado") {
        metricas.pptoEnviado++;

        // Alerta: Presupuestos sin respuesta +5 días
        const fechaRecepcion = fila[cols.fecha_recepcion];
        if (fechaRecepcion) {
          const diasDesde = Math.floor((new Date() - new Date(fechaRecepcion)) / (1000 * 60 * 60 * 24));
          if (diasDesde >= 5) {
            metricas.alertas.push({
              tipo: "presupuesto",
              mensaje: `Presupuesto sin respuesta hace ${diasDesde} días`,
              resguardo: resguardo
            });
          }
        }
      }

      if (estado === "Garantía") metricas.garantia++;
      if (estado === "Pieza Pendiente") metricas.esperandoPieza++;
      if (estado === "Pieza Entregada") metricas.piezaEntregada++;
      if (estado === "En Reparación") metricas.enReparacion++;

      // Listos para recoger
      if (estado === "Reparado" || estado === "No tiene Reparación" || estado === "Presupuesto Rechazado") {
        metricas.listos++;
      }

      // Alerta: Equipos listos sin recoger +7 días
      if (estadoEntrega === "PENDIENTE" && (estado === "Reparado" || estado === "No tiene Reparación")) {
        const fechaReparacion = fila[cols.fecha_reparacion];
        if (fechaReparacion) {
          const diasDesde = Math.floor((new Date() - new Date(fechaReparacion)) / (1000 * 60 * 60 * 24));
          if (diasDesde >= 7) {
            metricas.alertas.push({
              tipo: "recogida",
              mensaje: `Equipo listo sin recoger hace ${diasDesde} días`,
              resguardo: resguardo
            });
          }
        }
      }

      // Detectar equipos con días de entrega excedidos
      // Necesita el presupuesto aceptado para ver dias_entrega
      const pptoAceptadoId = fila[cols.presupuesto_aceptado_id];
      if (pptoAceptadoId && (estado === "En Reparación" || estado === "Pieza Pendiente" || estado === "En Tránsito" || estado === "Pieza Entregada")) {
        // Cargar presupuestos si aún no se han cargado
        if (!presupuestosData) {
          presupuestosData = obtenerTodoConHeader("presupuestos");
        }

        // Buscar el presupuesto aceptado
        for (let j = 1; j < presupuestosData.length; j++) {
          if (String(presupuestosData[j][colP.presupuesto_id]) === String(pptoAceptadoId)) {
            const tiempoPrometido = presupuestosData[j][colP.dias_entrega];
            if (tiempoPrometido && tiempoPrometido > 0) {
              // Determinar fecha de inicio: fecha_reparacion del presupuesto aceptado o fecha_recepcion
              const fechaInicio = fila[cols.fecha_recepcion];
              if (fechaInicio) {
                const diasTranscurridos = calcularDiasLaborables(fechaInicio, new Date());
                const diasRestantes = tiempoPrometido - diasTranscurridos;
                if (diasRestantes < 0) {
                  metricas.equiposRetrasados.push({
                    resguardo: resguardo,
                    cliente: fila[cols.cliente_nombre],
                    equipo: fila[cols.equipo_modelo],
                    estado: estado,
                    diasExcedidos: Math.abs(diasRestantes),
                    diasPrometidos: tiempoPrometido
                  });
                }
              }
            }
            break;
          }
        }
      }
    }

    // Guardar en caché por 5 minutos
    cache.put('metricas-dashboard', JSON.stringify(metricas), 300);

    return metricas;

  } catch (error) {
    Logger.log(`Error al obtener métricas: ${error.message}`);
    throw error;
  }
}
