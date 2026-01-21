/**
 * PEDIDOS.GS - Gestión de pedidos de piezas
 * Operaciones relacionadas con piezas y pedidos a proveedores
 */

// ============================================
// GESTIÓN DE PIEZAS
// ============================================

/**
 * Actualiza la información de la pieza de una reparación
 * @param {string} resguardo - Número de resguardo
 * @param {Object} datosPieza - Datos de la pieza
 * @returns {Object} Resultado de la operación
 */
function actualizarPieza(resguardo, datosPieza) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const col = SHEET_CONFIG.columnas;

    // Actualizar campos de pieza
    if (datosPieza.responsableCompra !== undefined) {
      sheet.getRange(numFila, col.responsableCompra + 1).setValue(datosPieza.responsableCompra);
    }

    if (datosPieza.proveedor !== undefined) {
      sheet.getRange(numFila, col.proveedor + 1).setValue(datosPieza.proveedor);
    }

    if (datosPieza.enlaceCompra !== undefined) {
      sheet.getRange(numFila, col.enlaceCompra + 1).setValue(datosPieza.enlaceCompra);
    }

    if (datosPieza.numeroPedido !== undefined) {
      sheet.getRange(numFila, col.numeroPedido + 1).setValue(datosPieza.numeroPedido);
    }

    if (datosPieza.fechaPedido !== undefined) {
      sheet.getRange(numFila, col.fechaPedido + 1).setValue(datosPieza.fechaPedido);
    }

    if (datosPieza.estadoPedido !== undefined) {
      sheet.getRange(numFila, col.estadoPedido + 1).setValue(datosPieza.estadoPedido);
    }

    if (datosPieza.fechaEntrega !== undefined) {
      sheet.getRange(numFila, col.fechaEntrega + 1).setValue(datosPieza.fechaEntrega);
    }

    if (datosPieza.contactarProveedor !== undefined) {
      sheet.getRange(numFila, col.contactarProveedor + 1).setValue(datosPieza.contactarProveedor);
    }

    if (datosPieza.fechaContacto1 !== undefined) {
      sheet.getRange(numFila, col.fechaContacto1 + 1).setValue(datosPieza.fechaContacto1);
    }

    // Agregar observación
    if (datosPieza.estadoPedido) {
      const infoEstado = obtenerInfoEstadoPedido(datosPieza.estadoPedido);
      agregarObservacion(resguardo, `${infoEstado.icono} Pedido actualizado: ${datosPieza.estadoPedido}`);
    }

    // Invalidar caché
    invalidarCaches();

    registrarLog('actualizar_pieza', 'Información de pieza actualizada', {
      resguardo: resguardo,
      datosPieza: datosPieza
    });

    return {
      exito: true,
      mensaje: "Información de pieza actualizada"
    };

  } catch (error) {
    Logger.log(`❌ Error al actualizar pieza: ${error.message}`);
    throw error;
  }
}

// ============================================
// CAMBIO DE ESTADO DE PEDIDO
// ============================================

/**
 * Cambia el estado de un pedido de pieza
 * @param {string} resguardo - Número de resguardo
 * @param {string} nuevoEstado - Nuevo estado del pedido
 * @param {Object} opciones - Opciones adicionales
 * @returns {Object} Resultado de la operación
 */
function cambiarEstadoPedido(resguardo, nuevoEstado, opciones) {
  try {
    opciones = opciones || {};

    // Validar que el estado existe
    if (!ESTADOS_PEDIDO[nuevoEstado]) {
      throw new Error(`Estado de pedido "${nuevoEstado}" no es válido`);
    }

    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const col = SHEET_CONFIG.columnas;
    const estadoAnterior = sheet.getRange(numFila, col.estadoPedido + 1).getValue();

    // Actualizar estado del pedido
    sheet.getRange(numFila, col.estadoPedido + 1).setValue(nuevoEstado);

    const ahora = new Date();

    // Acciones según el nuevo estado
    switch (nuevoEstado) {
      case "Pedido":
        // Registrar fecha de pedido si no existe
        const fechaPedidoActual = sheet.getRange(numFila, col.fechaPedido + 1).getValue();
        if (!fechaPedidoActual) {
          sheet.getRange(numFila, col.fechaPedido + 1).setValue(ahora);
        }
        break;

      case "Recibido":
        // Registrar fecha de entrega real
        sheet.getRange(numFila, col.fechaEntrega + 1).setValue(ahora);

        // IMPORTANTE: Cambiar estado de reparación automáticamente
        const estadoReparacion = sheet.getRange(numFila, col.estado + 1).getValue();
        if (estadoReparacion === "Esperando Pieza") {
          cambiarEstadoReparacion(resguardo, "Reparando", {
            observacion: "Pieza recibida, lista para reparar",
            notificar: false
          });
        }
        break;

      case "Cancelado":
        // Agregar observación especial
        agregarObservacion(resguardo, `⚠️ Pedido cancelado${opciones.motivo ? `: ${opciones.motivo}` : ""}`);
        break;
    }

    // Agregar observación del cambio de estado
    const infoEstado = obtenerInfoEstadoPedido(nuevoEstado);
    agregarObservacion(resguardo, `${infoEstado.icono} Estado del pedido: ${nuevoEstado}`);

    // Invalidar caché
    invalidarCaches();

    registrarLog('cambio_estado_pedido', `Estado del pedido cambiado a ${nuevoEstado}`, {
      resguardo: resguardo,
      estadoAnterior: estadoAnterior,
      nuevoEstado: nuevoEstado
    });

    return {
      exito: true,
      mensaje: `Estado del pedido cambiado a "${nuevoEstado}"`,
      estadoAnterior: estadoAnterior,
      nuevoEstado: nuevoEstado
    };

  } catch (error) {
    Logger.log(`❌ Error al cambiar estado del pedido: ${error.message}`);
    throw error;
  }
}

