/**
 * NOTIFICACIONES.GS - Sistema de recordatorios automáticos
 * Trigger diario a las 11am (lunes a viernes)
 */

// ============================================
// FUNCIÓN PRINCIPAL DEL TRIGGER
// ============================================

/**
 * Entry point del trigger diario.
 * Instalar con: instalarTriggerRecordatorios()
 */
function procesarRecordatorios() {
  const hoy = new Date();
  const diaSemana = hoy.getDay(); // 0=Dom, 6=Sab

  if (diaSemana === 0 || diaSemana === 6) {
    Logger.log('Fin de semana — sin procesamiento');
    return;
  }

  Logger.log(`=== Procesando recordatorios ${Utilities.formatDate(hoy, 'Europe/Madrid', 'dd/MM/yyyy HH:mm')} ===`);

  procesarReintentos();
  procesarNuevosEnvios();
  procesarAvisosRecogida();

  Logger.log('=== Procesamiento completado ===');
}

// ============================================
// FASE 1: REINTENTOS
// ============================================

function procesarReintentos() {
  const cols = HOJAS.notificaciones.cols;
  const sheet = getHoja('notificaciones');
  const datos = sheet.getDataRange().getValues();
  const maxReintentos = RECORDATORIOS_CONFIG.maxReintentos;

  let reintentados = 0;

  for (let i = 1; i < datos.length; i++) {
    const fila = datos[i];
    if (fila[cols.estado] !== 'fallido') continue;

    const intentos = Number(fila[cols.intentos]) || 0;
    if (intentos >= maxReintentos) continue;

    const canal = fila[cols.canal];
    const destinatario = String(fila[cols.destinatario]);
    const tipo = String(fila[cols.tipo]);
    let datosExtra = {};
    try { datosExtra = JSON.parse(fila[cols.datos_extra] || '{}'); } catch (e) {}

    let resultado;
    if (canal === 'email') {
      resultado = enviarEmailNotificacion(destinatario, tipo, datosExtra);
    } else if (canal === 'sms') {
      resultado = enviarSMSNotificacion(destinatario, tipo, datosExtra);
    } else {
      continue;
    }

    const numFila = i + 1;
    const nuevosIntentos = intentos + 1;
    sheet.getRange(numFila, cols.intentos + 1).setValue(nuevosIntentos);

    if (resultado.exito) {
      sheet.getRange(numFila, cols.estado + 1).setValue('enviado');
      sheet.getRange(numFila, cols.fecha_envio + 1).setValue(new Date());
      sheet.getRange(numFila, cols.id_externo + 1).setValue(resultado.idExterno || '');
      Logger.log(`Reintento exitoso: fila ${numFila}, canal=${canal}`);
    } else {
      sheet.getRange(numFila, cols.error + 1).setValue(resultado.error || '');
      Logger.log(`Reintento fallido (${nuevosIntentos}/${maxReintentos}): fila ${numFila} — ${resultado.error}`);
    }

    reintentados++;
  }

  Logger.log(`Reintentos procesados: ${reintentados}`);
}

// ============================================
// FASE 2: NUEVOS ENVÍOS
// ============================================

function procesarNuevosEnvios() {
  const colR = HOJAS.reparaciones.cols;
  const colP = HOJAS.presupuestos.cols;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const todasReps = obtenerTodo('reparaciones');
  const enEspera = todasReps.filter(fila => fila[colR.estado] === 'Presupuesto Enviado');

  Logger.log(`Reparaciones en "Presupuesto Enviado": ${enEspera.length}`);

  let enviados = 0;
  for (const repFila of enEspera) {
    try {
      const resultado = procesarReparacionIndividual(repFila, hoy);
      if (resultado) enviados++;
    } catch (e) {
      Logger.log(`Error en ${repFila[colR.resguardo]}: ${e.message}`);
    }
  }

  Logger.log(`Nuevos recordatorios creados: ${enviados}`);
}

function procesarReparacionIndividual(repFila, hoy) {
  const colR = HOJAS.reparaciones.cols;
  const colP = HOJAS.presupuestos.cols;
  const resguardo = repFila[colR.resguardo];
  const cfg = RECORDATORIOS_CONFIG;

  // Obtener presupuesto enviado más reciente
  const presupuestos = buscarTodosPorCampo('presupuestos', 'resguardo', resguardo);
  const pptoEnviados = presupuestos
    .filter(p => String(p.fila[colP.estado]) === 'enviado' && p.fila[colP.fecha_envio])
    .sort((a, b) => new Date(b.fila[colP.fecha_envio]) - new Date(a.fila[colP.fecha_envio]));

  if (pptoEnviados.length === 0) return false;

  const pptoReciente = pptoEnviados[0];
  const fechaEnvio = new Date(pptoReciente.fila[colP.fecha_envio]);
  fechaEnvio.setHours(0, 0, 0, 0);

  const diasDesdeEmision = Math.floor((hoy - fechaEnvio) / (1000 * 60 * 60 * 24));
  const diasRestantes = cfg.diasVencimiento - diasDesdeEmision;

  Logger.log(`${resguardo}: ${diasDesdeEmision} días desde emisión`);

  const datosExtra = construirDatosExtra(repFila, pptoEnviados.map(p => p.fila), diasRestantes);

  // Día 30 — vencimiento
  if (diasDesdeEmision === cfg.diasVencimiento) {
    if (!existeNotificacionEnviada(resguardo, 'vencimiento_presupuesto')) {
      crearYEnviarNotificaciones(resguardo, pptoReciente.fila[colP.presupuesto_id],
        'vencimiento_presupuesto', 99, repFila, datosExtra);
      return true;
    }
    return false;
  }

  // Expirado
  if (diasDesdeEmision > cfg.diasVencimiento) return false;

  // Recordatorio normal
  const ultimoExitoso = obtenerUltimoRecordatorioExitoso(resguardo);

  let debeEnviar = false;
  let proximaSecuencia = 1;

  if (!ultimoExitoso) {
    if (diasDesdeEmision >= cfg.diasPrimerRecordatorio) {
      debeEnviar = true;
      proximaSecuencia = 1;
    }
  } else {
    const fechaUltimo = new Date(ultimoExitoso.fechaEnvio);
    fechaUltimo.setHours(0, 0, 0, 0);
    const diasDesdeUltimo = Math.floor((hoy - fechaUltimo) / (1000 * 60 * 60 * 24));
    if (diasDesdeUltimo >= cfg.diasEntreRecordatorios) {
      debeEnviar = true;
      proximaSecuencia = (ultimoExitoso.numeroSecuencia || 0) + 1;
    }
  }

  if (debeEnviar) {
    crearYEnviarNotificaciones(resguardo, pptoReciente.fila[colP.presupuesto_id],
      'recordatorio_presupuesto', proximaSecuencia, repFila, datosExtra);
    return true;
  }

  return false;
}

// ============================================
// ENVÍO POR CANALES
// ============================================

function crearYEnviarNotificaciones(resguardo, presupuestoId, tipo, secuencia, repFila, datosExtra) {
  const colR = HOJAS.reparaciones.cols;
  const emailCliente = String(repFila[colR.cliente_email] || '');
  const telefonoCliente = String(repFila[colR.cliente_telefono] || '');

  const sinEmail = !emailCliente || emailCliente === '0' || emailCliente.toLowerCase() === 'no tiene';
  const sinTel   = !telefonoCliente || telefonoCliente === '0' || telefonoCliente.toLowerCase() === 'no tiene';

  const tieneEmail = !sinEmail && validarEmail(emailCliente);
  const tieneTel   = !sinTel && validarTelefono(telefonoCliente);

  Logger.log(`${resguardo} canales — email: ${tieneEmail} (${emailCliente}) | sms: ${tieneTel} (${telefonoCliente}) | test: ${MODO_TEST.activo}`);

  const destinatarioEmail = MODO_TEST.activo ? MODO_TEST.emailPrueba : emailCliente;
  const destinatarioSMS   = MODO_TEST.activo ? ('+' + MODO_TEST.telefonoPrueba) : formatearTelefono(telefonoCliente);

  if (tieneEmail) {
    const resultado = enviarEmailNotificacion(destinatarioEmail, tipo, datosExtra);
    registrarNotificacion({ resguardo, presupuestoId, tipo, canal: 'email',
      destinatario: destinatarioEmail, secuencia, resultado, datosExtra });
  }

  if (tieneTel) {
    const resultado = enviarSMSNotificacion(destinatarioSMS, tipo, datosExtra);
    registrarNotificacion({ resguardo, presupuestoId, tipo, canal: 'sms',
      destinatario: destinatarioSMS, secuencia, resultado, datosExtra });
  }

  if (!tieneEmail && !tieneTel) {
    const msg = `Sin canal de contacto para ${resguardo} (${datosExtra.clienteNombre}). No se pudo enviar recordatorio de presupuesto (secuencia #${secuencia}).`;
    try {
      MailApp.sendEmail({ to: KELATOS.email, subject: `[Kelatos] Sin canal: ${resguardo}`, body: msg });
    } catch (e) {
      Logger.log(`Error enviando alerta interna: ${e.message}`);
    }
    registrarNotificacion({ resguardo, presupuestoId, tipo: 'alerta_sin_canal', canal: 'interno',
      destinatario: KELATOS.email, secuencia, resultado: { exito: true }, datosExtra });
  }
}

