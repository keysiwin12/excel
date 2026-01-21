# 🔧 Kelatos - Sistema de Gestión de Reparaciones

Sistema web para gestión de reparaciones de equipos informáticos construido con Google Apps Script.

## 📋 Características

- ✅ Gestión completa de reparaciones (CRUD)
- ✅ Seguimiento de estados (diagnóstico, presupuesto, reparación, entrega)
- ✅ Gestión de pedidos de piezas a proveedores
- ✅ Dashboard con métricas en tiempo real
- ✅ Sistema de alertas automáticas
- ✅ Notificaciones por email y SMS (integrado)
- ✅ Búsqueda y filtros avanzados
- ✅ Responsive design (móvil y desktop)

## 🚀 Instalación

### Requisitos Previos

1. **Google Sheets** con la hoja "Consolidado" creada
2. **Node.js** instalado (para clasp)
3. **Cuenta de Google**

### Paso 1: Instalar clasp

```bash
npm install -g @google/clasp
```

### Paso 2: Autenticar clasp

```bash
clasp login
```

### Paso 3: Crear proyecto de Apps Script

```bash
# Desde la carpeta del proyecto
cd c:\excel_automation

# Crear nuevo proyecto
clasp create --type standalone --title "Kelatos Reparaciones"

# O vincular a un proyecto existente
clasp create --type sheets --parentId TU_SPREADSHEET_ID_AQUI
```

Esto generará un archivo `.clasp.json` con el `scriptId`.

### Paso 4: Subir el código

```bash
# Subir todos los archivos
clasp push

# O subir y ver cambios en tiempo real
clasp push --watch
```

### Paso 5: Configurar el Web App

1. Abre el proyecto en el editor de Apps Script:
   ```bash
   clasp open
   ```

2. En el editor:
   - Ve a **Implementar** > **Nueva implementación**
   - Tipo: **Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - Haz clic en **Implementar**

3. Copia la URL de la aplicación web.

### Paso 6: Prueba Inicial

Ejecuta la función de prueba:

```bash
clasp run TEST_verificarSistema
```

O desde el editor de Apps Script:
- Selecciona la función `TEST_verificarSistema`
- Haz clic en **Ejecutar**
- Revisa los logs en **Ver** > **Logs**

## 📁 Estructura del Proyecto

```
excel_automation/
├── backend/
│   ├── Code.gs              # Entry point y rutas API
│   ├── Config.gs            # Configuración general
│   ├── Database.gs          # Capa de acceso a datos
│   ├── Reparaciones.gs      # Lógica de negocio
│   ├── Pedidos.gs           # Gestión de piezas
│   └── Utils.gs             # Funciones auxiliares
│
├── frontend/
│   ├── login.html           # (Próximo paso)
│   ├── dashboard.html       # (Próximo paso)
│   └── ...
│
├── .clasp.json              # Configuración de clasp
├── appsscript.json          # Configuración de Apps Script
└── README.md                # Este archivo
```

## 🔧 Configuración

### Editar datos de Kelatos

Abre `backend/Config.gs` y modifica:

```javascript
const KELATOS = {
  nombre: "Kelatos",
  direccion: "Tu dirección",
  telefono: "Tu teléfono",
  email: "Tu email",
  // ...
};
```

### Configurar validación de usuarios

En `backend/Config.gs`, función `validarUsuario()`:

```javascript
// Opción 1: Cualquier usuario (MVP)
return true;

// Opción 2: Solo dominio específico
return email.endsWith('@kelatos.com');

// Opción 3: Lista específica
const autorizados = ['user1@gmail.com', 'user2@gmail.com'];
return autorizados.includes(email);
```

## 📊 Estructura de la Hoja "Consolidado"

La hoja debe tener estas columnas (en orden):

| Columna | Nombre | Descripción |
|---------|--------|-------------|
| A | Resguardo | Número único de resguardo |
| B | Fecha Responsable Ppto | Fecha asignación presupuesto |
| C | Fecha Elaboración Ppto | Fecha creación presupuesto |
| D | Técnico | Técnico asignado |
| E | Fecha Reparación | Fecha finalización |
| F | Nombre Cliente | Nombre completo |
| G | Teléfono | Teléfono del cliente |
| H | Email | Email del cliente |
| I | Modelo/Marca Equipo | Modelo del equipo |
| J | Síntoma | Descripción del problema |
| K | Estado | Estado actual |
| L | Tiempo días | Días transcurridos |
| M | Costo Reparación sin IVA | Mano de obra |
| N | Costo Pieza | Precio pieza |
| O | Ganancia Neta | Ganancia calculada |
| P | Responsable Compra | Quién compra la pieza |
| Q | Proveedor | Proveedor de la pieza |
| R | Enlace Compra | URL del producto |
| S | Número Pedido | Tracking del pedido |
| T | Fecha Pedido | Fecha del pedido |
| U | Estado Pedido | Estado del pedido |
| ... | ... | (continúa según Config.gs) |

