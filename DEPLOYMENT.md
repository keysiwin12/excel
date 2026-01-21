# 🚀 Guía de Deployment - Kelatos MVP

## 📋 Checklist Pre-Deployment

Antes de subir el código a Apps Script, verifica:

- [ ] Google Sheets con hoja "Consolidado" creado
- [ ] Columnas del Excel configuradas correctamente
- [ ] Node.js y clasp instalados
- [ ] Usuario autenticado en clasp

---

## 🔧 Paso a Paso - Primera vez

### 1. Instalar clasp (si no lo tienes)

```bash
npm install -g @google/clasp
```

### 2. Autenticar con Google

```bash
clasp login
```

Esto abrirá el navegador para que autorices el acceso.

### 3. Crear/Vincular Proyecto

**Opción A: Crear proyecto nuevo vinculado al Sheets**

```bash
cd c:\excel_automation

# Reemplaza TU_SPREADSHEET_ID con el ID de tu Google Sheets
# Lo encuentras en la URL: https://docs.google.com/spreadsheets/d/TU_SPREADSHEET_ID/edit
clasp create --type sheets --parentId TU_SPREADSHEET_ID --title "Kelatos Reparaciones"
```

**Opción B: Crear proyecto standalone**

```bash
clasp create --type standalone --title "Kelatos Reparaciones"
```

Esto generará el archivo `.clasp.json` con el `scriptId`.

### 4. Configurar .claspignore

Crea un archivo `.claspignore` para excluir archivos innecesarios:

```
README.md
DEPLOYMENT.md
.git/**
node_modules/**
```

### 5. Subir el Código

```bash
clasp push
```

Si te pregunta si quieres sobrescribir el manifiesto, responde **Yes**.

### 6. Abrir el Editor de Apps Script

```bash
clasp open
```

### 7. Configurar Permisos

En el editor de Apps Script:

1. Ve a **Proyecto** > **Configuración del proyecto**
2. En **Configuración avanzada** → **Google Cloud Platform (GCP) Project**
3. Si no tienes un proyecto GCP, crea uno nuevo

### 8. Implementar como Web App

1. En el editor, haz clic en **Implementar** > **Nueva implementación**
2. En **Tipo**, selecciona **Aplicación web**
3. Configuración:
   - **Descripción:** "Kelatos MVP v1.0"
   - **Ejecutar como:** **Yo**
   - **Quién tiene acceso:** **Cualquier usuario**
4. Haz clic en **Implementar**
5. **Copia la URL de la aplicación web** (la necesitarás)

### 9. Autorizar Permisos

La primera vez que uses la app:

1. Accede a la URL de la web app
2. Te pedirá autorizar permisos
3. Haz clic en **Avanzado** > **Ir a Kelatos Reparaciones (unsafe)**
4. Autoriza los permisos solicitados

---

## ✅ Verificar Instalación

### Ejecutar Función de Prueba

En el editor de Apps Script:

1. Selecciona la función `TEST_verificarSistema` en el dropdown
2. Haz clic en **Ejecutar**
3. Revisa los logs en **Ver** > **Logs de ejecución**

Deberías ver:

```
🔧 INICIANDO PRUEBAS DEL SISTEMA
1. Verificando configuración...
   ✓ Hoja: Consolidado
   ✓ Técnicos: 6
   ✓ Marcas: 17
2. Verificando acceso a Google Sheets...
   ✓ Hoja encontrada: Consolidado
   ✓ Filas: X
3. Obteniendo métricas...
   ✓ Total reparaciones: X
   ...
✅ TODAS LAS PRUEBAS PASARON CORRECTAMENTE
```

---

## 🔄 Actualizaciones (después de la primera vez)

### Subir Cambios

```bash
# Editar archivos localmente
# Luego subir:
clasp push

# Ver logs en tiempo real:
clasp logs --watch
```

### Nueva Versión

Cuando hagas cambios importantes:

1. Sube el código: `clasp push`
2. Abre el editor: `clasp open`
3. Ve a **Implementar** > **Administrar implementaciones**
4. Haz clic en el ícono de lápiz de tu implementación
5. Crea una **Nueva versión** con descripción
6. **Guardar**

La URL de la web app NO cambia, solo se actualiza el contenido.

---

## 🐛 Solución de Problemas

### Error: "No se encontró la hoja Consolidado"

**Solución:**

