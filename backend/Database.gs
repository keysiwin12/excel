/**
 * DATABASE.GS - Capa de acceso a datos (Multi-Tabla)
 * Operaciones CRUD genéricas + funciones específicas por entidad
 */

// ============================================
// CACHÉ GLOBAL DE RENDIMIENTO
// ============================================

/**
 * Caché de SpreadSheet para evitar múltiples openById()
 * MEJORA: ~500ms por llamada evitada
 */
var SS_CACHE = SS_CACHE || null;

/**
 * Caché de hojas individuales { "reparaciones": Sheet, "presupuestos": Sheet }
 * MEJORA: ~200ms por llamada evitada
 */
var SHEET_CACHE = SHEET_CACHE || {};

/**
 * Caché global de IDs máximos por hoja
 * Formato: { "presupuestos_presupuesto_id": 42, "piezas_pieza_id": 156 }
 */
var ID_CACHE = ID_CACHE || {};

/**
 * Caché de versiones máximas por resguardo
 * Formato: { "12345": 3, "12346": 1 }
 */
var VERSION_CACHE = VERSION_CACHE || {};

/**
 * Cola de eventos de historial para procesamiento asíncrono
 */
var HISTORIAL_QUEUE = HISTORIAL_QUEUE || [];

/**
 * Caché de email → nombre de empleado
 */
var NOMBRE_CACHE = NOMBRE_CACHE || {};

// ============================================
// FUNCIONES HELPER GENÉRICAS
// ============================================

/**
 * Resuelve email del usuario actual a nombre de empleado.
 * Usa caché para evitar lecturas repetidas.
 * @returns {string} Nombre del empleado o email como fallback
 */
function obtenerNombreUsuarioActual() {
  const email = Session.getActiveUser().getEmail();
  if (!email) return "";
  if (NOMBRE_CACHE[email]) return NOMBRE_CACHE[email];
  const cols = HOJAS.empleados.cols;
  const data = obtenerTodo("empleados");
  for (const fila of data) {
    if (String(fila[cols.email] || "").toLowerCase() === email.toLowerCase()) {
      NOMBRE_CACHE[email] = fila[cols.nombre] || email;
      return NOMBRE_CACHE[email];
    }
  }
  NOMBRE_CACHE[email] = email;
  return email;
}

/**
 * Obtiene el SpreadSheet con caché (evita múltiples openById)
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet() {
  if (!SS_CACHE) {
    SS_CACHE = SpreadsheetApp.openById(DB_ID);
  }
  return SS_CACHE;
}

/**
 * Obtiene una hoja por su clave en HOJAS (con caché)
 * @param {string} claveHoja - Clave en el objeto HOJAS (ej: "reparaciones", "presupuestos")
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getHoja(claveHoja) {
  // Verificar caché primero
  if (SHEET_CACHE[claveHoja]) {
    return SHEET_CACHE[claveHoja];
  }

  const config = HOJAS[claveHoja];
  if (!config) {
    throw new Error(`Hoja "${claveHoja}" no está configurada en HOJAS`);
  }

  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(config.nombre);

  if (!sheet) {
    const hojas = ss.getSheets().map(h => h.getName());
    throw new Error(`Hoja "${config.nombre}" no encontrada. Disponibles: ${hojas.join(', ')}`);
  }

  // Guardar en caché
  SHEET_CACHE[claveHoja] = sheet;
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
 * ⚡ OPTIMIZADO: Busca una fila usando TextFinder (mucho más rápido que leer toda la hoja)
 * @param {string} claveHoja - Clave en HOJAS
 * @param {string} claveCol - Clave de columna en cols (ej: "resguardo")
 * @param {*} valor - Valor a buscar
 * @returns {Object|null} {fila: Array, numFila: number (1-based)} o null
 */
