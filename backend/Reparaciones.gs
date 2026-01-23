/**
 * REPARACIONES.GS - Lógica de negocio de reparaciones
 * Operaciones de alto nivel sobre reparaciones
 */

// ============================================
// CAMBIO DE ESTADO
// ============================================

/**
 * Cambia el estado de una reparación
 * @param {string} resguardo - Número de resguardo
 * @param {string} nuevoEstado - Nuevo estado
 * @param {Object} opciones - Opciones adicionales {notificar, observacion}
 * @returns {Object} Resultado de la operación
 */
function cambiarEstadoReparacion(resguardo, nuevoEstado, opciones) {
  try {
    opciones = opciones || {};

    // Validar que el estado existe
    if (!ESTADOS_REPARACION[nuevoEstado]) {
      throw new Error(`Estado "${nuevoEstado}" no es válido`);
    }

    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const estadoAnterior = sheet.getRange(numFila, SHEET_CONFIG.columnas.estado + 1).getValue();

    // Actualizar estado
    sheet.getRange(numFila, SHEET_CONFIG.columnas.estado + 1).setValue(nuevoEstado);

    // Agregar timestamp según el estado
    const ahora = new Date();

    if (nuevoEstado === "Reparado" || nuevoEstado === "No tiene Reparación") {
      sheet.getRange(numFila, SHEET_CONFIG.columnas.fechaReparacion + 1).setValue(ahora);
    }

    // Agregar observación automática
    const observacion = `[${formatearFecha(ahora, true)}] Estado cambiado de "${estadoAnterior}" a "${nuevoEstado}"` +
      (opciones.observacion ? ` - ${opciones.observacion}` : "");

    agregarObservacion(resguardo, observacion);

    // Invalidar caché
    invalidarCaches();

    // Registrar log
    registrarLog('cambio_estado', `Estado cambiado a ${nuevoEstado}`, {
      resguardo: resguardo,
      estadoAnterior: estadoAnterior,
      nuevoEstado: nuevoEstado
    });

    // Verificar si debe enviar notificación
    if (opciones.notificar !== false) {
      verificarEnvioNotificacion(resguardo, nuevoEstado);
    }

    return {
      exito: true,
      mensaje: `Estado cambiado a "${nuevoEstado}"`,
      estadoAnterior: estadoAnterior,
      nuevoEstado: nuevoEstado
    };

  } catch (error) {
    Logger.log(`❌ Error al cambiar estado: ${error.message}`);
    throw error;
  }
}

/**
 * Verifica si debe enviar notificación según el nuevo estado
 * @param {string} resguardo - Número de resguardo
 * @param {string} estado - Estado de la reparación
 */
function verificarEnvioNotificacion(resguardo, estado) {
  // Si cambia a un estado de recojo, verificar si debe enviar aviso
  if (estadoRequiereRecojo(estado)) {
    const reparacion = obtenerReparacion(resguardo);

    // Verificar si ya se envió aviso de recojo
    const tipoUltimo = reparacion.pieza?.tipoUltimoRecordatorio || "";

    if (!tipoUltimo || !tipoUltimo.startsWith("recojo_")) {
      Logger.log(`📧 Debe enviar aviso de recojo para ${resguardo}`);
      // TODO: Integrar con sistema de notificaciones
      // Por ahora solo logueamos, el sistema de notificaciones existente
      // se encargará en su próxima ejecución
    }
  }
}

// ============================================
// OBSERVACIONES
// ============================================

/**
 * Agrega una observación a una reparación
 * @param {string} resguardo - Número de resguardo
 * @param {string} texto - Texto de la observación
 * @returns {Object} Resultado de la operación
 */
function agregarObservacion(resguardo, texto) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    // Obtener observaciones actuales
    const obsActuales = sheet.getRange(numFila, SHEET_CONFIG.columnas.observaciones + 1).getValue() || "";

    // Agregar nueva observación con timestamp
    const timestamp = formatearFecha(new Date(), true);
    const usuario = Session.getActiveUser().getEmail().split('@')[0];
    const nuevaObs = `[${timestamp}] ${usuario}: ${texto}`;

    // Combinar
    const obsCompletas = obsActuales
      ? obsActuales + "\n" + nuevaObs
      : nuevaObs;

    // Actualizar
    sheet.getRange(numFila, SHEET_CONFIG.columnas.observaciones + 1).setValue(obsCompletas);

    registrarLog('observacion', 'Observación agregada', {
      resguardo: resguardo,
      texto: texto
    });

    return {
      exito: true,
      mensaje: "Observación agregada"
    };

  } catch (error) {
    Logger.log(`❌ Error al agregar observación: ${error.message}`);
    throw error;
  }
}

