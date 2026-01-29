/**
 * PEDIDOS.GS - Gestión de pedidos de piezas (Multi-Tabla)
 * Opera sobre la tabla PEDIDOS separada
 */

// ============================================
// REGISTRAR PEDIDO
// ============================================

/**
 * Registra pedidos de piezas para una reparación (uno por pieza)
 * @param {string} resguardo
 * @param {Object} datos - {compradoPor, fechaPedido, piezas: [{piezaId, descripcion, proveedor, enlace, numeroPedido, fechaEstimada}]}
 * @returns {Object}
 */
function registrarPedidoPieza(resguardo, datos) {
  try {
    const numFila = encontrarFilaPorResguardo(resguardo);
    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const colPed = HOJAS.pedidos.cols;
    const piezas = datos.piezas || [];
    const pedidosCreados = [];

    // Si no hay array de piezas, crear un solo pedido (retrocompatibilidad)
    if (piezas.length === 0) {
      piezas.push({
        piezaId: datos.piezaId || "",
        descripcion: datos.descripcion || "",
        proveedor: datos.proveedor || "",
        enlace: datos.enlace || "",
        numeroPedido: datos.numeroPedido || "",
        fechaEstimada: datos.fechaEstimada || ""
      });
    }

    for (const pieza of piezas) {
      const pedidoId = generarId("PED", "pedidos", "pedido_id");

      const filaPed = new Array(Object.keys(colPed).length).fill("");
      filaPed[colPed.pedido_id] = pedidoId;
      filaPed[colPed.pieza_id] = pieza.piezaId || "";
      filaPed[colPed.resguardo] = resguardo;
      filaPed[colPed.comprado_por] = datos.compradoPor || Session.getActiveUser().getEmail();
      filaPed[colPed.numero_pedido] = pieza.numeroPedido || "";
      filaPed[colPed.fecha_pedido] = datos.fechaPedido ? new Date(datos.fechaPedido) : new Date();
      filaPed[colPed.fecha_estimada] = pieza.fechaEstimada ? new Date(pieza.fechaEstimada) : "";
      filaPed[colPed.estado] = "En Tránsito";
      filaPed[colPed.notas] = pieza.descripcion || "";

      agregarFila("pedidos", filaPed);
      pedidosCreados.push(pedidoId);
    }

    // Cambiar estado de la reparación a "Pieza Pendiente" (una sola vez)
    actualizarCelda("reparaciones", numFila, "estado", "Pieza Pendiente");

    // Historial
    agregarEventoHistorial(
      resguardo,
      "pedido_registrado",
      `${pedidosCreados.length} pedido(s) registrado(s): ${pedidosCreados.join(", ")}`
    );

    invalidarCaches();

    // Retornar con la lista actualizada de pedidos
    const pedidosActualizados = obtenerPedidosDeReparacion(resguardo);

    return {
      exito: true,
      pedidoIds: pedidosCreados,
      nuevoEstado: "Pieza Pendiente",
      pedidos: pedidosActualizados,
      mensaje: `${pedidosCreados.length} pedido(s) registrado(s) exitosamente`
    };

  } catch (error) {
    Logger.log(`Error al registrar pedido: ${error.message}`);
    throw error;
  }
}

// ============================================
// CAMBIO DE ESTADO DE PEDIDO
// ============================================

/**
 * Cambia el estado de un pedido
 * @param {string} pedidoId - ID del pedido
 * @param {string} nuevoEstado
 * @param {Object} opciones - {recibidoPor, motivo}
 * @returns {Object}
 */
