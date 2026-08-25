# Mesa

App móvil para noches de juegos de mesa. Lleva la puntuación mientras jugáis,
en un solo móvil o con uno por persona.

Estado: **el marcador funciona**. La colección de juegos y las sugerencias
vienen después; la sincronización en la nube también, y el esquema ya está
preparado para ella.

## Qué hace hoy

- Crear una partida, sentar a los jugadores y fijar el orden de turno.
- Puntuar con hojas específicas por juego (Catán, Azul, Wingspan, Carcassonne,
  Terraforming Mars, Aventureros al Tren) o con una hoja genérica que vale para
  cualquier juego.
- Clasificación en vivo, con desempates y empates reales compartiendo puesto.
- Juegos por rondas, con la puntuación acumulándose ronda a ronda.
- Deshacer el último cambio de cada jugador.
- Cerrar la partida, ver quién gana y reabrirla para corregir.
- Todo funciona sin conexión: se guarda en el dispositivo.

## Arrancar

```bash
npm install
npm start          # abre el servidor y muestra el QR
```

Para abrirlo en el móvil hace falta una app contenedora. Hay dos caminos:

**Development build (recomendado).** Compilas tu propia app con este SDK y
estas librerías, así que no dependes de que Expo publique nada:

```bash
npm install -g eas-cli                             # el paquete es eas-cli, el comando es eas
eas login                                          # cuenta gratuita de Expo
eas build --profile development --platform android
```

Sin instalación global, el equivalente es `npx eas-cli@latest <comando>`;
`npx eas` no funciona, porque npx busca un paquete llamado `eas` que no existe.

Al terminar te da un enlace con un QR: lo escaneas desde el móvil, instalas el
APK y ya tienes tu app. A partir de ahí, `npm start` y abrirla; el código se
recarga solo. Solo hay que repetir el build al añadir una librería nativa.

**Expo Go.** Más rápido para una primera prueba, pero solo soporta un SDK a la
vez, así que si va por detrás de este proyecto no abrirá. En ese caso, el
build de Expo Go para el SDK de este proyecto está en
`https://expo.dev/go?sdkVersion=57&platform=android&device=true`.

## Verificar

```bash
npm run check                       # typecheck + lint + tests
npx expo export --platform android  # comprueba que empaqueta
```

## Cómo está montado

El motor de puntuación (`src/core`) no importa React ni la base de datos: es
TypeScript puro, así que sus tests corren en Node en menos de un segundo.

Las puntuaciones son un registro que solo crece. Corregir un dato escribe una
entrada nueva para la misma casilla y el motor decide cuál cuenta. Eso hace que
deshacer, el historial y —cuando llegue— la convergencia entre varios móviles
sean el mismo mecanismo y no tres.

Las hojas de puntuación son datos declarativos, no código. Añadir un juego es
añadir una entrada a una lista, nunca escribir un componente.

Hay más detalle en [`AGENTS.md`](AGENTS.md).