// ============================================
// PRESUPUESTO
// ============================================

/**
 * Actualiza el presupuesto de una reparación
 * @param {string} resguardo - Número de resguardo
 * @param {Object} presupuesto - Datos del presupuesto
 * @returns {Object} Resultado de la operación
 */
function actualizarPresupuesto(resguardo, presupuesto) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const col = SHEET_CONFIG.columnas;
    const ahora = new Date();

    // FASE 2: Completar columnas del presupuesto

    // Columna C: Responsable de presupuesto
    if (presupuesto.responsablePresupuesto !== undefined) {
      sheet.getRange(numFila, col.fechaResponsablePpto + 1).setValue(presupuesto.responsablePresupuesto);
    }

    // Columna D: Fecha de elaboración
    if (presupuesto.fechaElaboracion !== undefined) {
      sheet.getRange(numFila, col.fechaElaboracionPpto + 1).setValue(presupuesto.fechaElaboracion);

      // Calcular fecha límite (7 días después)
      const fechaLimite = new Date(presupuesto.fechaElaboracion);
      fechaLimite.setDate(fechaLimite.getDate() + 7);
      sheet.getRange(numFila, col.fechaLimitePpto + 1).setValue(fechaLimite);
    }

    // Columna N: Costo reparación sin IVA
    if (presupuesto.costoReparacion !== undefined) {
      sheet.getRange(numFila, col.costoReparacionSinIVA + 1).setValue(presupuesto.costoReparacion);
    }

    // Columna O: Costo pieza
    if (presupuesto.costoPieza !== undefined) {
      sheet.getRange(numFila, col.costoPieza + 1).setValue(presupuesto.costoPieza);
    }

    // Columna P: Ganancia neta (usar la calculada del frontend)
    if (presupuesto.gananciaNeta !== undefined) {
      sheet.getRange(numFila, col.gananciaNeta + 1).setValue(presupuesto.gananciaNeta);
    }

    // Si necesita pieza, completar columnas Q y R
    if (presupuesto.necesitaPieza) {
      // Columna Q: Responsable de compra
      if (presupuesto.responsableCompra !== undefined) {
        sheet.getRange(numFila, col.responsableCompra + 1).setValue(presupuesto.responsableCompra);
      }

      // Columna R: Proveedor
      if (presupuesto.proveedor !== undefined) {
        sheet.getRange(numFila, col.proveedor + 1).setValue(presupuesto.proveedor);
      }
    }

    // Otras actualizaciones (para fases posteriores)
    if (presupuesto.fechaAceptacion !== undefined) {
      sheet.getRange(numFila, col.fechaAceptacionPpto + 1).setValue(presupuesto.fechaAceptacion);
    }

    if (presupuesto.motivoRechazo !== undefined) {
      sheet.getRange(numFila, col.motivoRechazo + 1).setValue(presupuesto.motivoRechazo);
    }

    // Agregar observación
    const costoTotal = (presupuesto.costoReparacion || 0) + (presupuesto.costoPieza || 0);
    agregarObservacion(resguardo, `Presupuesto actualizado: ${formatearMoneda(costoTotal)}`);

    // IMPORTANTE: Cambiar estado a "Presupuesto Enviado"
    cambiarEstadoReparacion(resguardo, "Presupuesto Enviado", {
      observacion: "Presupuesto enviado al cliente"
    });

    // Invalidar caché
    invalidarCaches();

    registrarLog('actualizar_presupuesto', 'Presupuesto actualizado y enviado', {
      resguardo: resguardo,
      presupuesto: presupuesto
    });

    return {
      exito: true,
      mensaje: "Presupuesto enviado correctamente"
    };

  } catch (error) {
    Logger.log(`❌ Error al actualizar presupuesto: ${error.message}`);
    throw error;
  }
}

/**
 * Marca un presupuesto como enviado
 * @param {string} resguardo - Número de resguardo
 * @returns {Object} Resultado de la operación
 */
