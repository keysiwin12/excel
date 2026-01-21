/**
 * LÓGICA PRINCIPAL
 * Procesa filas y decide qué recordatorios enviar
 * Kelatos - Sistema de Recordatorios Automáticos
 */

// ============================================
// FUNCIÓN PRINCIPAL - TRIGGER DIARIO
// ============================================
function verificarRecordatorios() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_CONFIG.nombre);
  
  if (!sheet) {
    Logger.log("ERROR: No se encontró la hoja " + SHEET_CONFIG.nombre);
    return;
  }
  
  // Inicializar columnas de tracking si no existen
  inicializarColumnasTracking(sheet);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  // Buscar índice de "ESTADO DE RECOGIDA" dinámicamente
  SHEET_CONFIG.columnas.estadoRecogida = headers.indexOf("ESTADO DE RECOGIDA");
  
  if (SHEET_CONFIG.columnas.estadoRecogida === -1) {
    Logger.log("ERROR: No se encontró la columna 'ESTADO DE RECOGIDA'");
    return;
  }
  
  const hoy = new Date();
  
  Logger.log(`Iniciando verificación - ${hoy.toDateString()}`);
  
  // Procesar desde fila 2 (índice 1)
  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    
    // Saltar filas vacías
    if (!fila[SHEET_CONFIG.columnas.nombreCliente]) continue;
    
    // CASO 1: Recordatorio aceptación presupuesto
    if (debeEnviarRecordatorioAceptacion(fila, hoy)) {
      enviarRecordatorioAceptacion(fila, sheet, i + 1);
    }
    
    // CASO 2: Aviso recojo inmediato (primera vez)
    else if (debeEnviarAvisoRecojoInmediato(fila)) {
      enviarAvisoRecojoInmediato(fila, sheet, i + 1);
    }
    
    // CASO 3: Recordatorio seguimiento (cada 2 días)
    else if (debeEnviarRecordatorioSeguimiento(fila, hoy)) {
      enviarRecordatorioSeguimiento(fila, sheet, i + 1);
    }
  }
  
  Logger.log("Proceso completado");
}

// ============================================
// CONDICIONES DE ENVÍO
// ============================================

function debeEnviarRecordatorioAceptacion(fila, hoy) {
  const estado = fila[SHEET_CONFIG.columnas.estado];
  const fechaPpto = fila[SHEET_CONFIG.columnas.fechaElaboracionPpto];
  const tipoUltimo = fila[SHEET_CONFIG.columnas.tipoUltimoRecordatorio];
  const fechaUltimo = fila[SHEET_CONFIG.columnas.fechaUltimoRecordatorio];
  
  // Solo si está en "Presupuesto Enviado"
  if (estado !== ESTADOS.presupuestoEnviado) return false;
  
  // Verificar que tenga fecha de presupuesto
  if (!fechaPpto) return false;
  
  // Calcular días desde elaboración
  const fechaPptoDate = new Date(fechaPpto);
  const diasDesde = Math.floor((hoy - fechaPptoDate) / (1000 * 60 * 60 * 24));
  if (diasDesde < RECORDATORIOS_CONFIG.diasEsperaAceptacion) return false;
  
  // No enviar si ya se envió hoy
  if (fechaUltimo && esMismaFecha(new Date(fechaUltimo), hoy) && 
      tipoUltimo === TIPOS_RECORDATORIO.aceptacion) {
    return false;
  }
  
  return true;
}

function debeEnviarAvisoRecojoInmediato(fila) {
  const estado = fila[SHEET_CONFIG.columnas.estado];
  const estadoRecogida = fila[SHEET_CONFIG.columnas.estadoRecogida];
  const tipoUltimo = fila[SHEET_CONFIG.columnas.tipoUltimoRecordatorio];
  
  // Estados que requieren recojo
  const estadosRecojo = [
    ESTADOS.reparado, 
    ESTADOS.noTieneReparacion, 
    ESTADOS.presupuestoRechazado
  ];
  
  if (!estadosRecojo.includes(estado)) return false;
  if (estadoRecogida === ESTADOS.entregado) return false;
  
  // ENVIAR INMEDIATO: Si nunca se envió aviso de recojo
  if (!tipoUltimo || !tipoUltimo.startsWith("recojo_")) return true;
  
  return false;
}