function cambiarEstadoPedido(pedidoId, nuevoEstado, opciones) {
  try {
    opciones = opciones || {};

    if (!ESTADOS_PEDIDO[nuevoEstado]) {
      throw new Error(`Estado de pedido "${nuevoEstado}" no es válido`);
    }

    const resultado = buscarPorId("pedidos", "pedido_id", pedidoId);
    if (!resultado) {
      throw new Error(`Pedido ${pedidoId} no encontrado`);
    }

    const colPed = HOJAS.pedidos.cols;
    const resguardo = resultado.fila[colPed.resguardo];
    const estadoAnterior = resultado.fila[colPed.estado];

    // Actualizar estado
    const cambios = { estado: nuevoEstado };

    if (nuevoEstado === "Recibido") {
      cambios.fecha_recepcion = new Date();
      cambios.recibido_por = opciones.recibidoPor || Session.getActiveUser().getEmail();
    }

    actualizarCeldas("pedidos", resultado.numFila, cambios);

    // Si es "Recibido", verificar si todos los pedidos de esta reparación están recibidos
    if (nuevoEstado === "Recibido") {
      const pedidosReparacion = obtenerPedidosDeReparacion(resguardo);
      const todosRecibidos = pedidosReparacion.every(p => {
        return p.estado === "Recibido" || p.estado === "Cancelado" ||
               p.estado === "Problema" || p.estado === "Pieza Rota" ||
               p.estado === "Pieza Defectuosa" || p.pedidoId === pedidoId;
      });

      if (todosRecibidos) {
        // Cambiar estado de la reparación a "Pieza Entregada"
        const numFilaRep = encontrarFilaPorResguardo(resguardo);
        if (numFilaRep) {
          actualizarCelda("reparaciones", numFilaRep, "estado", "Pieza Entregada");
        }
      }
    }

    // Historial
    agregarEventoHistorial(
      resguardo,
      "pedido_estado",
      `Pedido ${pedidoId}: ${estadoAnterior} → ${nuevoEstado}`
    );

    invalidarCaches();

    return {
      exito: true,
      mensaje: `Estado del pedido cambiado a "${nuevoEstado}"`,
      estadoAnterior: estadoAnterior,
      nuevoEstado: nuevoEstado
    };

  } catch (error) {
    Logger.log(`Error al cambiar estado del pedido: ${error.message}`);
    throw error;
  }
}

// ============================================
// CONSULTAS DE PEDIDOS
// ============================================

/**
 * Obtiene todos los pedidos activos categorizados
 * @returns {Object} {enTransito, pedidos, retrasados}
 */
function obtenerPedidosActivos() {
  try {
    const colPed = HOJAS.pedidos.cols;
    const data = obtenerTodoConHeader("pedidos");
    const hoy = new Date();

    const resultado = {
      enTransito: [],
      pedidos: [],
      retrasados: []
    };

    for (let i = 1; i < data.length; i++) {
      const fila = data[i];
      const estado = fila[colPed.estado];

      if (estado !== "Pedido" && estado !== "En Tránsito") continue;

      const pedido = convertirFilaAPedido(fila, i + 1);
      const fechaEstimada = fila[colPed.fecha_estimada];
      const estaRetrasado = fechaEstimada && new Date(fechaEstimada) < hoy;

      if (estaRetrasado) {
        pedido.diasRetraso = calcularDiasTranscurridos(fechaEstimada, hoy);
        resultado.retrasados.push(pedido);
      } else if (estado === "En Tránsito") {
        resultado.enTransito.push(pedido);
      } else {
        resultado.pedidos.push(pedido);
      }
    }

    return resultado;

  } catch (error) {
    Logger.log(`Error al obtener pedidos activos: ${error.message}`);
    throw error;
  }
}

/**
 * Obtiene estadísticas de pedidos
 * @returns {Object}
 */
function obtenerEstadisticasPedidos() {
  try {
    const colPed = HOJAS.pedidos.cols;
    const data = obtenerTodoConHeader("pedidos");
    const hoy = new Date();

    const stats = {
      total: 0,
      pendiente: 0,
      pedido: 0,
      enTransito: 0,
      recibido: 0,
      cancelado: 0,
      problema: 0,
      retrasados: 0,
      promedioEntrega: 0
    };

    const tiemposEntrega = [];

    for (let i = 1; i < data.length; i++) {
      const fila = data[i];
      const estado = fila[colPed.estado];
      if (!estado) continue;

      stats.total++;

      switch (estado) {
        case "Pendiente": stats.pendiente++; break;
        case "Pedido": stats.pedido++; break;
        case "En Tránsito": stats.enTransito++; break;
        case "Recibido":
          stats.recibido++;
          const fechaPed = fila[colPed.fecha_pedido];
          const fechaRec = fila[colPed.fecha_recepcion];
          if (fechaPed && fechaRec) {
            tiemposEntrega.push(calcularDiasTranscurridos(fechaPed, fechaRec));
          }
          break;
        case "Cancelado": stats.cancelado++; break;
        case "Problema": stats.problema++; break;
      }

      // Retrasados
      if (estado === "Pedido" || estado === "En Tránsito") {
        const fechaEstimada = fila[colPed.fecha_estimada];
        if (fechaEstimada && new Date(fechaEstimada) < hoy) {
          stats.retrasados++;
        }
      }
    }

    if (tiemposEntrega.length > 0) {
      const suma = tiemposEntrega.reduce((a, b) => a + b, 0);
      stats.promedioEntrega = Math.round(suma / tiemposEntrega.length);
    }

    return stats;

  } catch (error) {
    Logger.log(`Error al obtener estadísticas: ${error.message}`);
    throw error;
  }
}
