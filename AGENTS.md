# Project_M — notas para quien programe aquí

## Expo ha cambiado

Lee la documentación de la versión exacta en
https://docs.expo.dev/versions/v57.0.0/ antes de escribir código de Expo.
Este proyecto usa el SDK 57, React Native 0.86 y expo-router 57.

## Antes de dar nada por terminado

```bash
npm run check                      # typecheck + lint + tests
npx expo export --platform android # demuestra que empaqueta de verdad
```

El bucle de verificación es lo que sostiene la calidad del código generado
por un modelo. `tsc` en modo estricto (con `noUncheckedIndexedAccess`) caza
las APIs inventadas antes de que lleguen a una partida real, y el `export`
demuestra que todos los imports resuelven en un bundle de Hermes. No des por
buena una tarea sin haber ejecutado ambos.

## Reglas de la casa

**`src/core` es puro.** Ni un solo import de React, React Native, expo o de
la base de datos. Es lo que permite ejecutar los tests en Node en menos de un
segundo. Si algo necesita el reloj o aleatoriedad, se inyecta por parámetro.

**Las puntuaciones se añaden, nunca se actualizan.** Corregir un dato escribe
una entrada nueva para la misma casilla `(asiento, categoría, ronda)`;
`foldEntries` decide cuál cuenta, por marca de tiempo y, en caso de empate,
por id (los ids son ordenables precisamente para eso). De ahí salen gratis el
deshacer, el historial y la convergencia entre móviles. No introduzcas un
`UPDATE` sobre `score_entries`.

**Las plantillas son datos, no código.** Añadir un juego es añadir una entrada
en `src/templates/builtin.ts`, nunca un componente. El total es una suma
ponderada a propósito: un lenguaje de fórmulas necesitaría un intérprete y
convertiría las plantillas de usuario en código ajeno ejecutándose en el móvil
de otro.

**Todo se escribe primero en SQLite y se encola en `outbox`.** Ninguna capa por
encima de `src/db/repository.ts` debe saber si hay red. Es lo que permite
puntuar una partida en un sótano sin cobertura.

**Idiomas.** Identificadores, nombres de fichero y comentarios en inglés; todo
el texto que ve el usuario, en español.

## Estructura

```
app/                  Pantallas (expo-router)
src/core/             Motor de puntuación, puro y testeado
src/templates/        Hojas de puntuación que vienen con la app
src/db/               Esquema, migraciones y repositorio (Drizzle + expo-sqlite)
src/ui/               Tokens de diseño y componentes compartidos
```

## Migraciones

Se aplican en orden y se controlan con el `user_version` de SQLite. Añadir una
migración es **añadir** una entrada a `MIGRATIONS` en `src/db/migrations.ts`;
nunca editar una anterior. No hay drizzle-kit en el build a propósito: las
migraciones generadas exigirían un transformador de Metro para empaquetar
ficheros `.sql`, que son demasiadas piezas móviles para esta cantidad de tablas.

## Versiones nativas ancladas

`package.json` fija `react-native-worklets` y `react-native-reanimated` con
`overrides`. No los quites ni los subas por tu cuenta.

Ninguno de los dos es dependencia directa: entran por `expo-router` y
`@expo/ui`, y npm resolvía versiones más nuevas que las que trae el SDK.
`expo-modules-core` compila C++ contra la API de worklets, así que una versión
de más rompe el build de Android con un error de compilador, no de JavaScript
—y por tanto no lo cazan ni `tsc` ni los tests ni el bundle de Metro. La que
nos costó una tarde fue `no member named 'executeSync' in
'worklets::WorkletRuntime'`.

Los valores correctos son siempre los de
`node_modules/expo/bundledNativeModules.json`, que es la lista de versiones
contra las que Expo ha probado el SDK. Al subir de SDK, actualiza los
`overrides` a lo que diga ese fichero.

`npm ls react-native-worklets` los delata: si dice `invalid`, el build de
Android va a fallar aunque todo lo demás esté en verde.
