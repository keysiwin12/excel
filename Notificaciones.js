/**
 * MÓDULO DE NOTIFICACIONES
 * Gestión de envíos por Email y SMS
 * Incluye modo de prueba para testing seguro
 */

// ============================================
// EMAILS - ACEPTACIÓN PRESUPUESTO
// ============================================

function enviarEmailAceptacion(destinatario, cliente, equipo) {
  if (!destinatario) return;
  
  const asunto = `Recordatorio: Presupuesto pendiente - ${equipo}`;
  const cuerpo = `
Hola ${cliente}, esperamos que estés muy bien.

Queríamos saber si has podido revisar el presupuesto que te enviamos para la reparación de tu equipo.

Quedamos atentos por si necesitas cualquier aclaración.

¡Gracias!

Equipo Kelatos
C. de Joaquín María López, 26, 28015 Madrid
  `.trim();
  
  enviarEmail(destinatario, asunto, cuerpo);
}

// ============================================
// EMAILS - RECOJO
// ============================================

function enviarEmailRecojoReparado(destinatario, cliente, equipo) {
  if (!destinatario) return;
  
  const asunto = `¡Tu equipo está listo! - ${equipo}`;
  const cuerpo = `
Hola ${cliente}, nos complace informarte que tu equipo ya está reparado y listo para recoger.

Nuestro horario de atención es de lunes a viernes de 10:00 a 18:00 (horario continuo).

Dirección: C. de Joaquín María López, 26, 28015 Madrid.

Puedes pagar en efectivo, transferencia o tarjeta. ¡Te esperamos!

Equipo Kelatos
  `.trim();
  
  enviarEmail(destinatario, asunto, cuerpo);
}

function enviarEmailRecojoNoReparacion(destinatario, cliente, equipo) {
  if (!destinatario) return;
  
  const asunto = `Información sobre tu equipo - ${equipo}`;
  const cuerpo = `
Hola ${cliente}, te informamos que, tras las comprobaciones realizadas, no ha sido posible reparar tu equipo.

Puedes pasar a recogerlo de lunes a viernes de 10:00 a 18:00 (horario continuo) en C. de Joaquín María López, 26, 28015 Madrid.

Te recordamos que, pasados 30 días desde el primer aviso realizado, se aplicará un cargo de 1 € + IVA por día de custodia. ¡Gracias!

Equipo Kelatos
  `.trim();
  
  enviarEmail(destinatario, asunto, cuerpo);
}

function enviarEmailRecojoRechazado(destinatario, cliente, equipo) {
  if (!destinatario) return;
  
  const asunto = `Tu equipo está disponible para recoger - ${equipo}`;
  const cuerpo = `
Hola ${cliente}, te informamos que tu equipo se encuentra disponible para recoger en nuestro local.

Nuestro horario es de lunes a viernes de 10:00 a 18:00 (horario continuo).

Dirección: C. de Joaquín María López, 26, 28015 Madrid.

Te recordamos que, pasados 30 días desde el primer aviso realizado, se aplicará un cargo de 1 € + IVA por día de custodia. ¡Gracias!

Equipo Kelatos
  `.trim();
  
  enviarEmail(destinatario, asunto, cuerpo);
}

// ============================================
// SMS - ACEPTACIÓN PRESUPUESTO (160 chars)
// ============================================

function enviarSMSAceptacion(telefono, cliente) {
  if (!telefono) return;
  
  // Usar solo primer nombre si es muy largo
  const nombreCorto = cliente.split(' ')[0];
  
  const mensaje = `Hola ${nombreCorto}, ¿has revisado el presupuesto para tu equipo? Quedamos atentos.`;
  
  enviarSMS(telefono, mensaje);
}

// ============================================
// SMS - RECOJO (160 chars max)
// ============================================

function enviarSMSRecojoReparado(telefono, cliente) {
  if (!telefono) return;
  
  const nombreCorto = cliente.split(' ')[0];
  
  const mensaje = `Hola ${nombreCorto}, tu equipo esta reparado. Recogelo L-V 10-18h en C. Joaquin M. Lopez 26, Madrid. Pago: efectivo/tarjeta.`;
  
  enviarSMS(telefono, mensaje);
}

function enviarSMSRecojoNoReparacion(telefono, cliente) {
  if (!telefono) return;
  
  const nombreCorto = cliente.split(' ')[0];
  
  const mensaje = `Hola ${nombreCorto}, tu equipo no pudo repararse. Recogelo L-V 10-18h en C. Joaquin M. Lopez 26, Madrid. Cargo tras 30d: 1€+IVA/dia.`;
  
  enviarSMS(telefono, mensaje);
}