function marcarPresupuestoEnviado(resguardo) {
  try {
    // Cambiar estado
    cambiarEstadoReparacion(resguardo, "Presupuesto Enviado", {
      observacion: "Presupuesto enviado al cliente",
      notificar: false
    });

    return {
      exito: true,
      mensaje: "Presupuesto marcado como enviado"
    };

  } catch (error) {
    Logger.log(`❌ Error al marcar presupuesto enviado: ${error.message}`);
    throw error;
  }
}

/**
 * Acepta un presupuesto
 * @param {string} resguardo - Número de resguardo
 * @returns {Object} Resultado de la operación
 */
function aceptarPresupuesto(resguardo) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const ahora = new Date();

    // Actualizar fecha de aceptación
    sheet.getRange(numFila, SHEET_CONFIG.columnas.fechaAceptacionPpto + 1).setValue(ahora);

    // Cambiar estado según si necesita pieza o no
    const reparacion = obtenerReparacion(resguardo);
    const necesitaPieza = reparacion.pieza.estadoPedido && reparacion.pieza.estadoPedido !== "";

    const nuevoEstado = necesitaPieza ? "Esperando Pieza" : "Reparando";

    cambiarEstadoReparacion(resguardo, nuevoEstado, {
      observacion: "Presupuesto aceptado por el cliente",
      notificar: false
    });

    return {
      exito: true,
      mensaje: `Presupuesto aceptado. Estado: ${nuevoEstado}`
    };

  } catch (error) {
    Logger.log(`❌ Error al aceptar presupuesto: ${error.message}`);
    throw error;
  }
}

/**
 * Rechaza un presupuesto
 * @param {string} resguardo - Número de resguardo
 * @param {string} motivo - Motivo del rechazo
 * @returns {Object} Resultado de la operación
 */
function rechazarPresupuesto(resguardo, motivo) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    // Guardar motivo
    if (motivo) {
      sheet.getRange(numFila, SHEET_CONFIG.columnas.motivoRechazo + 1).setValue(motivo);
    }

    // Cambiar estado
    cambiarEstadoReparacion(resguardo, "Presupuesto Rechazado", {
      observacion: `Presupuesto rechazado${motivo ? `: ${motivo}` : ""}`,
      notificar: true // Enviar aviso de recojo
    });

    return {
      exito: true,
      mensaje: "Presupuesto rechazado"
    };

  } catch (error) {
    Logger.log(`❌ Error al rechazar presupuesto: ${error.message}`);
    throw error;
  }
}

// ============================================
// RECOGIDA
// ============================================

/**
 * Marca una reparación como entregada
 * @param {string} resguardo - Número de resguardo
 * @param {string} numeroFactura - Número de factura (opcional)
 * @returns {Object} Resultado de la operación
 */
function marcarComoEntregado(resguardo, numeroFactura) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const ahora = new Date();
    const col = SHEET_CONFIG.columnas;

    // Actualizar estado de recogida
    sheet.getRange(numFila, col.estadoRecogida + 1).setValue("ENTREGADO");

    // Actualizar fecha de recogida
    sheet.getRange(numFila, col.fechaRecogida + 1).setValue(ahora);

    // Actualizar número de factura si se proporciona
    if (numeroFactura) {
      sheet.getRange(numFila, col.numeroFactura + 1).setValue(numeroFactura);
    }

    // Calcular tiempo total de entrega
    const fechaIngreso = sheet.getRange(numFila, col.fechaElaboracionPpto + 1).getValue();
    if (fechaIngreso) {
      const diasTranscurridos = calcularDiasTranscurridos(fechaIngreso, ahora);
      sheet.getRange(numFila, col.tiempoEntregaDias + 1).setValue(diasTranscurridos);
    }

    // Agregar observación
    agregarObservacion(resguardo, `Equipo entregado al cliente${numeroFactura ? ` - Factura: ${numeroFactura}` : ""}`);

    // Invalidar caché
    invalidarCaches();

    registrarLog('entrega', 'Reparación entregada', {
      resguardo: resguardo,
      numeroFactura: numeroFactura
    });

    return {
      exito: true,
      mensaje: "Reparación marcada como entregada"
    };

  } catch (error) {
    Logger.log(`❌ Error al marcar como entregado: ${error.message}`);
    throw error;
  }
}