function debeEnviarRecordatorioSeguimiento(fila, hoy) {
  const estado = fila[SHEET_CONFIG.columnas.estado];
  const estadoRecogida = fila[SHEET_CONFIG.columnas.estadoRecogida];
  const fechaUltimo = fila[SHEET_CONFIG.columnas.fechaUltimoRecordatorio];
  const contador = fila[SHEET_CONFIG.columnas.contadorRecojosEnviados] || 0;
  const tipoUltimo = fila[SHEET_CONFIG.columnas.tipoUltimoRecordatorio];
  
  // Estados que requieren recojo
  const estadosRecojo = [
    ESTADOS.reparado, 
    ESTADOS.noTieneReparacion, 
    ESTADOS.presupuestoRechazado
  ];
  
  if (!estadosRecojo.includes(estado)) return false;
  if (estadoRecogida !== ESTADOS.pendiente) return false;
  if (contador >= RECORDATORIOS_CONFIG.maxRecordatoriosRecojo) return false;
  
  // Debe haber recibido al menos el aviso inmediato
  if (!tipoUltimo || !tipoUltimo.startsWith("recojo_")) return false;
  
  // Verificar que hayan pasado 2 días desde el último
  if (!fechaUltimo) return false;
  const fechaUltimoDate = new Date(fechaUltimo);
  const diasDesde = Math.floor((hoy - fechaUltimoDate) / (1000 * 60 * 60 * 24));
  
  return diasDesde >= RECORDATORIOS_CONFIG.diasEntreRecordatoriosRecojo;
}

// ============================================
// ENVÍO DE RECORDATORIOS
// ============================================

function enviarRecordatorioAceptacion(fila, sheet, numFila) {
  const cliente = fila[SHEET_CONFIG.columnas.nombreCliente];
  const telefono = fila[SHEET_CONFIG.columnas.telefono];
  const email = fila[SHEET_CONFIG.columnas.email];
  const equipo = fila[SHEET_CONFIG.columnas.equipo];
  
  // Enviar notificaciones
  enviarEmailAceptacion(email, cliente, equipo);
  enviarSMSAceptacion(telefono, cliente);
  
  // Actualizar tracking
  actualizarTracking(sheet, numFila, TIPOS_RECORDATORIO.aceptacion, 0);
  
  Logger.log(`✓ Recordatorio aceptación enviado: ${cliente} - ${equipo}`);
}

function enviarAvisoRecojoInmediato(fila, sheet, numFila) {
  const estado = fila[SHEET_CONFIG.columnas.estado];
  const cliente = fila[SHEET_CONFIG.columnas.nombreCliente];
  const telefono = fila[SHEET_CONFIG.columnas.telefono];
  const email = fila[SHEET_CONFIG.columnas.email];
  const equipo = fila[SHEET_CONFIG.columnas.equipo];
  
  let tipo;
  if (estado === ESTADOS.reparado) {
    tipo = TIPOS_RECORDATORIO.recojoInmediatoReparado;
    enviarEmailRecojoReparado(email, cliente, equipo);
    enviarSMSRecojoReparado(telefono, cliente);
  } else if (estado === ESTADOS.noTieneReparacion) {
    tipo = TIPOS_RECORDATORIO.recojoInmediatoNoReparacion;
    enviarEmailRecojoNoReparacion(email, cliente, equipo);
    enviarSMSRecojoNoReparacion(telefono, cliente);
  } else {
    tipo = TIPOS_RECORDATORIO.recojoInmediatoRechazado;
    enviarEmailRecojoRechazado(email, cliente, equipo);
    enviarSMSRecojoRechazado(telefono, cliente);
  }
  
  actualizarTracking(sheet, numFila, tipo, 1);
  
  Logger.log(`✓ Aviso recojo INMEDIATO enviado: ${cliente} - ${estado}`);
}

