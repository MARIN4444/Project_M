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
npm start          # abre Expo; escanea el QR con Expo Go
npm run android    # o ios
```

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
