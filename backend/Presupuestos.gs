/**
 * PRESUPUESTOS.GS - Lógica de negocio para presupuestos múltiples
 * Cada reparación puede tener N presupuestos, el cliente acepta uno o ninguno.
 */

// ============================================
// CREAR PRESUPUESTO
// ============================================

/**
 * Crea un nuevo presupuesto para una reparación
 * @param {string} resguardo - Número de resguardo
 * @param {Object} datos - Datos del presupuesto
 * @param {Array<Object>} piezas - Lista de piezas [{descripcion, proveedorId, costo, enlace, notas}]
 * @returns {Object} Resultado
 */
function crearPresupuesto(resguardo, datos, piezas) {
  try {
    // ⚡ ULTRA-OPTIMIZADO: Mínimas llamadas a Google Sheets API
    const ss = getSpreadsheet();
    const usuario = datos.elaboradoPor || Session.getActiveUser().getEmail();
    const ahora = new Date();
    piezas = piezas || [];

    // 1. Obtener todas las hojas necesarias en paralelo (1 llamada batch)
    const sheetPresupuestos = getHoja("presupuestos");
    const sheetReparaciones = getHoja("reparaciones");

    // 2. Verificar reparación existe (TextFinder rápido)
    const colRep = HOJAS.reparaciones.cols;
    const finderRep = sheetReparaciones.getRange(1, colRep.resguardo + 1, sheetReparaciones.getLastRow(), 1)
      .createTextFinder(String(resguardo)).matchEntireCell(true);
    const foundRep = finderRep.findNext();
    if (!foundRep) {
      return { exito: false, error: `Reparación ${resguardo} no encontrada` };
    }
    const numFilaRep = foundRep.getRow();

    // 3. Calcular versión usando caché (evita lectura si ya está cacheado)
    const version = obtenerMaxVersionPresupuesto(resguardo) + 1;
    actualizarCacheVersion(resguardo, version);

    // 4. Generar ID de presupuesto (usa caché)
    const presupuestoId = generarId("PPTO", "presupuestos", "presupuesto_id");

    // 5. Verificar si tiene revisión pagada
    const filaRep = sheetReparaciones.getRange(numFilaRep, 1, 1, sheetReparaciones.getLastColumn()).getValues()[0];
    const revisionPagada = String(filaRep[HOJAS.reparaciones.cols.revision_pagada]).toUpperCase() === "SI";
    const descuentoRevision = revisionPagada ? KELATOS.PRECIO_REVISION : 0;

    // 6. Calcular costos
    const costoPiezas = piezas.length > 0
      ? piezas.reduce((sum, p) => sum + (parseFloat(p.costo) || 0), 0)
      : (parseFloat(datos.costoPiezas) || 0);
    const precioPiezas = piezas.length > 0
      ? piezas.reduce((sum, p) => sum + (parseFloat(p.precio) || 0), 0)
      : (parseFloat(datos.precioPiezas) || 0);
    const manoObra = parseFloat(datos.manoObra) || 0;
    const total = Math.max(0, manoObra + precioPiezas - descuentoRevision);
    const gananciaNeta = total - costoPiezas;

    // 6. Preparar fila de presupuesto
    const colP = HOJAS.presupuestos.cols;
    const filaP = new Array(Object.keys(colP).length).fill("");
    filaP[colP.presupuesto_id] = presupuestoId;
    filaP[colP.resguardo] = resguardo;
    filaP[colP.version] = version;
    filaP[colP.fecha_elaboracion] = ahora;
    filaP[colP.elaborado_por] = usuario;
    // costo_reparacion: columna legacy, total ya cubre este dato
    filaP[colP.costo_piezas] = costoPiezas;
    filaP[colP.total] = total;
    filaP[colP.ganancia_neta] = gananciaNeta;
    filaP[colP.dias_entrega] = datos.diasEntrega || 0;
    filaP[colP.estado] = "borrador";
    filaP[colP.notas] = datos.notas || "";
    filaP[colP.tipo_pieza] = datos.tipoPieza || "no";
    filaP[colP.descripcion] = datos.descripcion || "";
    filaP[colP.mano_obra] = manoObra;
    filaP[colP.precio_piezas] = precioPiezas;

    // 7. ESCRIBIR PRESUPUESTO (1 operación)
    const lastRowP = sheetPresupuestos.getLastRow();
    sheetPresupuestos.getRange(lastRowP + 1, 1, 1, filaP.length).setValues([filaP]);

    // 8. ESCRIBIR PIEZAS si hay (1 operación batch)
    if (piezas.length > 0) {
      const sheetPiezas = getHoja("piezas");
      const colPz = HOJAS.piezas.cols;
      const lastRowPz = sheetPiezas.getLastRow();

      // Generar IDs y preparar filas
      const filasPiezas = piezas.map(pieza => {
        const piezaId = generarId("PZ", "piezas", "pieza_id");
        const filaPz = new Array(Object.keys(colPz).length).fill("");
        filaPz[colPz.pieza_id] = piezaId;
        filaPz[colPz.presupuesto_id] = presupuestoId;
        filaPz[colPz.proveedor_id] = pieza.proveedorId || "";
        filaPz[colPz.descripcion] = pieza.descripcion || "";
        filaPz[colPz.costo] = parseFloat(pieza.costo) || 0;
        filaPz[colPz.enlace] = pieza.enlace || "";
        filaPz[colPz.notas] = pieza.notas || "";
        filaPz[colPz.precio] = parseFloat(pieza.precio) || 0;
        return filaPz;
      });

      sheetPiezas.getRange(lastRowPz + 1, 1, filasPiezas.length, filasPiezas[0].length)
                 .setValues(filasPiezas);
      SpreadsheetApp.flush();
    }

    // 8.5. Actualizar ultimo_usuario en la reparación
    sheetReparaciones.getRange(numFilaRep, colRep.ultimo_usuario + 1, 1, 1).setValue(obtenerNombreUsuarioActual());

    // 9. Historial asíncrono (no bloquea - se procesa después)
    agregarEventoHistorial(resguardo, "presupuesto_creado",
      `Presupuesto v${version} creado (${presupuestoId}). Total: ${total}€`, obtenerNombreUsuarioActual());

    // Procesar historial solo si hay suficientes eventos pendientes
    if (HISTORIAL_QUEUE.length >= 5) {
      procesarColaHistorial();
    }

    // 10. Invalidar caché (operación rápida)
    CacheService.getScriptCache().remove('metricas-dashboard');

    // 11. Retornar resultado (sin leer nada más de Sheets)
    return {
      exito: true,
      presupuestoId: presupuestoId,
      version: version,
      presupuesto: {
        presupuestoId: presupuestoId,
        resguardo: resguardo,
        version: version,
        fechaElaboracion: ahora.toISOString(),
        elaboradoPor: usuario,
        manoObra: manoObra,
        costoPiezas: costoPiezas,
        precioPiezas: precioPiezas,
        total: total,
        gananciaNeta: gananciaNeta,
        descuentoRevision: descuentoRevision,
        diasEntrega: datos.diasEntrega || 0,
        estado: "borrador",
        descripcion: datos.descripcion || "",
        tipoPieza: datos.tipoPieza || "no",
        piezas: piezas.map(p => ({
          descripcion: p.descripcion || "",
          proveedorId: p.proveedorId || "",
          costo: parseFloat(p.costo) || 0,
          precio: parseFloat(p.precio) || 0,
          enlace: p.enlace || "",
          notas: p.notas || ""
        }))
      },
      mensaje: `Presupuesto v${version} creado exitosamente`
    };

  } catch (error) {
    Logger.log(`Error al crear presupuesto: ${error.message}`);
    return { exito: false, error: error.message };
  }
}