function enviarRecordatorioSeguimiento(fila, sheet, numFila) {
  const estado = fila[SHEET_CONFIG.columnas.estado];
  const cliente = fila[SHEET_CONFIG.columnas.nombreCliente];
  const telefono = fila[SHEET_CONFIG.columnas.telefono];
  const email = fila[SHEET_CONFIG.columnas.email];
  const equipo = fila[SHEET_CONFIG.columnas.equipo];
  const contador = (fila[SHEET_CONFIG.columnas.contadorRecojosEnviados] || 0) + 1;
  
  // Usar el mismo mensaje según el estado
  if (estado === ESTADOS.reparado) {
    enviarEmailRecojoReparado(email, cliente, equipo);
    enviarSMSRecojoReparado(telefono, cliente);
  } else if (estado === ESTADOS.noTieneReparacion) {
    enviarEmailRecojoNoReparacion(email, cliente, equipo);
    enviarSMSRecojoNoReparacion(telefono, cliente);
  } else {
    enviarEmailRecojoRechazado(email, cliente, equipo);
    enviarSMSRecojoRechazado(telefono, cliente);
  }
  
  actualizarTracking(sheet, numFila, TIPOS_RECORDATORIO.recojoSeguimiento, contador);
  
  Logger.log(`✓ Recordatorio seguimiento enviado: ${cliente} - Intento ${contador}/20`);
}

// ============================================
// UTILIDADES
// ============================================

function actualizarTracking(sheet, numFila, tipo, contador) {
  const hoy = new Date();
  sheet.getRange(numFila, SHEET_CONFIG.columnas.fechaUltimoRecordatorio + 1)
    .setValue(hoy);
  sheet.getRange(numFila, SHEET_CONFIG.columnas.tipoUltimoRecordatorio + 1)
    .setValue(tipo);
  
  if (contador > 0) {
    sheet.getRange(numFila, SHEET_CONFIG.columnas.contadorRecojosEnviados + 1)
      .setValue(contador);
  }
}

function esMismaFecha(fecha1, fecha2) {
  return fecha1.toDateString() === fecha2.toDateString();
}

function inicializarColumnasTracking(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Buscar o crear columnas de tracking
  let colFecha = headers.indexOf("Fecha Último Recordatorio");
  let colTipo = headers.indexOf("Tipo Último Recordatorio");
  let colContador = headers.indexOf("Contador Recordatorios Recojo");
  
  const ultimaCol = sheet.getLastColumn();
  let nuevaCol = ultimaCol;
  
  if (colFecha === -1) {
    nuevaCol++;
    sheet.getRange(1, nuevaCol).setValue("Fecha Último Recordatorio");
    colFecha = nuevaCol - 1;
  }
  if (colTipo === -1) {
    nuevaCol++;
    sheet.getRange(1, nuevaCol).setValue("Tipo Último Recordatorio");
    colTipo = nuevaCol - 1;
  }
  if (colContador === -1) {
    nuevaCol++;
    sheet.getRange(1, nuevaCol).setValue("Contador Recordatorios Recojo");
    colContador = nuevaCol - 1;
  }
  
  SHEET_CONFIG.columnas.fechaUltimoRecordatorio = colFecha;
  SHEET_CONFIG.columnas.tipoUltimoRecordatorio = colTipo;
  SHEET_CONFIG.columnas.contadorRecojosEnviados = colContador;
  
  Logger.log(`Columnas tracking: Fecha=${colFecha}, Tipo=${colTipo}, Contador=${colContador}`);
}