// ============================================
// EMAIL
// ============================================

function enviarEmailNotificacion(destinatario, tipo, datosExtra) {
  try {
    const asunto = construirAsuntoEmail(tipo, datosExtra);
    const cuerpoHtml = TIPOS_RECOGIDA.includes(tipo)
      ? construirEmailRecogidaHtml(tipo, datosExtra)
      : construirMensajeEmailHtml(tipo, datosExtra);

    MailApp.sendEmail({
      to: destinatario,
      subject: asunto,
      htmlBody: cuerpoHtml,
      name: 'Kelatos Servicio Técnico'
    });

    Logger.log(`Email enviado a ${destinatario} (${tipo})`);
    return { exito: true, idExterno: '' };
  } catch (e) {
    Logger.log(`Error email a ${destinatario}: ${e.message}`);
    return { exito: false, error: e.message };
  }
}

const TIPOS_RECOGIDA = ['aviso_recogida_reparado', 'aviso_recogida_sin_reparacion',
                        'aviso_recogida_ppto_rechazado', 'cargo_almacenaje_activo'];

function construirAsuntoEmail(tipo, d) {
  if (tipo === 'vencimiento_presupuesto')          return `[Kelatos] Presupuesto por vencer — ${d.equipo || 'tu equipo'}`;
  if (tipo === 'aviso_recogida_reparado')           return `[Kelatos] Su equipo está listo para recoger — ${d.equipo || ''}`;
  if (tipo === 'aviso_recogida_sin_reparacion')     return `[Kelatos] Su equipo está disponible para recoger — ${d.equipo || ''}`;
  if (tipo === 'aviso_recogida_ppto_rechazado')     return `[Kelatos] Su equipo está disponible para recoger — ${d.equipo || ''}`;
  if (tipo === 'cargo_almacenaje_activo')           return `[Kelatos] Cargo de almacenaje activo — ${d.equipo || ''}`;
  return `[Kelatos] Recordatorio: presupuesto pendiente de respuesta — ${d.equipo || 'tu equipo'}`;
}