// ============================================
// ACTUALIZAR PRESUPUESTO
// ============================================

/**
 * ⚡ ULTRA-OPTIMIZADO: Actualiza un presupuesto existente
 * @param {string} presupuestoId - ID del presupuesto a actualizar
 * @param {Object} datos - Datos del presupuesto
 * @param {Array<Object>} piezas - Lista de piezas [{descripcion, proveedorId, costo, enlace, notas}]
 * @returns {Object} Resultado
 */
function actualizarPresupuesto(presupuestoId, datos, piezas) {
  try {
    piezas = piezas || [];
    Logger.log(`actualizarPresupuesto: ${presupuestoId}, tipoPieza: ${datos.tipoPieza}, piezas recibidas: ${piezas.length}, piezas: ${JSON.stringify(piezas).substring(0, 300)}`);
    const colP = HOJAS.presupuestos.cols;
    const sheetPresupuestos = getHoja("presupuestos");

    // 1. Buscar presupuesto con TextFinder (rápido)
    const colIndex = colP.presupuesto_id;
    const finder = sheetPresupuestos.getRange(1, colIndex + 1, sheetPresupuestos.getLastRow(), 1)
      .createTextFinder(String(presupuestoId)).matchEntireCell(true);
    const found = finder.findNext();

    if (!found) {
      return { exito: false, error: `Presupuesto ${presupuestoId} no encontrado` };
    }

    const numFila = found.getRow();
    const maxCols = Object.keys(colP).length;
    const sheetCols = sheetPresupuestos.getLastColumn();
    const readCols = Math.min(maxCols, sheetCols);
    const filaActual = sheetPresupuestos.getRange(numFila, 1, 1, readCols).getValues()[0];
    // Extender a maxCols si la hoja tiene menos columnas (columnas nuevas aún no escritas)
    while (filaActual.length < maxCols) filaActual.push("");

    // 2. Verificar si tiene revisión pagada
    const resguardoTemp = filaActual[colP.resguardo];
    const sheetReparaciones = getHoja("reparaciones");
    const colRep = HOJAS.reparaciones.cols;
    const finderRep = sheetReparaciones.getRange(1, colRep.resguardo + 1, sheetReparaciones.getLastRow(), 1)
      .createTextFinder(String(resguardoTemp)).matchEntireCell(true);
    const foundRep = finderRep.findNext();
    let revisionPagada = false;
    let descuentoRevision = 0;
    if (foundRep) {
      const filaRep = sheetReparaciones.getRange(foundRep.getRow(), 1, 1, sheetReparaciones.getLastColumn()).getValues()[0];
      revisionPagada = String(filaRep[colRep.revision_pagada]).toUpperCase() === "SI";
      descuentoRevision = revisionPagada ? KELATOS.PRECIO_REVISION : 0;
    }

    // 3. Calcular costos
    const costoPiezas = piezas.length > 0
      ? piezas.reduce((sum, p) => sum + (parseFloat(p.costo) || 0), 0)
      : (parseFloat(datos.costoPiezas) || 0);
    const precioPiezas = piezas.length > 0
      ? piezas.reduce((sum, p) => sum + (parseFloat(p.precio) || 0), 0)
      : (parseFloat(datos.precioPiezas) || 0);
    const manoObra = parseFloat(datos.manoObra) || 0;
    const total = Math.max(0, manoObra + precioPiezas - descuentoRevision);
    const gananciaNeta = total - costoPiezas;

    // 3. Actualizar fila de presupuesto directamente (1 operación)
    filaActual[colP.elaborado_por] = datos.elaboradoPor || filaActual[colP.elaborado_por];
    // costo_reparacion: columna legacy, total ya cubre este dato
    filaActual[colP.costo_piezas] = costoPiezas;
    filaActual[colP.total] = total;
    filaActual[colP.ganancia_neta] = gananciaNeta;
    filaActual[colP.dias_entrega] = datos.diasEntrega || 0;
    filaActual[colP.tipo_pieza] = datos.tipoPieza || "no";
    filaActual[colP.descripcion] = datos.descripcion || "";
    filaActual[colP.notas] = datos.notas || "";
    filaActual[colP.mano_obra] = manoObra;
    filaActual[colP.precio_piezas] = precioPiezas;

    sheetPresupuestos.getRange(numFila, 1, 1, maxCols).setValues([filaActual]);

    // 4. Gestionar piezas de forma optimizada
    const sheetPiezas = getHoja("piezas");
    const colPz = HOJAS.piezas.cols;

    // Buscar piezas existentes
    const finderPiezas = sheetPiezas.getRange(1, colPz.presupuesto_id + 1, sheetPiezas.getLastRow(), 1)
      .createTextFinder(String(presupuestoId)).matchEntireCell(true);
    const matchesPiezas = finderPiezas.findAll();
    const filasAEliminar = matchesPiezas.map(m => m.getRow()).filter(r => r > 1).sort((a, b) => b - a);

    // Eliminar piezas existentes (de abajo hacia arriba para no afectar índices)
    if (filasAEliminar.length > 0) {
      for (const fila of filasAEliminar) {
        sheetPiezas.deleteRow(fila);
      }
      SpreadsheetApp.flush(); // Forzar commit de eliminaciones antes de insertar
      Logger.log(`🗑️ ${filasAEliminar.length} pieza(s) anterior(es) eliminada(s) de ${presupuestoId}`);
    }

    // Agregar nuevas piezas en batch
    if (piezas.length > 0) {
      const numColsPz = Object.keys(colPz).length;

      const filasPiezas = piezas.map(pieza => {
        const piezaId = generarId("PZ", "piezas", "pieza_id");
        const filaPz = new Array(numColsPz).fill("");
        filaPz[colPz.pieza_id] = piezaId;
        filaPz[colPz.presupuesto_id] = presupuestoId;
        filaPz[colPz.proveedor_id] = pieza.proveedorId || "";
        filaPz[colPz.descripcion] = pieza.descripcion || "";
        filaPz[colPz.costo] = parseFloat(pieza.costo) || 0;
        filaPz[colPz.enlace] = pieza.enlace || "";
        filaPz[colPz.notas] = pieza.notas || "";
        filaPz[colPz.precio] = parseFloat(pieza.precio) || 0;
        return filaPz;
      });

      const lastRowPz = sheetPiezas.getLastRow();
      sheetPiezas.getRange(lastRowPz + 1, 1, filasPiezas.length, numColsPz).setValues(filasPiezas);
      SpreadsheetApp.flush(); // Forzar commit de escritura
      Logger.log(`✅ ${filasPiezas.length} pieza(s) escritas en fila ${lastRowPz + 1} para ${presupuestoId}`);
    } else {
      Logger.log(`ℹ️ Sin piezas para escribir (tipoPieza: ${datos.tipoPieza})`);
    }

    // 4.5. Actualizar ultimo_usuario en la reparación
    const resguardo = filaActual[colP.resguardo];
    const version = filaActual[colP.version];
    const elaboradoPor = datos.elaboradoPor || filaActual[colP.elaborado_por];
    actualizarReparacion(resguardo, { ultimo_usuario: obtenerNombreUsuarioActual() });

    // 5. Historial asíncrono
    agregarEventoHistorial(resguardo, "presupuesto_actualizado",
      `Presupuesto v${version} actualizado (${presupuestoId}). Total: ${total}€`, elaboradoPor);

    if (HISTORIAL_QUEUE.length >= 5) {
      procesarColaHistorial();
    }

    // 6. Invalidar caché
    CacheService.getScriptCache().remove('metricas-dashboard');

    // 7. Retornar sin leer más de Sheets
    const serializarFecha = (valor) => {
      if (!valor) return null;
      if (valor instanceof Date) return valor.toISOString();
      if (typeof valor === 'string' && valor.trim() !== '') {
        try { const f = new Date(valor); if (!isNaN(f.getTime())) return f.toISOString(); } catch (e) { }
      }
      return null;
    };

    return {
      exito: true,
      presupuestoId: presupuestoId,
      presupuesto: {
        presupuestoId: presupuestoId,
        resguardo: resguardo,
        version: version,
        fechaElaboracion: serializarFecha(filaActual[colP.fecha_elaboracion]),
        elaboradoPor: filaActual[colP.elaborado_por],
        manoObra: manoObra,
        costoPiezas: costoPiezas,
        precioPiezas: precioPiezas,
        total: total,
        gananciaNeta: gananciaNeta,
        descuentoRevision: descuentoRevision,
        diasEntrega: datos.diasEntrega || 0,
        estado: filaActual[colP.estado],
        descripcion: datos.descripcion || "",
        fechaEnvio: serializarFecha(filaActual[colP.fecha_envio]),
        fechaRespuesta: serializarFecha(filaActual[colP.fecha_respuesta]),
        motivoRechazo: filaActual[colP.motivo_rechazo] || "",
        tipoPieza: datos.tipoPieza || "no",
        piezas: piezas.map(p => ({
          descripcion: p.descripcion || "",
          proveedorId: p.proveedorId || "",
          costo: parseFloat(p.costo) || 0,
          precio: parseFloat(p.precio) || 0,
          enlace: p.enlace || "",
          notas: p.notas || ""
        }))
      },
      mensaje: `Presupuesto v${version} actualizado exitosamente`
    };

  } catch (error) {
    Logger.log(`Error al actualizar presupuesto: ${error.message}`);
    return { exito: false, error: error.message };
  }
}