## 🔑 API Endpoints (para el frontend)

### Autenticación
- `obtenerUsuarioGoogle()` - Obtener usuario actual
- `cerrarSesion()` - Cerrar sesión

### Reparaciones
- `apiCrearReparacion(datos)` - Crear nueva reparación
- `apiObtenerReparacion(resguardo)` - Obtener una reparación
- `apiBuscarReparaciones(filtros, pagina, porPagina)` - Buscar reparaciones
- `apiActualizarReparacion(resguardo, datos)` - Actualizar reparación

### Estados
- `apiCambiarEstado(resguardo, nuevoEstado, opciones)` - Cambiar estado
- `apiAgregarObservacion(resguardo, texto)` - Agregar nota

### Presupuesto
- `apiActualizarPresupuesto(resguardo, presupuesto)` - Actualizar presupuesto
- `apiAceptarPresupuesto(resguardo)` - Aceptar presupuesto
- `apiRechazarPresupuesto(resguardo, motivo)` - Rechazar presupuesto

### Pedidos/Piezas
- `apiActualizarPieza(resguardo, datosPieza)` - Actualizar info pieza
- `apiCambiarEstadoPedido(resguardo, nuevoEstado)` - Cambiar estado pedido
- `apiObtenerPedidosActivos()` - Obtener pedidos activos

### Dashboard
- `apiObtenerMetricas()` - Métricas del dashboard
- `apiObtenerAlertas()` - Alertas pendientes

### Recogida
- `apiMarcarComoEntregado(resguardo, numeroFactura)` - Marcar entregado

### Configuración
- `apiObtenerConfiguracion()` - Obtener configuración general

## 🧪 Testing

### Ejecutar función de prueba

```bash
clasp run TEST_verificarSistema
```

O desde el editor:
1. Abre `Code.gs`
2. Ejecuta `TEST_verificarSistema()`
3. Revisa los logs

### Logs en tiempo real

```bash
clasp logs --watch
```

## 🔄 Workflow de Desarrollo

### 1. Desarrollo local

```bash
# Abrir VS Code
code .

# Editar archivos en backend/
# Subir cambios
clasp push

# Ver logs
clasp logs
```

### 2. Testing

```bash
# Ejecutar función específica
clasp run nombreDeLaFuncion

# Ver logs en tiempo real
clasp logs --watch
```

### 3. Nueva versión

```bash
# Subir cambios
clasp push

# Crear nueva versión en el editor web
clasp open
# > Implementar > Administrar implementaciones > Editar > Nueva versión
```

## 🐛 Troubleshooting

### Error: "No se encontró la hoja Consolidado"

**Solución:** Verifica que el nombre de la hoja sea exactamente "Consolidado" (con mayúscula).

```javascript
// En Config.gs
const SHEET_CONFIG = {
  nombre: "Consolidado",  // Debe coincidir exactamente
  //...
};
```

### Error: "Usuario no autorizado"

**Solución:** Verifica la función `validarUsuario()` en `Config.gs`:

```javascript
function validarUsuario(email) {
  return true;  // Permitir a todos (MVP)
}
```

### Error al hacer push con clasp

**Solución:**

```bash
# Re-autenticar
clasp logout
clasp login

# Verificar proyecto
clasp open
```

### Caché desactualizado

**Solución:** Invalidar cachés manualmente:

```bash
clasp run invalidarCaches
```

O desde el código, agregar al inicio de funciones:

```javascript
CacheService.getScriptCache().removeAll();
```

## 📝 Próximos Pasos

- [ ] Crear frontend HTML (login, dashboard, formularios)
- [ ] Integrar sistema de notificaciones existente
- [ ] Configurar triggers automáticos
- [ ] Testing completo con datos reales
- [ ] Deploy a producción

## 🔗 Enlaces Útiles

- [Documentación de Apps Script](https://developers.google.com/apps-script)
- [Documentación de clasp](https://github.com/google/clasp)
- [Web de Kelatos](https://kelatos.com)

## 📞 Soporte

Para dudas o problemas:
- Email: soporte@kelatos.com
- Teléfono: 918 29 46 60

---

**Versión:** 1.0.0 - MVP
**Fecha:** Enero 2026
**Desarrollado con:** Google Apps Script + Bootstrap 5