function construirMensajeEmailHtml(tipo, d) {
  const esVencimiento      = tipo === 'vencimiento_presupuesto';
  const esRecordatorio     = tipo === 'recordatorio_presupuesto';

  // Para recordatorio y vencimiento: reutilizar el email completo de presupuesto
  // con un banner de aviso en la parte superior
  if (esRecordatorio || esVencimiento) {
    const avisoHtml = esVencimiento
      ? `<div style="background:#f8d7da;border:1px solid #f5c2c7;border-radius:8px;padding:16px;margin:0 0 20px 0;">
           <p style="margin:0 0 4px 0;font-weight:bold;color:#842029;">⚠️ Presupuesto por vencer hoy</p>
           <p style="margin:0;color:#842029;font-size:14px;">
             A partir de mañana se aplicará un cargo de <strong>1 € + IVA por día</strong> en concepto de almacenaje
             mientras el equipo permanezca en nuestras instalaciones.
           </p>
         </div>`
      : `<div style="background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:16px;margin:0 0 20px 0;">
           <p style="margin:0 0 4px 0;font-weight:bold;color:#856404;">⏰ Recordatorio — presupuesto pendiente de respuesta</p>
           <p style="margin:0;color:#856404;font-size:14px;">
             Le recordamos que aún no hemos recibido su confirmación. El presupuesto es válido durante <strong>30 días</strong>
             desde la fecha de emisión${d.presupuestos && d.presupuestos[0] && d.presupuestos[0].diasRestantes > 0
               ? ` — quedan <strong>${d.presupuestos[0].diasRestantes} días</strong>` : ''}.
           </p>
         </div>`;

    return construirEmailPresupuestoHtml({ ...d, avisoHtml: avisoHtml });
  }

  const bloqueVencimiento = '';

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">

        <!-- Header -->
        <tr><td style="background:#f5f5f5;padding:24px 32px;text-align:center;">
          <img src="${KELATOS.logo}" alt="Kelatos" height="40" style="max-height:40px;">
        </td></tr>

        <!-- Cuerpo -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 16px 0;">Hola${d.clienteNombre ? ', <strong>' + d.clienteNombre + '</strong>' : ''},</p>
          <p style="margin:0 0 16px 0;">Esperamos que estés muy bien.</p>
          <p style="margin:0 0 16px 0;">
            Queríamos saber si has podido revisar ${(d.presupuestos && d.presupuestos.length > 1) ? 'los presupuestos que te enviamos' : 'el presupuesto que te enviamos'} para la reparación de tu equipo
            ${d.equipo ? '<strong>' + d.equipo + '</strong>' : ''}.
          </p>

          ${bloqueVencimiento}

          <!-- Datos del/los presupuesto(s) -->
          ${(() => {
            const ppts = d.presupuestos && d.presupuestos.length > 0 ? d.presupuestos
              : [{ total: d.totalPresupuesto, fechaEmision: d.fechaEmision, fechaVencimiento: d.fechaVencimiento, diasRestantes: d.diasRestantes, presupuestoId: d.presupuestoId }];
            const bloques = ppts.map((p, i) => `
              <div style="background:#f8f9fa;border-radius:6px;padding:16px;margin:${i === 0 ? '16px' : '8px'} 0;">
                ${ppts.length > 1 ? `<p style="margin:0 0 8px 0;font-size:13px;font-weight:bold;color:#444;">Presupuesto ${i + 1}${p.presupuestoId ? ' — ' + p.presupuestoId : ''}</p>` : ''}
                <table width="100%" cellpadding="4" cellspacing="0">
                  ${p.total ? `<tr>
                    <td style="color:#666;font-size:13px;">Importe total (IVA incl.)</td>
                    <td style="font-weight:bold;text-align:right;">${p.total} €</td>
                  </tr>` : ''}
                  <tr>
                    <td style="color:#666;font-size:13px;">Fecha de emisión</td>
                    <td style="text-align:right;">${p.fechaEmision || ''}</td>
                  </tr>
                  <tr>
                    <td style="color:#666;font-size:13px;">Válido hasta</td>
                    <td style="font-weight:bold;text-align:right;color:${p.diasRestantes <= 3 ? '#dc3545' : '#198754'};">
                      ${p.fechaVencimiento || ''} (${p.diasRestantes > 0 ? p.diasRestantes + ' días' : 'vence hoy'})
                    </td>
                  </tr>
                  ${ppts.length === 1 ? `<tr>
                    <td style="color:#666;font-size:13px;">Nº resguardo</td>
                    <td style="text-align:right;font-family:monospace;">${d.resguardo || ''}</td>
                  </tr>` : ''}
                </table>
              </div>`).join('');
            const resguardoExtra = ppts.length > 1 ? `<p style="font-size:13px;color:#666;margin:4px 0 16px 0;">Nº resguardo: <strong style="font-family:monospace;">${d.resguardo || ''}</strong></p>` : '';
            return bloques + resguardoExtra;
          })()}

          <!-- Garantía -->
          <div style="border-left:4px solid #0d6efd;padding:12px 16px;margin:16px 0;background:#f0f4ff;">
            <p style="margin:0;font-size:14px;"><strong>Garantía</strong><br>
            Todas nuestras reparaciones cuentan con una garantía de 6 meses sobre el trabajo realizado y las piezas sustituidas.</p>
          </div>

          <!-- Datos bancarios -->
          <p style="margin:16px 0 8px 0;font-weight:bold;">💳 Datos bancarios</p>
          <div style="background:#f8f9fa;border-radius:6px;padding:16px;font-size:13px;line-height:1.8;">
            <strong>Titular:</strong> Affirma Technology Group S.L.<br>
            <strong>Banco Santander</strong> — ES58 0049 4943 3521 1610 3259<br>
            <strong>BBVA</strong> — ES22 0182 0972 1402 0168 8870<br>
            <strong>CaixaBank</strong> — ES31 2100 1098 1702 0009 0497<br>
            <strong>Banco Sabadell</strong> — ES70 0081 0594 7100 0169 6278<br>
            <br>
            Una vez recibido y validado el justificante de pago, procederemos al envío del equipo.
          </div>

          <!-- Dudas -->
          <div style="background:#e8f5e9;border-radius:6px;padding:14px 16px;margin:16px 0;font-size:14px;">
            <strong>❓ Dudas o consultas</strong><br>
            Para cualquier duda, puede responder directamente a este correo y estaremos encantados de atenderle.
          </div>

          <p style="margin:16px 0 0 0;">
            Gracias por confiar en nuestro servicio técnico.<br>
            Un saludo,<br>
            <strong>Equipo Kelatos</strong>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f8f9fa;padding:16px 32px;text-align:center;font-size:12px;color:#888;border-top:1px solid #eee;">
          ${KELATOS.nombre} · ${KELATOS.direccion}<br>
          ${KELATOS.horario} · <a href="tel:${KELATOS.telefono}" style="color:#888;">${KELATOS.telefono}</a> ·
          <a href="${KELATOS.web}" style="color:#888;">${KELATOS.web}</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ============================================
// SMS
// ============================================

function enviarSMSNotificacion(telefono, tipo, datosExtra) {
  try {
    const mensaje = construirMensajeSMS(tipo, datosExtra);

    // NETELIP: número en formato internacional con "00" (no "+")
    const destinationNum = '00' + telefono.replace(/^\+/, '');

    const payload = {
      token:       NETELIP.token,
      from:        NETELIP.from,
      destination: destinationNum,
      message:     mensaje
    };

    const response = UrlFetchApp.fetch(NETELIP.apiUrl, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    const body = response.getContentText().trim();
    Logger.log(`SMS a ${destinationNum}: HTTP ${code} → ${body}`);

    // Respuesta en XML: <status>200</status>
    const statusMatch = body.match(/<status>(\d+)<\/status>/);
    const statusCode  = statusMatch ? parseInt(statusMatch[1]) : 0;
    const idMatch     = body.match(/<ID-SMS>([^<]+)<\/ID-SMS>/);
    const idSms       = idMatch ? idMatch[1] : '';

    if (statusCode === 200) {
      return { exito: true, idExterno: idSms };
    }
    return { exito: false, error: `NETELIP status ${statusCode}: ${body}` };

  } catch (e) {
    Logger.log(`Error SMS a ${telefono}: ${e.message}`);
    return { exito: false, error: e.message };
  }
}

function construirMensajeSMS(tipo, d) {
  const nombre = d.clienteNombre ? d.clienteNombre.trim().split(' ')[0] : '';
  const saludo = nombre ? `Hola ${nombre}, ` : 'Hola, ';
  const dir = 'C/ Joaquin Ma Lopez 26 Madrid. L-V 10-18h.';

  if (tipo === 'vencimiento_presupuesto') {
    return `${saludo}Tu presupuesto vence hoy. A partir de manana cargo de 1€+IVA/dia por almacenaje. Kelatos informatica.`;
  }
  if (tipo === 'aviso_recogida_reparado') {
    return `${saludo}su equipo ha sido reparado y esta listo para recoger. ${dir} Kelatos informatica.`;
  }
  if (tipo === 'aviso_recogida_sin_reparacion') {
    return `${saludo}su equipo esta disponible para recoger (no fue posible repararlo). ${dir} Kelatos informatica.`;
  }
  if (tipo === 'aviso_recogida_ppto_rechazado') {
    return `${saludo}su equipo esta disponible para recoger en nuestro local. ${dir} Kelatos informatica.`;
  }
  if (tipo === 'cargo_almacenaje_activo') {
    return `${saludo}su equipo lleva mas de 30 dias en nuestras instalaciones. Cargo de 1€+IVA/dia activo. Recoger en ${dir} Kelatos informatica.`;
  }

  return `${saludo}Queriamos saber si has podido revisar el presupuesto para la reparacion de tu equipo. Kelatos informatica.`;
}

// ============================================
// REGISTRO EN HOJA
// ============================================

function registrarNotificacion({ resguardo, presupuestoId, tipo, canal, destinatario, secuencia, resultado, datosExtra }) {
  const cols = HOJAS.notificaciones.cols;
  const sheet = getHoja('notificaciones');
  const ahora = new Date();
  const notifId = 'NOTIF-' + Utilities.formatDate(ahora, 'Europe/Madrid', 'yyyyMMddHHmm') +
                  '-' + Math.random().toString(36).substr(2, 4).toUpperCase();

  const numCols = 15;
  const fila = new Array(numCols).fill('');
  fila[cols.notif_id]          = notifId;
  fila[cols.resguardo]         = resguardo;
  fila[cols.presupuesto_id]    = presupuestoId || '';
  fila[cols.tipo]              = tipo;
  fila[cols.canal]             = canal;
  fila[cols.destinatario]      = destinatario;
  fila[cols.estado]            = resultado.exito ? 'enviado' : 'fallido';
  fila[cols.fecha_programada]  = ahora;
  fila[cols.fecha_envio]       = resultado.exito ? ahora : '';
  fila[cols.error]             = resultado.error || '';
  fila[cols.numero_secuencia]  = secuencia;
  fila[cols.intentos]          = 1;
  fila[cols.id_externo]        = resultado.idExterno || '';
  fila[cols.datos_extra]       = JSON.stringify(datosExtra);

  sheet.appendRow(fila);
}

// ============================================
// HELPERS
// ============================================

function construirDatosExtra(repFila, pptoFilas, diasRestantesReciente) {
  const colR = HOJAS.reparaciones.cols;
  const colP = HOJAS.presupuestos.cols;

  // pptoFilas: array ordenado por fecha desc (más reciente primero)
  const pptoReciente = pptoFilas[0];
  const fechaEnvioReciente = new Date(pptoReciente[colP.fecha_envio]);
  const fechaVencReciente  = new Date(fechaEnvioReciente.getTime() + 30 * 24 * 60 * 60 * 1000);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);

  const presupuestos = pptoFilas.map(pptoFila => {
    const fe = new Date(pptoFila[colP.fecha_envio]); fe.setHours(0, 0, 0, 0);
    const fv = new Date(fe.getTime() + 30 * 24 * 60 * 60 * 1000);
    const dias = Math.floor((hoy - fe) / (1000 * 60 * 60 * 24));

    const pptoId    = String(pptoFila[colP.presupuesto_id] || '');
    const manoObra  = pptoFila[colP.mano_obra] !== undefined && pptoFila[colP.mano_obra] !== ''
      ? (parseFloat(pptoFila[colP.mano_obra]) || 0)
      : (parseFloat(pptoFila[colP.costo_reparacion]) || 0);
    const precioPiezas = pptoFila[colP.precio_piezas] !== undefined && pptoFila[colP.precio_piezas] !== ''
      ? (parseFloat(pptoFila[colP.precio_piezas]) || 0)
      : (parseFloat(pptoFila[colP.costo_piezas]) || 0);
    const total        = parseFloat(pptoFila[colP.total]) || (manoObra + precioPiezas);
    const costoPiezas  = parseFloat(pptoFila[colP.costo_piezas]) || 0;

    let piezas = [];
    try { piezas = obtenerPiezasDePresupuesto(pptoId); } catch (e) {}

    return {
      presupuestoId:    pptoId,
      version:          pptoFila[colP.version] || 1,
      manoObra:         manoObra,
      costoPiezas:      costoPiezas,
      precioPiezas:     precioPiezas,
      total:            total,
      iva:              +(total * 0.21).toFixed(2),
      totalConIva:      +(total * 1.21).toFixed(2),
      diasEntrega:      parseInt(pptoFila[colP.dias_entrega]) || 0,
      descripcion:      String(pptoFila[colP.descripcion] || ''),
      tipoPieza:        String(pptoFila[colP.tipo_pieza] || 'no'),
      piezas:           piezas,
      fechaEmision:     Utilities.formatDate(fe, 'Europe/Madrid', 'dd/MM/yyyy'),
      fechaVencimiento: Utilities.formatDate(fv, 'Europe/Madrid', 'dd/MM/yyyy'),
      diasRestantes:    30 - dias
    };
  });

  const revisionPagada = String(repFila[colR.revision_pagada] || '').toUpperCase() === 'SI';
  const descuentoRevision = revisionPagada ? KELATOS.PRECIO_REVISION : 0;

  return {
    clienteNombre:    String(repFila[colR.cliente_nombre] || ''),
    equipo:           String(repFila[colR.equipo_modelo]  || ''),
    sintoma:          String(repFila[colR.sintoma]        || ''),
    modo:             String(repFila[colR.presupuestos_modo] || 'alternativas'),
    totalPresupuesto: pptoReciente[colP.total] ? (Number(pptoReciente[colP.total]) * 1.21).toFixed(2) : '',
    fechaEmision:     Utilities.formatDate(fechaEnvioReciente, 'Europe/Madrid', 'dd/MM/yyyy'),
    fechaVencimiento: Utilities.formatDate(fechaVencReciente,  'Europe/Madrid', 'dd/MM/yyyy'),
    diasRestantes:    diasRestantesReciente,
    resguardo:        String(repFila[colR.resguardo] || ''),
    presupuestoId:    String(pptoReciente[colP.presupuesto_id] || ''),
    presupuestos:     presupuestos,
    revisionPagada:   revisionPagada,
    descuentoRevision: descuentoRevision
  };
}

function existeNotificacionEnviada(resguardo, tipo) {
  const cols = HOJAS.notificaciones.cols;
  const datos = getHoja('notificaciones').getDataRange().getValues();
  return datos.slice(1).some(fila =>
    String(fila[cols.resguardo]) === String(resguardo) &&
    String(fila[cols.tipo])      === tipo &&
    String(fila[cols.estado])    === 'enviado'
  );
}

function obtenerUltimoRecordatorioExitoso(resguardo) {
  const cols = HOJAS.notificaciones.cols;
  const datos = getHoja('notificaciones').getDataRange().getValues();

  const exitosos = datos.slice(1)
    .filter(fila =>
      String(fila[cols.resguardo]) === String(resguardo) &&
      String(fila[cols.tipo])      === 'recordatorio_presupuesto' &&
      String(fila[cols.estado])    === 'enviado' &&
      fila[cols.fecha_envio]
    )
    .sort((a, b) => new Date(b[cols.fecha_envio]) - new Date(a[cols.fecha_envio]));

  if (exitosos.length === 0) return null;

  const u = exitosos[0];
  return {
    fechaEnvio:      u[cols.fecha_envio],
    numeroSecuencia: Number(u[cols.numero_secuencia]) || 0
  };
}

// ============================================
// FASE 3: AVISOS DE RECOGIDA
// ============================================

const ESTADOS_PENDIENTES_RECOGIDA = ['Reparado', 'No tiene Reparación', 'Presupuesto Rechazado'];
const TIPO_POR_ESTADO  = {
  'Reparado':               'aviso_recogida_reparado',
  'No tiene Reparación':    'aviso_recogida_sin_reparacion',
  'Presupuesto Rechazado':  'aviso_recogida_ppto_rechazado'
};
// Días de espera para el primer aviso según estado
const ESPERA_PRIMER_AVISO = {
  'Reparado':               7,
  'No tiene Reparación':    7,
  'Presupuesto Rechazado':  0
};

function procesarAvisosRecogida() {
  const colR = HOJAS.reparaciones.cols;
  const hoy  = new Date();
  hoy.setHours(0, 0, 0, 0);

  const todasReps = obtenerTodo('reparaciones');
  const candidatas = todasReps.filter(fila =>
    ESTADOS_PENDIENTES_RECOGIDA.includes(fila[colR.estado]) &&
    String(fila[colR.estado_entrega] || 'PENDIENTE') === 'PENDIENTE'
  );

  Logger.log(`Avisos recogida: ${candidatas.length} reparaciones candidatas`);

  for (const repFila of candidatas) {
    try {
      procesarAvisoRecogidaIndividual(repFila, hoy);
    } catch (e) {
      Logger.log(`Error aviso recogida ${repFila[colR.resguardo]}: ${e.message}`);
    }
  }
}

function procesarAvisoRecogidaIndividual(repFila, hoy) {
  const colR     = HOJAS.reparaciones.cols;
  const resguardo = repFila[colR.resguardo];
  const estado    = repFila[colR.estado];
  const tipo      = TIPO_POR_ESTADO[estado];
  const diasEspera = ESPERA_PRIMER_AVISO[estado];

  // Fecha en que cambió al estado actual
  const fechaCambio = obtenerFechaCambioEstadoRecogida(resguardo, estado);
  if (!fechaCambio) {
    Logger.log(`${resguardo}: sin fecha de cambio de estado, omitido`);
    return;
  }

  const diasDesde = Math.floor((hoy - fechaCambio) / (1000 * 60 * 60 * 24));
  const datosExtra = {
    clienteNombre: String(repFila[colR.cliente_nombre] || ''),
    equipo:        String(repFila[colR.equipo_modelo]  || ''),
    resguardo:     resguardo,
    estado:        estado,
    diasDesde:     diasDesde,
    presupuestoId: ''
  };

  // ── Cargo de almacenaje activo (día 30+, una sola vez) ──────────
  if (diasDesde >= 30 && !existeNotificacionEnviada(resguardo, 'cargo_almacenaje_activo')) {
    crearYEnviarNotificaciones(resguardo, '', 'cargo_almacenaje_activo', 99, repFila, datosExtra);
  }

  // ── Aviso de recogida normal ─────────────────────────────────────
  if (diasDesde < diasEspera) {
    Logger.log(`${resguardo}: ${diasDesde}/${diasEspera} días — aún no toca`);
    return;
  }

  const ultimoAviso = obtenerUltimoAvisoRecogida(resguardo, tipo);

  let debeEnviar = false;
  let secuencia  = 1;

  if (!ultimoAviso) {
    debeEnviar = true;
    secuencia  = 1;
  } else {
    const fechaUltimo = new Date(ultimoAviso.fechaEnvio);
    fechaUltimo.setHours(0, 0, 0, 0);
    const diasDesdeUltimo = Math.floor((hoy - fechaUltimo) / (1000 * 60 * 60 * 24));

    // Después de 30 días desde cambio de estado → frecuencia semanal
    const intervalo = diasDesde >= 30 ? 7 : 2;
    if (diasDesdeUltimo >= intervalo) {
      debeEnviar = true;
      secuencia  = (ultimoAviso.numeroSecuencia || 0) + 1;
    }
  }

  if (debeEnviar) {
    Logger.log(`${resguardo}: enviando aviso recogida #${secuencia} (${tipo})`);
    crearYEnviarNotificaciones(resguardo, '', tipo, secuencia, repFila, datosExtra);
  }
}

function obtenerFechaCambioEstadoRecogida(resguardo, estado) {
  const eventos = obtenerHistorialDeReparacion(resguardo);

  // Mapa de estado → tipo de evento historial
  const tipoEvento = {
    'Reparado':              'reparacion_finalizada',
    'No tiene Reparación':   'sin_reparacion_sin_pieza',
    'Presupuesto Rechazado': 'presupuesto_rechazado'
  };

  const tipoBuscado = tipoEvento[estado];

  // Buscar por tipo específico primero
  let candidatos = eventos.filter(e => e.tipo === tipoBuscado && e.fechaHora);

  // Fallback: buscar cambio_estado genérico que mencione el estado
  if (candidatos.length === 0) {
    candidatos = eventos.filter(e =>
      e.tipo === 'cambio_estado' &&
      e.descripcion.includes(estado) &&
      e.fechaHora
    );
  }

  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => new Date(b.fechaHora) - new Date(a.fechaHora));
  const fecha = new Date(candidatos[0].fechaHora);
  fecha.setHours(0, 0, 0, 0);
  return fecha;
}