// ============================================
// ENVIAR PRESUPUESTOS (BATCH)
// ============================================

/**
 * Envía TODOS los presupuestos en borrador de una reparación al cliente
 * @param {string} resguardo
 * @returns {Object}
 */
function enviarPresupuestos(resguardo, modo) {
  try {
    // 1. Buscar reparación (1 TextFinder + 1 read) - reutilizar fila y numFila
    const repResult = buscarPorId("reparaciones", "resguardo", resguardo);
    if (!repResult) {
      return { exito: false, error: `Reparación ${resguardo} no encontrada` };
    }

    // 2. Buscar presupuestos de esta reparación (1 TextFinder + N reads)
    const colP = HOJAS.presupuestos.cols;
    const todosPptos = buscarTodosPorCampo("presupuestos", "resguardo", resguardo);
    const borradores = todosPptos.filter(p => String(p.fila[colP.estado]) === "borrador");

    if (borradores.length === 0) {
      return { exito: false, error: "No hay presupuestos en borrador para enviar" };
    }

    // 3. Actualizar borradores: modificar fila en memoria y escribir (sin re-leer)
    const ahora = new Date();
    const numColsP = Object.keys(colP).length;
    const sheetPptos = getHoja("presupuestos");
    const versionesEnviadas = [];

    for (const borrador of borradores) {
      borrador.fila[colP.estado] = "enviado";
      borrador.fila[colP.fecha_envio] = ahora;
      sheetPptos.getRange(borrador.numFila, 1, 1, numColsP).setValues([borrador.fila]);
      versionesEnviadas.push(`v${borrador.fila[colP.version]}`);
    }

    // 4. Actualizar reparación directamente (reutilizar fila, sin buscar de nuevo)
    const colR = HOJAS.reparaciones.cols;
    const numColsR = Object.keys(colR).length;
    const usuario = obtenerNombreUsuarioActual();
    repResult.fila[colR.estado] = "Presupuesto Enviado";
    repResult.fila[colR.ultimo_usuario] = usuario;
    if (modo) repResult.fila[colR.presupuestos_modo] = modo;
    getHoja("reparaciones").getRange(repResult.numFila, 1, 1, numColsR).setValues([repResult.fila]);

    // 5. Historial + flush inmediato (evita perder evento en cola)
    agregarEventoHistorial(
      resguardo,
      "presupuesto_enviado",
      `Presupuesto(s) ${versionesEnviadas.join(", ")} enviado(s) al cliente`,
      Session.getActiveUser().getEmail()
    );
    procesarColaHistorial();

    // 6. Invalidar cachés (1 sola vez)
    invalidarCaches();

    // 7. Email al cliente
    try {
      enviarEmailPresupuestoAlCliente(resguardo, repResult.fila, borradores, modo);
    } catch (e) {
      Logger.log(`[enviarPresupuestos] Error al enviar email: ${e.message}`);
    }

    return {
      exito: true,
      mensaje: `${borradores.length} presupuesto(s) enviado(s) al cliente`,
      enviados: borradores.length,
      nuevoEstado: "Presupuesto Enviado"
    };

  } catch (error) {
    Logger.log(`Error al enviar presupuestos: ${error.message}`);
    return { exito: false, error: error.message };
  }
}