// ============================================
// BÚSQUEDAS ESPECIALES
// ============================================

/**
 * Obtiene reparaciones que requieren atención
 * @returns {Array} Lista de reparaciones con alertas
 */
function obtenerReparacionesConAlertas() {
  try {
    const data = getAllData();
    const alertas = [];
    const hoy = new Date();

    for (let i = 1; i < data.length; i++) {
      const fila = data[i];

      // Saltar vacías
      if (!fila[SHEET_CONFIG.columnas.nombreCliente]) continue;

      const resguardo = fila[SHEET_CONFIG.columnas.resguardo];
      const estado = fila[SHEET_CONFIG.columnas.estado];

      // ALERTA: Presupuesto pendiente de elaborar +24 horas
      if (estado === "Presupuesto Pendiente") {
        const fechaRecepcion = fila[SHEET_CONFIG.columnas.fecha];
        if (fechaRecepcion) {
          const horas = calcularHorasTranscurridas(fechaRecepcion, hoy);
          if (horas >= 24) {
            const dias = Math.floor(horas / 24);
            alertas.push({
              resguardo: resguardo,
              tipo: "presupuesto_sin_elaborar",
              horas: horas,
              dias: dias,
              cliente: fila[SHEET_CONFIG.columnas.nombreCliente],
              mensaje: `Presupuesto pendiente de elaborar hace ${horas} horas (${dias} días)`
            });
          }
        }
      }

      // Presupuestos sin respuesta +5 días
      if (estado === "Presupuesto Enviado") {
        const fechaPpto = fila[SHEET_CONFIG.columnas.fechaElaboracionPpto];
        if (fechaPpto) {
          const dias = calcularDiasTranscurridos(fechaPpto, hoy);
          if (dias >= 5) {
            alertas.push({
              resguardo: resguardo,
              tipo: "presupuesto_pendiente",
              dias: dias,
              cliente: fila[SHEET_CONFIG.columnas.nombreCliente],
              mensaje: `Presupuesto sin respuesta hace ${dias} días`
            });
          }
        }
      }

      // Equipos listos sin recoger +7 días
      if (estadoRequiereRecojo(estado)) {
        const estadoRecogida = fila[SHEET_CONFIG.columnas.estadoRecogida];
        if (estadoRecogida === "PENDIENTE") {
          const fechaReparacion = fila[SHEET_CONFIG.columnas.fechaReparacion];
          if (fechaReparacion) {
            const dias = calcularDiasTranscurridos(fechaReparacion, hoy);
            if (dias >= 7) {
              alertas.push({
                resguardo: resguardo,
                tipo: "sin_recoger",
                dias: dias,
                cliente: fila[SHEET_CONFIG.columnas.nombreCliente],
                mensaje: `Equipo listo sin recoger hace ${dias} días`
              });
            }
          }
        }
      }

      // Piezas retrasadas
      if (estado === "Esperando Pieza") {
        const fechaEntregaEsperada = fila[SHEET_CONFIG.columnas.fechaEntrega];
        if (fechaEntregaEsperada && new Date(fechaEntregaEsperada) < hoy) {
          const dias = calcularDiasTranscurridos(fechaEntregaEsperada, hoy);
          alertas.push({
            resguardo: resguardo,
            tipo: "pieza_retrasada",
            dias: dias,
            cliente: fila[SHEET_CONFIG.columnas.nombreCliente],
            mensaje: `Pedido de pieza retrasado ${dias} días`
          });
        }
      }
    }

    return alertas;

  } catch (error) {
    Logger.log(`❌ Error al obtener alertas: ${error.message}`);
    throw error;
  }
}

// ============================================
// FASE 3: RESPUESTA DEL CLIENTE
// ============================================

/**
 * Registra que el cliente aceptó el presupuesto
 * @param {string} resguardo - Número de resguardo
 * @returns {Object} Resultado
 */
