/**
 * CONFIGURACIÓN GENERAL DEL SISTEMA
 * Kelatos - Sistema de Recordatorios Automáticos
 */

// ============================================
// DATOS DE KELATOS
// ============================================
const KELATOS = {
  direccion: "C. de Joaquín María López, 26, Chamberí, 28015 Madrid",
  horario: "Lunes a Viernes de 10:00 a 18:00",
  telefono: "918 29 46 60",
  email: "soporte@kelatos.com",
  formasPago: "Efectivo, Tarjeta, Bizum o Transferencia"
};

// ============================================
// CREDENCIALES NETELIP (SMS)
// ============================================
const NETELIP = {
  token: "144253c56723e71e7da7da6ffb56d8f243270f3e4df17b68afc5e1b23d3332ac",
  from: "Kelatos",
  apiUrl: "https://api.netelip.com/v1/sms/api.php"
};

// ============================================
// CONFIGURACIÓN DEL SHEET
// ============================================
const SHEET_CONFIG = {
  nombre: "Consolidado", // ← CAMBIAR POR EL NOMBRE REAL DE TU HOJA
  
  // Índices de columnas (0-based)
 columnas: {
    nombreCliente: 6,        // G - Nombre de Cliente
    telefono: 7,             // H - Telefono
    email: 8,                // I - Correo electrónico
    equipo: 9,               // J - Modelo/Marca Equipo
    estado: 11,              // L - Estado ← CORREGIDO
    fechaElaboracionPpto: 3, // D - Fecha de Elaboración de Presupuesto // D - Fecha de Elaboración de Presupuesto
    estadoRecogida: null,    // Se busca dinámicamente "ESTADO DE RECOGIDA"
    
    // Columnas de tracking (se crean automáticamente)
    fechaUltimoRecordatorio: null,
    tipoUltimoRecordatorio: null,
    contadorRecojosEnviados: null
  }
};

// ============================================
// TIPOS DE RECORDATORIOS
// ============================================
const TIPOS_RECORDATORIO = {
  aceptacion: "aceptacion_ppto",
  recojoInmediatoReparado: "recojo_inmediato_reparado",
  recojoInmediatoNoReparacion: "recojo_inmediato_no_reparacion",
  recojoInmediatoRechazado: "recojo_inmediato_rechazado",
  recojoSemanal: "recojo_semanal"
};

// ============================================
// ESTADOS DEL SHEET
// ============================================
const ESTADOS = {
  presupuestoEnviado: "Presupuesto Enviado",
  reparado: "Reparado",
  noTieneReparacion: "No tiene Reparación",
  presupuestoRechazado: "Presupuesto Rechazado",
  
  // Estados de recogida
  entregado: "ENTREGADO",
  pendiente: "PENDIENTE"
};

// ============================================
// CONFIGURACIÓN DE RECORDATORIOS
// ============================================
const RECORDATORIOS_CONFIG = {
  diasEsperaAceptacion: 2,        // Días después de enviar presupuesto
  maxRecordatoriosRecojo: 20,  
  diasEntreRecordatoriosRecojo: 2 // Cada 2 días
};


// ============================================
// MODO PRUEBA
// ============================================
// ============================================
// MODO PRUEBA
// ============================================
const MODO_TEST = {
  activo: false, // Se activará solo cuando ejecutes la función de prueba
  emailPrueba: "keysiwin12@gmail.com",
  telefonoPrueba: "51941536797" // ← AGREGAR ESTA LÍNEA
};