// ============================================
// FUNCIÓN DE PRUEBA - 2 SMS + 5 EMAILS
// ============================================
function PRUEBA_verificarRecordatorios() {
  Logger.log("========================================");
  Logger.log("🔧 MODO PRUEBA ACTIVADO");
  Logger.log("📧 Emails: 5 → " + MODO_TEST.emailPrueba);
  Logger.log("📱 SMS: 2 → " + MODO_TEST.telefonoPrueba);
  Logger.log("========================================\n");
  
  // Activar modo test temporalmente
  MODO_TEST.activo = true;
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_CONFIG.nombre);
  
  if (!sheet) {
    Logger.log("ERROR: No se encontró la hoja " + SHEET_CONFIG.nombre);
    MODO_TEST.activo = false;
    return;
  }
  
  // Inicializar columnas de tracking si no existen
  inicializarColumnasTracking(sheet);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  // Buscar índice de "ESTADO DE RECOGIDA" dinámicamente
  SHEET_CONFIG.columnas.estadoRecogida = headers.indexOf("ESTADO DE RECOGIDA");
  
  if (SHEET_CONFIG.columnas.estadoRecogida === -1) {
    Logger.log("ERROR: No se encontró la columna 'ESTADO DE RECOGIDA'");
    MODO_TEST.activo = false;
    return;
  }
  
  const hoy = new Date();
  
  Logger.log(`Iniciando verificación - ${hoy.toDateString()}\n`);
  
  let emailsEnviados = 0;
  let smsEnviados = 0;
  let casosSinContacto = 0;
  
  const LIMITE_EMAILS = 5;
  const LIMITE_SMS = 2;
  
  // Procesar desde fila 2 (índice 1)
  for (let i = 1; i < data.length; i++) {
    // Detener si ya alcanzamos ambos límites
    if (emailsEnviados >= LIMITE_EMAILS && smsEnviados >= LIMITE_SMS) {
      Logger.log(`\n🛑 LÍMITES ALCANZADOS:`);
      Logger.log(`   📧 Emails: ${emailsEnviados}/${LIMITE_EMAILS}`);
      Logger.log(`   📱 SMS: ${smsEnviados}/${LIMITE_SMS}`);
      break;
    }
    
    const fila = data[i];
    
    // Saltar filas vacías
    if (!fila[SHEET_CONFIG.columnas.nombreCliente]) continue;
    
    const email = fila[SHEET_CONFIG.columnas.email];
    const telefono = fila[SHEET_CONFIG.columnas.telefono];
    const cliente = fila[SHEET_CONFIG.columnas.nombreCliente];
    
    // Validar contacto
    const tieneEmail = email && email.toString().trim() !== '';
    const tieneTelefono = telefono && telefono.toString().trim() !== '';
    
    if (!tieneEmail && !tieneTelefono) {
      if (debeEnviarRecordatorioAceptacion(fila, hoy) || 
          debeEnviarAvisoRecojoInmediato(fila) ||
          debeEnviarRecordatorioSeguimiento(fila, hoy)) {
        casosSinContacto++;
        Logger.log(`  ⚠️ Sin contacto: ${cliente} (Fila ${i + 1})`);
      }
      continue;
    }
    
    // Verificar si ya alcanzamos el límite para el medio disponible
    if (tieneEmail && !tieneTelefono && emailsEnviados >= LIMITE_EMAILS) {
      continue;
    }
    if (!tieneEmail && tieneTelefono && smsEnviados >= LIMITE_SMS) {
      continue;
    }
    
    let enviado = false;
    let caso = "";
    
    // CASO 1: Recordatorio aceptación presupuesto
    if (debeEnviarRecordatorioAceptacion(fila, hoy)) {
      enviarRecordatorioAceptacion(fila, sheet, i + 1);
      enviado = true;
      caso = "Aceptación Ppto";
    }
    
    // CASO 2: Aviso recojo inmediato
    else if (debeEnviarAvisoRecojoInmediato(fila)) {
      enviarAvisoRecojoInmediato(fila, sheet, i + 1);
      enviado = true;
      caso = "Recojo Inmediato";
    }
    
    // CASO 3: Recordatorio seguimiento
    else if (debeEnviarRecordatorioSeguimiento(fila, hoy)) {
      enviarRecordatorioSeguimiento(fila, sheet, i + 1);
      enviado = true;
      caso = "Seguimiento Recojo";
    }
    
    if (enviado) {
      const medios = [];
      
      // Contar solo si realmente se enviará
      if (tieneEmail && emailsEnviados < LIMITE_EMAILS) {
        medios.push("📧 Email");
        emailsEnviados++;
      }
      if (tieneTelefono && smsEnviados < LIMITE_SMS) {
        medios.push("📱 SMS");
        smsEnviados++;
      }
      
      Logger.log(`  ✅ ${cliente} - ${caso}`);
      Logger.log(`     ${medios.join(" + ")}`);
      Logger.log(`     [📧 ${emailsEnviados}/${LIMITE_EMAILS} | 📱 ${smsEnviados}/${LIMITE_SMS}]\n`);
    }
  }
  
  // Desactivar modo test
  MODO_TEST.activo = false;
  
  Logger.log("\n========================================");
  Logger.log(`✅ PRUEBA COMPLETADA`);
  Logger.log(`   📧 Emails enviados: ${emailsEnviados}/${LIMITE_EMAILS}`);
  Logger.log(`   📱 SMS enviados: ${smsEnviados}/${LIMITE_SMS}`);
  Logger.log(`   ⚠️ Casos sin contacto: ${casosSinContacto}`);
  Logger.log("\n📧 Revisa email: " + MODO_TEST.emailPrueba);
  Logger.log("📱 Revisa SMS en: " + MODO_TEST.telefonoPrueba);
  Logger.log("========================================");
}


