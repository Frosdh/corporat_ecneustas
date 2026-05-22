# Encuestas Parroquiales - San Bartolome

Aplicacion web profesional en PHP + MySQL con estructura separada:

- `frontend/`: interfaz, estilos y logica del navegador
- `backend/`: API, reglas de negocio, almacenamiento y base de datos

## Funcionalidades actuales

- inicio de sesion por roles
- postulacion de encuestadores con documentos
- revision administrativa de postulaciones
- aprobacion, rechazo o suspension de cuentas
- reseteo administrativo de claves
- dashboard de indicadores
- formulario de encuestas
- cola offline real en `localStorage`
- sincronizacion posterior
- descarga segura de documentos desde la API
- auditoria basica de acciones

## Estructura principal

- `index.php`: entrada publica
- `api.php`: entrada publica de la API
- `frontend/index.php`: interfaz
- `frontend/app.js`: logica del frontend
- `frontend/style.css`: estilos
- `backend/api.php`: controlador de endpoints
- `backend/lib.php`: logica de negocio y acceso a datos
- `backend/config.php`: configuracion
- `backend/storage/`: documentos cargados
- `database/schema.sql`: instalacion limpia
- `database/migrate_professional.sql`: migracion desde tu version actual

## Instalacion limpia

1. Crea o verifica la base `corporat_san-bartolome`.
2. Importa `database/schema.sql` en phpMyAdmin.
3. Sube toda la carpeta del proyecto a `public_html/san-bartolome/`.
4. Verifica permisos de escritura para `backend/storage/`.
5. Abre `https://corporativoqbank.com/san-bartolome/`.

## Si ya tienes la version actual funcionando

1. Sube los archivos nuevos y carpetas `frontend/` y `backend/`.
2. Importa `database/migrate_professional.sql` una sola vez.
3. Verifica permisos de escritura para `backend/storage/`.
4. Vuelve a cargar el sitio.

## Usuario inicial

- Usuario: `admin_general`
- Clave: `admin123`

## Nota operativa

El registro de nuevos encuestadores ahora crea una postulacion pendiente. Solo el administrador puede aprobarla para habilitar el levantamiento real.
