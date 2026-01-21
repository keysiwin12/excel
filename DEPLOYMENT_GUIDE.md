# Guía de Despliegue - Sistema Kelatos

## Problema Actual

El código funciona correctamente en el editor de Apps Script, pero devuelve `null` cuando se ejecuta desde la Web App. Esto indica que la **Web App está usando una versión antigua del código**.

## Solución: Redesplegar la Web App

### Paso 1: Push del Código Actualizado

Primero, asegúrate de tener la última versión del código en Apps Script:

```bash
clasp push
```

Esto subirá todos los cambios al proyecto de Apps Script.

### Paso 2: Crear Nueva Implementación (Deployment)

Tienes dos opciones:

#### Opción A: Desde el Editor de Apps Script (Recomendado)

1. Ve a https://script.google.com/home/projects/1Y-n2yrhKaP-XpUpEnkxdSh49erxXdSX3QB4W6EqGY5NDNm45_54Xff0_

2. Haz clic en **"Implementar" → "Nueva implementación"**

3. Configura la implementación:
   - **Tipo:** Selecciona "Aplicación web"
   - **Descripción:** "v1.1 - Fix búsqueda reparaciones"
   - **Ejecutar como:** "Yo (tu email)"
   - **Quién tiene acceso:** "Cualquier persona"

4. Haz clic en **"Implementar"**

5. Copia la **URL de la aplicación web** que aparece

6. ⚠️ **IMPORTANTE:** Usa la nueva URL en tu navegador, NO la URL anterior

#### Opción B: Actualizar Implementación Existente

Si ya tienes una implementación:

1. Ve a **"Implementar" → "Administrar implementaciones"**

2. Haz clic en el ícono de **lápiz (editar)** junto a tu implementación

3. En "Versión", selecciona **"Nueva versión"**

4. Agrega descripción: "v1.1 - Fix búsqueda reparaciones"

5. Haz clic en **"Implementar"**

6. ⚠️ La URL se mantiene igual, pero debes **refrescar el navegador con Ctrl+F5** (o Cmd+Shift+R en Mac)

### Paso 3: Verificar la Versión Desplegada

Una vez que hayas accedido a la nueva URL:

1. Abre la **Consola del Navegador** (F12)

2. Busca esta línea en los logs:
   ```
   📦 Versión del backend: {version: "1.1", fecha: "2025-01-21", ...}
   ```

3. Si ves `version: "1.1"`, el despliegue fue exitoso ✅

4. Si NO ves esta línea o muestra una versión anterior, repite el Paso 2

### Paso 4: Verificar que Funcione

Después de verificar la versión:

1. Busca en la consola:
   ```
   ✅ Búsqueda exitosa: 15 resultados encontrados
   ```

2. Deberías ver la tabla de reparaciones cargada en el dashboard

## Debugging Adicional

Si después de redesplegar aún no funciona, verifica:

### 1. Logs del Backend

Ve a **Ejecuciones** en Apps Script y busca:
```
🔍 apiBuscarReparaciones llamado - VERSIÓN ACTUALIZADA v1.1
```

### 2. Permisos

Asegúrate de que la app tiene permisos para:
- Leer/escribir en Google Sheets
- Ejecutarse como aplicación web

### 3. Caché del Navegador

- Limpia la caché completamente (Ctrl+Shift+Delete)
- O usa una ventana de incógnito/privada

## Cambios Realizados en v1.1

1. **Logging mejorado** en `apiBuscarReparaciones()`:
   - Versión identificable en logs
   - Validación de resultados nulos
   - Respuesta estructurada consistente

2. **Función de verificación de versión**:
   - `obtenerVersion()` para identificar qué código está corriendo

3. **Frontend actualizado**:
   - Verifica versión del backend al cargar
   - Mejor manejo de errores

## Comandos Útiles

```bash
# Ver logs en tiempo real
clasp logs

# Ver logs con seguimiento
clasp logs --watch

# Ver info del proyecto
clasp list

# Ver implementaciones actuales (no disponible en clasp, usar UI)
```

## Contacto de Ayuda

Si después de seguir todos los pasos aún tienes problemas:

1. Copia los logs completos de la consola del navegador
2. Copia los logs de "Ejecuciones" en Apps Script
3. Anota la URL exacta que estás usando
4. Anota qué opción de despliegue usaste (A o B)
