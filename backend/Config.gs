/**
 * CONFIGURACIÓN GENERAL DEL SISTEMA - KELATOS v2
 * Sistema de Gestión de Reparaciones - Estructura Multi-Tabla
 */

// ============================================
// DATOS DE KELATOS
// ============================================
const KELATOS = {
  nombre: "Kelatos",
  direccion: "C. de Joaquín María López, 26, Chamberí, 28015 Madrid",
  horario: "Lunes a Viernes de 10:00 a 18:00",
  telefono: "918 29 46 60",
  email: "soporte@kelatos.com",
  logo: "https://kelatos.com/wp-content/uploads/2021/12/logo_web_kelatos.png",
  web: "https://kelatos.com",
  PRECIO_REVISION: 20,

  colores: {
    primario: "#1768ea",
    secundario: "#3633e1",
    texto: "#373a3c",
    fondo: "#ffffff",
    exito: "#28a745",
    advertencia: "#ffc107",
    peligro: "#dc3545",
    info: "#17a2b8"
  }
};

// ============================================
// CONFIGURACIÓN DE HOJAS (MULTI-TABLA)
// ============================================
const DB_ID = "1MmAZeCgSdmbRpXm2DeWEMLSWej1H08S6lBjDLgaYe4A";

const HOJAS = {
  empleados: {
    nombre: "Empleados",
    cols: {
      empleado_id: 0,
      nombre: 1,
      email: 2,
      rol: 3,
      es_tecnico: 4,
      es_comprador: 5,
      activo: 6
    }
  },

  proveedores: {
    nombre: "Provedores",
    cols: {
      provedor_id: 0,
      nombre: 1,
      notas: 2,
      activo: 3
    }
  },

  reparaciones: {
    nombre: "Reparaciones",
    cols: {
      resguardo: 0,
      fecha_recepcion: 1,
      cliente_nombre: 2,
      cliente_telefono: 3,
      cliente_email: 4,
      equipo_modelo: 5,
      sintoma: 6,
      estado: 7,
      presupuesto_aceptado_id: 8,
      tecnico_asignado: 9,
      fecha_reparacion: 10,
      resultado_reparacion: 11,
      numero_factura: 12,
      fecha_entrega: 13,
      estado_entrega: 14,
      observaciones: 15,
      creado_por: 16,
      fecha_creacion: 17,
      tipo_recepcion: 18,
      equipo_en_local: 19,
      entrega_mensajeria: 20,
      direccion_envio: 21,
      // Nueva columna JSON para cintas (optimizada)
      datos_cintas: 22,
      motivo_sin_reparacion: 23,
      tipo_ingreso: 24,
      ultimo_usuario: 25,
      presupuestos_modo: 26,
      revision_pagada: 27
    }
  },

  presupuestos: {
    nombre: "Presupuestos",
    cols: {
      presupuesto_id: 0,
      resguardo: 1,
      version: 2,
      fecha_elaboracion: 3,
      elaborado_por: 4,
      costo_reparacion: 5,
      costo_piezas: 6,
      total: 7,
      ganancia_neta: 8,
      dias_entrega: 9,
      estado: 10,
      fecha_envio: 11,
      fecha_respuesta: 12,
      motivo_rechazo: 13,
      notas: 14,
      tipo_pieza: 15,
      descripcion: 16,
      mano_obra: 17,
      precio_piezas: 18
    }
  },

  piezas: {
    nombre: "Piezas_Presupuesto",
    cols: {
      pieza_id: 0,
      presupuesto_id: 1,
      proveedor_id: 2,
      descripcion: 3,
      costo: 4,
      enlace: 5,
      notas: 6,
      precio: 7
    }
  },

  pedidos: {
    nombre: "PEDIDOS",
    cols: {
      pedido_id: 0,
      pieza_id: 1,
      resguardo: 2,
      comprado_por: 3,
      numero_pedido: 4,
      fecha_pedido: 5,
      fecha_estimada: 6,
      fecha_recepcion: 7,
      estado: 8,
      recibido_por: 9,
      problema_tipo: 10,
      codigo_devolucion: 11,
      pedido_remplazo_id: 12,
      notas: 13,
      fecha_devolucion: 14,
      enlace: 15
    }
  },

  historial: {
    nombre: "Historial",
    cols: {
      evento_id: 0,
      resguardo: 1,
      fecha_hora: 2,
      empleado_id: 3,
      tipo: 4,
      descripcion: 5,
      datos_extra: 6
    }
  },

  notificaciones: {
    nombre: "Notificaciones",
    cols: {
      notif_id: 0,
      resguardo: 1,
      presupuesto_id: 2,
      tipo: 3,
      canal: 4,
      destinatario: 5,
      // col 6 reservada (mensaje — en desuso)
      estado: 7,
      fecha_programada: 8,
      fecha_envio: 9,
      error: 10,
      numero_secuencia: 11,
      intentos: 12,
      id_externo: 13,
      datos_extra: 14
    }
  }
};