1. Verifica que la hoja se llame exactamente "Consolidado" (con mayúscula)
2. Si tiene otro nombre, edita `backend/Config.gs`:

```javascript
const SHEET_CONFIG = {
  nombre: "TU_NOMBRE_DE_HOJA",  // Cambiar aquí
  //...
};
```

### Error: "Usuario no autorizado"

**Solución:** Edita `backend/Config.gs`:

```javascript
function validarUsuario(email) {
  return true;  // Permitir a todos (MVP)
}
```

### Error al hacer push: "No scriptId in .clasp.json"

**Solución:**

```bash
# Verificar contenido de .clasp.json
cat .clasp.json

# Si está vacío o mal formado, volver a crear:
clasp create --type sheets --parentId TU_SPREADSHEET_ID
```

### La web app muestra página en blanco

**Posibles causas:**

1. **Error en el código:** Revisa los logs
   ```bash
   clasp logs
   ```

2. **Permisos no autorizados:** Vuelve a acceder y autoriza

3. **Caché del navegador:** Ctrl+Shift+R para recargar

### Error: "Exception: Service using too much computer time"

**Causa:** La hoja tiene muchos datos (5000+ filas)

**Solución:**
- Implementar paginación más agresiva
- Usar caché más agresivamente
- Considerar migrar a Firestore (Fase 2)

---

## 📊 Monitoreo

### Ver Logs en Tiempo Real

```bash
clasp logs --watch
```

### Ver Ejecuciones

1. Abre el editor: `clasp open`
2. Ve a **Ver** > **Registros de ejecución**
3. Filtra por fecha/función

### Métricas de Uso

1. En el editor, ve a **Proyecto** > **Triggers**
2. Haz clic en **Executions** (icono de reloj)
3. Verás historial de ejecuciones

---

## 🔒 Seguridad

### Restringir Acceso (Producción)

Edita `backend/Config.gs`:

```javascript
function validarUsuario(email) {
  // Opción 1: Solo dominio kelatos.com
  return email.endsWith('@kelatos.com');

  // Opción 2: Lista específica
  const autorizados = [
    'usuario1@kelatos.com',
    'usuario2@gmail.com'
  ];
  return autorizados.includes(email);
}
```

Luego:

```bash
clasp push
```

### Ocultar Datos Sensibles

**NO subir** a Git:
- Tokens de API (Netelip)
- Emails de prueba
- IDs de Spreadsheets

Usa `.gitignore`:

```
.clasp.json
backend/Config.gs  # Solo si contiene datos sensibles
```

---

## 🎯 Configuración de Triggers (Notificaciones Automáticas)

Para que las notificaciones se envíen automáticamente:

1. En el editor, ve a **Triggers** (icono de reloj)
2. Haz clic en **Agregar trigger**
3. Configuración:
   - **Función:** `verificarRecordatorios` (de tu código actual)
   - **Tipo de evento:** **Basado en tiempo**
   - **Tipo de activador:** **Temporizador diario**
   - **Hora del día:** **9 a.m. - 10 a.m.** (por ejemplo)
4. **Guardar**

---

## 📞 URLs Importantes

Una vez implementado, guarda estos enlaces:

- **URL Web App:** https://script.google.com/macros/s/TU_SCRIPT_ID/exec
- **Editor Apps Script:** https://script.google.com/home/projects/TU_SCRIPT_ID/edit
- **Google Sheets:** https://docs.google.com/spreadsheets/d/TU_SPREADSHEET_ID/edit

---

## ✅ Checklist Post-Deployment

- [ ] URL de la web app funcionando
- [ ] Login con Google exitoso
- [ ] Dashboard carga correctamente
- [ ] Métricas se muestran
- [ ] Crear nueva reparación funciona
- [ ] Búsqueda y filtros funcionan
- [ ] Notificaciones automáticas configuradas (trigger)
- [ ] Permisos de usuario configurados
- [ ] Backup del Sheets realizado

---

## 📝 Notas Finales

- **Backup:** Siempre haz backup del Google Sheets antes de cambios grandes
- **Testing:** Usa la función `PRUEBA_verificarRecordatorios()` para probar notificaciones
- **Logs:** Revisa los logs regularmente para detectar errores
- **Actualizaciones:** Comunica a los usuarios cuando hagas cambios

---

**¿Problemas?** Revisa los logs:

```bash
clasp logs --watch
```

O contacta al equipo de desarrollo.
