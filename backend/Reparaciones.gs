/**
 * REPARACIONES.GS - Lógica de negocio de reparaciones (Multi-Tabla)
 * Operaciones de alto nivel sobre reparaciones
 */

// ============================================
// CAMBIO DE ESTADO
// ============================================

/**
 * Cambia el estado de una reparación
 * @param {string} resguardo
 * @param {string} nuevoEstado
 * @param {Object} opciones - {notificar, observacion}
 * @returns {Object}
 */
function cambiarEstadoReparacion(resguardo, nuevoEstado, opciones) {
  try {
    opciones = opciones || {};

    if (!ESTADOS_REPARACION[nuevoEstado]) {
      throw new Error(`Estado "${nuevoEstado}" no es válido`);
    }

    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    // Leer estado anterior
    const sheet = getHoja("reparaciones");
    const colEstado = HOJAS.reparaciones.cols.estado;
    const estadoAnterior = sheet.getRange(numFila, colEstado + 1).getValue();

    // Actualizar estado
    const cambios = { estado: nuevoEstado };

    // Timestamps según el estado
    if (nuevoEstado === "Reparado" || nuevoEstado === "No tiene Reparación") {
      cambios.fecha_reparacion = new Date();
    }

    actualizarCeldas("reparaciones", numFila, cambios);

    // Registrar en historial
    const desc = `Estado: ${estadoAnterior} → ${nuevoEstado}` +
      (opciones.observacion ? ` - ${opciones.observacion}` : "");
    agregarEventoHistorial(resguardo, "cambio_estado", desc);

    invalidarCaches();

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
    Logger.log(`Error al cambiar estado: ${error.message}`);
    throw error;
  }
}

/**
 * Verifica si debe enviar notificación según el nuevo estado
 */
function verificarEnvioNotificacion(resguardo, estado) {
  if (estadoRequiereRecojo(estado)) {
    Logger.log(`Debe enviar aviso de recojo para ${resguardo}`);
    // TODO: Integrar con sistema de notificaciones (tabla Notificaciones)
  }
}

// ============================================
// OBSERVACIONES
// ============================================

/**
 * Agrega una observación a una reparación
 * @param {string} resguardo
 * @param {string} texto
 * @returns {Object}
 */
function agregarObservacion(resguardo, texto) {
  try {
    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    // Leer observaciones actuales
    const sheet = getHoja("reparaciones");
    const colObs = HOJAS.reparaciones.cols.observaciones;
    const obsActuales = sheet.getRange(numFila, colObs + 1).getValue() || "";

    // Agregar nueva con timestamp
    const timestamp = formatearFecha(new Date(), true);
    const usuario = Session.getActiveUser().getEmail().split('@')[0];
    const nuevaObs = `[${timestamp}] ${usuario}: ${texto}`;
    const obsCompletas = obsActuales ? obsActuales + "\n" + nuevaObs : nuevaObs;

    sheet.getRange(numFila, colObs + 1).setValue(obsCompletas);

    // También registrar en historial
    agregarEventoHistorial(resguardo, "observacion", texto);

    return { exito: true, mensaje: "Observación agregada" };

  } catch (error) {
    Logger.log(`Error al agregar observación: ${error.message}`);
    throw error;
  }
}

// ============================================
// REPARACIÓN - INICIAR / FINALIZAR
// ============================================

/**
 * Inicia la reparación de un equipo
 * @param {string} resguardo
 * @param {string} tecnico - Nombre del técnico
 * @param {string} observacion
 * @returns {Object}
 */
function iniciarReparacion(resguardo, tecnico, observacion) {
  try {
    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    // Verificar si tiene presupuesto aceptado con piezas pendientes
    const reparacion = buscarPorId("reparaciones", "resguardo", resguardo);
    const pptoAceptadoId = reparacion.fila[HOJAS.reparaciones.cols.presupuesto_aceptado_id];

    if (pptoAceptadoId) {
      // Verificar pedidos pendientes
      const pedidos = obtenerPedidosDeReparacion(resguardo);
      const pedidosPendientes = pedidos.filter(p =>
        p.estado === "Pedido" || p.estado === "En Tránsito" || p.estado === "Pendiente"
      );

      if (pedidosPendientes.length > 0) {
        return {
          exito: false,
          mensaje: `No se puede iniciar. Hay ${pedidosPendientes.length} pedido(s) pendiente(s) de recibir.`
        };
      }
    }

    // Asignar técnico
    actualizarCeldas("reparaciones", numFila, {
      tecnico_asignado: tecnico
    });

    // Historial
    if (observacion) {
      agregarEventoHistorial(resguardo, "reparacion_iniciada", `Reparación iniciada por ${tecnico}: ${observacion}`);
    }

    return cambiarEstadoReparacion(resguardo, "En Reparación", { notificar: false });

  } catch (error) {
    Logger.log(`Error al iniciar reparación: ${error.message}`);
    throw error;
  }
}