function obtenerUltimoAvisoRecogida(resguardo, tipo) {
  const cols  = HOJAS.notificaciones.cols;
  const datos = getHoja('notificaciones').getDataRange().getValues();

  const exitosos = datos.slice(1)
    .filter(fila =>
      String(fila[cols.resguardo]) === String(resguardo) &&
      String(fila[cols.tipo])      === tipo &&
      String(fila[cols.estado])    === 'enviado' &&
      fila[cols.fecha_envio]
    )
    .sort((a, b) => new Date(b[cols.fecha_envio]) - new Date(a[cols.fecha_envio]));

  if (exitosos.length === 0) return null;
  const u = exitosos[0];
  return {
    fechaEnvio:      u[cols.fecha_envio],
    numeroSecuencia: Number(u[cols.numero_secuencia]) || 0
  };
}

// ── Email de recogida ────────────────────────────────────────────────

function construirEmailRecogidaHtml(tipo, d) {
  const nombre = d.clienteNombre ? d.clienteNombre.trim().split(' ')[0] : '';
  const saludo = nombre ? `Estimado/a <strong>${nombre}</strong>` : 'Estimado/a cliente';

  const intros = {
    aviso_recogida_reparado: `
      <p>${saludo},</p>
      <p>Le informamos de que su equipo <strong>${d.equipo || ''}</strong> ya ha sido reparado correctamente y se encuentra listo para ser recogido.</p>`,
    aviso_recogida_sin_reparacion: `
      <p>${saludo},</p>
      <p>Tras el tiempo invertido en la revisión y las pruebas realizadas, le informamos de que no ha sido posible reparar su equipo <strong>${d.equipo || ''}</strong>.</p>
      <p>El equipo queda a su disposición para recogida, envío o gestión medioambiental, según prefiera.</p>`,
    aviso_recogida_ppto_rechazado: `
      <p>${saludo},</p>
      <p>Le informamos que su equipo <strong>${d.equipo || ''}</strong> se encuentra disponible para recoger en nuestro local.</p>`,
    cargo_almacenaje_activo: `
      <p>${saludo},</p>
      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:16px;margin:0 0 16px 0;">
        <strong>⚠️ Cargo de almacenaje activo</strong><br>
        Su equipo <strong>${d.equipo || ''}</strong> lleva más de 30 días en nuestras instalaciones.<br>
        Desde hoy se aplica un cargo de <strong>1 € + IVA por día</strong> en concepto de almacenaje.<br>
        Le rogamos que pase a recogerlo a la mayor brevedad posible.
      </div>`
  };

  const intro = intros[tipo] || `<p>${saludo},</p>`;

  const footer = `
      <hr style="margin:24px 0;border:none;border-top:1px solid #eee;">

      <p style="margin:0 0 6px 0;"><strong>🕒 Horario de atención (recogida en tienda)</strong></p>
      <p style="margin:0 0 16px 0;">
        Lunes a viernes: de 10:00 a 18:00 h, ininterrumpidamente<br>
        Sábados, domingos y festivos: <strong>cerrado</strong>
      </p>

      <p style="margin:0 0 6px 0;"><strong>📍 Dirección</strong></p>
      <p style="margin:0 0 16px 0;">
        Calle Joaquín María López 26, 28015 – Madrid<br>
        <em>(Junto al metro Islas Filipinas)</em>
      </p>

      <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:14px 16px;margin:0 0 16px 0;font-size:14px;">
        <strong>📦 Almacenaje del equipo</strong><br>
        El equipo podrá permanecer en nuestras instalaciones sin coste durante <strong>30 días</strong> desde la fecha de este aviso.<br>
        A partir del día 31, se aplicará un cargo de <strong>1 € + IVA por día</strong> en concepto de almacenaje.
      </div>

      <p style="margin:0 0 6px 0;"><strong>🚚 Opciones disponibles</strong></p>
      <ul style="margin:0 0 16px 0;padding-left:20px;">
        <li>Recogida en tienda, dentro del horario indicado.</li>
        <li>Envío al punto limpio de forma gratuita, si desea que el equipo sea reciclado conforme a la normativa medioambiental vigente.</li>
      </ul>

      <p style="margin:0 0 6px 0;"><strong>🚚 Envío a domicilio (opcional)</strong></p>
      <p style="margin:0 0 4px 0;">Si desea que el equipo sea enviado a su domicilio, será necesario realizar el pago correspondiente y enviarnos el justificante de la transferencia bancaria respondiendo a este mismo correo, indicando el número de presupuesto o reparación.</p>
      <p style="margin:0 0 4px 0;">El coste del envío es de <strong>15 €</strong>.</p>
      <p style="margin:0 0 16px 0;">En caso de que el equipo también haya sido recogido previamente por nuestro servicio, se deberán añadir otros 15 €. Si tiene cualquier duda sobre el importe total, consúltenos respondiendo a este mensaje.</p>

      <p style="margin:0 0 6px 0;"><strong>💳 Datos bancarios</strong></p>
      <div style="background:#f8f9fa;border-radius:6px;padding:14px 16px;font-size:13px;line-height:1.8;margin:0 0 16px 0;">
        <strong>Titular:</strong> Affirma Technology Group S.L.<br>
        <strong>Banco Santander</strong> — ES58 0049 4943 3521 1610 3259<br>
        <strong>BBVA</strong> — ES22 0182 0972 1402 0168 8870<br>
        <strong>CaixaBank</strong> — ES31 2100 1098 1702 0009 0497<br>
        <strong>Banco Sabadell</strong> — ES70 0081 0594 7100 0169 6278<br>
        <br>
        Una vez recibido y validado el justificante de pago, procederemos al envío del equipo en caso de haberlo solicitado.
      </div>

      <div style="background:#e8f5e9;border-radius:6px;padding:14px 16px;margin:0 0 16px 0;font-size:14px;">
        <strong>❓ Dudas o consultas</strong><br>
        Para cualquier duda o aclaración, puede responder directamente a este correo y estaremos encantados de atenderle.
      </div>

      <p style="margin:0;">Un saludo,<br><strong>Equipo Kelatos</strong></p>`;

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">
        <tr><td style="background:#f5f5f5;padding:24px 32px;text-align:center;">
          <img src="${KELATOS.logo}" alt="Kelatos" height="40" style="max-height:40px;">
        </td></tr>
        <tr><td style="padding:32px;">
          ${intro}
          ${footer}
        </td></tr>
        <tr><td style="background:#f8f9fa;padding:16px 32px;text-align:center;font-size:12px;color:#888;border-top:1px solid #eee;">
          ${KELATOS.nombre} · ${KELATOS.direccion}<br>
          ${KELATOS.horario} · <a href="${KELATOS.web}" style="color:#888;">${KELATOS.web}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/**
 * Envía el aviso de recogida inmediatamente al cambiar de estado.
 * Llamar desde el backend justo después de actualizar el estado.
 * No bloquea: se invoca fire-and-forget desde el frontend.
 */
function enviarAvisoRecogidaInmediato(resguardo) {
  const colR = HOJAS.reparaciones.cols;
  const todasReps = obtenerTodo('reparaciones');
  const repFila = todasReps.find(f => String(f[colR.resguardo]) === String(resguardo));

  if (!repFila) {
    Logger.log(`enviarAvisoRecogidaInmediato: ${resguardo} no encontrado`);
    return;
  }

  const estado = repFila[colR.estado];
  const tipo = TIPO_POR_ESTADO[estado];
  if (!tipo) {
    Logger.log(`enviarAvisoRecogidaInmediato: estado "${estado}" no requiere aviso`);
    return;
  }

  // Si ya existe un aviso enviado (p.ej. re-entrando al estado), no duplicar
  if (existeNotificacionEnviada(resguardo, tipo)) {
    Logger.log(`${resguardo}: ya existe aviso "${tipo}", omitido`);
    return;
  }

  const datosExtra = {
    clienteNombre: String(repFila[colR.cliente_nombre] || ''),
    equipo:        String(repFila[colR.equipo_modelo]  || ''),
    resguardo:     resguardo,
    estado:        estado,
    diasDesde:     0,
    presupuestoId: ''
  };

  Logger.log(`${resguardo}: aviso inmediato "${tipo}"`);
  crearYEnviarNotificaciones(resguardo, '', tipo, 1, repFila, datosExtra);
}

/**
 * Test manual para un resguardo en estado de recogida.
 */
function testAvisoRecogida(resguardo) {
  const colR = HOJAS.reparaciones.cols;
  const todasReps = obtenerTodo('reparaciones');
  const repFila = todasReps.find(f => String(f[colR.resguardo]) === String(resguardo));

  if (!repFila) { Logger.log(`Reparación ${resguardo} no encontrada`); return; }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  procesarAvisoRecogidaIndividual(repFila, hoy);
  Logger.log(`testAvisoRecogida(${resguardo}): completado`);
}

// ============================================
// GESTIÓN DEL TRIGGER
// ============================================

/**
 * Instala el trigger diario a las 11am hora Madrid.
 * Ejecutar UNA sola vez desde el editor de GAS.
 */
function instalarTriggerRecordatorios() {
  const cuentaActual = Session.getActiveUser().getEmail();
  const cuentasAutorizadas = [KELATOS.email]; // solo soporte@kelatos.com puede instalar
  if (!cuentasAutorizadas.includes(cuentaActual)) {
    throw new Error(`Solo ${cuentasAutorizadas.join(', ')} puede instalar el trigger. Cuenta actual: ${cuentaActual}`);
  }

  // Eliminar triggers previos del mismo nombre para no duplicar
  eliminarTriggerRecordatorios();

  ScriptApp.newTrigger('procesarRecordatorios')
    .timeBased()
    .atHour(11)
    .everyDays(1)
    .inTimezone('Europe/Madrid')
    .create();

  Logger.log(`Trigger instalado por ${cuentaActual}: procesarRecordatorios @ 11am Europe/Madrid (diario)`);
}

/**
 * Elimina todos los triggers de procesarRecordatorios.
 */
function eliminarTriggerRecordatorios() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers
    .filter(t => t.getHandlerFunction() === 'procesarRecordatorios')
    .forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log('Triggers de recordatorios eliminados');
}

