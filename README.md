# Pasaporte digital de baterías — Beta

Aplicación web que registra un pasaporte digital por cada batería de tracción, lo identifica con el GTIN de su modelo y su número de serie (impresos en un QR por el fabricante) y guarda de forma auditable su ciclo de vida: alta y venta, certificados de estado de salud validados por el CENT, segunda vida y baja con constancia del reciclador. Beta con **datos sintéticos** (ACARA · CENT UTN).

Stack: Next.js 15 (App Router) + TypeScript, Prisma 6 + PostgreSQL, Zod, cookies firmadas (HMAC) con bcrypt, `qrcode`, `@react-pdf/renderer`, Vercel Blob (disco local en desarrollo).

## Puesta en marcha local

1. La base de desarrollo es un servidor PostgreSQL propio del proyecto, con datos en `.pgdata` y puerto **5433** (usuario y contraseña `pasaporte`). No toca el PostgreSQL instalado en el sistema. Después de reiniciar la máquina hay que volver a arrancarlo (PowerShell):

   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D .pgdata -o "-p 5433" -l .pgdata\server.log start
   ```

   Para detenerlo: el mismo comando con `stop` en lugar de `start`. Para crearlo desde cero en otra máquina: `initdb -D .pgdata -U pasaporte -W --auth=scram-sha-256 -E UTF8`, arrancarlo y `createdb -h localhost -p 5433 -U pasaporte pasaporte_beta`.

2. Copiar `.env.example` a `.env` (ya existe uno con un `SESSION_SECRET` aleatorio).
3. Instalar, migrar y sembrar datos:

   ```bash
   npm install
   npx prisma migrate dev
   npm run db:seed
   npm run dev
   ```

4. Abrir http://localhost:3000 (la beta desplegada está en https://pasaporte-beta.vercel.app). Para probar el QR desde el celular, poner en `PUBLIC_BASE_URL` la IP de la máquina en la red local (p. ej. `http://192.168.0.10:3000`) y arrancar con `npx next dev -H 0.0.0.0`.

## Usuarios de prueba

Contraseña de todos: `beta1234`.

| Teléfono | Rol | Organización |
|---|---|---|
| 1150000001 | Operador responsable | Voltra Baterías SA (código 0042) |
| 1150000002 | Operador responsable | ImportCell Argentina SRL (código 0107) |
| 1150000003 | Concesionario | Concesionaria Del Plata SA |
| 1150000004 | Concesionario | Autos Cuyo SA |
| 1150000005 | Taller habilitado | ElectroService Taller |
| 1150000006 | Taller habilitado | Desarmadero Sur |
| 1150000007 | Taller **no** habilitado | Taller Nuevo |
| 1150000008 | Entidad técnica | CENT – UTN |
| 1150000009 | Reciclador | EcoReciclar SA |
| 1150000010 | Autoridad | DNRPA |
| 1150000011 | Autoridad | Secretaría de Ambiente |

El seed crea 60 baterías: 46 vendidas, 14 en stock, 14 con certificado validado, 2 reclasificadas a segunda vida (con su pasaporte nuevo), 1 reciclada, 1 con constancia pendiente de validación, 1 con baja solicitada sin constancia, 1 con ensayo pendiente y 1 con intervención abierta.

## Recorrido de demostración (de la venta al reciclaje)

1. **Operador** (1150000001) → *Modelos y alta*: cargar el modelo con su GTIN y dar de alta cada batería por su número de serie (individual o CSV con plantilla descargable). El identificador es el que trae la etiqueta del fabricante: el sistema no lo genera.
2. **Concesionario** (1150000003) → *Registrar venta*: GTIN-SERIE + VIN. Abrir `/01/{GTIN}/21/{serie}` desde el celular: muestra solo datos públicos.
3. **Taller** (1150000005) → buscar el identificador → *Registrar intervención* → *Cargar ensayo* (marcar o no "apta para reutilización").
4. **CENT** (1150000008) → *Validaciones* → validar. Recién ahí el SoH aparece en el pasaporte público y en el PDF.
5. **Taller** → *Solicitar baja* (ensayo no reutilizable) o *Reclasificar a segunda vida* (reutilizable: crea un pasaporte nuevo vinculado, con su propio GTIN y número de serie).
6. **Reciclador** (1150000009) → abrir la batería en *Baterías* → *Registrar constancia* (masa y n.º de manifiesto).
7. **CENT** → validar la constancia → el pasaporte pasa a **RECICLADA** (estado final).
8. **Autoridad** (1150000010) → ver el pasaporte completo, *Auditoría* (verificación de la cadena) y *Observatorio* (exportación JSON).

## Verificación automática

Con el servidor en marcha y la base recién sembrada:

```bash
npm run e2e
```