// ============================================
// PEDIDOS PENDIENTES Y RETRASADOS
// ============================================

/**
 * Obtiene todos los pedidos activos (Pedido + En Tránsito)
 * @returns {Array} Lista de pedidos activos
 */
function obtenerPedidosActivos() {
  try {
    const data = getAllData();
    const pedidos = {
      enTransito: [],
      pedidos: [],
      retrasados: []
    };

    const hoy = new Date();

    for (let i = 1; i < data.length; i++) {
      const fila = data[i];

      // Saltar vacías
      if (!fila[SHEET_CONFIG.columnas.nombreCliente]) continue;

      const estadoPedido = fila[SHEET_CONFIG.columnas.estadoPedido];

      // Solo pedidos activos
      if (estadoPedido === "Pedido" || estadoPedido === "En Tránsito") {
        const pedido = convertirFilaAObjeto(fila, i + 1);
        const fechaEntregaEsperada = fila[SHEET_CONFIG.columnas.fechaEntrega];

        // Verificar si está retrasado
        const estaRetrasado = fechaEntregaEsperada && new Date(fechaEntregaEsperada) < hoy;

        if (estaRetrasado) {
          pedido.diasRetraso = calcularDiasTranscurridos(fechaEntregaEsperada, hoy);
          pedidos.retrasados.push(pedido);
        } else {
          if (estadoPedido === "En Tránsito") {
            pedidos.enTransito.push(pedido);
          } else {
            pedidos.pedidos.push(pedido);
          }
        }
      }
    }

    return pedidos;

  } catch (error) {
    Logger.log(`❌ Error al obtener pedidos activos: ${error.message}`);
    throw error;
  }
}

/**
 * Obtiene pedidos retrasados
 * @returns {Array} Lista de pedidos retrasados
 */
function obtenerPedidosRetrasados() {
  try {
    const data = getAllData();
    const retrasados = [];
    const hoy = new Date();

    for (let i = 1; i < data.length; i++) {
      const fila = data[i];

      // Saltar vacías
      if (!fila[SHEET_CONFIG.columnas.nombreCliente]) continue;

      const estadoPedido = fila[SHEET_CONFIG.columnas.estadoPedido];
      const fechaEntregaEsperada = fila[SHEET_CONFIG.columnas.fechaEntrega];

      // Solo pedidos activos con fecha de entrega pasada
      if ((estadoPedido === "Pedido" || estadoPedido === "En Tránsito") &&
        fechaEntregaEsperada &&
        new Date(fechaEntregaEsperada) < hoy) {

        const pedido = convertirFilaAObjeto(fila, i + 1);
        pedido.diasRetraso = calcularDiasTranscurridos(fechaEntregaEsperada, hoy);

        retrasados.push(pedido);
      }
    }

    // Ordenar por días de retraso (mayor primero)
    retrasados.sort((a, b) => b.diasRetraso - a.diasRetraso);

    return retrasados;

  } catch (error) {
    Logger.log(`❌ Error al obtener pedidos retrasados: ${error.message}`);
    throw error;
  }
}

/**
 * Marca un pedido como "contactar proveedor"
 * @param {string} resguardo - Número de resguardo
 * @param {Date} fechaRecordatorio - Fecha para recordar contactar (opcional)
 * @returns {Object} Resultado de la operación
 */