// ============================================
// ENVIAR PRESUPUESTO INDIVIDUAL (legacy)
// ============================================

/**
 * Marca un presupuesto individual como enviado al cliente
 * @param {string} presupuestoId
 * @returns {Object}
 */
function enviarPresupuesto(presupuestoId) {
  try {
    const resultado = buscarPorId("presupuestos", "presupuesto_id", presupuestoId);
    if (!resultado) {
      return { exito: false, error: `Presupuesto ${presupuestoId} no encontrado` };
    }

    const colP = HOJAS.presupuestos.cols;
    const resguardo = resultado.fila[colP.resguardo];
    const version = resultado.fila[colP.version];

    // Actualizar estado del presupuesto
    actualizarCeldas("presupuestos", resultado.numFila, {
      estado: "enviado",
      fecha_envio: new Date()
    });

    // Actualizar estado de la reparación a "Presupuesto Enviado"
    const usuario = Session.getActiveUser().getEmail();
    actualizarReparacion(resguardo, {
      estado: "Presupuesto Enviado",
      ultimo_usuario: obtenerNombreUsuarioActual()
    });

    // Historial + flush inmediato
    agregarEventoHistorial(
      resguardo,
      "presupuesto_enviado",
      `Presupuesto v${version} enviado al cliente (${presupuestoId})`,
      usuario
    );
    procesarColaHistorial();

    invalidarCaches();

    return { exito: true, mensaje: `Presupuesto v${version} enviado` };

  } catch (error) {
    Logger.log(`Error al enviar presupuesto: ${error.message}`);
    return { exito: false, error: error.message };
  }
}