// ============================================
// TRIGGER AUTOMÁTICO AL EDITAR CELDAS
// ============================================
function onEditInstalable(e) {
  try {
    // Solo procesar si se editó la columna "Estado" (columna L)
    const range = e.range;
    const sheet = range.getSheet();
    
    Logger.log(`📝 Celda editada: ${sheet.getName()} - Columna ${range.getColumn()}`);
    
    // Verificar que sea la hoja correcta
    if (sheet.getName() !== SHEET_CONFIG.nombre) {
      Logger.log(`⚠️ Hoja diferente, se esperaba: ${SHEET_CONFIG.nombre}`);
      return;
    }
    
    // Verificar que sea la columna de Estado (columna L = columna 12)
    const columnaEditada = range.getColumn();
    const columnaEstadoEsperada = SHEET_CONFIG.columnas.estado + 1; // +1 porque getColumn() empieza en 1
    
    Logger.log(`Columna editada: ${columnaEditada}, Columna Estado esperada: ${columnaEstadoEsperada}`);
    
    if (columnaEditada !== columnaEstadoEsperada) {
      Logger.log(`⚠️ No es la columna Estado, ignorando`);
      return;
    }
    
    // Obtener el nuevo valor
    const nuevoEstado = range.getValue();
    const filaEditada = range.getRow();
    
    Logger.log(`🔔 Estado cambiado en fila ${filaEditada} a: "${nuevoEstado}"`);
    
    // Verificar si es un estado que requiere envío inmediato
    const estadosRecojo = [
      ESTADOS.reparado, 
      ESTADOS.noTieneReparacion, 
      ESTADOS.presupuestoRechazado
    ];
    
    if (!estadosRecojo.includes(nuevoEstado)) {
      Logger.log(`⚠️ Estado "${nuevoEstado}" no requiere aviso de recojo`);
      return;
    }
    
    Logger.log(`✅ Estado detectado que requiere aviso inmediato`);
    
    // Inicializar columnas de tracking
    inicializarColumnasTracking(sheet);
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    SHEET_CONFIG.columnas.estadoRecogida = headers.indexOf("ESTADO DE RECOGIDA");
    
    const fila = data[filaEditada - 1]; // -1 porque arrays empiezan en 0
    
    // Mostrar datos de la fila
    const cliente = fila[SHEET_CONFIG.columnas.nombreCliente];
    const email = fila[SHEET_CONFIG.columnas.email];
    const telefono = fila[SHEET_CONFIG.columnas.telefono];
    const estadoRecogida = fila[SHEET_CONFIG.columnas.estadoRecogida];
    const tipoUltimo = fila[SHEET_CONFIG.columnas.tipoUltimoRecordatorio];
    
    Logger.log(`📋 Datos de la fila:`);
    Logger.log(`  Cliente: ${cliente}`);
    Logger.log(`  Email: ${email}`);
    Logger.log(`  Teléfono: ${telefono}`);
    Logger.log(`  Estado Recogida: ${estadoRecogida}`);
    Logger.log(`  Tipo Último: ${tipoUltimo}`);
    
    // Verificar si debe enviar aviso inmediato
    if (debeEnviarAvisoRecojoInmediato(fila)) {
      Logger.log(`📧 Enviando aviso inmediato...`);
      
      // IMPORTANTE: Asegurarse que MODO_TEST esté desactivado
      const modoTestOriginal = MODO_TEST.activo;
      MODO_TEST.activo = false; // ← FORZAR modo producción
      
      Logger.log(`🔧 Modo TEST: ${MODO_TEST.activo ? 'ACTIVO (emails a prueba)' : 'INACTIVO (emails a clientes)'}`);
      
      // Enviar el aviso
      enviarAvisoRecojoInmediato(fila, sheet, filaEditada);
      
      // Restaurar estado original de MODO_TEST
      MODO_TEST.activo = modoTestOriginal;
      
      SpreadsheetApp.getActiveSpreadsheet().toast(
        `✅ Aviso enviado a ${cliente}`,
        'Notificación enviada',
        5
      );
      
      Logger.log(`✅ Proceso completado exitosamente`);
    } else {
      Logger.log(`⚠️ No se envió - Ya tiene recordatorio previo`);
      SpreadsheetApp.getActiveSpreadsheet().toast(
        '⚠️ Este cliente ya recibió aviso de recojo',
        'No se envió duplicado',
        3
      );
    }
  } catch (error) {
    Logger.log(`❌ ERROR en onEdit: ${error.message}`);
    Logger.log(`Stack trace: ${error.stack}`);
    
    SpreadsheetApp.getActiveSpreadsheet().toast(
      `❌ Error: ${error.message}`,
      'Error al enviar',
      5
    );
  }
}