/**
 * Prueba manual: procesa una reparación específica sin esperar al trigger.
 * @param {string} resguardo
 */
function testRecordatorio(resguardo) {
  const colR = HOJAS.reparaciones.cols;
  const todasReps = obtenerTodo('reparaciones');
  const repFila = todasReps.find(f => String(f[colR.resguardo]) === String(resguardo));

  if (!repFila) {
    Logger.log(`Reparación ${resguardo} no encontrada`);
    return;
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const resultado = procesarReparacionIndividual(repFila, hoy);
  Logger.log(`testRecordatorio(${resguardo}): ${resultado ? 'notificación enviada' : 'sin acción'}`);
}

// ============================================
// EMAIL DE PRESUPUESTO (al enviar al cliente)
// ============================================

/**
 * Envía email con el detalle del presupuesto al cliente.
 * Llamado desde enviarPresupuestos() en Presupuestos.gs.
 * No lanza excepciones: si falla, solo registra el error.
 *
 * @param {string} resguardo
 * @param {Array} repFila - Fila completa de la reparación
 * @param {Array} borradores - Array de {fila, numFila} de los presupuestos enviados
 */
function enviarEmailPresupuestoAlCliente(resguardo, repFila, borradores, modo) {
  const colR = HOJAS.reparaciones.cols;
  const colP = HOJAS.presupuestos.cols;

  // 1. Obtener email del cliente
  let emailCliente = String(repFila[colR.cliente_email] || '').trim();
  if (MODO_TEST.activo) emailCliente = MODO_TEST.emailPrueba;
  if (!emailCliente || emailCliente === '0' || emailCliente.toLowerCase() === 'no tiene' || !validarEmail(emailCliente)) {
    Logger.log(`[Presupuesto Email] Sin email válido para ${resguardo}. No se envía.`);
    return;
  }

  // 2. Construir datos para el template
  const clienteNombre = repFila[colR.cliente_nombre] || '';
  const equipo = repFila[colR.equipo_modelo] || 'su equipo';
  const sintoma = repFila[colR.sintoma] || '';

  const presupuestosData = borradores.map(b => {
    const f = b.fila;
    const pptoId = f[colP.presupuesto_id] || '';
    const manoObra = parseFloat(f[colP.mano_obra]) || 0;
    const precioPiezas = parseFloat(f[colP.precio_piezas]) || 0;
    const total = parseFloat(f[colP.total]) || (manoObra + precioPiezas);
    const diasEntrega = parseInt(f[colP.dias_entrega]) || 0;
    const descripcion = f[colP.descripcion] || '';
    const tipoPieza = f[colP.tipo_pieza] || 'no';
    const version = f[colP.version] || 1;

    // Obtener piezas de este presupuesto
    let piezas = [];
    try {
      piezas = obtenerPiezasDePresupuesto(pptoId);
    } catch (e) {
      Logger.log(`[Presupuesto Email] Error obteniendo piezas de ${pptoId}: ${e.message}`);
    }

    return {
      presupuestoId: pptoId,
      version: version,
      manoObra: manoObra,
      precioPiezas: precioPiezas,
      total: total,
      iva: +(total * 0.21).toFixed(2),
      totalConIva: +(total * 1.21).toFixed(2),
      diasEntrega: diasEntrega,
      descripcion: descripcion,
      tipoPieza: tipoPieza,
      piezas: piezas
    };
  });

  // Verificar si tiene revisión pagada
  const revisionPagada = String(repFila[colR.revision_pagada] || '').toUpperCase() === 'SI';
  const descuentoRevision = revisionPagada ? KELATOS.PRECIO_REVISION : 0;

  const datos = {
    clienteNombre: clienteNombre,
    equipo: equipo,
    sintoma: sintoma,
    resguardo: resguardo,
    presupuestos: presupuestosData,
    fechaEmision: Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy'),
    modo: modo || 'alternativas',
    revisionPagada: revisionPagada,
    descuentoRevision: descuentoRevision
  };

  // 3. Construir HTML y enviar
  try {
    const asunto = `[Kelatos] Presupuesto de reparación — ${equipo}`;
    const cuerpoHtml = construirEmailPresupuestoHtml(datos);

    MailApp.sendEmail({
      to: emailCliente,
      subject: asunto,
      htmlBody: cuerpoHtml,
      name: 'Kelatos Servicio Técnico'
    });

    // Copia interna
    try {
      MailApp.sendEmail({
        to: KELATOS.email,
        subject: `[Copia] ${asunto}`,
        htmlBody: `<p style="background:#f0f4ff;border-left:4px solid #0d6efd;padding:10px 14px;font-size:13px;margin-bottom:16px;">
          <strong>Copia interna</strong> — enviado a: <strong>${emailCliente}</strong><br>
          Resguardo: <strong>${resguardo}</strong> · Tipo: <code>presupuesto_enviado</code>
        </p>` + cuerpoHtml,
        name: 'Kelatos - Copia Interna'
      });
    } catch (ec) {
      Logger.log(`[Presupuesto Email] Error copia interna: ${ec.message}`);
    }

    // 4. Registrar notificación
    registrarNotificacion({
      resguardo: resguardo,
      presupuestoId: presupuestosData.map(p => p.presupuestoId).join(', '),
      tipo: 'presupuesto_enviado',
      canal: 'email',
      destinatario: emailCliente,
      secuencia: 1,
      resultado: { exito: true, idExterno: '' },
      datosExtra: datos
    });

    Logger.log(`[Presupuesto Email] Email enviado a ${emailCliente} para ${resguardo}`);

  } catch (e) {
    Logger.log(`[Presupuesto Email] Error enviando email a ${emailCliente}: ${e.message}`);
    // Registrar como fallido
    try {
      registrarNotificacion({
        resguardo: resguardo,
        presupuestoId: presupuestosData.map(p => p.presupuestoId).join(', '),
        tipo: 'presupuesto_enviado',
        canal: 'email',
        destinatario: emailCliente,
        secuencia: 1,
        resultado: { exito: false, error: e.message },
        datosExtra: datos
      });
    } catch (er) { /* silenciar */ }
  }
}

/**
 * Construye el HTML del email de presupuesto.
 * @param {Object} d - Datos: clienteNombre, equipo, sintoma, resguardo, presupuestos[], fechaEmision
 * @returns {string} HTML completo
 */
function construirEmailPresupuestoHtml(d) {
  const fmt = (n) => Number(n).toFixed(2).replace('.', ',');
  const hayMultiples = d.presupuestos.length > 1;
  const letras = ['A', 'B', 'C', 'D', 'E'];

  // Calcular plazo máximo entre todos los presupuestos
  const maxDias = Math.max(...d.presupuestos.map(p => p.diasEntrega || 0));

  // Determinar tipo de piezas para la sección de método de trabajo
  const algunaPedido = d.presupuestos.some(p => p.tipoPieza === 'pedido');
  const algunaStock = d.presupuestos.some(p => p.tipoPieza === 'stock');
  const tipoComponentes = algunaPedido ? 'compatibles de alta calidad' : (algunaStock ? 'disponibles en taller' : '');

  // Diagnóstico: usar descripcion de los presupuestos (es el diagnóstico técnico)
  const diagnosticos = d.presupuestos
    .map(p => p.descripcion)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i); // eliminar duplicados

  // Intervención: solo piezas (el diagnóstico ya va en su propia sección)
  const intervencion = d.presupuestos.map(p => {
    const partes = [];
    if (p.piezas && p.piezas.length > 0) {
      p.piezas.forEach(pz => {
        if (pz.descripcion) partes.push('Sustitución de ' + pz.descripcion);
      });
    }
    return partes;
  }).flat().filter((v, i, a) => a.indexOf(v) === i);

  // Helper: total piezas (fallback: sumar desde objetos pieza si precioPiezas es 0)
  const totalPiezas = (p) => {
    if (p.precioPiezas > 0) return p.precioPiezas;
    if (!p.piezas || p.piezas.length === 0) return 0;
    return p.piezas.reduce((s, pz) => s + (parseFloat(pz.precio) || parseFloat(pz.costo) || 0), 0);
  };

  // Helper: filas individuales de piezas con nombre y precio
  const filasPiezas = (p) => {
    if (!p.piezas || p.piezas.length === 0) return '';
    return p.piezas.filter(pz => pz.descripcion).map(pz => {
      const precio = parseFloat(pz.precio) || parseFloat(pz.costo) || 0;
      return `<tr><td style="color:#555;padding-left:20px;font-size:13px;">· ${pz.descripcion}</td><td style="text-align:right;font-size:13px;">${fmt(precio)} €</td></tr>`;
    }).join('');
  };

  // Helper: bloque inversión de UN presupuesto
  const bloqueUnPpto = (p, cellpad) => {
    const tp = totalPiezas(p);
    const filaDescuento = d.revisionPagada
      ? `<tr><td style="color:#28a745;">Descuento revisión</td><td style="text-align:right;color:#28a745;font-weight:bold;">-${fmt(d.descuentoRevision)} €</td></tr>`
      : '';
    return `
          <tr><td style="color:#555;">Mano de obra</td><td style="text-align:right;font-weight:bold;">${fmt(p.manoObra)} €</td></tr>
          ${tp > 0 ? `<tr><td style="color:#555;font-weight:bold;">Piezas</td><td style="text-align:right;font-weight:bold;">${fmt(tp)} €</td></tr>` : ''}
          ${filasPiezas(p)}
          ${filaDescuento}
          <tr><td colspan="2"><hr style="border:none;border-top:1px solid #ddd;margin:4px 0;"></td></tr>
          <tr><td style="color:#555;">Subtotal</td><td style="text-align:right;">${fmt(p.total)} €</td></tr>
          <tr><td style="color:#555;">IVA (21%)</td><td style="text-align:right;">${fmt(p.iva)} €</td></tr>
          <tr><td colspan="2"><hr style="border:none;border-top:2px solid #333;margin:4px 0;"></td></tr>
          <tr><td style="font-weight:bold;font-size:16px;">TOTAL</td><td style="text-align:right;font-weight:bold;font-size:16px;color:#1768ea;">${fmt(p.totalConIva)} €</td></tr>`;
  };

  // ── Bloques de inversión ──
  let bloqueInversion = '';
  if (hayMultiples) {
    bloqueInversion = `<p style="margin:0 0 12px 0;font-size:16px;font-weight:bold;">💶 Opciones de Presupuesto</p>`;
    d.presupuestos.forEach((p, i) => {
      bloqueInversion += `
        <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:0 0 12px 0;border-left:4px solid #1768ea;">
          <p style="margin:0 0 10px 0;font-weight:bold;color:#1768ea;">📋 Opción ${letras[i] || (i + 1)}${p.descripcion ? ' — ' + p.descripcion : ''}</p>
          <table width="100%" cellpadding="4" cellspacing="0" style="font-size:14px;">
            ${bloqueUnPpto(p)}
          </table>
          ${p.diasEntrega > 0 ? `<p style="margin:8px 0 0 0;font-size:13px;color:#666;">⏱ Plazo estimado: ${p.tipoPieza === 'pedido' ? `${p.diasEntrega} días (pieza) + 24–48 h (reparación) = <strong>${p.diasEntrega + 1}–${p.diasEntrega + 2} días totales</strong>` : `${p.diasEntrega} días laborables`}</p>` : ''}
        </div>`;
    });
  } else {
    const p = d.presupuestos[0];
    bloqueInversion = `
      <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:0 0 12px 0;border-left:4px solid #1768ea;">
        <p style="margin:0 0 12px 0;font-size:16px;font-weight:bold;">💶 Inversión</p>
        <table width="100%" cellpadding="6" cellspacing="0" style="font-size:14px;">
          ${bloqueUnPpto(p)}
        </table>
      </div>`;
  }

  // ── Instrucciones de aprobación ──
  const fmt2 = (n) => Number(n).toFixed(2).replace('.', ',');
  let bloqueAprobacion = '';
  if (hayMultiples) {
    const esAcumulable = d.modo === 'acumulables';
    const lineasOpciones = d.presupuestos.map((p, i) =>
      `<p style="margin:4px 0;font-weight:bold;font-size:15px;color:#28a745;">
        "APRUEBO OPCIÓN ${letras[i] || (i + 1)} — ${fmt2(p.totalConIva)}€"
      </p>`
    ).join('');

    if (esAcumulable) {
      // Total combinado de todas las opciones
      const totalCombinado = d.presupuestos.reduce((s, p) => s + p.totalConIva, 0);
      const etiquetasTodas = d.presupuestos.map((p, i) => letras[i] || (i + 1)).join(' Y ');
      bloqueAprobacion = `
        <p style="margin:0 0 8px 0;">Para iniciar la reparación, responda a este correo indicando la/s opción/es que desea autorizar <strong>junto con el importe total con IVA</strong>:</p>
        ${lineasOpciones}
        <p style="margin:8px 0;font-weight:bold;font-size:15px;color:#28a745;">
          "APRUEBO OPCIONES ${etiquetasTodas} — ${fmt2(totalCombinado)}€ TOTAL"
        </p>
        <p style="margin:8px 0 0 0;font-size:13px;color:#666;">Puede autorizar una opción o ambas. Indique el importe exacto que aparece en cada opción para confirmar sin errores.</p>`;
    } else {
      bloqueAprobacion = `
        <p style="margin:0 0 8px 0;">Para iniciar la reparación, responda a este correo indicando la opción elegida <strong>junto con el importe total con IVA</strong>:</p>
        ${lineasOpciones}
        <p style="margin:8px 0 0 0;font-size:13px;color:#666;">Solo se ejecutará la opción indicada. Las demás quedarán anuladas. Indique el importe exacto que aparece en la opción elegida para confirmar sin errores.</p>`;
    }
  } else {
    const totalUnico = fmt2(d.presupuestos[0].totalConIva);
    bloqueAprobacion = `
      <p style="margin:0 0 8px 0;">Para iniciar la reparación, responda a este correo indicando:</p>
      <p style="margin:0 0 8px 0;font-weight:bold;font-size:16px;color:#28a745;">"APRUEBO PRESUPUESTO — ${totalUnico}€"</p>
      <p style="margin:0;font-size:13px;color:#666;">Indique el importe exacto que aparece arriba para confirmar sin errores.</p>`;


  }

  // ── HTML completo ──
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;">

        <!-- Header -->
        <tr><td style="background:#f5f5f5;padding:24px 32px;text-align:center;">
          <img src="${KELATOS.logo}" alt="Kelatos" height="40" style="max-height:40px;">
        </td></tr>

        <!-- Cuerpo -->
        <tr><td style="padding:32px;">

          <!-- Saludo -->
          <p style="margin:0 0 4px 0;font-size:18px;">Estimado/a <strong>${d.clienteNombre || 'cliente'}</strong>,</p>
          <p style="margin:0 0 16px 0;color:#666;font-size:14px;">
            Propuesta preparada para: <strong>${d.clienteNombre || ''}</strong><br>
            Servicio: Reparación de <strong>${d.equipo}</strong>
          </p>
          <p style="margin:0 0 20px 0;">Gracias por confiar en nuestro servicio técnico. Tras el diagnóstico realizado, le presentamos la solución recomendada.</p>

          ${d.avisoHtml || ''}

          <!-- Diagnóstico -->
          <div style="background:#fff3cd;border-radius:8px;padding:16px;margin:0 0 16px 0;">
            <p style="margin:0 0 8px 0;font-weight:bold;">🔍 Diagnóstico</p>
            <p style="margin:0;">Se ha detectado:</p>
            ${diagnosticos.length > 0
              ? diagnosticos.map(diag => `<p style="margin:4px 0 0 0;"><strong>${diag}</strong></p>`).join('')
              : `<p style="margin:4px 0 0 0;"><strong>${d.sintoma || 'Según diagnóstico realizado en taller'}</strong></p>`}
          </div>

          <!-- Intervención propuesta -->
          <div style="background:#e3f2fd;border-radius:8px;padding:16px;margin:0 0 16px 0;">
            <p style="margin:0 0 8px 0;font-weight:bold;">🔧 Intervención propuesta</p>
            <p style="margin:0 0 8px 0;">La reparación incluye:</p>
            <ul style="margin:0;padding-left:20px;">
              ${intervencion.length > 0 ? intervencion.map(t => `<li>${t}</li>`).join('') : '<li>Intervención según diagnóstico</li>'}
              <li>Limpieza interna preventiva</li>
              <li>Verificación de temperaturas y rendimiento</li>
              <li>Pruebas funcionales completas</li>
            </ul>
          </div>

          <!-- Beneficios -->
          <div style="background:#e8f5e9;border-radius:8px;padding:16px;margin:0 0 16px 0;">
            <p style="margin:0 0 8px 0;font-weight:bold;">✅ Beneficios</p>
            <ul style="margin:0;padding-left:20px;">
              <li>Recuperación del funcionamiento normal</li>
              <li>Mayor estabilidad y rendimiento</li>
              <li>Prevención de fallos relacionados</li>
              <li>Ahorro frente a la sustitución del equipo</li>
            </ul>
          </div>

          <!-- Método de trabajo -->
          <div style="background:#f3e5f5;border-radius:8px;padding:16px;margin:0 0 16px 0;">
            <p style="margin:0 0 8px 0;font-weight:bold;">🧪 Método de trabajo</p>
            <ol style="margin:0;padding-left:20px;">
              <li>Registro y protección del equipo</li>
              <li>Intervención con herramientas específicas y protección antiestática</li>
              <li>Instalación de componentes originales y de alta calidad</li>
              <li>Pruebas de funcionamiento y control de calidad</li>
            </ol>
          </div>

          <!-- Plazo estimado -->
          ${maxDias > 0 ? `
          <div style="background:#fff8e1;border-radius:8px;padding:16px;margin:0 0 16px 0;">
            <p style="margin:0 0 8px 0;font-weight:bold;">⏱ Plazo estimado</p>
            <p style="margin:0;">
              ${algunaPedido ? `Disponibilidad de pieza: <strong>${maxDias}</strong> días laborables<br>` : ''}
              Reparación y pruebas: <strong>24–48 h</strong><br>
              ${algunaPedido ? `<strong>Total estimado: ${maxDias + 1}–${maxDias + 2} días laborables</strong><br>
              <span style="font-size:13px;color:#666;">(Sujeto a disponibilidad del proveedor y recepción de piezas)</span>` : ''}
            </p>
          </div>` : ''}

          <!-- INVERSIÓN -->
          ${bloqueInversion}

          <p style="margin:12px 0 16px 0;font-size:14px;color:#28a745;font-weight:bold;">
            💡 El pago se realiza únicamente si la reparación se completa con éxito.
          </p>

          <!-- Formas de pago -->
          <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:0 0 16px 0;">
            <p style="margin:0 0 8px 0;font-weight:bold;">💳 Formas de pago</p>
            <ul style="margin:0;padding-left:20px;">
              <li>Tarjeta</li>
              <li>Transferencia bancaria</li>
              <li>Efectivo</li>
            </ul>
            <p style="margin:12px 0 0 0;font-size:13px;line-height:1.8;">
              <strong>Titular:</strong> Affirma Technology Group S.L.<br>
              <strong>Banco Santander</strong> — ES58 0049 4943 3521 1610 3259<br>
              <strong>BBVA</strong> — ES22 0182 0972 1402 0168 8870<br>
              <strong>CaixaBank</strong> — ES31 2100 1098 1702 0009 0497<br>
              <strong>Banco Sabadell</strong> — ES70 0081 0594 7100 0169 6278
            </p>
          </div>

          <!-- Garantía -->
          <div style="border-left:4px solid #0d6efd;padding:12px 16px;margin:0 0 16px 0;background:#f0f4ff;">
            <p style="margin:0;font-size:14px;">
              <strong>🛡 Garantía</strong><br>
              La intervención cuenta con <strong>6 meses de garantía</strong> sobre el trabajo realizado y las piezas sustituidas.
            </p>
          </div>

          <!-- Servicio opcional -->
          <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:0 0 16px 0;">
            <p style="margin:0 0 8px 0;font-weight:bold;">📦 Servicio opcional</p>
            <ul style="margin:0;padding-left:20px;">
              <li>Recogida: <strong>15 €</strong></li>
              <li>Envío de vuelta: <strong>15 €</strong></li>
            </ul>
          </div>

          <!-- Condiciones -->
          <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:0 0 16px 0;font-size:13px;">
            <p style="margin:0 0 8px 0;font-weight:bold;font-size:14px;">📄 Condiciones</p>
            <ul style="margin:0;padding-left:20px;">
              <li>La reparación se limita al fallo diagnosticado.</li>
              <li>Cualquier incidencia adicional será comunicada previamente.</li>
              <li>Se realizan pruebas funcionales antes de la entrega.</li>
              <li>Confidencialidad total de los datos contenidos en el equipo.</li>
            </ul>
          </div>

          <!-- Validez -->
          <p style="margin:0 0 16px 0;font-size:14px;">
            📅 <strong>Validez:</strong> Este presupuesto tiene una validez de <strong>30 días</strong> desde la fecha de emisión (${d.fechaEmision}).
          </p>

          <!-- Sobre nosotros -->
          <div style="background:#e8eaf6;border-radius:8px;padding:16px;margin:0 0 20px 0;">
            <p style="margin:0;font-size:14px;">
              ⭐ <strong>Sobre nosotros</strong><br>
              Tenemos más de 5 años de experiencia en reparación informática en Madrid.
            </p>
          </div>

          <!-- Aprobación -->
          <div style="background:#d4edda;border:2px solid #28a745;border-radius:8px;padding:20px;margin:0 0 20px 0;">
            <p style="margin:0 0 8px 0;font-weight:bold;font-size:16px;">✔ Aprobación</p>
            ${bloqueAprobacion}
          </div>

          <!-- Despedida -->
          <p style="margin:0 0 4px 0;">Quedamos a su disposición para cualquier consulta.</p>
          <p style="margin:0 0 4px 0;">Gracias por confiar en nuestro servicio técnico.</p>
          <p style="margin:0;">
            Un cordial saludo,<br>
            <strong>Kelatos Informática</strong>
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#1a1a2e;padding:20px 32px;text-align:center;font-size:13px;color:#ccc;">
          <strong style="color:#fff;">${KELATOS.nombre} Informática</strong><br>
          ${KELATOS.direccion}<br>
          📞 ${KELATOS.telefono} · ✉ ${KELATOS.email}<br>
          🕒 ${KELATOS.horario}<br>
          <a href="${KELATOS.web}" style="color:#7cb3ff;">${KELATOS.web}</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ============================================
// TEST: Ejecutar desde el editor de GAS
// ============================================

/**
 * Prueba el email de presupuesto con un resguardo real.
 * Envía al email hardcodeado, NO al cliente.
 * Ejecutar manualmente desde el editor de Apps Script.
 *
 * Cambiar EMAIL_TEST y RESGUARDO_TEST antes de ejecutar.
 */
function testEmailPresupuesto() {
  const EMAIL_TEST = 'keysiwin12@gmail.com';
  const RESGUARDO_TEST = '1234'; // ← cambiar por un resguardo real que tenga presupuestos

  // 1. Buscar reparación
  const repResult = buscarPorId('reparaciones', 'resguardo', RESGUARDO_TEST);
  if (!repResult) {
    Logger.log('❌ Reparación no encontrada: ' + RESGUARDO_TEST);
    return;
  }

  // 2. Buscar presupuestos de esa reparación
  const colP = HOJAS.presupuestos.cols;
  const todosPptos = buscarTodosPorCampo('presupuestos', 'resguardo', RESGUARDO_TEST);
  if (todosPptos.length === 0) {
    Logger.log('❌ No hay presupuestos para ' + RESGUARDO_TEST);
    return;
  }

  // Usar todos los presupuestos (no solo borradores, para poder probar con cualquier estado)
  const colR = HOJAS.reparaciones.cols;
  const clienteNombre = repResult.fila[colR.cliente_nombre] || 'Cliente Prueba';
  const equipo = repResult.fila[colR.equipo_modelo] || 'Equipo Prueba';
  const sintoma = repResult.fila[colR.sintoma] || 'Síntoma de prueba';

  // 3. Construir datos igual que enviarEmailPresupuestoAlCliente
  const presupuestosData = todosPptos.map(b => {
    const f = b.fila;
    const pptoId = f[colP.presupuesto_id] || '';
    const manoObra = parseFloat(f[colP.mano_obra]) || 0;
    const precioPiezas = parseFloat(f[colP.precio_piezas]) || 0;
    const total = parseFloat(f[colP.total]) || (manoObra + precioPiezas);
    const diasEntrega = parseInt(f[colP.dias_entrega]) || 0;
    const descripcion = f[colP.descripcion] || '';
    const tipoPieza = f[colP.tipo_pieza] || 'no';
    const version = f[colP.version] || 1;

    let piezas = [];
    try { piezas = obtenerPiezasDePresupuesto(pptoId); } catch (e) {}

    return {
      presupuestoId: pptoId,
      version: version,
      manoObra: manoObra,
      precioPiezas: precioPiezas,
      total: total,
      iva: +(total * 0.21).toFixed(2),
      totalConIva: +(total * 1.21).toFixed(2),
      diasEntrega: diasEntrega,
      descripcion: descripcion,
      tipoPieza: tipoPieza,
      piezas: piezas
    };
  });

  const revisionPagada = String(repResult.fila[colR.revision_pagada] || '').toUpperCase() === 'SI';
  const descuentoRevision = revisionPagada ? KELATOS.PRECIO_REVISION : 0;

  const datos = {
    clienteNombre: clienteNombre,
    equipo: equipo,
    sintoma: sintoma,
    resguardo: RESGUARDO_TEST,
    presupuestos: presupuestosData,
    fechaEmision: Utilities.formatDate(new Date(), 'Europe/Madrid', 'dd/MM/yyyy'),
    revisionPagada: revisionPagada,
    descuentoRevision: descuentoRevision
  };

  // 4. Generar HTML y enviar al email de prueba
  const html = construirEmailPresupuestoHtml(datos);
  const asunto = `[TEST] Presupuesto de reparación — ${equipo}`;

  MailApp.sendEmail({
    to: EMAIL_TEST,
    subject: asunto,
    htmlBody: html,
    name: 'Kelatos Servicio Técnico (TEST)'
  });

  Logger.log('✅ Email de prueba enviado a ' + EMAIL_TEST);
  Logger.log('   Resguardo: ' + RESGUARDO_TEST);
  Logger.log('   Cliente: ' + clienteNombre);
  Logger.log('   Equipo: ' + equipo);
  Logger.log('   Presupuestos: ' + presupuestosData.length);
  presupuestosData.forEach(function(p, i) {
    Logger.log('   [' + (i + 1) + '] v' + p.version + ' — ' + (p.descripcion || 'sin desc') + ' — Total: ' + p.totalConIva + '€');
  });
}