/**
 * Finaliza la reparación de un equipo
 * @param {string} resguardo
 * @param {Object} datos - {resultado, tecnico, fecha, observaciones, piezaOk, piezaNoResuelve, codigoDevolucion}
 * @returns {Object}
 */
function finalizarReparacion(resguardo, datos) {
  try {
    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    // Actualizar técnico y fecha
    actualizarCeldas("reparaciones", numFila, {
      tecnico_asignado: datos.tecnico,
      fecha_reparacion: new Date(datos.fecha),
      resultado_reparacion: datos.resultado
    });

    const nuevoEstado = datos.resultado === "reparado" ? "Reparado" : "No tiene Reparación";

    // Construir mensaje para historial
    let mensajeHistorial = '';
    if (nuevoEstado === "Reparado") {
      mensajeHistorial = `Reparado por ${datos.tecnico}`;
      if (datos.piezaOk) mensajeHistorial += ' | Pieza OK';
    } else {
      mensajeHistorial = `No tiene Reparación - ${datos.tecnico}`;
      if (datos.piezaNoResuelve) {
        mensajeHistorial += ' | Pieza OK pero no resuelve el problema';
        if (datos.codigoDevolucion) {
          mensajeHistorial += ` | Código devolución: ${datos.codigoDevolucion}`;
        }
      }
    }

    if (datos.observaciones) {
      mensajeHistorial += `: ${datos.observaciones}`;
    }

    // Datos extra en JSON para el historial
    const datosExtra = JSON.stringify({
      piezaOk: datos.piezaOk || false,
      piezaNoResuelve: datos.piezaNoResuelve || false,
      codigoDevolucion: datos.codigoDevolucion || ""
    });

    agregarEventoHistorial(resguardo, "reparacion_finalizada", mensajeHistorial, datos.tecnico, datosExtra);

    // Cambiar estado
    actualizarCelda("reparaciones", numFila, "estado", nuevoEstado);

    invalidarCaches();

    return {
      exito: true,
      mensaje: `Reparación finalizada: ${nuevoEstado}`,
      nuevoEstado: nuevoEstado
    };

  } catch (error) {
    Logger.log(`Error al finalizar reparación: ${error.message}`);
    throw error;
  }
}

// ============================================
// PROBLEMA CON PIEZA
// ============================================

/**
 * Reporta un problema con la pieza y registra nuevo pedido
 * @param {string} resguardo
 * @param {Object} datos - Datos del problema y nuevo pedido
 * @returns {Object}
 */