// ============================================
// ESTADOS DE REPARACIÓN
// ============================================
const ESTADOS_REPARACION = {
  "Presupuesto Pendiente": {
    color: "#17a2b8", icono: "📝",
    descripcion: "Pendiente de elaborar presupuesto (24h)", fase: 1
  },
  "Garantía": {
    color: "#6f42c1", icono: "🛡️",
    descripcion: "Equipo en garantía", fase: 1
  },
  "Presupuesto Enviado": {
    color: "#6c757d", icono: "⏳",
    descripcion: "Esperando respuesta del cliente", fase: 2
  },
  "Presupuesto Aceptado": {
    color: "#20c997", icono: "✅",
    descripcion: "Presupuesto aceptado, pendiente de registrar pedido de pieza", fase: 3
  },
  "Presupuesto Rechazado": {
    color: "#dc3545", icono: "❌",
    descripcion: "Cliente rechazó, listo para recoger", fase: 3
  },
  "Pieza Pendiente": {
    color: "#fd7e14", icono: "📦",
    descripcion: "Pieza pedida, esperando llegada", fase: 4
  },
  "En Tránsito": {
    color: "#ffc107", icono: "🚚",
    descripcion: "Pieza en camino", fase: 4
  },
  "Pieza Entregada": {
    color: "#20c997", icono: "✓📦",
    descripcion: "Pieza recibida, listo para reparar", fase: 4
  },
  "En Reparación": {
    color: "#007bff", icono: "🔧",
    descripcion: "Técnico trabajando en la reparación", fase: 5
  },
  "Reparado": {
    color: "#28a745", icono: "✅",
    descripcion: "Reparación completada, listo para recoger", fase: 5
  },
  "No tiene Reparación": {
    color: "#6c757d", icono: "⚠️",
    descripcion: "No se pudo reparar, listo para recoger", fase: 5
  }
};

// ============================================
// ESTADOS DE PEDIDO
// ============================================
const ESTADOS_PEDIDO = {
  "Pendiente": { color: "#6c757d", icono: "⏳", descripcion: "Aún no se ha pedido" },
  "Pedido": { color: "#17a2b8", icono: "📦", descripcion: "Pedido realizado" },
  "En Tránsito": { color: "#ffc107", icono: "🚚", descripcion: "En camino" },
  "Recibido": { color: "#28a745", icono: "✅", descripcion: "Pieza recibida" },
  "Cancelado": { color: "#dc3545", icono: "❌", descripcion: "Pedido cancelado" },
  "Problema": { color: "#dc3545", icono: "⚠️", descripcion: "Problema con la pieza" },
  "Pieza Rota": { color: "#dc3545", icono: "🔨", descripcion: "Pieza rota durante reparación" },
  "Pieza Defectuosa": { color: "#fd7e14", icono: "⚠️", descripcion: "Pieza defectuosa de fábrica" }
};

// ============================================
// ESTADOS DE RECOGIDA
// ============================================
const ESTADOS_RECOGIDA = {
  "PENDIENTE": { color: "#ffc107", icono: "⏳", descripcion: "Esperando que cliente recoja" },
  "ENTREGADO": { color: "#28a745", icono: "✅", descripcion: "Entregado al cliente" },
  "ENVIO": { color: "#17a2b8", icono: "📦", descripcion: "Enviado por mensajería" },
  "RECICLAJE": { color: "#6c757d", icono: "♻️", descripcion: "Equipo desechado" }
};

// ============================================
// ESTADOS DE PRESUPUESTO
// ============================================
const ESTADOS_PRESUPUESTO = {
  "borrador":  { color: "#6c757d", descripcion: "En elaboración" },
  "enviado":   { color: "#17a2b8", descripcion: "Enviado al cliente" },
  "aceptado":  { color: "#28a745", descripcion: "Aceptado por el cliente" },
  "rechazado": { color: "#dc3545", descripcion: "Rechazado por el cliente" },
  "anulado":   { color: "#6c757d", descripcion: "Anulado después de ser aceptado" }
};

// ============================================
// MARCAS DE EQUIPOS
// ============================================
const MARCAS_EQUIPOS = [
  "LenovoTech", "MsiTech", "DellTech", "DysonTech", "Tech4you HP",
  "SurfaceLabs", "AppleTech", "Don Cargador", "ThermomixTech",
  "Alquiler de Ordenadores", "Kelatos", "AcerTech", "PC4you",
  "ConvertVideo", "Dr. Recovery Data", "disco duro externo", "AsusTech"
];

// ============================================
// NETELIP (SMS) — token en Project Properties
// Guardar con: configurarTokenNetelip()
// ============================================
const NETELIP = {
  get token() { return PropertiesService.getScriptProperties().getProperty('NETELIP_TOKEN') || ''; },
  from: "Kelatos",
  apiUrl: "https://api.netelip.com/v1/sms/api.php"
};

/**
 * Guardar el token Netelip en las propiedades del proyecto.
 * Ejecutar UNA VEZ desde el editor de GAS tras rotar el token.
 * El token NUNCA debe estar en el código fuente.
 */
function configurarTokenNetelip() {
  const token = '144253c56723e71e7da7da6ffb56d8f243270f3e4df17b68afc5e1b23d3332ac';
  if (token === '144253c56723e71e7da7da6ffb56d8f243270f3e4df17b68afc5e1b23d3332ac') {
    throw new Error('Reemplaza el valor de la variable token antes de ejecutar esta función.');
  }
  PropertiesService.getScriptProperties().setProperty('NETELIP_TOKEN', token);
  Logger.log('✅ Token Netelip guardado en Project Properties. Elimina el valor del código.');
}

// ============================================
// CONFIGURACIÓN DE RECORDATORIOS
// ============================================
const RECORDATORIOS_CONFIG = {
  diasEsperaAceptacion: 2,
  maxRecordatoriosRecojo: 20,
  diasEntreRecordatoriosRecojo: 2,
  // Presupuesto enviado
  diasPrimerRecordatorio: 1,       // día siguiente al envío
  diasEntreRecordatorios: 2,       // cada 2 días
  diasVencimiento: 30,             // mensaje especial en día 30
  maxReintentos: 4                 // intentos máximos por registro fallido
};

// ============================================
// MODO PRUEBA
// ============================================
const MODO_TEST = {
  activo: false,
  emailPrueba: "keysiwin12@gmail.com",
  telefonoPrueba: "51941536797"
};
