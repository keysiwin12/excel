/**
 * CONFIGURACIÓN GENERAL DEL SISTEMA - KELATOS MVP
 * Sistema de Gestión de Reparaciones
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

  // Colores corporativos
  colores: {
    primario: "#1768ea",      // Azul vibrante
    secundario: "#3633e1",    // Azul oscuro
    texto: "#373a3c",         // Gris oscuro
    fondo: "#ffffff",         // Blanco
    exito: "#28a745",         // Verde
    advertencia: "#ffc107",   // Amarillo
    peligro: "#dc3545",       // Rojo
    info: "#17a2b8"           // Cyan
  }
};

// ============================================
// CONFIGURACIÓN DEL SHEET
// ============================================
const SHEET_CONFIG = {
  spreadsheetId: "1yb0tqFy1p_krwiIX0fvuczsBoJXlxGz08UWAVTek6mU",
  nombre: "Consolidado",

  // Índices de columnas (0-based) - Basados en logs reales
  columnas: {
    resguardo: 0,                    // A - "Resguardo de Recepcion"
    fecha: 1,                        // B - "Fecha"
    fechaResponsablePpto: 2,         // C - "Responsable de presupuesto"
    fechaElaboracionPpto: 3,         // D - "Fecha de Elaboración de Presupuesto"
    tecnico: 4,                      // E - "Técnico que ha reparado el equipo"
    fechaReparacion: 5,              // F - "Fecha de Reparación"
    nombreCliente: 6,                // G - "Nombre de Cliente"
    telefono: 7,                     // H - "Telefono"
    email: 8,                        // I - "Correo electrónico"
    modeloMarcaEquipo: 9,            // J - "Modelo/Marca Equipo"
    sintoma: 10,                     // K - "Síntoma / Reparación"
    estado: 11,                      // L - "Estado"
    tiempoEntregaDias: 12,           // M - "TIEMPO (DÍAS) DE ENTREGA DE EQUIPO"
    costoReparacionSinIVA: 13,       // N - "Costo de Reparación sin IVA"
    costoPieza: 14,                  // O - "COSTO DE PIEZA"
    gananciaNeta: 15,                // P - "Ganancia Neta"
    responsableCompra: 16,           // Q - "Responsable de Compra"
    proveedor: 17,                   // R - "PROVEEDOR"
    enlaceCompra: 18,                // S - "ENLACES DE COMPRA"
    numeroPedido: 19,                // T - "NÚMERO DE PEDIDO DE COMPRA"
    fechaPedido: 20,                 // U - "FECHA DE PEDIDO"
    estadoPedido: 21,                // V - "Estado de Pedido"
    avisoWhatsappEstado: 22,         // W - "Aviso Wasap Estado"
    fechaLimitePpto: 23,             // X - "Fecha Límite Presupuesto"
    alertaPptoEnviada: 24,           // Y - "Alerta envío de presupuesto"
    motivoRechazo: 25,               // Z - "Motivo Rechazo de Presupuesto"
    fechaAceptacionPpto: 26,         // AA - "FECHA ACEPTACION DE PRESUPUESTO"
    fechaEntrega: 27,                // AB - "FECHA DE ENTREGA" (pieza)
    contactarProveedor: 28,          // AC - "CONTACTAR PROVEEDOR"
    fechaContacto1: 29,              // AD - "FECHA CONTACTO 1"
    recordatorioP1: 30,              // AE - "RECORDATORIO P1"
    numeroFactura: 31,               // AF - "NÚMERO DE FACTURA"
    fechaRecogida: 32,               // AG - "FECHA DE RECOGIDA POR EL CLIENTE"
    estadoRecogida: 33,              // AH - "ESTADO DE RECOGIDA"
    fichaMarca: 34,                  // AI - "FICHA /MARCA"
    colocoResena: 35,                // AJ - "Colocó Reseña"
    observaciones: 36,               // AK - "OBSERVACIONES"
    envioEncuesta: 37,               // AL - "Envío de Encuesta"
    envioEnlaceResena: 38,           // AM - "Envío de enlace para reseña"
    ingresoResena: 39,               // AN - "Ingresó Reseña?"
    obsEntregaEquipos: 40,           // AO - "Obs (Entrega de Equipos)"
    vacio: 41,                       // AP - "" (columna vacía)
    fechaUltimoRecordatorio: 42,     // AQ - "Fecha Último Recordatorio"
    tipoUltimoRecordatorio: 43,      // AR - "Tipo Último Recordatorio"
    contadorRecojosEnviados: 44      // AS - "Contador Recordatorios Recojo"
  }
};

// ============================================
// ESTADOS DE REPARACIÓN
// Flujo: Recepción -> Presupuesto -> Respuesta -> Pieza (opcional) -> Reparación -> Entrega
// ============================================
const ESTADOS_REPARACION = {
  // Fase 1: Recepción inicial
  "Presupuesto Pendiente": {
    color: "#17a2b8",
    icono: "📝",
    descripcion: "Pendiente de elaborar presupuesto (24h)",
    fase: 1
  },
  "Garantía": {
    color: "#6f42c1",
    icono: "🛡️",
    descripcion: "Equipo en garantía",
    fase: 1
  },

  // Fase 2: Presupuesto elaborado
  "Presupuesto Enviado": {
    color: "#6c757d",
    icono: "⏳",
    descripcion: "Esperando respuesta del cliente",
    fase: 2
  },

  // Fase 3: Respuesta del cliente
  "Presupuesto Aceptado": {
    color: "#28a745",
    icono: "✅",
    descripcion: "Cliente aceptó, proceder con reparación",
    fase: 3
  },
  "Presupuesto Rechazado": {
    color: "#dc3545",
    icono: "❌",
    descripcion: "Cliente rechazó, listo para recoger",
    fase: 3
  },

  // Fase 4: Pedido de pieza (si aplica)
  "Pieza Pendiente": {
    color: "#fd7e14",
    icono: "📦",
    descripcion: "Pieza pedida, esperando llegada",
    fase: 4
  },
  "Pieza Entregada": {
    color: "#20c997",
    icono: "✓📦",
    descripcion: "Pieza recibida, listo para reparar",
    fase: 4
  },

  // Fase 5: Reparación
  "En Reparación": {
    color: "#007bff",
    icono: "🔧",
    descripcion: "Técnico trabajando en la reparación",
    fase: 5
  },
  "Reparado": {
    color: "#28a745",
    icono: "✅",
    descripcion: "Reparación completada, listo para recoger",
    fase: 5
  },
  "No tiene Reparación": {
    color: "#6c757d",
    icono: "⚠️",
    descripcion: "No se pudo reparar, listo para recoger",
    fase: 5
  }
};

// ============================================
// ESTADOS DE PEDIDO DE PIEZA
// ============================================
const ESTADOS_PEDIDO = {
  "": {
    color: "#e9ecef",
    icono: "",
    descripcion: "Sin pedido"
  },
  "Pendiente": {
    color: "#6c757d",
    icono: "⏳",
    descripcion: "Aún no se ha pedido"
  },
  "Pedido": {
    color: "#17a2b8",
    icono: "📦",
    descripcion: "Pedido realizado al proveedor"
  },
  "En Tránsito": {
    color: "#ffc107",
    icono: "🚚",
    descripcion: "Enviado, esperando recepción"
  },
  "Recibido": {
    color: "#28a745",
    icono: "✅",
    descripcion: "Pieza recibida, listo para reparar"
  },
  "Cancelado": {
    color: "#dc3545",
    icono: "❌",
    descripcion: "Pedido cancelado"
  }
};

// ============================================
// ESTADOS DE RECOGIDA
// ============================================
const ESTADOS_RECOGIDA = {
  "PENDIENTE": {
    color: "#ffc107",
    icono: "⏳",
    descripcion: "Esperando que cliente recoja"
  },
  "ENTREGADO": {
    color: "#28a745",
    icono: "✅",
    descripcion: "Entregado al cliente"
  },
  "ENVIO": {
    color: "#17a2b8",
    icono: "📦",
    descripcion: "Enviado por mensajería"
  },
  "RECICLAJE": {
    color: "#6c757d",
    icono: "♻️",
    descripcion: "Equipo desechado"
  },
  "REVISAR MOVIL": {
    color: "#fd7e14",
    icono: "📱",
    descripcion: "Revisar móvil"
  }
};

// ============================================
// TÉCNICOS
// ============================================
const TECNICOS = [
  "Ivan",
  "Romer",
  "Nelson",
  "Repuesto"
];

// ============================================
// MARCAS DE EQUIPOS
// ============================================
const MARCAS_EQUIPOS = [
  "LenovoTech",
  "MsiTech",
  "DellTech",
  "DysonTech",
  "Tech4you HP",
  "SurfaceLabs",
  "AppleTech",
  "Don Cargador",
  "ThermomixTech",
  "Alquiler de Ordenadores",
  "Kelatos",
  "AcerTech",
  "PC4you",
  "ConvertVideo",
  "Dr. Recovery Data",
  "disco duro externo",
  "AsusTech"
];

// ============================================
// PROVEEDORES
// ============================================
const PROVEEDORES = [
  "TechParts España",
  "Amazon",
  "AliExpress",
  "PCComponentes",
  "Otro"
];

// ============================================
// CREDENCIALES NETELIP (SMS) - Mantener de tu config actual
// ============================================
const NETELIP = {
  token: "144253c56723e71e7da7da6ffb56d8f243270f3e4df17b68afc5e1b23d3332ac",
  from: "Kelatos",
  apiUrl: "https://api.netelip.com/v1/sms/api.php"
};

// ============================================
// CONFIGURACIÓN DE RECORDATORIOS - Mantener de tu config actual
// ============================================
const RECORDATORIOS_CONFIG = {
  diasEsperaAceptacion: 2,
  maxRecordatoriosRecojo: 20,
  diasEntreRecordatoriosRecojo: 2
};

// ============================================
// MODO PRUEBA - Mantener de tu config actual
// ============================================
const MODO_TEST = {
  activo: false,
  emailPrueba: "keysiwin12@gmail.com",
  telefonoPrueba: "51941536797"
};

// ============================================
// VALIDACIÓN DE USUARIOS
// ============================================
function validarUsuario(email) {
  // Para MVP: cualquier usuario de Google puede entrar
  return true;

  // Para producción, descomentar una de estas opciones:

  // Opción 1: Solo dominio específico
  // return email.endsWith('@kelatos.com');

  // Opción 2: Lista específica de emails
  // const autorizados = [
  //   'usuario1@gmail.com',
  //   'usuario2@kelatos.com'
  // ];
  // return autorizados.includes(email);
}