// ============================================
// FUNCIONES DE DEBUG
// ============================================

function DEBUG_verQueEstaPasando() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_CONFIG.nombre);
  
  if (!sheet) {
    Logger.log("❌ ERROR: No se encontró la hoja: " + SHEET_CONFIG.nombre);
    return;
  }
  
  Logger.log("✅ Hoja encontrada: " + sheet.getName());
  
  inicializarColumnasTracking(sheet);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  SHEET_CONFIG.columnas.estadoRecogida = headers.indexOf("ESTADO DE RECOGIDA");
  
  Logger.log("\n📊 CONFIGURACIÓN DE COLUMNAS:");
  Logger.log(`  Estado (col L): ${SHEET_CONFIG.columnas.estado}`);
  Logger.log(`  Estado Recogida: ${SHEET_CONFIG.columnas.estadoRecogida}`);
  Logger.log(`  Tipo Último Recordatorio: ${SHEET_CONFIG.columnas.tipoUltimoRecordatorio}`);
  
  const hoy = new Date();
  let casosEncontrados = 0;
  
  Logger.log("\n🔍 ANALIZANDO PRIMERAS 20 FILAS...\n");
  
  for (let i = 1; i <= Math.min(20, data.length - 1); i++) {
    const fila = data[i];
    const estado = fila[SHEET_CONFIG.columnas.estado];
    const estadoRecogida = fila[SHEET_CONFIG.columnas.estadoRecogida];
    const tipoUltimo = fila[SHEET_CONFIG.columnas.tipoUltimoRecordatorio];
    const cliente = fila[SHEET_CONFIG.columnas.nombreCliente];
    const email = fila[SHEET_CONFIG.columnas.email];
    
    const estadosRecojo = [ESTADOS.reparado, ESTADOS.noTieneReparacion, ESTADOS.presupuestoRechazado];
    
    if (estadosRecojo.includes(estado)) {
      casosEncontrados++;
      Logger.log(`Fila ${i + 1}:`);
      Logger.log(`  Cliente: ${cliente || 'SIN NOMBRE'}`);
      Logger.log(`  Email: ${email || 'SIN EMAIL'}`);
      Logger.log(`  Estado: "${estado}"`);
      Logger.log(`  Estado Recogida: "${estadoRecogida}"`);
      Logger.log(`  Tipo Último: "${tipoUltimo}"`);
      
      Logger.log(`  Condiciones:`);
      Logger.log(`    ✓ Estado requiere recojo: ${estadosRecojo.includes(estado) ? 'SÍ' : 'NO'}`);
      Logger.log(`    ✓ NO entregado: ${estadoRecogida !== ESTADOS.entregado ? 'SÍ' : 'NO'}`);
      Logger.log(`    ✓ Sin recordatorio previo: ${!tipoUltimo || !tipoUltimo.startsWith("recojo_") ? 'SÍ' : 'NO'}`);
      Logger.log(`    ✓ Tiene cliente: ${cliente ? 'SÍ' : 'NO'}`);
      Logger.log(`    ✓ Tiene email: ${email ? 'SÍ' : 'NO'}`);
      
      if (debeEnviarAvisoRecojoInmediato(fila)) {
        Logger.log(`  ✅ DEBERÍA ENVIAR AVISO\n`);
      } else {
        Logger.log(`  ❌ NO cumple condiciones\n`);
      }
    }
  }
  
  Logger.log(`\nTotal casos relevantes encontrados en primeras 20 filas: ${casosEncontrados}`);
}