Recorre los criterios de "listo" de las etapas 1 a 6 del plan: permisos por rol y por organización, proyección de campos por nivel, QR y negociación HTML/JSON en `/01/{GTIN}/21/{serie}`, dígito de control del GTIN, idempotencia, CSV con informe por fila, certificado no validado invisible al público, 409 en transiciones inválidas, baja imposible sin constancia validada, y que alterar a mano una fila de auditoría o un evento haga fallar la verificación (después la restaura).

## Diseño

- `src/modules/events/lifecycle.ts` — **servicio único de transiciones**: tabla de reglas (estado de origen, estado destino, roles, organización habilitada y condiciones previas). Ninguna ruta cambia el estado sin pasar por `recordEvent`/`createWithEvent`. Transición no listada → 409 `INVALID_TRANSITION`. Bloquea la fila (`FOR UPDATE`) para evitar carreras.
- Eventos *append-only* con hash SHA-256 encadenado por batería; auditoría global encadenada (serializada con `pg_advisory_xact_lock`). Se registran todas las escrituras y las lecturas de nivel autoridad o interés legítimo.
- `src/modules/passport/projection.ts` — nivel de acceso por rol **y pertenencia** (operador de la batería, concesionario que la vendió, taller con intervención abierta, reciclador con baja en curso) y proyección de campos en el servidor.
- `src/lib/passport-id.ts` — identificador GTIN-14 + serie (GS1 Digital Link). El GTIN lo emite la organización GS1 del fabricante (GS1 Argentina, GS1 China, etc.) y se valida con su dígito de control (módulo 10); la serie tiene hasta 20 letras o dígitos. Dirección pública: `{PUBLIC_BASE_URL}/01/{GTIN}/21/{serie}`. Clave interna: `{GTIN}-{SERIE}`. Se acepta también la URL completa o la cadena GS1 `(01)…(21)…` al buscar.
- `src/adapters/vehicle-registry.ts` — adaptador simulado de DNRPA/RUDAC; la integración real reemplaza solo este archivo.
- `src/lib/storage.ts` — Vercel Blob si hay `BLOB_READ_WRITE_TOKEN`, si no `./uploads` (servido con sesión por `/api/files/...`). Valida tipo y tamaño (10 MB).
- Inicio de sesión con bloqueo de 15 min tras 5 intentos fallidos; límite por IP en rutas públicas (en memoria: en producción usar un almacén compartido).

## API

| Método y ruta | Rol |
|---|---|
| `POST /api/auth/login` · `POST /api/auth/logout` | Todos |
| `POST /api/models` (incluye `gtin`) | Operador |
| `POST /api/batteries` | Operador, concesionario |
| `POST /api/batteries/import` (multipart `file` o `text/csv`) | Operador |
| `GET /01/{GTIN}/21/{serie}` (HTML o JSON según `Accept`) · `GET /api/01/{GTIN}/21/{serie}` · `GET /api/p/{GTIN}-{SERIE}` | Público y autenticados |
| `GET /api/qr/{passportId}` | Público |
| `POST /api/sales` (por identificador) · `POST /api/batteries/{id}/link-vehicle` | Concesionario |
| `POST /api/batteries/{id}/intervention` · `/close-intervention` | Taller |
| `POST /api/batteries/{id}/health-certificates` | Taller |
| `POST /api/health-certificates/{id}/validate` `{approve, reason}` | Entidad técnica |
| `POST /api/batteries/{id}/second-life` (con `gtin` y `serialNumber` nuevos) · `/decommission` | Taller |
| `POST /api/batteries/{id}/recycler-receipt` | Reciclador |
| `POST /api/recycler-receipts/{id}/validate` | Entidad técnica |
| `POST /api/organizations/{id}/enable` | Entidad técnica |
| `GET /api/batteries/{id o passportId}/certificate.pdf` | Según nivel |
| `GET /api/audit?batteryId=` | Autoridad, entidad técnica |
| `GET /api/stats[?download=1]` | Autoridad, entidad técnica |

Las escrituras aceptan la cabecera `Idempotency-Key`. Errores: `{ code, message, details? }`.

## Despliegue en Vercel

Variables: `DATABASE_URL` (Neon), `SESSION_SECRET`, `PUBLIC_BASE_URL` (`https://pasaporte-beta.vercel.app` en la beta; en producción, un dominio propio y estable porque queda impreso en las etiquetas), `BLOB_READ_WRITE_TOKEN`. Comando de build: `npm run build`; aplicar migraciones con `npm run db:deploy` y sembrar con `npm run db:seed`.

## Pendiente / fuera de la beta

Segundo factor para CENT y autoridades (opcional en la especificación, no implementado), firma digital, integraciones reales (RUDAC/TAD, BMS, pasaporte europeo), cobro de aranceles.
