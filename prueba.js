// ============================================
// FUNCIONES DE PRUEBA - RECORDATORIOS
// ============================================

/**
 * PASO 1: Modificar fechas a hace 3 días
 * Esto simula que ya pasaron 3 días desde el último recordatorio
 */
function PRUEBA_simularFechasAntiguas() {
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
  Logger.log("🕐 MODIFICANDO FECHAS DE TRACKING A HACE 3 DÍAS");
  Logger.log("========================================\n");
  
  const hace3Dias = new Date();
  hace3Dias.setDate(hace3Dias.getDate() - 3); // Restar 3 días
  
  let modificados = 0;
  
  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const tipoUltimo = fila[SHEET_CONFIG.columnas.tipoUltimoRecordatorio];
    const cliente = fila[SHEET_CONFIG.columnas.nombreCliente];
    const estadoRecogida = fila[SHEET_CONFIG.columnas.estadoRecogida];
    
    // Solo modificar filas que tengan tracking de recojo y estén PENDIENTE
    if (tipoUltimo && tipoUltimo.startsWith("recojo_") && estadoRecogida === "PENDIENTE") {
      sheet.getRange(i + 1, SHEET_CONFIG.columnas.fechaUltimoRecordatorio + 1)
        .setValue(hace3Dias);
      
      modificados++;
      
      if (modificados <= 5) {
        Logger.log(`✓ Fila ${i + 1}: ${cliente}`);
        Logger.log(`  Tipo: ${tipoUltimo}`);
        Logger.log(`  Fecha modificada a: ${hace3Dias.toLocaleString()}\n`);
      }
    }
  }
  
  Logger.log("========================================");
  Logger.log(`✅ ${modificados} fechas modificadas a hace 3 días`);
  Logger.log("\n📋 SIGUIENTE PASO:");
  Logger.log("Ejecuta: PRUEBA_recordatoriosSeguimiento()");
  Logger.log("========================================");
}

/**
 * PASO 2: Probar recordatorios de seguimiento
 * Ejecuta la lógica real de recordatorios y envía a tu email de prueba
 */
function PRUEBA_recordatoriosSeguimiento() {
  Logger.log("========================================");
  Logger.log("🔧 PRUEBA DE RECORDATORIOS DE SEGUIMIENTO");
  Logger.log("📧 Enviando a: " + MODO_TEST.emailPrueba);
  Logger.log("📱 SMS a: " + MODO_TEST.telefonoPrueba);
  Logger.log("========================================\n");
  
  // Activar modo test
  MODO_TEST.activo = true;
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_CONFIG.nombre);
  
  if (!sheet) {
    Logger.log("ERROR: No se encontró la hoja");
    MODO_TEST.activo = false;
    return;
  }
  
  inicializarColumnasTracking(sheet);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  SHEET_CONFIG.columnas.estadoRecogida = headers.indexOf("ESTADO DE RECOGIDA");
  
  const hoy = new Date();
  let enviados = 0;
  const MAX_PRUEBA = 3; // Enviar solo 3 de prueba
  
  Logger.log(`Buscando casos para recordatorio de seguimiento...\n`);
  
  for (let i = 1; i < data.length; i++) {
    if (enviados >= MAX_PRUEBA) {
      Logger.log(`\n🛑 LÍMITE ALCANZADO: ${MAX_PRUEBA} recordatorios enviados`);
      break;
    }
    
    const fila = data[i];
    const cliente = fila[SHEET_CONFIG.columnas.nombreCliente];
    const estado = fila[SHEET_CONFIG.columnas.estado];
    const tipoUltimo = fila[SHEET_CONFIG.columnas.tipoUltimoRecordatorio];
    const fechaUltimo = fila[SHEET_CONFIG.columnas.fechaUltimoRecordatorio];
    const contador = fila[SHEET_CONFIG.columnas.contadorRecojosEnviados] || 0;
    const estadoRecogida = fila[SHEET_CONFIG.columnas.estadoRecogida];
    
    if (!cliente) continue;
    
    // Verificar si debe enviar
    if (debeEnviarRecordatorioSeguimiento(fila, hoy)) {
      Logger.log(`✅ CASO ${enviados + 1} - Fila ${i + 1}:`);
      Logger.log(`  Cliente: ${cliente}`);
      Logger.log(`  Estado: ${estado}`);
      Logger.log(`  Estado Recogida: ${estadoRecogida}`);
      Logger.log(`  Tipo Último: ${tipoUltimo}`);
      Logger.log(`  Fecha Último: ${fechaUltimo}`);
      Logger.log(`  Contador: ${contador}/20`);
      
      const diasDesde = fechaUltimo ? 
        Math.floor((hoy - new Date(fechaUltimo)) / (1000 * 60 * 60 * 24)) : 0;
      Logger.log(`  Días desde último: ${diasDesde}`);
      
      // Enviar recordatorio
      enviarRecordatorioSeguimiento(fila, sheet, i + 1);
      enviados++;
      Logger.log(`  ✅ Recordatorio enviado\n`);
    }
  }
  
  MODO_TEST.activo = false;
  
  Logger.log("\n========================================");
  Logger.log(`✅ PRUEBA COMPLETADA`);
  Logger.log(`   Recordatorios enviados: ${enviados}`);
  Logger.log("\n📧 Revisa email: " + MODO_TEST.emailPrueba);
  Logger.log("📱 Revisa SMS en: " + MODO_TEST.telefonoPrueba);
  Logger.log("========================================");
}