function reportarProblemaPieza(resguardo, datos) {
  try {
    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const colPed = HOJAS.pedidos.cols;
    const tiposProblema = {
      'defectuosa': 'Pieza Defectuosa',
      'rota': 'Pieza Rota'
    };
    const tiposDescripcion = {
      'defectuosa': 'Pieza defectuosa (de fábrica)',
      'rota': 'Pieza rota durante reparación'
    };

    // Soportar multi-pieza (array) o pieza única (retrocompatibilidad)
    let piezas = datos.piezas || [];
    if (piezas.length === 0) {
      piezas.push({
        pedidoAnteriorId: datos.pedidoAnteriorId || '',
        piezaId: datos.piezaId || '',
        tipoProblema: datos.tipoProblema || 'defectuosa',
        codigoDevolucion: datos.codigoDevolucion || '',
        descripcion: datos.descripcion || '',
        nuevoProveedor: datos.nuevoProveedor || '',
        nuevoEnlace: datos.nuevoEnlace || '',
        nuevoNumeroPedido: datos.nuevoNumeroPedido || '',
        nuevaFechaEstimada: datos.nuevaFechaEstimada || ''
      });
    }

    const pedidosCreados = [];

    for (const pieza of piezas) {
      // 1. Marcar pedido anterior con estado específico (Pieza Rota / Pieza Defectuosa)
      if (pieza.pedidoAnteriorId) {
        const pedidoAnterior = buscarPorId("pedidos", "pedido_id", pieza.pedidoAnteriorId);
        if (pedidoAnterior) {
          const estadoProblema = tiposProblema[pieza.tipoProblema] || 'Problema';
          actualizarCeldas("pedidos", pedidoAnterior.numFila, {
            estado: estadoProblema,
            problema_tipo: pieza.tipoProblema || '',
            codigo_devolucion: pieza.codigoDevolucion || ''
          });
        }
      }

      // 2. Crear nuevo pedido de reemplazo
      const pedidoId = generarId("PED", "pedidos", "pedido_id");
      const filaPed = new Array(Object.keys(colPed).length).fill("");
      filaPed[colPed.pedido_id] = pedidoId;
      filaPed[colPed.pieza_id] = pieza.piezaId || "";
      filaPed[colPed.resguardo] = resguardo;
      filaPed[colPed.comprado_por] = pieza.nuevoProveedor || "";
      filaPed[colPed.numero_pedido] = pieza.nuevoNumeroPedido || "";
      filaPed[colPed.fecha_pedido] = new Date();
      filaPed[colPed.fecha_estimada] = pieza.nuevaFechaEstimada ? new Date(pieza.nuevaFechaEstimada) : "";
      filaPed[colPed.estado] = "En Tránsito";
      filaPed[colPed.problema_tipo] = "";
      filaPed[colPed.codigo_devolucion] = "";
      filaPed[colPed.pedido_remplazo_id] = pieza.pedidoAnteriorId || "";
      filaPed[colPed.notas] = pieza.descripcion || "";

      agregarFila("pedidos", filaPed);
      pedidosCreados.push(pedidoId);

      // 3. Historial por pieza
      let mensajeHistorial = tiposDescripcion[pieza.tipoProblema] || 'Problema con pieza';
      if (pieza.codigoDevolucion) {
        mensajeHistorial += ` | Código devolución: ${pieza.codigoDevolucion}`;
      }
      mensajeHistorial += ` | Nuevo pedido: ${pieza.nuevoProveedor} #${pieza.nuevoNumeroPedido}`;

      const datosExtra = JSON.stringify({
        tipoProblema: pieza.tipoProblema,
        codigoDevolucion: pieza.codigoDevolucion || "",
        pedidoAnteriorId: pieza.pedidoAnteriorId || "",
        nuevoPedidoId: pedidoId
      });
      agregarEventoHistorial(resguardo, "problema_pieza", mensajeHistorial, null, datosExtra);
    }

    // Cambiar estado de la reparación a Pieza Pendiente
    actualizarCelda("reparaciones", numFila, "estado", "Pieza Pendiente");

    invalidarCaches();

    const pedidosActualizados = obtenerPedidosDeReparacion(resguardo);

    return {
      exito: true,
      mensaje: `${pedidosCreados.length} pieza(s) reportada(s). Nuevo(s) pedido(s): ${pedidosCreados.join(', ')}`,
      nuevoEstado: 'Pieza Pendiente',
      pedidoIds: pedidosCreados,
      pedidos: pedidosActualizados
    };

  } catch (error) {
    Logger.log(`Error al reportar problema con pieza: ${error.message}`);
    throw error;
  }
}

// ============================================
// ENTREGA DE EQUIPO
// ============================================

/**
 * Marca un equipo como entregado al cliente
 * @param {string} resguardo
 * @param {Object} datos - {numeroFactura, fechaRecogida, observaciones}
 * @returns {Object}
 */
function marcarComoEntregado(resguardo, datos) {
  try {
    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const fechaRecogida = new Date(datos.fechaRecogida || new Date());

    // Actualizar campos de la reparación
    const cambios = {
      estado_entrega: "ENTREGADO",
      fecha_entrega: fechaRecogida
    };

    if (datos.numeroFactura) {
      cambios.numero_factura = datos.numeroFactura;
    }

    actualizarCeldas("reparaciones", numFila, cambios);

    // Calcular días totales
    const sheet = getHoja("reparaciones");
    const colFechaRec = HOJAS.reparaciones.cols.fecha_recepcion;
    const fechaRecepcion = sheet.getRange(numFila, colFechaRec + 1).getValue();
    const diasTotales = calcularDiasTranscurridos(fechaRecepcion, fechaRecogida);

    // Historial
    let desc = `Equipo entregado al cliente (${diasTotales} días)`;
    if (datos.numeroFactura) desc += ` - Factura: ${datos.numeroFactura}`;
    if (datos.observaciones) desc += ` - ${datos.observaciones}`;
    agregarEventoHistorial(resguardo, "entrega", desc);

    invalidarCaches();

    return {
      exito: true,
      mensaje: `Equipo entregado exitosamente (${diasTotales} días)`,
      diasTotales: diasTotales
    };

  } catch (error) {
    Logger.log(`Error al marcar como entregado: ${error.message}`);
    throw error;
  }
}