function aceptarPresupuesto(resguardo) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const ahora = new Date();

    // Registrar fecha de aceptación
    sheet.getRange(numFila, SHEET_CONFIG.columnas.fechaAceptacionPpto + 1).setValue(ahora);

    // Determinar siguiente estado
    const necesitaPieza = sheet.getRange(numFila, SHEET_CONFIG.columnas.proveedor + 1).getValue();
    const nuevoEstado = necesitaPieza ? "Pieza Pendiente" : "En Reparación";

    // Cambiar estado
    sheet.getRange(numFila, SHEET_CONFIG.columnas.estado + 1).setValue(nuevoEstado);

    // Invalidar caché
    invalidarCaches();

    Logger.log(`✅ Presupuesto aceptado: ${resguardo} → ${nuevoEstado}`);

    return {
      exito: true,
      mensaje: `Presupuesto aceptado. Estado: ${nuevoEstado}`,
      nuevoEstado: nuevoEstado
    };

  } catch (error) {
    Logger.log(`❌ Error al aceptar presupuesto: ${error.message}`);
    throw error;
  }
}

/**
 * Registra que el cliente rechazó el presupuesto
 * @param {string} resguardo - Número de resguardo
 * @param {string} motivo - Motivo del rechazo
 * @returns {Object} Resultado
 */
function rechazarPresupuesto(resguardo, motivo) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    // Registrar motivo de rechazo
    sheet.getRange(numFila, SHEET_CONFIG.columnas.motivoRechazo + 1).setValue(motivo || "No especificado");

    // Cambiar estado
    sheet.getRange(numFila, SHEET_CONFIG.columnas.estado + 1).setValue("Presupuesto Rechazado");

    // Invalidar caché
    invalidarCaches();

    Logger.log(`❌ Presupuesto rechazado: ${resguardo} - ${motivo}`);

    return {
      exito: true,
      mensaje: "Presupuesto rechazado",
      nuevoEstado: "Presupuesto Rechazado"
    };

  } catch (error) {
    Logger.log(`❌ Error al rechazar presupuesto: ${error.message}`);
    throw error;
  }
}

// ============================================
// FASE 4: GESTIÓN DE PIEZA
// ============================================

/**
 * Registra un pedido de pieza
 * @param {string} resguardo - Número de resguardo
 * @param {Object} datos - Datos del pedido {enlace, numeroPedido, fechaPedido, fechaEstimada}
 * @returns {Object} Resultado
 */
function registrarPedidoPieza(resguardo, datos) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    // Guardar datos del pedido
    sheet.getRange(numFila, SHEET_CONFIG.columnas.enlaceCompra + 1).setValue(datos.enlace || "");
    sheet.getRange(numFila, SHEET_CONFIG.columnas.numeroPedido + 1).setValue(datos.numeroPedido || "");
    sheet.getRange(numFila, SHEET_CONFIG.columnas.fechaPedido + 1).setValue(new Date(datos.fechaPedido));
    sheet.getRange(numFila, SHEET_CONFIG.columnas.fechaEntrega + 1).setValue(new Date(datos.fechaEstimada));
    sheet.getRange(numFila, SHEET_CONFIG.columnas.estadoPedido + 1).setValue("Pedido");

    // Invalidar caché
    invalidarCaches();

    Logger.log(`✅ Pedido registrado: ${resguardo} - ${datos.numeroPedido}`);

    return {
      exito: true,
      mensaje: "Pedido registrado exitosamente"
    };

  } catch (error) {
    Logger.log(`❌ Error al registrar pedido: ${error.message}`);
    throw error;
  }
}

/**
 * Actualiza el estado de un pedido de pieza
 * @param {string} resguardo - Número de resguardo
 * @param {string} nuevoEstado - Nuevo estado (En Tránsito, Recibido, etc)
 * @param {Date} fechaRecepcion - Fecha de recepción (solo para Recibido)
 * @returns {Object} Resultado
 */
function actualizarEstadoPedido(resguardo, nuevoEstado, fechaRecepcion) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    // Actualizar estado del pedido
    sheet.getRange(numFila, SHEET_CONFIG.columnas.estadoPedido + 1).setValue(nuevoEstado);

    // Si es "Recibido", actualizar fecha real y cambiar estado de reparación
    if (nuevoEstado === "Recibido") {
      sheet.getRange(numFila, SHEET_CONFIG.columnas.fechaEntrega + 1).setValue(fechaRecepcion || new Date());
      sheet.getRange(numFila, SHEET_CONFIG.columnas.estado + 1).setValue("Pieza Entregada");
    }

    // Invalidar caché
    invalidarCaches();

    Logger.log(`✅ Estado pedido actualizado: ${resguardo} → ${nuevoEstado}`);

    return {
      exito: true,
      mensaje: `Estado del pedido actualizado a: ${nuevoEstado}`
    };

  } catch (error) {
    Logger.log(`❌ Error al actualizar estado pedido: ${error.message}`);
    throw error;
  }
}