function DEBUG_analizarFilaEspecifica() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_CONFIG.nombre);
  
  if (!sheet) {
    Logger.log("❌ ERROR: No se encontró la hoja");
    return;
  }
  
  inicializarColumnasTracking(sheet);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  SHEET_CONFIG.columnas.estadoRecogida = headers.indexOf("ESTADO DE RECOGIDA");
  
  Logger.log("========================================");
  Logger.log("🔎 BUSCANDO FILA CON CLIENTE 'Julio Jorge'");
  Logger.log("========================================\n");
  
  const hoy = new Date();
  
  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const cliente = fila[SHEET_CONFIG.columnas.nombreCliente];
    
    if (cliente && cliente.toString().includes("Julio Jorge")) {
      Logger.log(`✅ ENCONTRADA en Fila ${i + 1}\n`);
      
      Logger.log("📋 DATOS DE LA FILA:");
      Logger.log(`  Nombre Cliente [col ${SHEET_CONFIG.columnas.nombreCliente}]: "${fila[SHEET_CONFIG.columnas.nombreCliente]}"`);
      Logger.log(`  Email [col ${SHEET_CONFIG.columnas.email}]: "${fila[SHEET_CONFIG.columnas.email]}"`);
      Logger.log(`  Teléfono [col ${SHEET_CONFIG.columnas.telefono}]: "${fila[SHEET_CONFIG.columnas.telefono]}"`);
      Logger.log(`  Equipo [col ${SHEET_CONFIG.columnas.equipo}]: "${fila[SHEET_CONFIG.columnas.equipo]}"`);
      Logger.log(`  Estado [col ${SHEET_CONFIG.columnas.estado}]: "${fila[SHEET_CONFIG.columnas.estado]}"`);
      Logger.log(`  Estado Recogida [col ${SHEET_CONFIG.columnas.estadoRecogida}]: "${fila[SHEET_CONFIG.columnas.estadoRecogida]}"`);
      Logger.log(`  Fecha Ppto [col ${SHEET_CONFIG.columnas.fechaElaboracionPpto}]: "${fila[SHEET_CONFIG.columnas.fechaElaboracionPpto]}"`);
      Logger.log(`  Tipo Último [col ${SHEET_CONFIG.columnas.tipoUltimoRecordatorio}]: "${fila[SHEET_CONFIG.columnas.tipoUltimoRecordatorio]}"`);
      Logger.log(`  Fecha Último [col ${SHEET_CONFIG.columnas.fechaUltimoRecordatorio}]: "${fila[SHEET_CONFIG.columnas.fechaUltimoRecordatorio]}"`);
      
      Logger.log("\n🔍 EVALUACIÓN DE CONDICIONES:");
      
      const estado = fila[SHEET_CONFIG.columnas.estado];
      const fechaPpto = fila[SHEET_CONFIG.columnas.fechaElaboracionPpto];
      const email = fila[SHEET_CONFIG.columnas.email];
      
      Logger.log(`\n1. Estado es "Presupuesto Enviado"?`);
      Logger.log(`   Valor leído: "${estado}"`);
      Logger.log(`   Esperado: "${ESTADOS.presupuestoEnviado}"`);
      Logger.log(`   ¿Coincide? ${estado === ESTADOS.presupuestoEnviado ? 'SÍ ✅' : 'NO ❌'}`);
      
      Logger.log(`\n2. Tiene fecha de presupuesto?`);
      Logger.log(`   Valor: ${fechaPpto}`);
      Logger.log(`   ¿Válido? ${fechaPpto ? 'SÍ ✅' : 'NO ❌'}`);
      
      if (fechaPpto) {
        const fechaPptoDate = new Date(fechaPpto);
        const diasDesde = Math.floor((hoy - fechaPptoDate) / (1000 * 60 * 60 * 24));
        Logger.log(`\n3. Días desde elaboración: ${diasDesde}`);
        Logger.log(`   ¿Más de 2 días? ${diasDesde >= 2 ? 'SÍ ✅' : 'NO ❌'}`);
      }
      
      Logger.log(`\n4. Tiene email válido?`);
      Logger.log(`   Valor: "${email}"`);
      Logger.log(`   ¿Válido? ${email ? 'SÍ ✅' : 'NO ❌'}`);
      
      Logger.log(`\n5. Tiene nombre cliente?`);
      Logger.log(`   Valor: "${cliente}"`);
      Logger.log(`   ¿Válido? ${cliente ? 'SÍ ✅' : 'NO ❌'}`);
      
      Logger.log("\n📊 RESULTADO FINAL:");
      const cumple = debeEnviarRecordatorioAceptacion(fila, hoy);
      Logger.log(`   debeEnviarRecordatorioAceptacion(): ${cumple ? 'TRUE ✅' : 'FALSE ❌'}`);
      
      if (!cumple) {
        Logger.log("\n⚠️ La fila NO cumple las condiciones según la función");
      }
      
      break;
    }
  }
  
  Logger.log("\n========================================");
}