/**
 * OPCIÓN RÁPIDA: Forzar 1 recordatorio (ignora tiempo)
 * Útil para prueba rápida sin modificar fechas
 */
function PRUEBA_forzarRecordatorio() {
  Logger.log("========================================");
  Logger.log("🔧 FORZANDO 1 RECORDATORIO DE SEGUIMIENTO");
  Logger.log("(Ignorando restricción de 2 días)");
  Logger.log("========================================\n");
  
  MODO_TEST.activo = true;
  
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName(SHEET_CONFIG.nombre);
  
  if (!sheet) {
    Logger.log("ERROR: No se encontró la hoja");
    MODO_TEST.activo = false;
    return;
  }
  
  inicializarColumnasTracking(sheet);
  
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  SHEET_CONFIG.columnas.estadoRecogida = headers.indexOf("ESTADO DE RECOGIDA");
  
  // Buscar el primer caso con aviso inmediato enviado
  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const tipoUltimo = fila[SHEET_CONFIG.columnas.tipoUltimoRecordatorio];
    const cliente = fila[SHEET_CONFIG.columnas.nombreCliente];
    const estado = fila[SHEET_CONFIG.columnas.estado];
    const estadoRecogida = fila[SHEET_CONFIG.columnas.estadoRecogida];
    const contador = fila[SHEET_CONFIG.columnas.contadorRecojosEnviados] || 0;
    
    if (tipoUltimo && tipoUltimo.startsWith("recojo_") && estadoRecogida === "PENDIENTE") {
      Logger.log(`✅ Caso encontrado - Fila ${i + 1}:`);
      Logger.log(`  Cliente: ${cliente}`);
      Logger.log(`  Estado: ${estado}`);
      Logger.log(`  Estado Recogida: ${estadoRecogida}`);
      Logger.log(`  Tipo Último: ${tipoUltimo}`);
      Logger.log(`  Contador: ${contador}/20`);
      Logger.log(`\n📧 Enviando recordatorio de seguimiento...\n`);
      
      // Enviar directamente SIN verificar días
      enviarRecordatorioSeguimiento(fila, sheet, i + 1);
      
      Logger.log(`\n✅ Recordatorio enviado`);
      Logger.log(`📧 Revisa email: ${MODO_TEST.emailPrueba}`);
      Logger.log(`📱 Revisa SMS: ${MODO_TEST.telefonoPrueba}`);
      break; // Solo enviar a 1 para la prueba
    }
  }
  
  MODO_TEST.activo = false;
  
  Logger.log("\n========================================");
}

/**
 * UTILIDAD: Ver estado actual de recordatorios
 * Muestra cuántos casos hay pendientes y sus contadores
 */
function PRUEBA_verEstadoRecordatorios() {
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
  Logger.log("📊 ESTADO ACTUAL DE RECORDATORIOS");
  Logger.log("========================================\n");
  
  let conRecordatorio = 0;
  let pendientes = 0;
  let entregados = 0;
  
  const hoy = new Date();
  
  Logger.log("📋 CASOS CON RECORDATORIO ACTIVO:\n");
  
  for (let i = 1; i < data.length; i++) {
    const fila = data[i];
    const tipoUltimo = fila[SHEET_CONFIG.columnas.tipoUltimoRecordatorio];
    const cliente = fila[SHEET_CONFIG.columnas.nombreCliente];
    const estadoRecogida = fila[SHEET_CONFIG.columnas.estadoRecogida];
    const fechaUltimo = fila[SHEET_CONFIG.columnas.fechaUltimoRecordatorio];
    const contador = fila[SHEET_CONFIG.columnas.contadorRecojosEnviados] || 0;
    
    if (tipoUltimo && tipoUltimo.startsWith("recojo_")) {
      conRecordatorio++;
      
      if (estadoRecogida === "PENDIENTE") {
        pendientes++;
        
        const diasDesde = fechaUltimo ? 
          Math.floor((hoy - new Date(fechaUltimo)) / (1000 * 60 * 60 * 24)) : 0;
        
        if (conRecordatorio <= 10) {
          Logger.log(`${conRecordatorio}. ${cliente} (Fila ${i + 1})`);
          Logger.log(`   Estado Recogida: ${estadoRecogida}`);
          Logger.log(`   Contador: ${contador}/20`);
          Logger.log(`   Último envío: hace ${diasDesde} días`);
          Logger.log(`   Próximo: ${diasDesde >= 2 ? '✅ HOY' : `en ${2 - diasDesde} día(s)`}\n`);
        }
      } else {
        entregados++;
      }
    }
  }
  
  Logger.log("========================================");
  Logger.log("📊 RESUMEN:");
  Logger.log(`   Total con recordatorio: ${conRecordatorio}`);
  Logger.log(`   Pendientes de recoger: ${pendientes}`);
  Logger.log(`   Ya entregados: ${entregados}`);
  Logger.log("========================================");
}

