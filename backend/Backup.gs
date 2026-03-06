/**
 * BACKUP.GS - Copia de seguridad automática del spreadsheet a Google Drive
 *
 * USO:
 *   1. Ejecutar `configurarTriggerBackupDiario()` UNA VEZ desde el editor de GAS
 *      para programar el backup diario automático.
 *   2. `hacerBackup()` puede ejecutarse manualmente en cualquier momento.
 *   3. Los backups se guardan en formato .xlsx con fecha y hora en el nombre.
 *   4. Se mantienen los últimos MAX_BACKUPS archivos; los más antiguos se eliminan.
 */

const BACKUP_FOLDER_ID  = '1qocwXHmfLhJYhBzbMczDx0u_BChClfAS';
const MAX_BACKUPS        = 30;   // Cuántos backups conservar
const BACKUP_HORA        = 3;    // Hora del backup automático (3:00 AM hora Madrid)
const BACKUP_PREFIJO     = 'Backup_Kelatos_';
const BACKUP_EMAILS      = ['informaticosexpress@gmail.com'];

// ============================================
// BACKUP PRINCIPAL
// ============================================

/**
 * Exporta el spreadsheet como .xlsx y lo guarda en la carpeta de Drive.
 * Elimina backups antiguos si se supera MAX_BACKUPS.
 */
function hacerBackup() {
  try {
    const id     = DB_ID;
    const zona   = 'Europe/Madrid';
    const ahora  = new Date();
    const fecha  = Utilities.formatDate(ahora, zona, 'yyyy-MM-dd');
    const hora   = Utilities.formatDate(ahora, zona, 'HH-mm');
    const nombre = `${BACKUP_PREFIJO}${fecha}_${hora}.xlsx`;

    // Exportar como Excel
    const url      = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
    const token    = ScriptApp.getOAuthToken();
    const response = UrlFetchApp.fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      muteHttpExceptions: true,
      followRedirects: true
    });

    const code    = response.getResponseCode();
    const content = response.getContent();
    Logger.log(`📦 Export response: HTTP ${code}, tamaño: ${content.length} bytes`);

    if (code !== 200) {
      throw new Error(`Error al exportar: HTTP ${code} — ${response.getContentText().substring(0, 200)}`);
    }
    if (content.length === 0) {
      throw new Error('La exportación devolvió 0 bytes. Verificar permisos del token o ID del spreadsheet.');
    }

    const blob   = response.getBlob().setName(nombre);
    const folder = DriveApp.getFolderById(BACKUP_FOLDER_ID);
    const file   = folder.createFile(blob);

    Logger.log(`✅ Backup creado: ${nombre} (${file.getId()})`);

    // Limpiar backups antiguos
    _limpiarBackupsAntiguos(folder);

    // Enviar backup por email
    const destinatarios = [Session.getActiveUser().getEmail(), ...BACKUP_EMAILS].filter(Boolean);
    try {
      MailApp.sendEmail({
        to: destinatarios.join(','),
        subject: `✅ Backup Kelatos — ${fecha}`,
        body: `Backup automático completado correctamente.\n\nArchivo: ${nombre}`,
        attachments: [file.getBlob().setName(nombre)]
      });
      Logger.log(`📧 Backup enviado a: ${destinatarios.join(', ')}`);
    } catch (emailError) {
      Logger.log(`⚠️ Backup guardado en Drive pero error al enviar email: ${emailError.message}`);
    }

    return { exito: true, nombre: nombre, fileId: file.getId() };

  } catch (error) {
    Logger.log(`❌ Error en backup: ${error.message}`);
    // Intentar notificar por email al propietario del script
    try {
      MailApp.sendEmail({
        to: Session.getActiveUser().getEmail(),
        subject: '⚠️ Error en backup automático Kelatos',
        body: `El backup automático falló el ${new Date().toLocaleString()}.\n\nError: ${error.message}`
      });
    } catch (e) {}
    throw error;
  }
}

// ============================================
// LIMPIEZA DE BACKUPS ANTIGUOS
// ============================================

/**
 * Mantiene solo los últimos MAX_BACKUPS archivos en la carpeta.
 * Ordena por fecha de creación y elimina los más viejos.
 */
function _limpiarBackupsAntiguos(folder) {
  const files = [];
  const iter  = folder.getFilesByName && folder.getFiles
    ? folder.getFiles()
    : DriveApp.getFolderById(BACKUP_FOLDER_ID).getFiles();

  while (iter.hasNext()) {
    const f = iter.next();
    if (f.getName().startsWith(BACKUP_PREFIJO)) {
      files.push({ file: f, fecha: f.getDateCreated() });
    }
  }

  // Ordenar más reciente primero
  files.sort((a, b) => b.fecha - a.fecha);

  // Eliminar los que superan el límite
  if (files.length > MAX_BACKUPS) {
    const aEliminar = files.slice(MAX_BACKUPS);
    aEliminar.forEach(entry => {
      Logger.log(`🗑️ Eliminando backup antiguo: ${entry.file.getName()}`);
      entry.file.setTrashed(true);
    });
    Logger.log(`🧹 ${aEliminar.length} backup(s) antiguo(s) eliminado(s). Total conservados: ${MAX_BACKUPS}`);
  }
}

// ============================================
// TRIGGER AUTOMÁTICO
// ============================================

/**
 * Crea un trigger diario para ejecutar hacerBackup() automáticamente.
 * Ejecutar esta función UNA SOLA VEZ desde el editor de GAS.
 * Si ya existe un trigger previo para hacerBackup, lo elimina primero.
 */
function configurarTriggerBackupDiario() {
  // Eliminar triggers existentes para esta función
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'hacerBackup')
    .forEach(t => {
      ScriptApp.deleteTrigger(t);
      Logger.log('🗑️ Trigger anterior eliminado');
    });

  // Crear nuevo trigger diario
  ScriptApp.newTrigger('hacerBackup')
    .timeBased()
    .everyDays(1)
    .atHour(BACKUP_HORA)
    .inTimezone('Europe/Madrid')
    .create();

  Logger.log(`✅ Trigger diario configurado: hacerBackup() a las ${BACKUP_HORA}:00 (Madrid)`);
}

/**
 * Elimina todos los triggers de backup (para desactivar el automático).
 */
function eliminarTriggerBackup() {
  const eliminados = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'hacerBackup');

  eliminados.forEach(t => ScriptApp.deleteTrigger(t));
  Logger.log(`✅ ${eliminados.length} trigger(s) de backup eliminado(s)`);
}

/**
 * Muestra el estado actual de los triggers de backup.
 */
function verEstadoTriggers() {
  const triggers = ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'hacerBackup');

  if (triggers.length === 0) {
    Logger.log('ℹ️ No hay triggers de backup configurados.');
  } else {
    triggers.forEach(t => {
      Logger.log(`✅ Trigger activo: ${t.getHandlerFunction()} — Tipo: ${t.getEventType()}`);
    });
  }
}
