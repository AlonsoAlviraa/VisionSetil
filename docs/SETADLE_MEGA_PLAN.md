# Setadle — Mega plan (LoLdle → setas)

| Campo | Valor |
| --- | --- |
| **Referencia** | [loldle.net](https://loldle.net/) (scraping + docs públicas) |
| **Producto** | VisionSetil daily guessing suite |
| **Ruta** | `/setadle` (+ `/setadle/:mode`) |
| **Safety** | Solo orientación educativa; nunca permiso de consumo |

## 1. Lo que es LoLdle (scraped / documentado)

Hub con modos diarios independientes:

| Modo LoLdle | Mecánica |
| --- | --- |
| **Classic** | Adivina campeón; cada intento revela atributos (correcto / parcial / incorrecto) |
| **Quote** | Cita del campeón |
| **Ability** | Icono de habilidad sin nombre |
| **Emoji** | Conjunto de emojis |
| **Splash** | Recorte de splash art; se aleja con fallos |

UX: input con typeahead, grid de intentos con colores, pistas tras N intentos, modo unlimited, un acierto por día y modo.

## 2. Setadle — equivalentes micológicos

| Modo | ID | Mecánica VisionSetil |
| --- | --- | --- |
| **Clásico** | `classic` | Atributos: familia, género, riesgo, edibilidad educativa, relevancia ibérica, temporada |
| **Pista** | `clue` | Tagline / 1ª frase de descripción (sin nombre) |
| **Rasgo** | `trait` | Un `key_features` o morfología |
| **Emoji** | `emoji` | Emojis de riesgo + hábitat + temporada |
| **Foto** | `photo` | Imagen recortada/zoom; se abre con cada fallo |

Pool: especies del catálogo v2 con familia + vernáculo ES cuando sea posible (≥80 taxa).

## 3. Reglas de producto

1. Un **secreto diario** por modo (seed = fecha UTC + mode + salt).
2. Intentos ilimitados en diario (como LoLdle classic); unlimited = nuevo secreto al azar.
3. Colores: verde exacto · ámbar parcial (mismo género / misma familia / riesgo adyacente) · gris no.
4. Disclaimer siempre visible.
5. No inventar comestibilidad; usar `edibility_code` / risk del catálogo como etiqueta educativa.

## 4. Entrega MVP (esta iteración)

- Hub visual estilo LoLdle
- 5 modos jugables
- Typeahead catálogo
- Grid de intentos clásico
- Photo zoom-out
- Nav en “Más” + link en Reto
- Persistencia local de victoria diaria por modo

## 5. Fuera de MVP

- Ranking social, multiplayer, API backend de scores
- Citas reales de foros (sin fuente)
