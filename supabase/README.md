# Base de datos compartida

## Aplicar migraciones

La primera vez, enlaza el proyecto (te pedirá la contraseña de la base de
datos, que se queda en tu máquina):

```bash
npx supabase login
npx supabase link --project-ref twxibzemfgvihadogpvs
```

A partir de ahí, cada vez que haya una migración nueva:

```bash
npx supabase db push
```

La alternativa manual, si prefieres no instalar nada: abre el **SQL Editor**
del panel de Supabase, pega el contenido del fichero de `migrations/` y ejecuta.

## Añadir una migración

Se **añade** un fichero nuevo con marca de tiempo por delante
(`20260825000002_lo_que_sea.sql`). Nunca se edita uno ya aplicado: el que
está en producción ya corrió y nadie lo va a volver a ejecutar.

## Probar las políticas antes de subirlas

Equivocarse en Row Level Security no da un error: da una fuga silenciosa. Por
eso las políticas se prueban contra un PostgreSQL real antes de tocar el
proyecto de verdad.

```bash
initdb -D /var/lib/pgtest -A trust -U postgres
pg_ctl -D /var/lib/pgtest -o '-k /tmp -p 5433' -w start
createdb -h /tmp -p 5433 -U postgres mesa_test

psql -h /tmp -p 5433 -U postgres -d mesa_test -f supabase/auth_stub.sql
psql -h /tmp -p 5433 -U postgres -d mesa_test -f supabase/migrations/20260825000001_init.sql
psql -h /tmp -p 5433 -U postgres -d mesa_test -f supabase/rls_test.sql
```

`auth_stub.sql` recrea lo mínimo del esquema `auth` de Supabase para poder
cambiar de usuario en las pruebas. `rls_test.sql` falla ruidosamente en cuanto
una política deja pasar algo que no debería.