// ============================================
// FASE 5: REPARACIÓN
// ============================================

/**
 * Inicia la reparación de un equipo
 * @param {string} resguardo - Número de resguardo
 * @returns {Object} Resultado
 */
function iniciarReparacion(resguardo) {
  try {
    return cambiarEstadoReparacion(resguardo, "En Reparación", {
      observacion: "Reparación iniciada"
    });

  } catch (error) {
    Logger.log(`❌ Error al iniciar reparación: ${error.message}`);
    throw error;
  }
}

/**
 * Finaliza la reparación de un equipo
 * @param {string} resguardo - Número de resguardo
 * @param {Object} datos - Datos {resultado, tecnico, fecha, observaciones}
 * @returns {Object} Resultado
 */
function finalizarReparacion(resguardo, datos) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    // Guardar técnico y fecha
    sheet.getRange(numFila, SHEET_CONFIG.columnas.tecnico + 1).setValue(datos.tecnico);
    sheet.getRange(numFila, SHEET_CONFIG.columnas.fechaReparacion + 1).setValue(new Date(datos.fecha));

    // Guardar observaciones si hay
    if (datos.observaciones) {
      agregarObservacion(resguardo, datos.observaciones);
    }

    // Cambiar estado según resultado
    const nuevoEstado = datos.resultado === "reparado" ? "Reparado" : "No tiene Reparación";
    sheet.getRange(numFila, SHEET_CONFIG.columnas.estado + 1).setValue(nuevoEstado);

    // Invalidar caché
    invalidarCaches();

    Logger.log(`✅ Reparación finalizada: ${resguardo} → ${nuevoEstado}`);

    return {
      exito: true,
      mensaje: `Reparación finalizada: ${nuevoEstado}`,
      nuevoEstado: nuevoEstado
    };

  } catch (error) {
    Logger.log(`❌ Error al finalizar reparación: ${error.message}`);
    throw error;
  }
}

// ============================================
// FASE 6: ENTREGA
// ============================================

/**
 * Marca un equipo como entregado al cliente
 * @param {string} resguardo - Número de resguardo
 * @param {Object} datos - Datos {numeroFactura, fechaRecogida, observaciones}
 * @returns {Object} Resultado
 */
function marcarComoEntregado(resguardo, datos) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const fechaRecogida = new Date(datos.fechaRecogida || new Date());

    // Guardar número de factura
    if (datos.numeroFactura) {
      sheet.getRange(numFila, SHEET_CONFIG.columnas.numeroFactura + 1).setValue(datos.numeroFactura);
    }

    // Guardar fecha de recogida
    sheet.getRange(numFila, SHEET_CONFIG.columnas.fechaRecogida + 1).setValue(fechaRecogida);

    // Cambiar estado de recogida
    sheet.getRange(numFila, SHEET_CONFIG.columnas.estadoRecogida + 1).setValue("ENTREGADO");

    // Calcular tiempo total (días desde recepción hasta entrega)
    const fechaRecepcion = sheet.getRange(numFila, SHEET_CONFIG.columnas.fecha + 1).getValue();
    const diasTotales = calcularDiasTranscurridos(fechaRecepcion, fechaRecogida);
    sheet.getRange(numFila, SHEET_CONFIG.columnas.tiempoEntregaDias + 1).setValue(diasTotales);

    // Guardar observaciones si hay
    if (datos.observaciones) {
      sheet.getRange(numFila, SHEET_CONFIG.columnas.obsEntregaEquipos + 1).setValue(datos.observaciones);
    }

    // Invalidar caché
    invalidarCaches();

    Logger.log(`✅ Equipo entregado: ${resguardo} - ${diasTotales} días`);

    return {
      exito: true,
      mensaje: `Equipo entregado exitosamente (${diasTotales} días)`,
      diasTotales: diasTotales
    };

  } catch (error) {
    Logger.log(`❌ Error al marcar como entregado: ${error.message}`);
    throw error;
  }
}