// ============================================
// ACEPTAR PRESUPUESTO
// ============================================

/**
 * Acepta un presupuesto (y rechaza los demás del mismo resguardo)
 * @param {string} presupuestoId
 * @returns {Object}
 */
function aceptarPresupuesto(presupuestoId, opciones) {
  try {
    const resultado = buscarPorId("presupuestos", "presupuesto_id", presupuestoId);
    if (!resultado) {
      return { exito: false, error: `Presupuesto ${presupuestoId} no encontrado` };
    }

    const colP = HOJAS.presupuestos.cols;
    const resguardo = resultado.fila[colP.resguardo];
    const version = resultado.fila[colP.version];
    const tipoPieza = resultado.fila[colP.tipo_pieza] || "no";
    const estadoActual = String(resultado.fila[colP.estado] || "");

    // Guardia: si ya fue aceptado, evitar doble-aceptación y devolver el estado actual de la reparación
    if (estadoActual === "aceptado") {
      const repActual = buscarPorId("reparaciones", "resguardo", resguardo);
      const colR = HOJAS.reparaciones.cols;
      const estadoRep = repActual ? String(repActual.fila[colR.estado] || "") : null;
      const pedidosActuales = obtenerPedidosDeReparacion(resguardo);
      return {
        exito: true,
        mensaje: `Presupuesto v${version} ya estaba aceptado`,
        nuevoEstado: estadoRep,
        pedidos: pedidosActuales,
        yaAceptado: true
      };
    }

    // Marcar este como aceptado
    actualizarCeldas("presupuestos", resultado.numFila, {
      estado: "aceptado",
      fecha_respuesta: new Date()
    });

    // Obtener todos los presupuestos del resguardo para cálculos
    const todosPptos = buscarTodosPorCampo("presupuestos", "resguardo", resguardo);

    // Si hayMas === false (o no se especifica), rechazar los demás presupuestos no-aceptados
    const hayMas = opciones && opciones.hayMas === true;
    if (!hayMas) {
      for (const otro of todosPptos) {
        const otroId = otro.fila[colP.presupuesto_id];
        if (String(otroId) !== String(presupuestoId)) {
          const otroEstado = otro.fila[colP.estado];
          if (otroEstado !== "rechazado" && otroEstado !== "aceptado" && otroEstado !== "anulado") {
            actualizarCeldas("presupuestos", otro.numFila, {
              estado: "rechazado",
              fecha_respuesta: new Date(),
              motivo_rechazo: "Otro presupuesto aceptado"
            });
          }
        }
      }
    }

    // Calcular IDs aceptados: los que ya estaban + el nuevo
    const idsYaAceptados = todosPptos
      .filter(p => String(p.fila[colP.estado]) === "aceptado")
      .map(p => String(p.fila[colP.presupuesto_id]));
    if (!idsYaAceptados.includes(presupuestoId)) idsYaAceptados.push(presupuestoId);

    const usuario = Session.getActiveUser().getEmail();

    // Si hayMas === true: no cambiar estado todavía, solo registrar el ID
    // Si hayMas === false (último): calcular estado final
    let nuevoEstado = null;
    if (!hayMas) {
      const algunoRequierePieza = tipoPieza === "pedido" || todosPptos.some(p => {
        const pId = String(p.fila[colP.presupuesto_id]);
        return idsYaAceptados.includes(pId) && String(p.fila[colP.tipo_pieza]) === "pedido";
      });
      nuevoEstado = algunoRequierePieza ? "Presupuesto Aceptado" : "En Reparación";
    }

    const cambiosRep = {
      presupuesto_aceptado_id: idsYaAceptados.join(","),
      ultimo_usuario: obtenerNombreUsuarioActual()
    };
    if (nuevoEstado) cambiosRep.estado = nuevoEstado;
    Logger.log(`✅ Estableciendo estado: ${cambiosRep.estado} para resguardo ${resguardo}`);
    actualizarReparacion(resguardo, cambiosRep);

    // Historial
    agregarEventoHistorial(
      resguardo,
      "presupuesto_aceptado",
      `Presupuesto v${version} aceptado por el cliente (${presupuestoId})`,
      usuario
    );

    // Procesar cola de historial antes de continuar
    procesarColaHistorial();

    CacheService.getScriptCache().remove('metricas-dashboard');

    // Flush para asegurar que los pedidos estén disponibles
    SpreadsheetApp.flush();

    // Obtener pedidos creados para retornarlos al frontend (evita llamada redundante)
    const pedidosCreados = obtenerPedidosDeReparacion(resguardo);

    return {
      exito: true,
      mensaje: `Presupuesto v${version} aceptado`,
      nuevoEstado: nuevoEstado || null,  // null si hayMas (estado no cambia)
      pedidos: pedidosCreados
    };

  } catch (error) {
    Logger.log(`Error al aceptar presupuesto: ${error.message}`);
    return { exito: false, error: error.message };
  }
}