/**
 * Envía un equipo a punto limpio (reciclaje)
 */
function enviarAPuntoLimpio(resguardo) {
  try {
    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const fechaReciclaje = new Date();

    actualizarCeldas("reparaciones", numFila, {
      estado_entrega: "RECICLAJE",
      fecha_entrega: fechaReciclaje
    });

    // Calcular días totales
    const sheet = getHoja("reparaciones");
    const colFechaRec = HOJAS.reparaciones.cols.fecha_recepcion;
    const fechaRecepcion = sheet.getRange(numFila, colFechaRec + 1).getValue();
    const diasTotales = calcularDiasTranscurridos(fechaRecepcion, fechaReciclaje);

    agregarEventoHistorial(resguardo, "reciclaje", `Equipo enviado a punto limpio - reciclaje (${diasTotales} días)`);

    invalidarCaches();

    return {
      exito: true,
      mensaje: `Equipo enviado a punto limpio (${diasTotales} días)`,
      diasTotales: diasTotales
    };

  } catch (error) {
    Logger.log(`Error al enviar a punto limpio: ${error.message}`);
    throw error;
  }
}

/**
 * Actualiza datos del cliente
 */
function actualizarCliente(resguardo, datos) {
  try {
    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const cambios = {};
    if (datos.nombre !== undefined) cambios.cliente_nombre = datos.nombre;
    if (datos.telefono !== undefined) cambios.cliente_telefono = datos.telefono;
    if (datos.email !== undefined) cambios.cliente_email = datos.email;

    actualizarCeldas("reparaciones", numFila, cambios);

    agregarEventoHistorial(resguardo, "actualizacion_cliente", "Datos del cliente actualizados");

    invalidarCaches();

    return { exito: true, mensaje: "Datos del cliente actualizados" };

  } catch (error) {
    Logger.log(`Error al actualizar cliente: ${error.message}`);
    throw error;
  }
}

// ============================================
// BÚSQUEDAS ESPECIALES
// ============================================

/**
 * Obtiene reparaciones que requieren atención
 * @returns {Array}
 */
function obtenerReparacionesConAlertas() {
  try {
    const cols = HOJAS.reparaciones.cols;
    const data = obtenerTodoConHeader("reparaciones");
    const alertas = [];
    const hoy = new Date();

    for (let i = 1; i < data.length; i++) {
      const fila = data[i];
      if (!fila[cols.cliente_nombre]) continue;

      const resguardo = fila[cols.resguardo];
      const estado = fila[cols.estado];

      // Presupuesto pendiente +24h
      if (estado === "Presupuesto Pendiente") {
        const fechaRecepcion = fila[cols.fecha_recepcion];
        if (fechaRecepcion) {
          const horas = calcularHorasTranscurridas(fechaRecepcion, hoy);
          if (horas >= 24) {
            alertas.push({
              resguardo: resguardo,
              tipo: "presupuesto_sin_elaborar",
              horas: horas,
              dias: Math.floor(horas / 24),
              cliente: fila[cols.cliente_nombre],
              mensaje: `Presupuesto pendiente hace ${Math.floor(horas / 24)} días`
            });
          }
        }
      }

      // Presupuestos sin respuesta +5 días
      if (estado === "Presupuesto Enviado") {
        const fechaRecepcion = fila[cols.fecha_recepcion];
        if (fechaRecepcion) {
          const dias = calcularDiasTranscurridos(fechaRecepcion, hoy);
          if (dias >= 5) {
            alertas.push({
              resguardo: resguardo,
              tipo: "presupuesto_pendiente",
              dias: dias,
              cliente: fila[cols.cliente_nombre],
              mensaje: `Presupuesto sin respuesta hace ${dias} días`
            });
          }
        }
      }

      // Equipos listos sin recoger +7 días
      if (estadoRequiereRecojo(estado)) {
        const estadoEntrega = fila[cols.estado_entrega];
        if (estadoEntrega === "PENDIENTE") {
          const fechaReparacion = fila[cols.fecha_reparacion];
          if (fechaReparacion) {
            const dias = calcularDiasTranscurridos(fechaReparacion, hoy);
            if (dias >= 7) {
              alertas.push({
                resguardo: resguardo,
                tipo: "sin_recoger",
                dias: dias,
                cliente: fila[cols.cliente_nombre],
                mensaje: `Equipo listo sin recoger hace ${dias} días`
              });
            }
          }
        }
      }
    }

    return alertas;

  } catch (error) {
    Logger.log(`Error al obtener alertas: ${error.message}`);
    throw error;
  }
}