function enviarSMSRecojoRechazado(telefono, cliente) {
  if (!telefono) return;
  
  const nombreCorto = cliente.split(' ')[0];
  
  const mensaje = `Hola ${nombreCorto}, tu equipo esta disponible. Recogelo L-V 10-18h en C. Joaquin M. Lopez 26, Madrid. Cargo tras 30d: 1€+IVA/dia.`;
  
  enviarSMS(telefono, mensaje);
}

// ============================================
// FUNCIÓN BASE - EMAIL (CON MODO PRUEBA)
// ============================================

function enviarEmail(destinatario, asunto, cuerpo) {
  try {
    let destinatarioFinal = destinatario;
    let asuntoFinal = asunto;
    let cuerpoFinal = cuerpo;
    
    // Si está en modo prueba, redirigir
    if (MODO_TEST.activo) {
      destinatarioFinal = MODO_TEST.emailPrueba;
      asuntoFinal = `[PRUEBA] ${asunto}`;
      cuerpoFinal = `
========================================
🔧 MODO PRUEBA - Este email NO se envió al cliente
========================================
Cliente destinatario original: ${destinatario}
Asunto original: ${asunto}

========================================
CONTENIDO DEL EMAIL:
========================================

${cuerpo}

========================================
FIN DEL EMAIL DE PRUEBA
========================================
      `.trim();
    }
    
    GmailApp.sendEmail(destinatarioFinal, asuntoFinal, cuerpoFinal, {
      name: MODO_TEST.activo ? "Kelatos Servicio Técnico [PRUEBA]" : "Kelatos Servicio Técnico"
    });
    
    if (MODO_TEST.activo) {
      Logger.log(`  → [PRUEBA] Email redirigido a: ${destinatarioFinal} (original: ${destinatario})`);
    } else {
      Logger.log(`  → Email enviado a: ${destinatario}`);
    }
  } catch (error) {
    Logger.log(`  ✗ ERROR Email: ${error.message}`);
  }
}

// ============================================
// FUNCIÓN BASE - SMS (CON MODO PRUEBA REAL)
// ============================================

function enviarSMS(telefono, mensaje) {
  // En modo prueba, enviar SMS REAL al teléfono de prueba
  let telDestino = telefono;
  let mensajeFinal = mensaje;
  
  if (MODO_TEST.activo) {
    // Enviar al teléfono de prueba en lugar del cliente
    telDestino = MODO_TEST.telefonoPrueba;
    
    // Agregar prefijo de prueba (manteniendo bajo 160 si es posible)
    const prefijo = `[PRUEBA] `;
    if ((prefijo + mensaje).length <= 160) {
      mensajeFinal = prefijo + mensaje;
    } else {
      // Si no cabe, solo agregar [P]
      mensajeFinal = `[P] ${mensaje}`;
    }
    
    Logger.log(`  → [PRUEBA] SMS redirigido a: ${telDestino} (original: ${telefono})`);
    Logger.log(`     Longitud: ${mensajeFinal.length} caracteres`);
  }
  
  // Formatear teléfono a formato internacional
  let tel = telDestino.toString().replace(/\s+/g, '').replace(/[^0-9]/g, '');
  
  // Agregar prefijo si no tiene
  if (!tel.startsWith('00')) {
    // Si empieza con 51 (Perú), 34 (España), o 6/7/9 (móviles España)
    if (tel.startsWith('51') || tel.startsWith('34') || 
        tel.startsWith('6') || tel.startsWith('7') || tel.startsWith('9')) {
      tel = '00' + tel;
    }
  }
  
  const payload = {
    'token': NETELIP.token,
    'from': NETELIP.from,
    'destination': tel,
    'message': mensajeFinal
  };
  
  const options = {
    'method': 'post',
    'payload': payload,
    'muteHttpExceptions': true
  };
  
  try {
    const response = UrlFetchApp.fetch(NETELIP.apiUrl, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      Logger.log(`  → SMS enviado a: ${tel}`);
      
      const xmlResponse = response.getContentText();
      const saldoMatch = xmlResponse.match(/<remainingbalance>(.*?)<\/remainingbalance>/);
      if (saldoMatch) {
        Logger.log(`    Saldo Netelip restante: €${saldoMatch[1]}`);
      }
    } else {
      Logger.log(`  ✗ ERROR SMS ${responseCode} a ${tel}: ${response.getContentText()}`);
    }
  } catch (error) {
    Logger.log(`  ✗ ERROR SMS a ${tel}: ${error.message}`);
  }
}