// ============================================
// FINALIZAR ACEPTACIÓN (cuando hayMas fue true por error)
// ============================================

/**
 * Calcula y aplica el estado final cuando ya no hay más presupuestos por aceptar.
 * Se usa cuando el usuario marcó "hayMas=true" por error y quedó bloqueado.
 * No re-acepta ni crea pedidos; solo calcula el estado correcto y rechaza pendientes.
 * @param {string} resguardo
 * @returns {Object}
 */
function finalizarAceptacion(resguardo) {
  try {
    const colP = HOJAS.presupuestos.cols;
    const todosPptos = buscarTodosPorCampo("presupuestos", "resguardo", resguardo);

    const aceptados = todosPptos.filter(p => String(p.fila[colP.estado]) === "aceptado");
    if (aceptados.length === 0) {
      return { exito: false, error: "No hay presupuestos aceptados para esta reparación" };
    }

    // Rechazar cualquier presupuesto que aún esté pendiente (borrador/enviado)
    for (const p of todosPptos) {
      const est = String(p.fila[colP.estado]);
      if (est !== "aceptado" && est !== "rechazado" && est !== "anulado") {
        actualizarCeldas("presupuestos", p.numFila, {
          estado: "rechazado",
          fecha_respuesta: new Date(),
          motivo_rechazo: "Otro presupuesto aceptado"
        });
      }
    }

    // Calcular estado final según si algún aceptado requiere pieza por pedido
    const algunoRequierePieza = aceptados.some(
      p => String(p.fila[colP.tipo_pieza]) === "pedido"
    );
    const nuevoEstado = algunoRequierePieza ? "Pieza Pendiente" : "En Reparación";

    actualizarReparacion(resguardo, { estado: nuevoEstado });

    agregarEventoHistorial(
      resguardo,
      "cambio_estado",
      `Estado: corregido → ${nuevoEstado} (no había más presupuestos por aceptar)`
    );
    procesarColaHistorial();

    CacheService.getScriptCache().remove('metricas-dashboard');
    invalidarCaches();

    return { exito: true, nuevoEstado, mensaje: `Estado actualizado a "${nuevoEstado}"` };

  } catch (error) {
    Logger.log(`Error en finalizarAceptacion: ${error.message}`);
    return { exito: false, error: error.message };
  }
}