function marcarContactarProveedor(resguardo, fechaRecordatorio) {
  try {
    const sheet = getSheet();
    const numFila = encontrarFilaPorResguardo(resguardo);

    if (!numFila) {
      throw new Error(`Reparación ${resguardo} no encontrada`);
    }

    const col = SHEET_CONFIG.columnas;
    const ahora = new Date();

    // Marcar contactar proveedor
    sheet.getRange(numFila, col.contactarProveedor + 1).setValue(true);

    // Registrar fecha de contacto
    sheet.getRange(numFila, col.fechaContacto1 + 1).setValue(ahora);

    // Si se proporciona fecha de recordatorio
    if (fechaRecordatorio) {
      sheet.getRange(numFila, col.recordatorioP1 + 1).setValue(fechaRecordatorio);
    }

    // Agregar observación
    agregarObservacion(resguardo, `⚠️ Marcado para contactar proveedor${fechaRecordatorio ? ` - Recordar: ${formatearFecha(fechaRecordatorio)}` : ""}`);

    registrarLog('contactar_proveedor', 'Marcado para contactar proveedor', {
      resguardo: resguardo,
      fechaRecordatorio: fechaRecordatorio
    });

    return {
      exito: true,
      mensaje: "Marcado para contactar proveedor"
    };

  } catch (error) {
    Logger.log(`❌ Error al marcar contactar proveedor: ${error.message}`);
    throw error;
  }
}

// ============================================
// TRIGGERS Y AUTOMATIZACIONES
// ============================================

/**
 * Verifica pedidos retrasados (ejecutar diariamente con trigger)
 * Marca automáticamente como "contactar proveedor" si llevan +2 días de retraso
 */
function verificarPedidosRetrasadosAutomatico() {
  try {
    const retrasados = obtenerPedidosRetrasados();

    Logger.log(`🔍 Verificando pedidos retrasados: ${retrasados.length} encontrados`);

    let marcados = 0;

    retrasados.forEach(pedido => {
      // Si lleva más de 2 días de retraso y no está marcado para contactar
      if (pedido.diasRetraso >= 2 && !pedido.pieza.contactarProveedor) {
        marcarContactarProveedor(pedido.resguardo);
        marcados++;
      }
    });

    Logger.log(`✅ Pedidos marcados para contactar: ${marcados}`);

    return {
      exito: true,
      retrasados: retrasados.length,
      marcados: marcados
    };

  } catch (error) {
    Logger.log(`❌ Error en verificación automática: ${error.message}`);
    throw error;
  }
}

/**
 * Obtiene estadísticas de pedidos
 * @returns {Object} Estadísticas
 */
function obtenerEstadisticasPedidos() {
  try {
    const data = getAllData();
    const stats = {
      total: 0,
      pendiente: 0,
      pedido: 0,
      enTransito: 0,
      recibido: 0,
      cancelado: 0,
      retrasados: 0,
      promedioEntrega: 0
    };

    const tiemposEntrega = [];
    const hoy = new Date();

    for (let i = 1; i < data.length; i++) {
      const fila = data[i];

      // Saltar vacías
      if (!fila[SHEET_CONFIG.columnas.nombreCliente]) continue;

      const estadoPedido = fila[SHEET_CONFIG.columnas.estadoPedido];

      if (estadoPedido) {
        stats.total++;

        switch (estadoPedido) {
          case "Pendiente":
            stats.pendiente++;
            break;
          case "Pedido":
            stats.pedido++;
            break;
          case "En Tránsito":
            stats.enTransito++;
            break;
          case "Recibido":
            stats.recibido++;

            // Calcular tiempo de entrega
            const fechaPedido = fila[SHEET_CONFIG.columnas.fechaPedido];
            const fechaEntrega = fila[SHEET_CONFIG.columnas.fechaEntrega];
            if (fechaPedido && fechaEntrega) {
              const dias = calcularDiasTranscurridos(fechaPedido, fechaEntrega);
              tiemposEntrega.push(dias);
            }
            break;
          case "Cancelado":
            stats.cancelado++;
            break;
        }

        // Verificar si está retrasado
        if (estadoPedido === "Pedido" || estadoPedido === "En Tránsito") {
          const fechaEntregaEsperada = fila[SHEET_CONFIG.columnas.fechaEntrega];
          if (fechaEntregaEsperada && new Date(fechaEntregaEsperada) < hoy) {
            stats.retrasados++;
          }
        }
      }
    }

    // Calcular promedio de entrega
    if (tiemposEntrega.length > 0) {
      const suma = tiemposEntrega.reduce((a, b) => a + b, 0);
      stats.promedioEntrega = Math.round(suma / tiemposEntrega.length);
    }

    return stats;

  } catch (error) {
    Logger.log(`❌ Error al obtener estadísticas: ${error.message}`);
    throw error;
  }
}