function DEBUG_verificarPresupuestoRechazado() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_CONFIG.nombre);
  
  if (!sheet) {
    Logger.log("❌ ERROR: No se encontró la hoja");
    return;
  }
  
  inicializarColumnasTracking(sheet);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  SHEET_CONFIG.columnas.estadoRecogida = headers.indexOf("ESTADO DE RECOGIDA");
  
  Logger.log("========================================");
  Logger.log("🔎 BUSCANDO CASOS DE 'PRESUPUESTO RECHAZADO'");
  Logger.log("========================================\n");
  
  let encontrados = 0;
  let conEmail = 0;
  let sinEmail = 0;
  
  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const estado = fila[SHEET_CONFIG.columnas.estado];
    const estadoRecogida = fila[SHEET_CONFIG.columnas.estadoRecogida];
    const tipoUltimo = fila[SHEET_CONFIG.columnas.tipoUltimoRecordatorio];
    const cliente = fila[SHEET_CONFIG.columnas.nombreCliente];
    const email = fila[SHEET_CONFIG.columnas.email];
    
    if (estado === ESTADOS.presupuestoRechazado) {
      encontrados++;
      
      if (encontrados <= 5) {
        Logger.log(`Caso ${encontrados} - Fila ${i + 1}:`);
        Logger.log(`  Cliente: ${cliente || 'SIN NOMBRE'}`);
        Logger.log(`  Email: ${email || 'SIN EMAIL'}`);
        Logger.log(`  Estado: "${estado}"`);
        Logger.log(`  Estado Recogida: "${estadoRecogida}"`);
        Logger.log(`  Tipo Último: "${tipoUltimo || 'vacío'}"`);
        Logger.log(`  Cumple condiciones: ${debeEnviarAvisoRecojoInmediato(fila) ? 'SÍ ✅' : 'NO ❌'}\n`);
      }
      
      if (email && email.toString().trim() !== '') {
        conEmail++;
      } else {
        sinEmail++;
      }
    }
  }
  
  Logger.log("========================================");
  Logger.log(`📊 RESUMEN "PRESUPUESTO RECHAZADO":`);
  Logger.log(`   Total encontrados: ${encontrados}`);
  Logger.log(`   Con email: ${conEmail}`);
  Logger.log(`   Sin email: ${sinEmail}`);
  Logger.log("========================================");
}

function LIMPIAR_trackingDePrueba() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_CONFIG.nombre);
  
  if (!sheet) {
    Logger.log("❌ ERROR: No se encontró la hoja");
    return;
  }
  
  inicializarColumnasTracking(sheet);
  
  const data = sheet.getDataRange().getValues();
  let limpios = 0;
  
  Logger.log("🧹 LIMPIANDO TRACKING DE PRUEBA...\n");
  
  for (let i = 1; i <= Math.min(500, data.length - 1); i++) {
    const tipoUltimo = data[i][SHEET_CONFIG.columnas.tipoUltimoRecordatorio];
    
    if (tipoUltimo && tipoUltimo !== '') {
      sheet.getRange(i + 1, SHEET_CONFIG.columnas.fechaUltimoRecordatorio + 1).clearContent();
      sheet.getRange(i + 1, SHEET_CONFIG.columnas.tipoUltimoRecordatorio + 1).clearContent();
      sheet.getRange(i + 1, SHEET_CONFIG.columnas.contadorRecojosEnviados + 1).clearContent();
      limpios++;
    }
  }
  
  Logger.log(`✅ Se limpiaron ${limpios} registros`);
  Logger.log("Ahora puedes volver a ejecutar PRUEBA_verificarRecordatorios");
}

// ============================================
// MENÚ PERSONALIZADO EN EL SHEET
// ============================================
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🔔 Kelatos Recordatorios')
    .addItem('🧪 Ejecutar PRUEBA (emails a ti)', 'PRUEBA_verificarRecordatorios')
    .addSeparator()
    .addItem('▶️ Ejecutar REAL (emails a clientes)', 'verificarRecordatorios')
    .addSeparator()
    .addItem('🧹 Limpiar tracking de prueba', 'LIMPIAR_trackingDePrueba')
    .addToUi();
}