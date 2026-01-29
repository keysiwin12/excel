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
    // Verificar que la reparación existe
    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      return { exito: false, error: `Reparación ${resguardo} no encontrada` };
    }

    // Calcular versión
    const pptosExistentes = obtenerPresupuestosDeReparacion(resguardo);
    const version = pptosExistentes.length + 1;

    // Generar ID
    const presupuestoId = generarId("PPTO", "presupuestos", "presupuesto_id");

    // costoReparacion = precio total al cliente (ya incluye piezas)
    // costoPiezas = suma de costos de piezas individuales
    // gananciaNeta = costoReparacion - costoPiezas
    piezas = piezas || [];
    const costoPiezas = piezas.length > 0
      ? piezas.reduce((sum, p) => sum + (parseFloat(p.costo) || 0), 0)
      : (parseFloat(datos.costoPiezas) || 0);
    const costoReparacion = parseFloat(datos.costoReparacion) || 0;
    const total = costoReparacion; // Total = lo que paga el cliente
    const gananciaNeta = costoReparacion - costoPiezas;

    // Crear fila en Presupuestos
    const colP = HOJAS.presupuestos.cols;
    const filaP = new Array(Object.keys(colP).length).fill("");
    filaP[colP.presupuesto_id] = presupuestoId;
    filaP[colP.resguardo] = resguardo;
    filaP[colP.version] = version;
    filaP[colP.fecha_elaboracion] = new Date();
    filaP[colP.elaborado_por] = datos.elaboradoPor || Session.getActiveUser().getEmail();
    filaP[colP.costo_reparacion] = costoReparacion;
    filaP[colP.costo_piezas] = costoPiezas;
    filaP[colP.total] = total;
    filaP[colP.ganancia_neta] = gananciaNeta;
    filaP[colP.dias_entrega] = datos.diasEntrega || 0;
    filaP[colP.estado] = "borrador";
    filaP[colP.notas] = datos.notas || "";
    filaP[colP.tipo_pieza] = datos.tipoPieza || "no";

    agregarFila("presupuestos", filaP);

    // Crear piezas
    const colPz = HOJAS.piezas.cols;
    for (const pieza of piezas) {
      const piezaId = generarId("PZ", "piezas", "pieza_id");
      const filaPz = new Array(Object.keys(colPz).length).fill("");
      filaPz[colPz.pieza_id] = piezaId;
      filaPz[colPz.presupuesto_id] = presupuestoId;
      filaPz[colPz.proveedor_id] = pieza.proveedorId || "";
      filaPz[colPz.descripcion] = pieza.descripcion || "";
      filaPz[colPz.costo] = parseFloat(pieza.costo) || 0;
      filaPz[colPz.enlace] = pieza.enlace || "";
      filaPz[colPz.notas] = pieza.notas || "";

      agregarFila("piezas", filaPz);
    }

    // Registrar en historial
    agregarEventoHistorial(
      resguardo,
      "presupuesto_creado",
      `Presupuesto v${version} creado (${presupuestoId}). Total: ${total}€`,
      datos.elaboradoPor
    );

    // Invalidar caché
    CacheService.getScriptCache().remove('metricas-dashboard');

    Logger.log(`Presupuesto ${presupuestoId} creado para resguardo ${resguardo}`);

    // Retornar presupuesto completo para el frontend
    const presupuestoCreado = {
      presupuestoId: presupuestoId,
      resguardo: resguardo,
      version: version,
      fechaElaboracion: new Date().toISOString(),
      elaboradoPor: datos.elaboradoPor || Session.getActiveUser().getEmail(),
      costoReparacion: costoReparacion,
      costoPiezas: costoPiezas,
      total: total,
      gananciaNeta: gananciaNeta,
      diasEntrega: datos.diasEntrega || 0,
      estado: "borrador",
      piezas: piezas.map((p, idx) => ({
        descripcion: p.descripcion || "",
        proveedorId: p.proveedorId || "",
        costo: parseFloat(p.costo) || 0,
        enlace: p.enlace || "",
        notas: p.notas || ""
      }))
    };

    return {
      exito: true,
      presupuestoId: presupuestoId,
      version: version,
      presupuesto: presupuestoCreado,
      mensaje: `Presupuesto v${version} creado exitosamente`
    };

  } catch (error) {
    Logger.log(`Error al crear presupuesto: ${error.message}`);
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
function enviarPresupuestos(resguardo) {
  try {
    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      return { exito: false, error: `Reparación ${resguardo} no encontrada` };
    }

    const colP = HOJAS.presupuestos.cols;
    const todosPptos = buscarTodosPorCampo("presupuestos", "resguardo", resguardo);

    // Filtrar solo borradores
    const borradores = todosPptos.filter(p => String(p.fila[colP.estado]) === "borrador");

    if (borradores.length === 0) {
      return { exito: false, error: "No hay presupuestos en borrador para enviar" };
    }

    const ahora = new Date();
    const versionesEnviadas = [];

    for (const borrador of borradores) {
      actualizarCeldas("presupuestos", borrador.numFila, {
        estado: "enviado",
        fecha_envio: ahora
      });
      versionesEnviadas.push(`v${borrador.fila[colP.version]}`);
    }

    // Cambiar estado de la reparación
    actualizarReparacion(resguardo, { estado: "Presupuesto Enviado" });

    // Historial
    agregarEventoHistorial(
      resguardo,
      "presupuesto_enviado",
      `Presupuesto(s) ${versionesEnviadas.join(", ")} enviado(s) al cliente`
    );

    CacheService.getScriptCache().remove('metricas-dashboard');
    invalidarCaches();

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
    actualizarReparacion(resguardo, { estado: "Presupuesto Enviado" });

    // Historial
    agregarEventoHistorial(
      resguardo,
      "presupuesto_enviado",
      `Presupuesto v${version} enviado al cliente (${presupuestoId})`
    );

    CacheService.getScriptCache().remove('metricas-dashboard');

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
function aceptarPresupuesto(presupuestoId) {
  try {
    const resultado = buscarPorId("presupuestos", "presupuesto_id", presupuestoId);
    if (!resultado) {
      return { exito: false, error: `Presupuesto ${presupuestoId} no encontrado` };
    }

    const colP = HOJAS.presupuestos.cols;
    const resguardo = resultado.fila[colP.resguardo];
    const version = resultado.fila[colP.version];

    // Marcar este como aceptado
    actualizarCeldas("presupuestos", resultado.numFila, {
      estado: "aceptado",
      fecha_respuesta: new Date()
    });

    // Rechazar los demás presupuestos del mismo resguardo
    const todosPptos = buscarTodosPorCampo("presupuestos", "resguardo", resguardo);
    for (const otro of todosPptos) {
      const otroId = otro.fila[colP.presupuesto_id];
      if (String(otroId) !== String(presupuestoId)) {
        const otroEstado = otro.fila[colP.estado];
        if (otroEstado !== "rechazado") {
          actualizarCeldas("presupuestos", otro.numFila, {
            estado: "rechazado",
            fecha_respuesta: new Date(),
            motivo_rechazo: "Otro presupuesto aceptado"
          });
        }
      }
    }

    // Actualizar reparación: estado + presupuesto_aceptado_id
    actualizarReparacion(resguardo, {
      estado: "Presupuesto Aceptado",
      presupuesto_aceptado_id: presupuestoId
    });

    // Historial
    agregarEventoHistorial(
      resguardo,
      "presupuesto_aceptado",
      `Presupuesto v${version} aceptado por el cliente (${presupuestoId})`
    );

    CacheService.getScriptCache().remove('metricas-dashboard');

    return { exito: true, mensaje: `Presupuesto v${version} aceptado` };

  } catch (error) {
    Logger.log(`Error al aceptar presupuesto: ${error.message}`);
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

    if (todosRechazados) {
      // Si todos están rechazados, cambiar estado de la reparación
      actualizarReparacion(resguardo, { estado: "Presupuesto Rechazado" });
    }

    // Historial
    agregarEventoHistorial(
      resguardo,
      "presupuesto_rechazado",
      `Presupuesto v${version} rechazado (${presupuestoId}). Motivo: ${motivo || "No especificado"}`
    );

    CacheService.getScriptCache().remove('metricas-dashboard');

    return { exito: true, mensaje: `Presupuesto v${version} rechazado` };

  } catch (error) {
    Logger.log(`Error al rechazar presupuesto: ${error.message}`);
    return { exito: false, error: error.message };
  }
}

// ============================================
// OBTENER PRESUPUESTO INDIVIDUAL
// ============================================

/**
 * Obtiene un presupuesto por su ID con sus piezas
 * @param {string} presupuestoId
 * @returns {Object|null}
 */
function obtenerPresupuesto(presupuestoId) {
  const resultado = buscarPorId("presupuestos", "presupuesto_id", presupuestoId);
  if (!resultado) return null;

  const colP = HOJAS.presupuestos.cols;
  const f = resultado.fila;

  const serializarFecha = (valor) => {
    if (!valor) return null;
    if (valor instanceof Date) return valor.toISOString();
    if (typeof valor === 'string' && valor.trim() !== '') {
      try { const d = new Date(valor); if (!isNaN(d.getTime())) return d.toISOString(); } catch (e) { }
    }
    return null;
  };

  return {
    presupuestoId: f[colP.presupuesto_id] || "",
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
    piezas: obtenerPiezasDePresupuesto(presupuestoId),
    numFila: resultado.numFila
  };
}