// ============================================
// ANULAR PRESUPUESTO (era aceptado, se cancela)
// ============================================

/**
 * Anula un presupuesto que estaba aceptado.
 * Cancela los pedidos asociados no recibidos y recalcula el estado de la reparación.
 * @param {string} presupuestoId
 * @param {string} motivo
 * @returns {Object}
 */
function anularPresupuesto(presupuestoId, motivo) {
  try {
    const resultado = buscarPorId("presupuestos", "presupuesto_id", presupuestoId);
    if (!resultado) {
      return { exito: false, error: `Presupuesto ${presupuestoId} no encontrado` };
    }

    const colP = HOJAS.presupuestos.cols;
    const resguardo = resultado.fila[colP.resguardo];
    const version = resultado.fila[colP.version];

    // 1. Marcar presupuesto como anulado
    actualizarCeldas("presupuestos", resultado.numFila, {
      estado: "anulado",
      fecha_respuesta: new Date(),
      motivo_rechazo: motivo || "Anulado"
    });

    // 2. Cancelar pedidos asociados a las piezas de este presupuesto (si no están Recibidos)
    const piezasPresupuesto = obtenerPiezasDePresupuesto(presupuestoId).map(p => p.piezaId);
    if (piezasPresupuesto.length > 0) {
      const pedidos = obtenerPedidosDeReparacion(resguardo);
      const pedidosACancelar = pedidos.filter(p =>
        piezasPresupuesto.includes(p.piezaId) &&
        !['Recibido', 'Cancelado'].includes(p.estado)
      );
      for (const pedido of pedidosACancelar) {
        cambiarEstadoPedido(pedido.pedidoId, 'Cancelado', {});
      }
    }

    // 3. Recalcular estado de reparación
    const todosPptos = buscarTodosPorCampo("presupuestos", "resguardo", resguardo);
    const colR = HOJAS.reparaciones.cols;
    const restantesAceptados = todosPptos.filter(p =>
      String(p.fila[colP.estado]) === "aceptado" &&
      String(p.fila[colP.presupuesto_id]) !== String(presupuestoId)
    );

    // Actualizar presupuesto_aceptado_id eliminando el anulado
    const repActual = buscarPorId("reparaciones", "resguardo", resguardo);
    const idActual = repActual ? String(repActual.fila[colR.presupuesto_aceptado_id] || "") : "";
    const idsActualizados = idActual.split(",")
      .map(s => s.trim())
      .filter(id => id && id !== String(presupuestoId))
      .join(",");

    let nuevoEstadoRep;
    if (restantesAceptados.length === 0) {
      // Sin presupuestos aceptados → volver al estado previo según enviados
      const hayEnviados = todosPptos.some(p => String(p.fila[colP.estado]) === "enviado");
      nuevoEstadoRep = hayEnviados ? "Presupuesto Enviado" : "Presupuesto Pendiente";
    } else {
      // Aún quedan aceptados → recalcular en base a pedidos activos
      const pedidosActivos = obtenerPedidosDeReparacion(resguardo)
        .filter(p => !['Cancelado', 'Recibido'].includes(p.estado));
      const algunoRequierePieza = restantesAceptados.some(p =>
        String(p.fila[colP.tipo_pieza]) === "pedido"
      );
      if (algunoRequierePieza && pedidosActivos.length > 0) nuevoEstadoRep = "Pieza Pendiente";
      else if (algunoRequierePieza && pedidosActivos.length === 0) nuevoEstadoRep = "Pieza Entregada";
      else nuevoEstadoRep = "En Reparación";
    }

    actualizarReparacion(resguardo, {
      estado: nuevoEstadoRep,
      presupuesto_aceptado_id: idsActualizados,
      ultimo_usuario: obtenerNombreUsuarioActual()
    });

    // 4. Historial
    const usuario = Session.getActiveUser().getEmail();
    agregarEventoHistorial(
      resguardo,
      "presupuesto_anulado",
      `Presupuesto v${version} anulado (${presupuestoId}). Motivo: ${motivo || "No especificado"}`,
      usuario
    );
    procesarColaHistorial();
    invalidarCaches();

    return {
      exito: true,
      mensaje: `Presupuesto v${version} anulado`,
      nuevoEstadoReparacion: nuevoEstadoRep
    };

  } catch (error) {
    Logger.log(`Error al anular presupuesto: ${error.message}`);
    return { exito: false, error: error.message };
  }
}

