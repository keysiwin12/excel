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
    try {
      enviarAvisoRecogidaInmediato(resguardo);
    } catch (e) {
      Logger.log(`Error enviando aviso de recogida para ${resguardo}: ${e.message}`);
    }
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

    // Asignar técnico (desde formulario)
    actualizarCeldas("reparaciones", numFila, {
      tecnico_asignado: tecnico,
      ultimo_usuario: obtenerNombreUsuarioActual()
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

    // Actualizar técnico (desde formulario) y fecha
    actualizarCeldas("reparaciones", numFila, {
      tecnico_asignado: datos.tecnico,
      fecha_reparacion: datos.fecha ? new Date(datos.fecha) : new Date(),
      resultado_reparacion: datos.resultado,
      ultimo_usuario: obtenerNombreUsuarioActual()
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

    // Enviar aviso de recogida al cliente
    try {
      enviarAvisoRecogidaInmediato(resguardo);
    } catch (e) {
      Logger.log(`Error enviando aviso de recogida para ${resguardo}: ${e.message}`);
    }

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
    const tipoEntrega = datos.tipoEntrega || "ENTREGADO";

    // Actualizar campos de la reparación
    const cambios = {
      estado_entrega: tipoEntrega,
      fecha_entrega: fechaRecogida,
      ultimo_usuario: obtenerNombreUsuarioActual()
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
    const descripcionEntrega = tipoEntrega === 'ENVIO' ? 'Equipo enviado por mensajería' : 'Equipo entregado al cliente en local';
    let desc = `${descripcionEntrega} (${diasTotales} días)`;
    if (datos.numeroFactura) desc += ` - Factura: ${datos.numeroFactura}`;
    if (datos.observaciones) desc += ` - ${datos.observaciones}`;
    agregarEventoHistorial(resguardo, "entrega", desc, obtenerNombreUsuarioActual());

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

/**
 * Actualiza datos del equipo
 */
function actualizarEquipo(resguardo, datos) {
  try {
    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const cambios = {};
    if (datos.modelo !== undefined) cambios.equipo_modelo = datos.modelo;
    if (datos.sintoma !== undefined) cambios.sintoma = datos.sintoma;

    actualizarCeldas("reparaciones", numFila, cambios);

    agregarEventoHistorial(resguardo, "actualizacion_equipo", "Datos del equipo actualizados");

    invalidarCaches();

    return { exito: true, mensaje: "Datos del equipo actualizados" };

  } catch (error) {
    Logger.log(`Error al actualizar equipo: ${error.message}`);
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

// ============================================
// REPARACIÓN DE CINTAS (OPTIMIZADO)
// ============================================

/**
 * ⚡ OPTIMIZADO: Crea reparación de cintas con presupuesto aceptado en UNA sola llamada
 * Combina: crearReparacion + crearPresupuesto + aceptarPresupuesto
 * @param {Object} datos - Datos de la reparación incluyendo datosCintas
 * @returns {Object} Resultado con reparación y presupuesto
 */
function crearReparacionCintas(datos) {
  try {
    const ss = getSpreadsheet();
    const usuario = datos.creadoPor || Session.getActiveUser().getEmail();
    const ahora = new Date();

    // Validar datos de cintas
    if (!datos.datosCintas || !datos.datosCintas.total || datos.datosCintas.total === 0) {
      return { exito: false, error: 'Debe especificar al menos 1 cinta' };
    }

    const resguardo = datos.resguardo;
    if (!resguardo) {
      return { exito: false, error: 'El número de resguardo es obligatorio' };
    }

    // 1. Verificar que no existe el resguardo
    const sheetReparaciones = getHoja("reparaciones");
    const colRep = HOJAS.reparaciones.cols;
    const finderRep = sheetReparaciones.getRange(1, colRep.resguardo + 1, sheetReparaciones.getLastRow(), 1)
      .createTextFinder(String(resguardo)).matchEntireCell(true);
    if (finderRep.findNext()) {
      return { exito: false, error: `El resguardo ${resguardo} ya existe` };
    }

    // 2. CREAR REPARACIÓN
    const fechaRecepcion = datos.fechaRecepcion ? new Date(datos.fechaRecepcion) : ahora;
    const filaRep = new Array(Object.keys(colRep).length).fill("");
    filaRep[colRep.resguardo] = resguardo;
    filaRep[colRep.fecha_recepcion] = fechaRecepcion;
    filaRep[colRep.cliente_nombre] = datos.clienteNombre || "";
    filaRep[colRep.cliente_telefono] = datos.clienteTelefono || "";
    filaRep[colRep.cliente_email] = datos.clienteEmail || "";
    filaRep[colRep.equipo_modelo] = datos.equipoModelo || "Cintas de video";
    filaRep[colRep.sintoma] = datos.sintoma || "Digitalización";
    filaRep[colRep.estado] = "En Reparación"; // Cintas: va directo a reparación
    filaRep[colRep.estado_entrega] = "PENDIENTE";
    filaRep[colRep.creado_por] = usuario;
    filaRep[colRep.fecha_creacion] = ahora;
    filaRep[colRep.tipo_recepcion] = datos.tipoRecepcion || "LOCAL";
    filaRep[colRep.equipo_en_local] = "SI";
    filaRep[colRep.datos_cintas] = serializarDatosCintas(datos.datosCintas);

    const lastRowRep = sheetReparaciones.getLastRow();
    sheetReparaciones.getRange(lastRowRep + 1, 1, 1, filaRep.length).setValues([filaRep]);

    // 3. CREAR PRESUPUESTO ACEPTADO
    const sheetPresupuestos = getHoja("presupuestos");
    const colP = HOJAS.presupuestos.cols;
    const presupuestoId = generarId("PPTO", "presupuestos", "presupuesto_id");
    const totalCintas = datos.datosCintas.total;
    const precioPorCinta = datos.datosCintas.precioUnitario || 0;
    const totalSinIVA = totalCintas * precioPorCinta;
    const totalConIVA = totalSinIVA * 1.21;

    const filaP = new Array(Object.keys(colP).length).fill("");
    filaP[colP.presupuesto_id] = presupuestoId;
    filaP[colP.resguardo] = resguardo;
    filaP[colP.version] = 1;
    filaP[colP.fecha_elaboracion] = ahora;
    filaP[colP.elaborado_por] = usuario;
    // costo_reparacion: columna legacy, total ya cubre este dato
    filaP[colP.costo_piezas] = 0;
    filaP[colP.total] = totalConIVA;
    filaP[colP.ganancia_neta] = totalConIVA;
    filaP[colP.dias_entrega] = 1;
    filaP[colP.estado] = "aceptado"; // Ya aceptado
    filaP[colP.fecha_respuesta] = ahora;
    filaP[colP.tipo_pieza] = "no";
    filaP[colP.descripcion] = `Digitalización de ${totalCintas} cintas - ${precioPorCinta}€/cinta`;
    filaP[colP.mano_obra] = totalConIVA;
    filaP[colP.precio_piezas] = 0;

    const lastRowP = sheetPresupuestos.getLastRow();
    sheetPresupuestos.getRange(lastRowP + 1, 1, 1, filaP.length).setValues([filaP]);

    // 4. Actualizar presupuesto_aceptado_id en reparación
    const numFilaRep = lastRowRep + 1;
    sheetReparaciones.getRange(numFilaRep, colRep.presupuesto_aceptado_id + 1).setValue(presupuestoId);

    // 5. Historial (batch)
    agregarEventoHistorial(resguardo, "creacion", `Conversión de cintas creada. ${totalCintas} cintas.`, obtenerNombreUsuarioActual());
    agregarEventoHistorial(resguardo, "presupuesto_aceptado", `Presupuesto automático aceptado. Total: ${totalConIVA.toFixed(2)}€`, obtenerNombreUsuarioActual());

    // Procesar historial
    procesarColaHistorial();

    // Invalidar caches
    CacheService.getScriptCache().remove('metricas-dashboard');

    // Actualizar cache de versión
    actualizarCacheVersion(resguardo, 1);

    Logger.log(`✅ Reparación de cintas creada: ${resguardo}`);

    return {
      exito: true,
      resguardo: resguardo,
      presupuestoId: presupuestoId,
      reparacion: {
        resguardo: resguardo,
        fechaRecepcion: fechaRecepcion.toISOString(),
        cliente: {
          nombre: datos.clienteNombre || "",
          telefono: datos.clienteTelefono || "",
          email: datos.clienteEmail || ""
        },
        equipo: {
          modelo: datos.equipoModelo || "Cintas de video",
          sintoma: datos.sintoma || "Digitalización"
        },
        estado: "En Reparación",
        estadoEntrega: "PENDIENTE",
        datosCintas: datos.datosCintas,
        presupuestos: [{
          presupuestoId: presupuestoId,
          version: 1,
          estado: "aceptado",
          total: totalConIVA,
          descripcion: `Digitalización de ${totalCintas} cintas`
        }],
        pedidos: []
      },
      mensaje: `Recepción de ${totalCintas} cintas registrada con presupuesto aceptado`
    };

  } catch (error) {
    Logger.log(`Error al crear reparación de cintas: ${error.message}`);
    return { exito: false, error: error.message };
  }
}

// ============================================
// MARCAR COMO "SIN REPARACIÓN" POR FALTA DE PIEZA
// ============================================

/**
 * Marca una reparación como "No tiene Reparación" por falta de pieza disponible
 * @param {string} resguardo - Número de resguardo
 * @param {Object} opciones - { motivoAdicional: string, marcarPresupuestosObsoletos: boolean }
 * @returns {Object} Resultado
 */
function marcarSinReparacionPorPieza(resguardo, opciones) {
  try {
    opciones = opciones || {};
    const motivoAdicional = opciones.motivoAdicional || "";
    const marcarPresupuestosObsoletos = opciones.marcarPresupuestosObsoletos !== false; // default true
    const tecnico = opciones.tecnico || "";
    const fecha = opciones.fecha ? new Date(opciones.fecha) : new Date();

    // 1. Buscar reparación
    const resultado = buscarPorId("reparaciones", "resguardo", resguardo);
    if (!resultado) {
      return { exito: false, error: `Reparación ${resguardo} no encontrada` };
    }

    const cols = HOJAS.reparaciones.cols;
    const estadoActual = resultado.fila[cols.estado];

    // 2. Validar que esté en estado permitido
    const estadosPermitidos = ["Presupuesto Pendiente", "Presupuesto Enviado"];
    if (!estadosPermitidos.includes(estadoActual)) {
      return {
        exito: false,
        error: `Solo se puede marcar "Sin Pieza" en estados: ${estadosPermitidos.join(', ')}. Estado actual: ${estadoActual}`
      };
    }

    // 3. Guardar estado anterior para permitir reversión
    const estadoAnterior = estadoActual;

    // 4. Actualizar reparación
    const cambios = {
      estado: "No tiene Reparación",
      motivo_sin_reparacion: "NO_HAY_PIEZA",
      tecnico_asignado: tecnico,
      fecha_reparacion: fecha,
      resultado_reparacion: "no_reparado",
      ultimo_usuario: obtenerNombreUsuarioActual()
    };

    actualizarReparacion(resguardo, cambios);

    // 5. Agregar evento al historial
    const descripcionEvento = motivoAdicional
      ? `Marcado como "Sin Reparación" - Pieza no disponible. Motivo: ${motivoAdicional}`
      : `Marcado como "Sin Reparación" - Pieza no disponible`;

    agregarEventoHistorial(resguardo, "sin_reparacion_sin_pieza", descripcionEvento, obtenerNombreUsuarioActual());

    // 6. Guardar estado anterior en historial (para deshacer)
    agregarEventoHistorial(resguardo, "estado_anterior_guardado", `Estado anterior: ${estadoAnterior}`, obtenerNombreUsuarioActual());

    // 7. Marcar presupuestos como obsoletos si se solicitó
    if (marcarPresupuestosObsoletos) {
      const presupuestos = buscarTodosPorCampo("presupuestos", "resguardo", resguardo);
      if (presupuestos.length > 0) {
        const colP = HOJAS.presupuestos.cols;
        const sheetPresupuestos = getHoja("presupuestos");

        presupuestos.forEach(p => {
          const estadoPpto = p.fila[colP.estado];
          if (estadoPpto === 'borrador' || estadoPpto === 'pendiente') {
            // Marcar como obsoleto agregando nota
            const notasActuales = p.fila[colP.notas] || "";
            const nuevasNotas = notasActuales
              ? `${notasActuales}\n[OBSOLETO: Sin pieza disponible]`
              : "[OBSOLETO: Sin pieza disponible]";

            actualizarCelda("presupuestos", p.numFila, "notas", nuevasNotas);
          }
        });

        agregarEventoHistorial(resguardo, "presupuestos_obsoletos",
          `${presupuestos.length} presupuesto(s) marcado(s) como obsoleto(s)`, obtenerNombreUsuarioActual());
      }
    }

    // 8. Procesar cola de historial
    if (HISTORIAL_QUEUE.length >= 5) {
      procesarColaHistorial();
    }

    // 9. Invalidar caché
    CacheService.getScriptCache().remove('metricas-dashboard');

    // 10. Enviar aviso de recogida al cliente
    try {
      enviarAvisoRecogidaInmediato(resguardo);
    } catch (e) {
      Logger.log(`Error enviando aviso de recogida para ${resguardo}: ${e.message}`);
    }

    return {
      exito: true,
      mensaje: "Reparación marcada como 'Sin Reparación - No hay pieza'",
      estadoAnterior: estadoAnterior
    };

  } catch (error) {
    Logger.log(`Error al marcar sin reparación por pieza: ${error.message}`);
    return { exito: false, error: error.message };
  }
}

/**
 * Deshace el marcado de "Sin Reparación" por falta de pieza y restaura el estado anterior
 * @param {string} resguardo - Número de resguardo
 * @returns {Object} Resultado
 */
function deshacerSinReparacion(resguardo) {
  try {
    // 1. Buscar reparación
    const resultado = buscarPorId("reparaciones", "resguardo", resguardo);
    if (!resultado) {
      return { exito: false, error: `Reparación ${resguardo} no encontrada` };
    }

    const cols = HOJAS.reparaciones.cols;
    const estadoActual = resultado.fila[cols.estado];
    const motivoSinReparacion = resultado.fila[cols.motivo_sin_reparacion];

    // 2. Validar que esté en estado "No tiene Reparación" y el motivo sea "NO_HAY_PIEZA"
    if (estadoActual !== "No tiene Reparación") {
      return { exito: false, error: "La reparación no está en estado 'No tiene Reparación'" };
    }

    if (motivoSinReparacion !== "NO_HAY_PIEZA") {
      return {
        exito: false,
        error: "Solo se puede deshacer si el motivo es 'NO_HAY_PIEZA'. Esta reparación tiene otro motivo."
      };
    }

    // 3. Buscar el estado anterior en el historial
    const eventos = obtenerHistorial(resguardo);
    const eventoEstadoAnterior = eventos
      .filter(e => e.tipo === "estado_anterior_guardado")
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0]; // Más reciente

    let estadoAnterior = "Presupuesto Pendiente"; // fallback por defecto
    if (eventoEstadoAnterior && eventoEstadoAnterior.descripcion) {
      const match = eventoEstadoAnterior.descripcion.match(/Estado anterior: (.+)/);
      if (match && match[1]) {
        estadoAnterior = match[1];
      }
    }

    // 4. Restaurar estado anterior
    const cambios = {
      estado: estadoAnterior,
      motivo_sin_reparacion: "",
      ultimo_usuario: obtenerNombreUsuarioActual()
    };

    actualizarReparacion(resguardo, cambios);

    // 5. Agregar evento al historial
    agregarEventoHistorial(resguardo, "deshacer_sin_reparacion",
      `Deshecho "Sin Reparación". Estado restaurado a: ${estadoAnterior}`,
      obtenerNombreUsuarioActual());

    // 6. Procesar cola de historial
    if (HISTORIAL_QUEUE.length >= 5) {
      procesarColaHistorial();
    }

    // 7. Invalidar caché
    CacheService.getScriptCache().remove('metricas-dashboard');

    return {
      exito: true,
      mensaje: `Estado restaurado a: ${estadoAnterior}`,
      estadoRestaurado: estadoAnterior
    };

  } catch (error) {
    Logger.log(`Error al deshacer sin reparación: ${error.message}`);
    return { exito: false, error: error.message };
  }
}