function buscarPorId(claveHoja, claveCol, valor) {
  const config = HOJAS[claveHoja];
  const colIndex = config.cols[claveCol];
  const sheet = getHoja(claveHoja);
  const valorStr = String(valor);

  // Usar TextFinder en la columna específica (mucho más rápido)
  const columna = sheet.getRange(1, colIndex + 1, sheet.getLastRow(), 1);
  const finder = columna.createTextFinder(valorStr).matchEntireCell(true);
  const found = finder.findNext();

  if (!found) return null;

  const numFila = found.getRow();
  // Obtener la fila completa
  const numCols = Object.keys(config.cols).length;
  const fila = sheet.getRange(numFila, 1, 1, numCols).getValues()[0];

  return { fila: fila, numFila: numFila };
}

/**
 * ⚡ OPTIMIZADO: Busca todas las filas usando TextFinder
 * @param {string} claveHoja - Clave en HOJAS
 * @param {string} claveCol - Clave de columna
 * @param {*} valor - Valor a buscar
 * @returns {Array<{fila: Array, numFila: number}>}
 */
function buscarTodosPorCampo(claveHoja, claveCol, valor) {
  const config = HOJAS[claveHoja];
  const colIndex = config.cols[claveCol];
  const sheet = getHoja(claveHoja);
  const valorStr = String(valor);
  const numCols = Object.keys(config.cols).length;

  // Usar TextFinder para encontrar todas las coincidencias
  const columna = sheet.getRange(1, colIndex + 1, sheet.getLastRow(), 1);
  const finder = columna.createTextFinder(valorStr).matchEntireCell(true);
  const matches = finder.findAll();

  if (matches.length === 0) return [];

  // Obtener números de fila de todas las coincidencias
  const filaNumeros = matches.map(m => m.getRow()).filter(r => r > 1); // Excluir header

  if (filaNumeros.length === 0) return [];

  // Optimización: si hay muchas coincidencias, leer en batch
  // Si hay pocas, leer individualmente es más eficiente
  const resultados = [];

  if (filaNumeros.length <= 5) {
    // Pocas filas: leer individualmente
    for (const numFila of filaNumeros) {
      const fila = sheet.getRange(numFila, 1, 1, numCols).getValues()[0];
      resultados.push({ fila: fila, numFila: numFila });
    }
  } else {
    // Muchas filas: leer todo el rango y filtrar
    const allData = sheet.getDataRange().getValues();
    for (const numFila of filaNumeros) {
      resultados.push({ fila: allData[numFila - 1], numFila: numFila });
    }
  }

  return resultados;
}

/**
 * ⚡ OPTIMIZADO: Agrega una fila usando setValues (más rápido que appendRow)
 * @param {string} claveHoja - Clave en HOJAS
 * @param {Array} datos - Array con los valores de la fila
 * @returns {number} Número de fila agregada (1-based)
 */