// ============================================
// RECHAZAR PRESUPUESTO
// ============================================

/**
 * Rechaza un presupuesto
 * @param {string} presupuestoId
 * @param {string} motivo
 * @returns {Object}
 */
function rechazarPresupuesto(presupuestoId, motivo) {
  try {
    const resultado = buscarPorId("presupuestos", "presupuesto_id", presupuestoId);
    if (!resultado) {
      return { exito: false, error: `Presupuesto ${presupuestoId} no encontrado` };
    }

    const colP = HOJAS.presupuestos.cols;
    const resguardo = resultado.fila[colP.resguardo];
    const version = resultado.fila[colP.version];

    // Marcar como rechazado
    actualizarCeldas("presupuestos", resultado.numFila, {
      estado: "rechazado",
      fecha_respuesta: new Date(),
      motivo_rechazo: motivo || ""
    });

    // Verificar si todos los presupuestos fueron rechazados
    const todosPptos = buscarTodosPorCampo("presupuestos", "resguardo", resguardo);
    const todosRechazados = todosPptos.every(p => {
      const est = String(p.fila[colP.estado]);
      return est === "rechazado" || String(p.fila[colP.presupuesto_id]) === String(presupuestoId);
    });

    const usuario = Session.getActiveUser().getEmail();

    const nombreUsuario = obtenerNombreUsuarioActual();
    if (todosRechazados) {
      actualizarReparacion(resguardo, {
        estado: "Presupuesto Rechazado",
        ultimo_usuario: nombreUsuario
      });
    } else {
      actualizarReparacion(resguardo, { ultimo_usuario: nombreUsuario });
    }

    // Historial + flush inmediato
    agregarEventoHistorial(
      resguardo,
      "presupuesto_rechazado",
      `Presupuesto v${version} rechazado (${presupuestoId}). Motivo: ${motivo || "No especificado"}`,
      usuario
    );
    procesarColaHistorial();

    invalidarCaches();

    // Enviar aviso de recogida si todos los presupuestos fueron rechazados
    if (todosRechazados) {
      try {
        enviarAvisoRecogidaInmediato(resguardo);
      } catch (e) {
        Logger.log(`Error enviando aviso de recogida para ${resguardo}: ${e.message}`);
      }
    }

    return {
      exito: true,
      mensaje: `Presupuesto v${version} rechazado`,
      estadoReparacion: todosRechazados ? 'Presupuesto Rechazado' : null
    };

  } catch (error) {
    Logger.log(`Error al rechazar presupuesto: ${error.message}`);
    return { exito: false, error: error.message };
  }
}