function agregarFila(claveHoja, datos) {
  const sheet = getHoja(claveHoja);
  const newRow = sheet.getLastRow() + 1;
  sheet.getRange(newRow, 1, 1, datos.length).setValues([datos]);
  return newRow;
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
 * ⚡ OPTIMIZADO: Actualiza múltiples celdas de una fila con batch update
 * @param {string} claveHoja - Clave en HOJAS
 * @param {number} numFila - Número de fila (1-based)
 * @param {Object} cambios - Objeto {claveCol: valor, ...}
 */
function actualizarCeldas(claveHoja, numFila, cambios) {
  const config = HOJAS[claveHoja];
  const sheet = getHoja(claveHoja);
  const cols = config.cols;

  // Obtener número total de columnas
  const numCols = Object.keys(cols).length;

  // Leer la fila completa una sola vez
  const fila = sheet.getRange(numFila, 1, 1, numCols).getValues()[0];

  // Modificar los valores necesarios en memoria
  for (const [claveCol, valor] of Object.entries(cambios)) {
    const colIndex = cols[claveCol];
    if (colIndex !== undefined) {
      fila[colIndex] = valor;
    }
  }

  // Escribir la fila completa de vuelta en una sola operación
  sheet.getRange(numFila, 1, 1, numCols).setValues([fila]);
}

/**
 * Elimina una fila de una hoja
 * @param {string} claveHoja - Clave en HOJAS
 * @param {number} numFila - Número de fila (1-indexed, incluyendo header)
 */
function eliminarFila(claveHoja, numFila) {
  const sheet = getHoja(claveHoja);
  sheet.deleteRow(numFila);
}

/**
 * Genera un ID secuencial con prefijo
 * @param {string} prefijo - Prefijo del ID (ej: "PPTO", "PED", "EVT")
 * @param {string} claveHoja - Clave en HOJAS
 * @param {string} claveCol - Clave de la columna de ID
 * @returns {string} ID generado (ej: "PPTO-0001")
 */
function generarId(prefijo, claveHoja, claveCol) {
  const cacheKey = `${claveHoja}_${claveCol}`;

  // Si hay en caché, incrementar y usar (evita lectura de hoja)
  if (ID_CACHE[cacheKey] !== undefined) {
    ID_CACHE[cacheKey]++;
    return `${prefijo}-${String(ID_CACHE[cacheKey]).padStart(4, '0')}`;
  }

  // Primera vez: leer hoja para obtener máximo
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

  // Guardar en caché para próximas llamadas
  ID_CACHE[cacheKey] = maxNum + 1;
  return `${prefijo}-${String(ID_CACHE[cacheKey]).padStart(4, '0')}`;
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
 * Obtiene todos los catálogos de empleados en UNA sola lectura de hoja
 * @returns {{empleados: Array, tecnicos: Array, compradores: Array}}
 */
function obtenerCatalogosEmpleados() {
  const cols = HOJAS.empleados.cols;
  const data = obtenerTodo("empleados");
  const empleados = [];
  const tecnicos = [];
  const compradores = [];

  const esActivo = (val) => {
    const v = String(val).toUpperCase();
    return v === "TRUE" || v === "SI" || v === "SÍ" || v === "1";
  };

  for (const fila of data) {
    if (!fila[cols.nombre]) continue;
    if (!esActivo(fila[cols.activo])) continue;

    const obj = {
      id: fila[cols.empleado_id] || "",
      nombre: fila[cols.nombre] || "",
      email: fila[cols.email] || "",
      rol: fila[cols.rol] || "",
      esTecnico: fila[cols.es_tecnico],
      esComprador: fila[cols.es_comprador],
      activo: fila[cols.activo]
    };

    empleados.push(obj);
    if (esActivo(fila[cols.es_tecnico])) tecnicos.push(obj);
    if (esActivo(fila[cols.es_comprador])) compradores.push(obj);
  }

  return { empleados, tecnicos, compradores };
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
    fila[cols.entrega_mensajeria] = datos.entregaMensajeria || "NO";
    fila[cols.direccion_envio] = datos.direccionEnvio || "";
    fila[cols.motivo_sin_reparacion] = "";  // Vacío por defecto
    fila[cols.tipo_ingreso] = (estadoInicial === "Garantía") ? "GARANTIA" : "NORMAL";
    fila[cols.ultimo_usuario] = obtenerNombreUsuarioActual();
    fila[cols.revision_pagada] = datos.revisionPagada || "NO";

    // Cintas: usar nuevo formato JSON (solo si hay datos de cintas)
    if (datos.datosCintas) {
      fila[cols.datos_cintas] = serializarDatosCintas(datos.datosCintas);
    } else if (datos.esReparacionCintas === "SI" || datos.esReparacionCintas === "SÍ") {
      // Crear desde valores individuales si vienen del formato viejo
      const datosCintas = crearDatosCintas({
        vhs: datos.cintasVHS,
        vhsc: datos.cintasVHSC,
        beta: datos.cintasBeta,
        minidv: datos.cintasMiniDV,
        "8mm": datos.cintas8mmCassette,
        precioUnitario: datos.precioPorCinta
      });
      fila[cols.datos_cintas] = serializarDatosCintas(datosCintas);
    }
    // Si NO hay cintas, el campo queda vacío (sin asignar valor)

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
function buscarReparaciones(filtros, pagina, porPagina, dataPreCargada) {
  try {
    filtros = filtros || {};
    pagina = pagina || 1;
    porPagina = (porPagina !== undefined && porPagina !== null) ? porPagina : 50;

    const cols = HOJAS.reparaciones.cols;
    const data = dataPreCargada || obtenerTodoConHeader("reparaciones");
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

    // Si porPagina es 0, devolver TODOS los resultados (modo SSOT)
    if (porPagina === 0) {
      // Batch: leer TODOS los pedidos en 1 sola lectura y agrupar por resguardo
      const allPedidosData = obtenerTodo("pedidos");
      const colPed = HOJAS.pedidos.cols;
      const pedidosPorResguardo = {};
      for (let j = 0; j < allPedidosData.length; j++) {
        const resg = String(allPedidosData[j][colPed.resguardo] || "");
        if (!resg) continue;
        if (!pedidosPorResguardo[resg]) pedidosPorResguardo[resg] = [];
        pedidosPorResguardo[resg].push(convertirFilaAPedido(allPedidosData[j], j + 2));
      }
      for (const rep of resultados) {
        rep.pedidos = pedidosPorResguardo[rep.resguardo] || [];
      }

      // Batch: leer presupuestos aceptados en 1 pasada para calcular entrega estimada en tabla
      const allPptosData = obtenerTodo("presupuestos");
      const colP = HOJAS.presupuestos.cols;
      const pptoAceptadoPorResguardo = {};
      for (let j = 0; j < allPptosData.length; j++) {
        const fp = allPptosData[j];
        if (String(fp[colP.estado] || '') !== 'aceptado') continue;
        const resg = String(fp[colP.resguardo] || '');
        if (!resg || pptoAceptadoPorResguardo[resg]) continue;
        let fechaRespuesta = null;
        if (fp[colP.fecha_respuesta]) {
          try { fechaRespuesta = new Date(fp[colP.fecha_respuesta]).toISOString(); } catch(e) {}
        }
        pptoAceptadoPorResguardo[resg] = {
          diasEntrega: Number(fp[colP.dias_entrega] || 0),
          fechaRespuesta: fechaRespuesta,
          costoPiezas: Number(fp[colP.costo_piezas] || 0)
        };
      }
      for (const rep of resultados) {
        rep.pptoAceptadoSummary = pptoAceptadoPorResguardo[rep.resguardo] || null;
      }

      return {
        resultados: resultados,
        total: resultados.length,
        pagina: 1,
        totalPaginas: 1,
        porPagina: resultados.length
      };
    }

    // Paginar
    const inicio = (pagina - 1) * porPagina;
    const paginados = resultados.slice(inicio, inicio + porPagina);

    // Cargar pedidos solo para reparaciones activas (el historial no los muestra en tabla)
    if (!filtros.finalizadas) {
      const allPedidosData = obtenerTodo("pedidos");
      const colPed = HOJAS.pedidos.cols;
      const pedidosPorResguardo = {};
      for (let j = 0; j < allPedidosData.length; j++) {
        const resg = String(allPedidosData[j][colPed.resguardo] || "");
        if (!resg) continue;
        if (!pedidosPorResguardo[resg]) pedidosPorResguardo[resg] = [];
        pedidosPorResguardo[resg].push(convertirFilaAPedido(allPedidosData[j], j + 2));
      }
      for (const rep of paginados) {
        rep.pedidos = pedidosPorResguardo[rep.resguardo] || [];
      }
    }

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
    presupuestosAceptadosIds: String(fila[col.presupuesto_aceptado_id] || "")
      .split(",").map(s => s.trim()).filter(Boolean),
    tecnicoAsignado: fila[col.tecnico_asignado] || "",
    fechaReparacion: serializarFecha(fila[col.fecha_reparacion]),
    resultadoReparacion: fila[col.resultado_reparacion] || "",
    numeroFactura: fila[col.numero_factura] || "",
    fechaEntrega: serializarFecha(fila[col.fecha_entrega]),
    estadoEntrega: fila[col.estado_entrega] || "PENDIENTE",
    tipoRecepcion: fila[col.tipo_recepcion] || "LOCAL",
    equipoEnLocal: fila[col.equipo_en_local] || "SI",
    entregaMensajeria: fila[col.entrega_mensajeria] || "NO",
    direccionEnvio: fila[col.direccion_envio] || "",
    motivoSinReparacion: fila[col.motivo_sin_reparacion] || "",
    tipoIngreso: fila[col.tipo_ingreso] || "NORMAL",
    revisionPagada: fila[col.revision_pagada] || "NO",
    ultimoUsuario: fila[col.ultimo_usuario] || "",

    // Cintas: leer desde nuevo formato JSON (con fallback a columnas viejas)
    datosCintas: leerDatosCintasDesdeFila(fila, col),

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

    // Compatibilidad con datos antiguos: si mano_obra no existe, usar costo_reparacion como fallback
    const manoObra = f[colP.mano_obra] !== undefined && f[colP.mano_obra] !== ""
      ? (f[colP.mano_obra] || 0)
      : (f[colP.costo_reparacion] || 0);
    const precioPiezas = f[colP.precio_piezas] !== undefined && f[colP.precio_piezas] !== ""
      ? (f[colP.precio_piezas] || 0)
      : (f[colP.costo_piezas] || 0);

    return {
      presupuestoId: pptoId,
      resguardo: f[colP.resguardo] || "",
      version: f[colP.version] || 1,
      fechaElaboracion: serializarFecha(f[colP.fecha_elaboracion]),
      elaboradoPor: f[colP.elaborado_por] || "",
      manoObra: manoObra,
      costoPiezas: f[colP.costo_piezas] || 0,
      precioPiezas: precioPiezas,
      total: f[colP.total] || 0,
      gananciaNeta: f[colP.ganancia_neta] || 0,
      diasEntrega: f[colP.dias_entrega] || 0,
      estado: f[colP.estado] || "borrador",
      fechaEnvio: serializarFecha(f[colP.fecha_envio]),
      fechaRespuesta: serializarFecha(f[colP.fecha_respuesta]),
      motivoRechazo: f[colP.motivo_rechazo] || "",
      notas: f[colP.notas] || "",
      tipoPieza: f[colP.tipo_pieza] || "no",
      descripcion: f[colP.descripcion] || "",
      piezas: piezas,
      numFila: r.numFila
    };
  });
}

/**
 * ⚡ OPTIMIZADO: Obtiene la versión máxima con caché
 * @param {string} resguardo
 * @returns {number} Versión máxima (0 si no hay presupuestos)
 */
function obtenerMaxVersionPresupuesto(resguardo) {
  const cacheKey = String(resguardo);

  // Verificar caché primero
  if (VERSION_CACHE[cacheKey] !== undefined) {
    return VERSION_CACHE[cacheKey];
  }

  const filas = buscarTodosPorCampo("presupuestos", "resguardo", resguardo);
  if (filas.length === 0) {
    VERSION_CACHE[cacheKey] = 0;
    return 0;
  }

  const colP = HOJAS.presupuestos.cols;
  const maxVersion = Math.max(...filas.map(r => r.fila[colP.version] || 0));
  VERSION_CACHE[cacheKey] = maxVersion;
  return maxVersion;
}

/**
 * Actualiza el caché de versión después de crear un presupuesto
 * @param {string} resguardo
 * @param {number} version
 */
function actualizarCacheVersion(resguardo, version) {
  VERSION_CACHE[String(resguardo)] = version;
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
    // Compatibilidad con datos antiguos: si precio no existe, usar costo como fallback
    const precio = f[colPz.precio] !== undefined && f[colPz.precio] !== ""
      ? (f[colPz.precio] || 0)
      : (f[colPz.costo] || 0);
    return {
      piezaId: f[colPz.pieza_id] || "",
      presupuestoId: f[colPz.presupuesto_id] || "",
      proveedorId: f[colPz.proveedor_id] || "",
      descripcion: f[colPz.descripcion] || "",
      costo: f[colPz.costo] || 0,
      precio: precio,
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
    enlace: fila[col.enlace] || "",
    numFila: numFila
  };
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
  // empleado_id es siempre el email del usuario activo que ejecuta la acción.
  // El parámetro empleadoId se mantiene solo como fallback (triggers sin sesión activa).
  // Los nombres de técnico ya aparecen en la descripción del evento.
  const emailActivo = Session.getActiveUser().getEmail();
  HISTORIAL_QUEUE.push({
    resguardo: resguardo,
    tipo: tipo,
    descripcion: descripcion,
    empleadoId: emailActivo || empleadoId || '',
    datosExtra: datosExtra || "",
    timestamp: new Date()
  });

  // Flush inmediato: cada google.script.run es un contexto separado,
  // la cola se pierde al terminar si no se procesa.
  // Funciones con múltiples eventos llaman procesarColaHistorial() manualmente
  // antes de agregar, así el batch aún funciona para ellas.
  procesarColaHistorial();

  return `EVT-PENDING-${HISTORIAL_QUEUE.length}`;
}

/**
 * Procesa la cola de eventos de historial en batch
 * Se llama automáticamente cuando hay 10+ eventos o manualmente
 */
function procesarColaHistorial() {
  if (HISTORIAL_QUEUE.length === 0) return;

  try {
    const cols = HOJAS.historial.cols;
    const eventos = [...HISTORIAL_QUEUE]; // Copiar cola
    HISTORIAL_QUEUE = []; // Limpiar cola

    // Preparar todas las filas en batch
    const filas = eventos.map(evento => {
      const eventoId = generarId("EVT", "historial", "evento_id");
      const fila = new Array(Object.keys(cols).length).fill("");
      fila[cols.evento_id] = eventoId;
      fila[cols.resguardo] = evento.resguardo;
      fila[cols.fecha_hora] = evento.timestamp;
      fila[cols.empleado_id] = evento.empleadoId;
      fila[cols.tipo] = evento.tipo;
      fila[cols.descripcion] = evento.descripcion;
      fila[cols.datos_extra] = evento.datosExtra;
      return fila;
    });

    // Escribir todas las filas de una vez (batch write)
    const sheet = getHoja("historial");
    const lastRow = sheet.getLastRow();
    if (filas.length > 0) {
      sheet.getRange(lastRow + 1, 1, filas.length, filas[0].length).setValues(filas);
      Logger.log(`✅ Procesados ${filas.length} eventos de historial en batch`);
    }

  } catch (error) {
    Logger.log(`⚠️ Error procesando cola de historial: ${error.message}`);
    // No lanzar error para no afectar la operación principal
  }
}

// ============================================
// FUNCIONES HELPER PARA CINTAS (JSON)
// ============================================

/**
 * Parsea el JSON de datos de cintas
 * @param {string} jsonString - JSON string de datos_cintas
 * @returns {Object|null} Objeto con estructura de cintas o null
 */
function parsearDatosCintas(jsonString) {
  if (!jsonString || jsonString === "" || jsonString === "null") return null;
  // Filtrar valores no-JSON conocidos (datos legacy en la columna)
  const val = String(jsonString).trim();
  if (val === "NO" || val === "SI" || val === "SÍ") return null;
  if (!val.startsWith("{") && !val.startsWith("[")) return null;
  try {
    return JSON.parse(val);
  } catch(e) {
    return null;
  }
}

/**
 * Serializa datos de cintas a JSON string
 * @param {Object} datosCintas - Objeto con estructura: {tipos: {vhs, vhsc, beta, minidv, 8mm}, total, precioUnitario}
 * @returns {string} JSON string o vacío
 */
function serializarDatosCintas(datosCintas) {
  if (!datosCintas) return "";
  try {
    return JSON.stringify(datosCintas);
  } catch(e) {
    Logger.log(`⚠️ Error serializando datos_cintas: ${e.message}`);
    return "";
  }
}

/**
 * Crea objeto de datos de cintas desde valores individuales
 * @param {Object} valores - {vhs, vhsc, beta, minidv, 8mm, precioUnitario}
 * @returns {Object} Estructura completa de datos de cintas
 */
function crearDatosCintas(valores) {
  const tipos = {
    vhs: parseInt(valores.vhs) || 0,
    vhsc: parseInt(valores.vhsc) || 0,
    beta: parseInt(valores.beta) || 0,
    minidv: parseInt(valores.minidv) || 0,
    "8mm": parseInt(valores["8mm"]) || 0
  };

  const total = Object.values(tipos).reduce((sum, val) => sum + val, 0);

  return {
    tipos: tipos,
    total: total,
    precioUnitario: parseFloat(valores.precioUnitario) || 0
  };
}

/**
 * Lee datos de cintas desde una fila (soporta formato nuevo y viejo)
 * @param {Array} fila - Fila de la hoja de reparaciones
 * @param {Object} cols - Columnas de la hoja
 * @returns {Object} Datos de cintas normalizados
 */
function leerDatosCintasDesdeFila(fila, cols) {
  // Intentar leer desde nueva columna JSON primero
  const datosJSON = parsearDatosCintas(fila[cols.datos_cintas]);
  if (datosJSON) return datosJSON;

  return null;
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
function obtenerMetricas(dataPreCargada) {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('metricas-dashboard');
    if (cached) {
      return JSON.parse(cached);
    }

    const cols = HOJAS.reparaciones.cols;
    const data = dataPreCargada || obtenerTodoConHeader("reparaciones");

    const metricas = {
      presupuestoPendiente: 0,
      pptoEnviado: 0,
      esperandoPieza: 0,
      piezaEntregada: 0,
      enReparacion: 0,
      pptosAceptados: 0,
      cintasEnReparacion: 0,
      mensajeriaActiva: 0,
      listos: 0,
      garantia: 0,
      totalReparaciones: 0,
      totalFinalizadas: 0,
      alertas: [],
      presupuestosRetrasados: [],
      equiposRetrasados: []
    };

    // Construir Map de presupuestos por ID para búsqueda O(1)
    const colP = HOJAS.presupuestos.cols;
    let pptoMap = null;

    const ahora = new Date();

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
          const horas = calcularHorasTranscurridas(fechaRecepcion, ahora);
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
          const diasDesde = Math.floor((ahora - new Date(fechaRecepcion)) / (1000 * 60 * 60 * 24));
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
      if (estado === "Presupuesto Aceptado") metricas.pptosAceptados++;
      if (estado === "Pieza Pendiente") metricas.esperandoPieza++;
      if (estado === "Pieza Entregada") metricas.piezaEntregada++;
      if (estado === "En Reparación") {
        metricas.enReparacion++;
        const dc = fila[cols.datos_cintas];
        if (dc && typeof dc === 'string' && dc.trim().startsWith('{')) metricas.cintasEnReparacion++;
      }

      // Listos para recoger
      if (estado === "Reparado" || estado === "No tiene Reparación" || estado === "Presupuesto Rechazado") {
        metricas.listos++;
      }

      // Mensajería activa (envío pendiente de salir)
      if (fila[cols.entrega_mensajeria] === "SI") metricas.mensajeriaActiva++;

      // Alerta: Equipos listos sin recoger +7 días
      if (estadoEntrega === "PENDIENTE" && (estado === "Reparado" || estado === "No tiene Reparación")) {
        const fechaReparacion = fila[cols.fecha_reparacion];
        if (fechaReparacion) {
          const diasDesde = Math.floor((ahora - new Date(fechaReparacion)) / (1000 * 60 * 60 * 24));
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
      const pptoAceptadoId = fila[cols.presupuesto_aceptado_id];
      if (pptoAceptadoId && (estado === "En Reparación" || estado === "Pieza Pendiente" || estado === "En Tránsito" || estado === "Pieza Entregada")) {
        // Construir Map una sola vez (lazy)
        if (!pptoMap) {
          pptoMap = new Map();
          const pptoData = obtenerTodoConHeader("presupuestos");
          for (let j = 1; j < pptoData.length; j++) {
            const pid = String(pptoData[j][colP.presupuesto_id]);
            if (pid) pptoMap.set(pid, pptoData[j]);
          }
        }

        const pptoFila = pptoMap.get(String(pptoAceptadoId));
        if (pptoFila) {
          const tiempoPrometido = pptoFila[colP.dias_entrega];
          if (tiempoPrometido && tiempoPrometido > 0) {
            const fechaInicio = fila[cols.fecha_recepcion];
            if (fechaInicio) {
              const diasTranscurridos = calcularDiasLaborables(fechaInicio, ahora);
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
